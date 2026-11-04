/**
 * FireX Esports — free, self-hostable backend (Node + firebase-admin).
 *
 * What it fixes vs the old HTML-only app:
 *  - ALL wallet/money writes happen here with Admin SDK (Firestore rules block clients).
 *  - Admin/staff identity uses custom claims, not a client-side `staff_users` read.
 *  - One-time bootstrap replaces the "first visitor becomes admin" bug.
 *  - Payment gateway is pluggable: SIMULATION (free), RAZORPAY, UPIQR.
 *  - Gateway webhook / polling credits the wallet automatically (idempotent).
 *  - FCM push is sent server-side; tokens never exposed to other clients.
 *
 * Runs on ANY free Node host (Render / Railway / Fly / VPS / local). No Cloud
 * Functions / Blaze plan required.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, '../web');
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'new-firex';
const PROVIDER = (process.env.PAYMENT_PROVIDER || 'upiqr').toLowerCase();
/* Instant auto-credit (koi admin approval nahi). Backwards-compatible with the
   old AUTO_APPROVE_SIMULATION flag. Set UPI_AUTO_CREDIT=false to require a
   12-digit UTR instead. With a real UPI PSP configured the server verifies
   with the PSP before crediting, so this flag is only for zero-config mode. */
const AUTO_CREDIT = process.env.UPI_AUTO_CREDIT !== 'false' && process.env.AUTO_APPROVE_SIMULATION !== 'false';
const ORDER_TTL_MS = 8 * 60 * 1000;   // matches the 07:54 checkout timer
const ALLOWED_AMOUNTS = [10, 20, 30, 50, 100, 500, 1000]; // rupees

let firebaseReady = false;
try {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credential;
  if (inline) credential = admin.credential.cert(JSON.parse(inline));
  else if (saPath && fs.existsSync(saPath)) credential = admin.credential.cert(JSON.parse(fs.readFileSync(saPath, 'utf8')));
  else credential = admin.credential.applicationDefault();
  // No storageBucket: this app never touches Cloud Storage (Blaze-only since
  // 2026-02-03). Images live in Firestore and are served by /api/media/:id.
  admin.initializeApp({ credential, projectId: PROJECT_ID });
  firebaseReady = true;
  console.log('[firebase] Admin SDK initialised for', PROJECT_ID);
} catch (e) {
  console.warn('[firebase] NOT initialised (UI preview still works):', e.message);
}

const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
const increment = (n) => admin.firestore.FieldValue.increment(n);
const app = express();
app.use(cors({ origin: true, credentials: true }));

/* ------------------------------------------------------------------ helpers */
const reply = (res, status, body) => res.status(status).json(body);
const needFirebase = (req, res, next) => firebaseReady ? next() : reply(res, 503, { error: 'Firebase not configured on server' });

async function verifyUser(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw Object.assign(new Error('Sign in required'), { status: 401 });
  return admin.auth().verifyIdToken(h.slice(7));
}
async function auth(req, res, next) {
  try { req.user = await verifyUser(req); next(); }
  catch (e) { reply(res, e.status || 401, { error: e.message }); }
}
async function privileged(req, res, next) {
  try {
    req.user = await verifyUser(req);
    if (!req.user.admin && !req.user.staff) return reply(res, 403, { error: 'Admin / staff access required' });
    next();
  } catch (e) { reply(res, 401, { error: e.message }); }
}
const isAdminOnly = (req, res, next) => req.user?.admin ? next() : reply(res, 403, { error: 'Super admin only' });

/* Idempotent wallet credit. `eventKey` makes webhook retries safe. */
/* IMPORTANT: FireX wallets are stored in RUPEES (signupBonus, entry fees,
   withdrawals — sab rupees me hain). Only Razorpay's own API uses paise.
   Pehle yahan amount*100 credit ho raha tha -> ₹10 par ₹1000 mil jate the. */
async function creditWallet({ userId, amount, eventKey, orderId, kind = 'Deposit', description = 'Auto deposit' }) {
  const firestore = db();
  const eventRef = firestore.collection('payment_events').doc(eventKey);
  const userRef = firestore.collection('users').doc(userId);
  return firestore.runTransaction(async (tx) => {
    const ev = await tx.get(eventRef);
    if (ev.exists) return { duplicate: true, credited: 0 };
    const u = await tx.get(userRef);
    if (!u.exists) throw Object.assign(new Error('User not found'), { status: 404 });
    tx.set(eventRef, { eventKey, orderId, kind, amount, createdAt: now() });
    tx.update(userRef, { 'wallets.deposit': increment(amount), updatedAt: now() });
    tx.set(firestore.collection('transactions').doc(), {
      userId, type: kind, desc: description, amount,
      status: 'Success', date: now(), orderId, auto: true,
    });
    if (orderId) tx.set(firestore.collection('payment_orders').doc(orderId), {
      status: 'paid', paidAt: now(), autoCredited: true,
    }, { merge: true });
    return { duplicate: false, credited: amount };
  });
}

