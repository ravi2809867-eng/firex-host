/* ============================================================================
 * FireX SUPER ADMIN — v3 upgrade pack (loaded at end of admin.html)
 *  * push goes through the free backend (no REST key in the browser)
 *  * deposit / withdrawal approval writes money server-side (rules block clients)
 *  * Zap / OneSignal secrets are NEVER stored in Firestore any more
 *  * 10 themes (matching the user app) + admin default
 *  * staff panel link + one-time secure owner bootstrap + refresh
 * ==========================================================================*/
(function () {
  'use strict';
  const API = (window.FIREX_API_BASE || '') + '/api';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function tok() { const u = firebase.auth().currentUser; if (!u) throw new Error('Sign in required'); return u.getIdToken(true); }
  async function api(path, body = {}, method = 'POST') {
    const t = await tok();
    const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: method === 'GET' ? undefined : JSON.stringify(body) });
    const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch { }
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  function note(msg, bad) { try { if (typeof showToast === 'function') return showToast(msg, !!bad); } catch (e) { } alert(msg); }

  /* Images Firestore me jaati hain (Cloud Storage Blaze-only hai). Doc 1 MB
     se chhota rakhne ke liye client-side resize. */
  async function shrinkImage(file, maxSide = 900, quality = 0.72) {
    if (!file || !file.type || !file.type.startsWith('image/')) return file;
    if (file.size && file.size <= 250 * 1024) return file;
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const w = img.width || 1, h = img.height || 1;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
      return blob && blob.size < file.size ? new File([blob], 'upload.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }
  function mediaUrl(u) {
    return /^https?:\/\//.test(u || '') ? u : ((window.FIREX_API_BASE || location.origin) + (u || ''));
  }

  /* -------------------------------------------------- 1. no secrets in DB */
  window.saveZapApi = function () {
    alert('Payment gateway keys are now configured in the SERVER (.env), not in Firestore.\nSet PAYMENT_PROVIDER / RAZORPAY_* or UPIQR_* there. This closes a security hole: settings/general was readable by every user.');
  };
  window.fetchOneSignalKeys = function () { /* no client-side REST keys any more */ };
  window.saveOneSignalKeys = function () {
    alert('Push is now sent by the backend using Firebase Admin SDK / FCM. No REST API key is stored in the browser or Firestore.');
    try { window.closeModal('osSetModal'); } catch (e) { }
  };

  /* ----------------------------------------------------- 2. push via server */
  window.sendPushGlobal = async function (userEmailOrAll, title, message) {
    try {
      let userIds;
      if (userEmailOrAll && userEmailOrAll !== 'All') {
        const q = await firebase.firestore().collection('users').where('email', '==', userEmailOrAll).limit(1).get();
        if (!q.empty) userIds = [q.docs[0].id];
      }
      const r = await api('/push/send', { title, body: message, userIds });
      note('Push dispatched: ' + (r.sent || 0) + ' sent');
    } catch (e) { note('Push failed: ' + e.message, true); }
  };

  /* ------------------------------------ 3. money approvals server-side */
  window.approveDeposit = async function (dId, uId, a, uEmail) {
    if (!confirm('Approve ₹' + a + '?')) return;
    try { await api('/admin/deposits/' + dId + '/approve', {}); note('Deposit approved ✓'); window.fetchDepositsNormal && window.fetchDepositsNormal(); window.loadDashboardStats && window.loadDashboardStats(); }
    catch (e) { note(e.message, true); }
  };
  window.rejectDeposit = async function (dId, uEmail) {
    if (!confirm('Reject this deposit?')) return;
    const reason = prompt('Reason:') || 'Invalid screenshot / UTR';
    try { await api('/admin/deposits/' + dId + '/reject', { reason }); note('Deposit rejected'); window.fetchDepositsNormal && window.fetchDepositsNormal(); }
    catch (e) { note(e.message, true); }
  };
  window.actWid = async function (docId, uid, amt, type, upiMethod, userEmail) {
    const action = String(type).toLowerCase() === 'approve' ? 'approve' : 'reject';
    if (!confirm(action.toUpperCase() + ' withdrawal of ₹' + amt + '?')) return;
    const reason = action === 'reject' ? (prompt('Reason:') || 'Invalid UPI details') : undefined;
    try { await api('/admin/withdrawals/' + docId + '/' + action, { reason }); note('Withdrawal ' + action + 'd ✓'); window.fetchWithdrawals && window.fetchWithdrawals(); window.loadDashboardStats && window.loadDashboardStats(); }
    catch (e) { note(e.message, true); }
  };

  /* --------------------------------------------- 4. image upload via backend */
  window.uploadImage = async function (file, folder) {
    const t = await tok();
    const payload = await shrinkImage(file);
    const r = await fetch(API + '/upload', {
      method: 'POST',
      headers: { 'Content-Type': payload.type || 'image/jpeg', 'x-file-ext': ((payload.name || 'upload.jpg').split('.').pop() || 'jpg').slice(0, 5), Authorization: 'Bearer ' + t },
      body: payload,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Upload failed');
    return mediaUrl(j.url);
  };

  /* ------------------------------------------------------------- 5. themes */
  const THEMES = [
    ['neon_blue', 'Neon Blue', '#2f8bff'], ['purple_neon_blue', 'Purple + Neon Blue', '#a855f7'],
    ['black_red', 'Black + Red', '#ff3b5c'], ['black_gold_vip', 'Black + Gold VIP', '#ffc93c'],
    ['neon_green', 'Neon Green', '#28e07a'], ['black_grey_dark', 'Black + Grey Dark', '#8b93a5'],
    ['cyan_black', 'Cyan + Black', '#00e5ff'], ['black_orange', 'Black + Orange', '#ff8c00'],
    ['neon_pink', 'Neon Pink', '#ff5cc8'], ['rgb_cyberpunk', 'RGB Cyberpunk', '#a855f7'],
  ];
  window.applyTheme = async function (id) {
    if (!confirm('Set "' + id + '" as the shared theme for all users?')) return;
    try { await firebase.firestore().collection('settings').doc('theme').set({ activeTheme: id }, { merge: true }); note('Theme updated to ' + id); window.updateThemeUI && window.updateThemeUI(id); }
    catch (e) { note('Failed: ' + e.message, true); }
  };
  window.updateThemeUI = function (active) {
    $$('.theme-card').forEach(c => c.classList.remove('active'));
    $$('[id^="status-"]').forEach(el => { el.innerHTML = 'Click to Apply'; });
    const card = document.getElementById('theme-' + active); if (card) card.classList.add('active');
    const st = document.getElementById('status-' + active);
    if (st) st.innerHTML = "<i class='fa-solid fa-check'></i> Active Theme";
  };
  function injectThemes() {
    const sec = document.getElementById('sec-Themes'); if (!sec || sec.dataset.v3) return;
    sec.dataset.v3 = '1';
    const grid = sec.querySelector('.theme-grid') || sec.querySelector('div[style*="grid"]');
    const box = document.createElement('div');
    box.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:16px';
    box.innerHTML = '<div style="grid-column:1/-1;font-size:11px;color:var(--text-sub)">FireX v3 themes (shared by all users until a user picks a device theme)</div>' +
      THEMES.map(([id, name, color]) => `<div class="theme-card" id="theme-${id}" onclick="window.applyTheme('${id}')" style="background:linear-gradient(45deg,#11131c,${color});padding:12px;border-radius:10px;text-align:center;cursor:pointer">
        <h4 style="color:#fff;margin:0;font-size:12px">${esc(name)}</h4><div id="status-${id}" style="font-size:10px;color:#ddd">Click to Apply</div></div>`).join('') +
      `<div class="theme-card" id="theme-orange" onclick="window.applyTheme('orange')" style="background:linear-gradient(45deg,#1a1a2e,#ff8c00);padding:12px;border-radius:10px;text-align:center;cursor:pointer">
        <h4 style="color:#fff;margin:0;font-size:12px">White &amp; Orange (Default)</h4><div id="status-orange-v3" style="font-size:10px;color:#ddd">Click to Apply</div></div>`;
    sec.appendChild(box);
  }

  /* ------------------------------------- 6. sidebar: staff, bootstrap, refresh */
  function injectAdminTools() {
    const side = document.getElementById('sidebar'); if (!side || side.dataset.v3) return;
    side.dataset.v3 = '1';
    side.insertAdjacentHTML('beforeend', `
      <div class="nav-item" onclick="window.open('/staff','_blank')" style="color:var(--info)"><i class="fa-solid fa-user-gear"></i> Staff Panel ↗</div>
      <div class="nav-item" onclick="FireXAdmin.refresh()" style="color:var(--admin-accent)"><i class="fa-solid fa-rotate-right"></i> Refresh data</div>`);
    // Owner is already provisioned server-side (custom claims on
    // firexadmin@gmail.com). Do NOT show the one-time "Set owner" box any more —
    // it is confusing and a takeover surface. Keep only the nav shortcuts above.
    return;
  }
  window.FireXAdmin = {
    refresh() {
      ['fetchAppConfig', 'loadDashboardStats', 'fetchUsers', 'fetchDepositsNormal', 'fetchWithdrawals', 'fetchMgmtTournaments', 'fetchGames'].forEach(fn => { try { typeof window[fn] === 'function' && window[fn](); } catch (e) { } });
      note('Refreshed ✓');
    },
    async bootstrap() {
      const uid = ($('#v3OwnerUid')?.value || '').trim(), token = ($('#v3BootToken')?.value || '').trim();
      if (!uid || !token) return note('UID and BOOTSTRAP_TOKEN required', true);
      try {
        const r = await fetch(API + '/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bootstrap-token': token }, body: JSON.stringify({ uid, email: firebase.auth().currentUser?.email || '' }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        note('Owner set ✓ — sign out and back in to refresh your token.');
      } catch (e) { note(e.message, true); }
    }
  };

  window.addEventListener('error', (e) => console.warn('[firex-admin] handled:', e.message));
  window.addEventListener('unhandledrejection', (e) => console.warn('[firex-admin] handled:', e.reason?.message || e.reason));

  function init() { injectThemes(); injectAdminTools(); try { window.fetchActiveTheme && window.fetchActiveTheme(); } catch (e) { } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
