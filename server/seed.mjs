#!/usr/bin/env node
/** Seed starter data into the FRESH Firestore (runs once, idempotent-ish).
 *  Uses Admin SDK -> bypasses rules. Never writes any secret.
 *  SA_PATH=/path/to/service-account.json node scripts/seed.mjs
 */
import fs from 'node:fs';
import admin from 'firebase-admin';

const sa = JSON.parse(fs.readFileSync(process.env.SA_PATH || '/home/user/.cache/firex/service-account.json', 'utf8'));
const pid = sa.project_id;
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: pid, storageBucket: pid + '.firebasestorage.app' });
const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp();

const settings = {
  general: {
    appName: 'FIREX Esports', signupBonus: 10, minDeposit: 10, maxDeposit: 1000,
    // APP_VERSION in the HTML is 1. Keep latestVersion <= 1, otherwise the
    // force-update modal hard-blocks the app (and updateLink is empty anyway).
    // Admin can raise it later ONLY together with a real updateLink.
    upiId: 'firex@upi', qrUrl: '', whatsappFloat: '', latestVersion: 1, updateLink: '',
    privacyPolicy: 'Add your privacy policy here.', fairPlayPolicy: 'Play fair. No cheats, no teaming.',
    note: 'No API keys / secrets belong in this document — it is readable by every signed-in user.'
  },
  theme: { activeTheme: 'orange' },
  pricing: { pWeekly: 49, pMonthly: 149, pCrown: 20, pTick: 20, itemAvatar: 15, itemCrown: 20, itemTick: 20 },
  referral: { bonusAmount: 10 },
  withdrawLimits: { min: 50, max: 5000, dailyCount: 3 },
  appStatus: { status: 'open', message: '', start: '', end: '' },
  liveStats: { activeCount: 0 },
  socials: { whatsapp: '', telegram: 'https://t.me/tnvboss', instagram: '', youtube: '', discord: '' },
};

const games = [
  { name: 'Free Turnament', slug: 'free-turnament', active: true, image: '/assets/home-reference.jpg', description: 'Free entry practice matches' },
  { name: 'Full map solo survival', slug: 'full-map-solo', active: true, image: '/assets/home-reference.jpg', description: 'Full map, solo survival' },
  { name: 'Full map', slug: 'full-map', active: true, image: '/assets/home-reference.jpg', description: 'Full map classic' },
  { name: 'Lone wolf T1', slug: 'lone-wolf', active: true, image: '/assets/home-reference.jpg', description: 'Lone Wolf 1v1' },
];

async function main() {
  const batch = db.batch();
  for (const [k, v] of Object.entries(settings)) {
    batch.set(db.collection('settings').doc(k), { ...v, updatedAt: ts }, { merge: true });
  }
  const banners = db.collection('admin_banners').doc('welcome');
  batch.set(banners, { title: 'FIREX Esports', link: '', image: '/assets/splash-poster.jpg', active: true, createdAt: ts }, { merge: true });
  for (const g of games) {
    batch.set(db.collection('admin_games').doc(g.slug), { ...g, createdAt: ts }, { merge: true });
  }
  // Admin panel jaisa hi shape: status 'Upcoming' (capital U), `max` slots,
  // `category` = admin_games ka name — warna client category screen / slot grid
  // me match dikhta hi nahi. Server dono (max / capacity) accept karta hai.
  batch.set(db.collection('tournaments').doc('welcome-free-match'), {
    name: 'Welcome Free Match', category: 'Free Turnament',
    fee: 0, entryFee: 0, max: 48, capacity: 48,
    status: 'Upcoming',
    time: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
    startsAt: new Date(Date.now() + 24 * 3600 * 1000),
    prizeDescription: '₹0 · Practice', map: 'Bermuda', type: 'Solo',
    perKill: 0, pool: 0, rules: '', isVipOnly: false, joinedUsers: [], createdAt: ts,
  }, { merge: true });
  await batch.commit();
  console.log('seeded settings (' + Object.keys(settings).length + '), games (' + games.length + '), 1 banner, 1 tournament');
  const cols = await db.listCollections();
  console.log('collections now:', cols.map(c => c.id).sort().join(', '));
}
main().catch(e => { console.error(e); process.exit(1); });