async function sendPushToUser(userId, title, body, data = {}) {
  if (!firebaseReady) return { sent: 0, skipped: 'firebase offline' };
  const snap = await db().collection('device_tokens').where('userId', '==', userId).get();
  const tokens = snap.docs.map((d) => d.data().token).filter(Boolean);
  if (!tokens.length) return { sent: 0, skipped: 'no device tokens' };
  try {
    const r = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { channelId: 'firex_alerts', sound: 'default' } },
    });
    // prune dead tokens
    const dead = [];
    r.responses.forEach((x, i) => { if (!x.success && /registration-token-not-registered|invalid-registration-token/i.test(x.error?.message || '')) dead.push(snap.docs[i].ref); });
    for (const ref of dead) await ref.delete().catch(() => {});
    return { sent: r.successCount, failed: r.failureCount };
  } catch (e) { return { sent: 0, error: e.message }; }
}

/* ------------------------------------------------------- payment providers */
const UPI_ID = process.env.MERCHANT_UPI_ID || 'firex@upi';
const MERCHANT_NAME = process.env.MERCHANT_NAME || 'FireX Esports';

function simulationOrder(userId, amount, orderId) {
  const upiUri = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent('FIREX-' + orderId.slice(0, 8))}&tr=${encodeURIComponent(orderId.slice(0, 12))}`;
  return { provider: 'simulation', orderId, amount, currency: 'INR', upiUri, expiresAt: Date.now() + ORDER_TTL_MS };
}
async function razorpayOrder(userId, amount, orderId) {
  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(keyId + ':' + secret).toString('base64'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: orderId, notes: { userId, firexOrderId: orderId } }),
  });
  const j = await r.json();
  if (!r.ok || !j.id) throw new Error('Razorpay order failed: ' + JSON.stringify(j));
  return { provider: 'razorpay', orderId, gatewayOrderId: j.id, amount, currency: 'INR', keyId, expiresAt: Date.now() + ORDER_TTL_MS };
}
/* Dynamic UPI intent. Any UPI app handles this scheme — FamPay, GPay,
   PhonePe, Paytm, BHIM. `tr` is the FireX order ref used to match the
   callback the UPI app sends back to the APK. */
function upiPayUri(amount, orderId) {
  const ref = String(orderId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  return `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(MERCHANT_NAME)}` +
         `&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent('FIREX-' + ref)}` +
         `&tr=${encodeURIComponent(ref)}`;
}

async function upiqrOrder(userId, amount, orderId) {
  const base = process.env.UPIQR_BASE_URL, key = process.env.UPIQR_API_KEY;
  const upiUri = upiPayUri(amount, orderId);
  if (!base || !key) {
    // Zero-config: server generates its own dynamic QR. No KYC, no keys.
    return { provider: 'upiqr', mode: 'dynamic-qr', orderId, amount, currency: 'INR',
      upiUri, qrUrl: null, expiresAt: Date.now() + ORDER_TTL_MS };
  }
  const r = await fetch(`${base.replace(/\/$/, '')}/create-order`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ amount, orderId, userId }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('UPI QR provider failed: ' + JSON.stringify(j).slice(0, 160));
  return { provider: 'upiqr', mode: 'psp', orderId, gatewayOrderId: j.orderId || j.order_id || orderId,
    amount, currency: 'INR', upiUri: j.upiUri || j.upi_uri || upiUri,
    qrUrl: j.qrUrl || j.qr_url || null, expiresAt: Date.now() + ORDER_TTL_MS };
}

/* Optional server-side verification with a real UPI PSP.
   Returns null when no PSP is configured or the payment is not yet settled. */
async function pspPaymentSuccess(orderId) {
  const base = process.env.UPIQR_BASE_URL, key = process.env.UPIQR_API_KEY;
  if (!base || !key) return null;
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/status?orderId=${encodeURIComponent(orderId)}`,
      { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    const s = String(j.status || j.payment_status || j.result || '').toLowerCase();
    return /success|paid|captured|completed|settled/.test(s) ? j : null;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------- routes */
app.get('/api/health', (req, res) => reply(res, 200, { ok: true, firebase: firebaseReady, provider: PROVIDER, projectId: PROJECT_ID }));
app.get('/api/config', (req, res) => reply(res, 200, { projectId: PROJECT_ID, provider: PROVIDER, allowedAmounts: ALLOWED_AMOUNTS, upiId: UPI_ID, orderTtlMs: ORDER_TTL_MS }));

/* ---- public signup: server owns the bonus, the profile doc and the logs.
       The client may NOT write `users`, `transactions` or `referrals` (rules deny it),
       so doing this here is what actually makes registration work on a fresh project. */
const signupHits = new Map();
app.post('/api/auth/signup', needFirebase, express.json({ limit: '256kb' }), async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0];
  const hits = (signupHits.get(ip) || []).filter(t => Date.now() - t < 3600000);
  if (hits.length >= 8) return reply(res, 429, { error: 'Too many signups from this network. Try later.' });
  const { email, password, ffName, refCode } = req.body || {};
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  const name = String(ffName || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return reply(res, 400, { error: 'Valid email required' });
  if (p.length < 6 || p.length > 128) return reply(res, 400, { error: 'Password must be 6–128 characters' });
  if (name.length < 2 || name.length > 30) return reply(res, 400, { error: 'Player name must be 2–30 characters' });
  try {
    const dup = await db().collection('users').where('ffName', '==', name).limit(1).get();
    if (!dup.empty) return reply(res, 409, { error: 'Username already taken' });
    const cfg = await db().collection('settings').doc('general').get();
    const bonus = Math.min(500, Math.max(0, Number(cfg.data()?.signupBonus) || 0));
    const user = await admin.auth().createUser({ email: e, password: p, displayName: name });
    const uid = user.uid;
    const appPrefix = String(cfg.data()?.appName || 'FIREX').replace(/\s+/g, '').substring(0, 4).toUpperCase();
    const myRef = appPrefix + Math.floor(Math.random() * 9000 + 1000);
    const batch = db().batch();
    batch.set(db().collection('users').doc(uid), {
      ffName: name, email: e, wallets: { winning: 0, deposit: 0, bonus },
      purchasedItems: [], purchasedItemExpiries: {}, status: 'Active',
      myReferralCode: myRef, avatar: '👦', notifOn: true,
      createdAt: now(), lastRankMonth: new Date().getMonth(), currentMonthWinnings: 0,
    });
    if (bonus > 0) batch.set(db().collection('transactions').doc(), {
      userId: uid, type: 'Signup Bonus', desc: 'Welcome Bonus', amount: bonus, status: 'Success', date: now(),
    });
    if (refCode) {
      const r = await db().collection('users').where('myReferralCode', '==', String(refCode).trim()).limit(1).get();
      if (!r.empty) {
        const ref = r.docs[0];
        batch.set(db().collection('referrals').doc(), {
          referrerUid: ref.id, referrerName: ref.data().ffName || '', referrerEmail: ref.data().email || '',
          refereeUid: uid, refereeName: name, refereeEmail: e, code: String(refCode).trim(),
          status: 'Pending', createdAt: now(),
        });
      }
    }
    await batch.commit();
    signupHits.set(ip, [...hits, Date.now()]);
    reply(res, 200, { uid, email: e, bonus });
  } catch (err) {
    const code = String(err.code || '').includes('email-already-exists') ? 409 : 400;
    reply(res, code, { error: code === 409 ? 'Email already registered' : (err.message || 'Signup failed') });
  }
});

/* Webhook needs the RAW body for HMAC verification -> mounted before express.json */
app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    let ok = false, payload = {};
    if (PROVIDER === 'razorpay') {
      const sig = req.headers['x-razorpay-signature'] || '';
      const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(raw).digest('hex');
      ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      payload = JSON.parse(raw.toString());
    } else {
      const sig = req.headers['x-firex-signature'] || '';
      const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET || '').update(raw).digest('hex');
      ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      payload = JSON.parse(raw.toString());
    }
    if (!ok) return reply(res, 400, { error: 'Invalid signature' });
    if (!firebaseReady) return reply(res, 200, { accepted: true, offline: true });

    const orderId = payload.firexOrderId || payload.orderId || payload.order_id || payload.notes?.firexOrderId;
    const status = String(payload.status || payload.event || '').toLowerCase();
    const paid = /paid|captured|success|payment\.captured|order\.paid/.test(status) ||
      (payload.event === 'payment.captured') || (payload.event === 'order.paid');
    if (!orderId) return reply(res, 400, { error: 'orderId missing' });
    const orderRef = db().collection('payment_orders').doc(String(orderId));
    const snap = await orderRef.get();
    if (!snap.exists) return reply(res, 404, { error: 'Unknown order' });
    const o = snap.data();
    if (!paid) { await orderRef.update({ status: 'failed' }).catch(() => {}); return reply(res, 200, { accepted: true, paid: false }); }
    if (o.status === 'paid') return reply(res, 200, { accepted: true, duplicate: true });
    const result = await creditWallet({
      userId: o.userId, amount: o.amount,
      eventKey: `pay_${orderId}`, orderId: String(orderId),
      description: `Auto ${o.provider || PROVIDER} payment`,
    });
    await sendPushToUser(o.userId, 'Deposit Successful ✅', `₹${o.amount} added to your wallet automatically.`, { type: 'payment' });
    reply(res, 200, { accepted: true, ...result });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

app.use(express.json({ limit: '256kb' }));

/* ---- one-time secure admin bootstrap (fixes the old open-admin bug) ---- */
app.post('/api/bootstrap', needFirebase, async (req, res) => {
  try {
    if (!process.env.BOOTSTRAP_TOKEN) return reply(res, 503, { error: 'BOOTSTRAP_TOKEN not set on server' });
    if (req.headers['x-bootstrap-token'] !== process.env.BOOTSTRAP_TOKEN) return reply(res, 403, { error: 'Invalid bootstrap token' });
    const snap = await db().collection('staff_users').where('role', '==', 'owner').limit(1).get();
    if (!snap.empty) return reply(res, 409, { error: 'Owner already exists' });
    const { uid, email } = req.body;
    if (!uid) return reply(res, 400, { error: 'uid required' });
    await admin.auth().setCustomUserClaims(uid, { admin: true, staff: true, role: 'owner' });
    await db().collection('staff_users').doc(uid).set({ email: email || '', role: 'owner', active: true, createdAt: now() });
    reply(res, 200, { ok: true, note: 'Sign out and back in to refresh the ID token.' });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* ---- staff management (super admin only) ---- */
app.post('/api/staff/set', needFirebase, privileged, isAdminOnly, async (req, res) => {
  try {
    const { uid, email, role = 'staff', active = true } = req.body;
    if (!uid) return reply(res, 400, { error: 'uid required' });
    const claims = active ? { staff: true, role } : { staff: false, role: null };
    await admin.auth().setCustomUserClaims(uid, claims);
    await db().collection('staff_users').doc(uid).set({ email: email || '', role, active, updatedAt: now() }, { merge: true });
    reply(res, 200, { ok: true });
  } catch (e) { reply(res, 500, { error: e.message }); }
});
app.get('/api/staff/list', needFirebase, privileged, async (req, res) => {
  try {
    const s = await db().collection('staff_users').get();
    reply(res, 200, { items: s.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* ---- create deposit order (provider-agnostic) ---- */
app.post('/api/payments/create', needFirebase, auth, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!ALLOWED_AMOUNTS.includes(amount)) return reply(res, 400, { error: 'Invalid amount', allowed: ALLOWED_AMOUNTS });
    const firestore = db();
    const orderRef = firestore.collection('payment_orders').doc();
    const idempotency = req.body.idempotencyKey || null;
    if (idempotency) {
      const old = await firestore.collection('payment_orders').where('idempotencyKey', '==', idempotency).limit(1).get();
      if (!old.empty) return reply(res, 200, { replay: true, orderId: old.docs[0].id });
    }
    let order;
    if (PROVIDER === 'razorpay') order = await razorpayOrder(req.user.uid, amount, orderRef.id);
    else if (PROVIDER === 'upiqr') order = await upiqrOrder(req.user.uid, amount, orderRef.id);
    else order = simulationOrder(req.user.uid, amount, orderRef.id);
    order.qrDataUrl = (order.qrUrl && order.qrUrl.startsWith('data:'))
      ? order.qrUrl
      : await QRCode.toDataURL(order.upiUri || `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${amount}&cu=INR`,
          { margin: 1, width: 320, color: { dark: '#111111', light: '#FFFFFF' } });
    await orderRef.set({
      userId: req.user.uid, userEmail: req.user.email || '', amount, currency: 'INR',
      status: 'created', provider: order.provider, mode: order.mode || null,
      gatewayOrderId: order.gatewayOrderId || null, upiUri: order.upiUri || null,
      idempotencyKey: idempotency, expiresAt: new Date(order.expiresAt), createdAt: now(),
    });
    reply(res, 200, order);
  } catch (e) { reply(res, 502, { error: e.message }); }
});

app.get('/api/payments/status/:orderId', needFirebase, auth, async (req, res) => {
  try {
    const s = await db().collection('payment_orders').doc(req.params.orderId).get();
    if (!s.exists) return reply(res, 404, { error: 'Not found' });
    if (s.data().userId !== req.user.uid) return reply(res, 403, { error: 'Forbidden' });
    reply(res, 200, { id: s.id, ...s.data() });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* INSTANT auto-credit — koi admin approval / screenshot / UTR nahi.
   Flow: UPI QR -> user pays in FamPay/GPay/PhonePe -> UPI app returns to the
   WebView -> /confirm -> wallet credit (idempotent) -> FCM push.
   With a real UPI PSP configured, the server double-checks with the PSP first.
   Webhook bhi same creditWallet() call karta hai, isliye duplicate nahi hota. */
app.post('/api/payments/confirm', needFirebase, auth, async (req, res) => {
  try {
    if (PROVIDER === 'razorpay') return reply(res, 400, { error: 'Razorpay uses its signed webhook' });
    const { orderId, utr, upiStatus, txnRef, approvalRef } = req.body || {};
    if (!orderId) return reply(res, 400, { error: 'orderId required' });
    const ref = db().collection('payment_orders').doc(String(orderId));
    const snap = await ref.get();
    if (!snap.exists || snap.data().userId !== req.user.uid) return reply(res, 404, { error: 'Order not found' });
    const o = snap.data();
    if (o.status === 'paid') return reply(res, 200, { ok: true, duplicate: true, credited: o.amount });
    if (o.status !== 'created') return reply(res, 409, { error: 'Order ' + o.status });
    if (o.expiresAt?.toMillis && o.expiresAt.toMillis() < Date.now()) return reply(res, 410, { error: 'Session expired' });

    // UPI app ne payment reject/cancel kiya ho to credit mat karo.
    if (upiStatus && /fail|declin|cancel|reject/i.test(String(upiStatus)))
      return reply(res, 402, { error: 'UPI payment was not completed' });

    const psp = !!(process.env.UPIQR_BASE_URL && process.env.UPIQR_API_KEY);
    let verifiedBy = 'upi-intent';
    if (psp) {
      const st = await pspPaymentSuccess(String(orderId));
      if (!st) return reply(res, 202, { ok: false, pending: true,
        error: 'Payment abhi gateway par confirm nahi hua. 10 second me phir try karein.' });
      verifiedBy = 'psp';
    } else if (!AUTO_CREDIT && !/^\d{12}$/.test(String(utr || ''))) {
      return reply(res, 400, { error: 'Enter a valid 12-digit UTR' });
    }
    const r = await creditWallet({
      userId: req.user.uid, amount: o.amount,
      eventKey: `pay_${orderId}`, orderId: String(orderId), description: 'Instant UPI deposit',
    });
    if (txnRef || approvalRef || upiStatus) {
      await ref.set({ upiStatus: String(upiStatus || ''), txnRef: String(txnRef || ''),
        approvalRef: String(approvalRef || ''), verifiedBy, verifiedAt: now() }, { merge: true });
    }
    await sendPushToUser(req.user.uid, 'Coins Added ✅',
      `₹${o.amount} automatically added to your wallet.`, { type: 'payment', orderId: String(orderId) });
    reply(res, 200, { ok: true, credited: o.amount, verifiedBy, ...r });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* ---- secure wallet operations (all atomic, server-side) ---- */
app.post('/api/wallet/withdraw', needFirebase, auth, async (req, res) => {
  try {
    const amount = Number(req.body.amount), upiId = String(req.body.upiId || ''), accountName = String(req.body.accountName || '');
    if (!Number.isFinite(amount) || amount < 50 || amount > 5000) return reply(res, 400, { error: 'Amount must be ₹50–₹5000' });
    if (!upiId) return reply(res, 400, { error: 'UPI ID required' });
    const firestore = db(), uRef = firestore.collection('users').doc(req.user.uid);
    const out = await firestore.runTransaction(async (tx) => {
      const u = await tx.get(uRef);
      const win = u.data()?.wallets?.winning || 0;
      if (win < amount) throw Object.assign(new Error('Insufficient winnings'), { status: 400 });
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const recent = await tx.get(firestore.collection('withdrawals').where('userId', '==', req.user.uid).where('createdAt', '>=', since));
      if (recent.size >= 3) throw Object.assign(new Error('Daily withdrawal limit reached'), { status: 429 });
      tx.update(uRef, { 'wallets.winning': increment(-amount) });
      const wRef = firestore.collection('withdrawals').doc();
      tx.set(wRef, { userId: req.user.uid, userEmail: req.user.email || '', amount, upiId, accountName,
        status: 'Pending', method: req.body.method || 'upi', createdAt: now() });
      return wRef.id;
    });
    reply(res, 200, { ok: true, withdrawalId: out });
  } catch (e) { reply(res, e.status || 500, { error: e.message }); }
});

app.post('/api/wallet/redeem', needFirebase, auth, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return reply(res, 400, { error: 'Code required' });
    const firestore = db();
    const out = await firestore.runTransaction(async (tx) => {
      const q = await tx.get(firestore.collection('redeem_codes').where('code', '==', code).where('status', '==', 'Active').limit(1));
      if (q.empty) throw Object.assign(new Error('Invalid or used code'), { status: 404 });
      const doc = q.docs[0], amt = Number(doc.data().amount) || 0;
      if (amt <= 0 || amt > 10000) throw Object.assign(new Error('Invalid code value'), { status: 400 });
      tx.update(doc.ref, { status: 'Used by ' + req.user.uid, usedAt: now() });
      tx.update(firestore.collection('users').doc(req.user.uid), { 'wallets.bonus': increment(amt) });
      tx.set(firestore.collection('transactions').doc(), { userId: req.user.uid, type: 'Redeem Code', desc: code, amount: amt, status: 'Success', date: now() });
      return amt;
    });
    reply(res, 200, { ok: true, credited: out });
  } catch (e) { reply(res, e.status || 500, { error: e.message }); }
});

app.post('/api/wallet/join', needFirebase, auth, async (req, res) => {
  try {
    const { tournamentId, players = [] } = req.body;
    if (!tournamentId) return reply(res, 400, { error: 'tournamentId required' });
    const firestore = db(), tRef = firestore.collection('tournaments').doc(String(tournamentId)), uRef = firestore.collection('users').doc(req.user.uid);
    const out = await firestore.runTransaction(async (tx) => {
      const [t, u] = await Promise.all([tx.get(tRef), tx.get(uRef)]);
      if (!t.exists) throw Object.assign(new Error('Tournament not found'), { status: 404 });
      const d = t.data(), w = u.data()?.wallets || { winning: 0, deposit: 0, bonus: 0 };
      const fee = Number(d.fee || d.entryFee || 0) * Math.max(1, players.length);
      if (fee <= 0) throw Object.assign(new Error('Use free join'), { status: 400 });
      if (String(d.status) !== 'upcoming') throw Object.assign(new Error('Registration closed'), { status: 409 });
      const joined = d.joinedUsers || [];
      if (joined.length >= Number(d.capacity || 999)) throw Object.assign(new Error('Tournament full'), { status: 409 });
      if (joined.some((p) => p.userDocId === req.user.uid)) throw Object.assign(new Error('Already joined'), { status: 409 });
      let rem = fee, dep = w.deposit || 0, win = w.winning || 0, bon = w.bonus || 0;
      const useBon = Math.min(bon, fee); bon -= useBon; rem -= useBon;
      const useDep = Math.min(dep, rem); dep -= useDep; rem -= useDep;
      const useWin = Math.min(win, rem); win -= useWin; rem -= useWin;
      if (rem > 0) throw Object.assign(new Error('Insufficient balance'), { status: 400 });
      tx.update(uRef, { 'wallets.deposit': dep, 'wallets.winning': win, 'wallets.bonus': bon });
      tx.update(tRef, { joinedUsers: [...joined, ...players.map((p) => ({ ...p, userDocId: req.user.uid, joinedAt: new Date().toISOString() }))] });
      tx.set(firestore.collection('transactions').doc(), { userId: req.user.uid, type: 'Match Entry', desc: d.name || 'Tournament', amount: fee, status: 'Success', date: now() });
      return { fee, balance: { deposit: dep, winning: win, bonus: bon } };
    });
    reply(res, 200, { ok: true, ...out });
  } catch (e) { reply(res, e.status || 500, { error: e.message }); }
});

/* ---- store / level / airdrop (server-side so rules can stay strict) ---- */
app.post('/api/wallet/store', needFirebase, auth, async (req, res) => {
  try {
    const key = String(req.body.itemKey || '');
    const priceMap = {
      avatar_upload: 'itemAvatar', gold_crown: 'itemCrown', blue_tick: 'itemTick',
      weekly_vip: 'pWeekly', monthly_vip: 'pMonthly',
    };
    const priceField = priceMap[key];
    if (!priceField) return reply(res, 400, { error: 'Unknown store item' });
    const firestore = db(), uRef = firestore.collection('users').doc(req.user.uid), pRef = firestore.collection('settings').doc('pricing');
    const out = await firestore.runTransaction(async (tx) => {
      const [u, p] = await Promise.all([tx.get(uRef), tx.get(pRef)]);
      const price = Number(p.data()?.[priceField] || { itemAvatar: 15, itemCrown: 20, itemTick: 20, pWeekly: 49, pMonthly: 149 }[priceField]);
      const owned = u.data()?.purchasedItems || [];
      if (owned.includes(key) && !key.includes('vip')) throw Object.assign(new Error('Already owned'), { status: 409 });
      const w = u.data()?.wallets || { winning: 0, deposit: 0, bonus: 0 };
      let rem = price, dep = w.deposit || 0, win = w.winning || 0, bon = w.bonus || 0;
      const ub = Math.min(bon, rem); bon -= ub; rem -= ub;
      const ud = Math.min(dep, rem); dep -= ud; rem -= ud;
      const uw = Math.min(win, rem); win -= uw; rem -= uw;
      if (rem > 0) throw Object.assign(new Error('Insufficient balance'), { status: 400 });
      tx.update(uRef, {
        'wallets.deposit': dep, 'wallets.winning': win, 'wallets.bonus': bon,
        purchasedItems: admin.firestore.FieldValue.arrayUnion(key),
      });
      tx.set(firestore.collection('transactions').doc(), { userId: req.user.uid, type: 'Store Purchase', desc: key, amount: price, status: 'Success', date: now() });
      return { price, balance: { deposit: dep, winning: win, bonus: bon } };
    });
    reply(res, 200, { ok: true, ...out });
  } catch (e) { reply(res, e.status || 500, { error: e.message }); }
});

app.post('/api/wallet/level', needFirebase, auth, async (req, res) => {
  try {
    const level = Number(req.body.level);
    if (!Number.isInteger(level) || level < 1 || level > 100) return reply(res, 400, { error: 'Invalid level' });
    const firestore = db(), uRef = firestore.collection('users').doc(req.user.uid);
    const out = await firestore.runTransaction(async (tx) => {
      const u = await tx.get(uRef);
      const claimed = u.data()?.claimedLevels || [];
      if (claimed.includes(level)) return { duplicate: true, credited: 0 };
      const reward = level * 5;
      tx.update(uRef, {
        'wallets.bonus': increment(reward),
        claimedLevels: admin.firestore.FieldValue.arrayUnion(level),
      });
      tx.set(firestore.collection('transactions').doc(), { userId: req.user.uid, type: 'Level Bonus', desc: 'Level ' + level, amount: reward, status: 'Success', date: now() });
      return { credited: reward };
    });
    reply(res, 200, { ok: true, ...out });
  } catch (e) { reply(res, e.status || 500, { error: e.message }); }
});

app.post('/api/wallet/airdrop', needFirebase, auth, async (req, res) => {
  try {
    const { utr, proofUrl, offerType, amountPaid } = req.body;
    if (!utr && !proofUrl) return reply(res, 400, { error: 'UTR or screenshot required' });
    const r = await db().collection('airdrops').add({
      userId: req.user.uid, userEmail: req.user.email || '', offerType: offerType || 'airdrop',
      amountPaid: Number(amountPaid) || 0, utr: String(utr || ''), proofUrl: String(proofUrl || ''),
      proofType: proofUrl ? 'Screenshot' : 'UTR', status: 'Pending', createdAt: now(),
    });
    reply(res, 200, { ok: true, id: r.id });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* ---- admin: approve / reject deposits & withdrawals (server-side money) ---- */
app.post('/api/admin/deposits/:id/:action', needFirebase, privileged, async (req, res) => {
  try {
    const { id, action } = req.params;
    const ref = db().collection('deposits').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return reply(res, 404, { error: 'Deposit not found' });
    const d = snap.data();
    if (d.status !== 'Pending') return reply(res, 409, { error: 'Already ' + d.status });
    if (action === 'approve') {
      await creditWallet({ userId: d.userId, amount: Number(d.amount), eventKey: `dep_${id}`, description: 'Manual deposit approval' });
      await ref.update({ status: 'Approved', reviewedBy: req.user.uid, reviewedAt: now() });
      await sendPushToUser(d.userId, 'Deposit Successful ✅', `₹${d.amount} added to your wallet.`, { type: 'payment' });
    } else {
      await ref.update({ status: 'Rejected', rejectReason: String(req.body.reason || 'Invalid proof'), reviewedAt: now() });
      await sendPushToUser(d.userId, 'Deposit Rejected ❌', String(req.body.reason || 'Invalid screenshot / UTR.'), { type: 'payment' });
    }
    reply(res, 200, { ok: true, action });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

app.post('/api/admin/withdrawals/:id/:action', needFirebase, privileged, async (req, res) => {
  try {
    const { id, action } = req.params;
    const ref = db().collection('withdrawals').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return reply(res, 404, { error: 'Withdrawal not found' });
    const d = snap.data();
    if (d.status !== 'Pending') return reply(res, 409, { error: 'Already ' + d.status });
    if (action === 'approve') {
      await ref.update({ status: 'Approved', reviewedBy: req.user.uid, reviewedAt: now() });
      await sendPushToUser(d.userId, 'Withdrawal Approved 💸', `₹${d.amount} has been sent to your UPI.`, { type: 'payment' });
    } else {
      // refund the amount that was deducted at request time
      await db().collection('users').doc(d.userId).update({ 'wallets.winning': increment(Number(d.amount)) });
      await ref.update({ status: 'Rejected', rejectReason: String(req.body.reason || 'Invalid details'), reviewedAt: now() });
      await sendPushToUser(d.userId, 'Withdrawal Rejected ❌', String(req.body.reason || 'Invalid UPI details.'), { type: 'payment' });
    }
    reply(res, 200, { ok: true, action });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* ---- IMAGE STORAGE WITHOUT CLOUD STORAGE (100% Spark-free) ------------------
   Since 2026-02-03 Firebase Cloud Storage needs the paid Blaze plan even for
   its "free" quota. So we DON'T use Storage at all.
   Images go into Firestore (Spark: 1 GiB stored, 50k reads/day free) as base64
   and are served back by /api/media/:id — a normal http(s) URL that works in
   every <img src> and with the old `startsWith('http')` checks in the HTML.
   Client code shrinks images first (see firex-upgrade.js / firex-admin.js) so a
   document stays well under Firestore's 1 MB limit.                            */
const MEDIA_LIMIT = 700 * 1024;   // ~950 KB base64 < 1 MB doc limit
app.post('/api/upload', needFirebase, auth, express.raw({ type: ['image/*'], limit: '900kb' }), async (req, res) => {
  try {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    if (!buf.length) return reply(res, 400, { error: 'No image received' });
    if (buf.length > MEDIA_LIMIT) return reply(res, 413, { error: 'Image too large (max 700 KB). Chhoti photo chunein.' });
    const ct = String(req.headers['content-type'] || 'image/jpeg').toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(ct)) return reply(res, 400, { error: 'Only JPEG / PNG / WebP / GIF' });
    const id = crypto.randomUUID();
    await db().collection('media').doc(id).set({
      data: buf.toString('base64'), contentType: ct, size: buf.length,
      owner: req.user.uid, createdAt: now(),
    });
    // Relative by default = same origin (our ONE-URL design). PUBLIC_URL is
    // only needed if images must be served from a different host.
    const url = process.env.PUBLIC_URL
      ? process.env.PUBLIC_URL.replace(/\/+$/, '') + '/api/media/' + id
      : '/api/media/' + id;
    reply(res, 200, { url, mediaId: id });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* Public: <img src> tags must load without an Authorization header. */
app.get('/api/media/:id', needFirebase, async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).send('Bad id');
    const s = await db().collection('media').doc(id).get();
    if (!s.exists) return res.status(404).send('Not found');
    const d = s.data();
    const buf = Buffer.from(d.data || '', 'base64');
    if (!buf.length) return res.status(404).send('Empty');
    res.set('Content-Type', d.contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('Content-Length', String(buf.length));
    res.send(buf);
  } catch (e) { res.status(500).send('Error'); }
});

/* ---- push ---- */
app.post('/api/push/register', needFirebase, auth, async (req, res) => {
  try {
    const token = String(req.body.token || '');
    if (token.length < 20 || token.length > 1024) return reply(res, 400, { error: 'Invalid token' });
    const id = crypto.createHash('sha256').update(token).digest('hex').slice(0, 40);
    await db().collection('device_tokens').doc(id).set({
      userId: req.user.uid, token, platform: req.body.platform || 'web',
      updatedAt: now(),
    });
    reply(res, 200, { ok: true });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

app.post('/api/push/send', needFirebase, privileged, async (req, res) => {
  try {
    const { title, body, userIds, topic } = req.body;
    if (!title || !body) return reply(res, 400, { error: 'title/body required' });
    const tokens = new Set();
    if (Array.isArray(userIds) && userIds.length) {
      for (const uid of userIds.slice(0, 500)) {
        const s = await db().collection('device_tokens').where('userId', '==', uid).get();
        s.docs.forEach((d) => tokens.add(d.data().token));
      }
    } else if (topic) {
      try { await admin.messaging().send({ topic, notification: { title, body } }); reply(res, 200, { mode: 'topic', ok: true }); return; }
      catch (e) { return reply(res, 502, { error: e.message }); }
    } else {
      const s = await db().collection('device_tokens').limit(500).get();
      s.docs.forEach((d) => tokens.add(d.data().token));
    }
    const list = [...tokens].filter(Boolean);
    let sent = 0, failed = 0;
    // Native APKs subscribe to the `firex_all` topic, so a broadcast reaches
    // Android devices even before the web app has registered its token.
    if (!Array.isArray(userIds) || !userIds.length) {
      try {
        await admin.messaging().send({
          topic: topic || 'firex_all',
          notification: { title, body },
          data: { title, body, route: 'notifications' },
          android: { priority: 'high', notification: { channelId: 'firex_updates' } },
        });
        sent += 1;
      } catch (e) { console.warn('[push] topic:', e.message); }
    }
    if (list.length) {
      const r = await admin.messaging().sendEachForMulticast({
        tokens: list, notification: { title, body },
        data: { title, body, route: 'notifications' },
        android: { priority: 'high', notification: { channelId: 'firex_updates' } },
      });
      sent += r.successCount; failed += r.failureCount;
    }
    await db().collection('notifications').add({ targetUser: userIds?.length ? userIds[0] : 'all', title, body, category: 'Alert', createdAt: now() });
    reply(res, 200, { sent, failed, note: sent ? undefined : 'No registered devices yet (topic send may still have been delivered)' });
  } catch (e) { reply(res, 500, { error: e.message }); }
});

/* --------------------------------------------------------------- static app */
app.use(express.static(WEB_DIR, { index: 'user.html', extensions: ['html'] }));
app.get('/staff', (req, res) => res.sendFile(path.join(WEB_DIR, 'staff.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(WEB_DIR, 'admin.html')));
app.get('/splash', (req, res) => res.sendFile(path.join(WEB_DIR, 'splash.html')));
app.get('/downloads', (req, res) => res.sendFile(path.join(WEB_DIR, 'downloads.html')));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => console.log(`[firex] http://0.0.0.0:${PORT}  provider=${PROVIDER}  firebase=${firebaseReady}`));
