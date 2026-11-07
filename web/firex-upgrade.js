/* ============================================================================
 * FireX Esports — v3 UPGRADE PACK (drop-in, loaded at the END of user.html)
 * Adds: premium splash · 10 themes · press-again-to-exit · refresh system ·
 *       FCM push registration · auto payment gateway checkout · secure wallet
 *       operations (all money now goes through the free backend, not the client)
 *       safe-area/FAB fixes · global error guards.
 * No external CDN is required for these features.
 * ==========================================================================*/
(function () {
  'use strict';
  const API = (window.FIREX_API_BASE || '') + '/api';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  /* ------------------------------------------------------------- API helper */
  async function idToken() {
    const u = firebase.auth().currentUser;
    if (!u) throw new Error('Sign in required');
    return u.getIdToken(true);
  }
  async function api(path, body = {}, method = 'POST') {
    const t = await idToken();
    const r = await fetch(API + path, {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
      body: method === 'GET' ? undefined : JSON.stringify(body),
    });
    const txt = await r.text(); let j = null;
    try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }
  function toast(msg, bad) {
    try { if (typeof showToast === 'function') return showToast(msg, !!bad); } catch (e) { }
    const t = $('#firexToast'); if (!t) return;
    t.textContent = msg; t.style.background = bad ? '#dc3545' : '#ff8c00'; t.style.display = 'block';
    clearTimeout(t._t); t._t = setTimeout(() => t.style.display = 'none', 3200);
  }
  function refreshViews() {
    try {
      if (window.currentUser && typeof loadUserProfile === 'function') loadUserProfile(window.currentUser.uid);
      if (typeof loadUserTransactions === 'function') loadUserTransactions();
      if (typeof filterMyMatches === 'function') filterMyMatches('Upcoming', $('.match-tabs .tab-btn.active'));
      if (typeof calculateProfileStats === 'function') calculateProfileStats();
      if (typeof loadNotifications === 'function') loadNotifications();
    } catch (e) { }
  }

  /* --------------------------------------------------------------- 1. SPLASH */
  const SPLASH_CSS = `
  #firexSplash{position:fixed;inset:0;z-index:9999999;background:#07080c;display:flex;align-items:stretch;justify-content:center;overflow:hidden}
  #firexSplash .fs-stage{position:relative;width:100%;max-width:480px;height:100%;overflow:hidden}
  #firexSplash .fs-poster{position:absolute;inset:0;background:url('assets/splash-poster.jpg') center top/cover no-repeat;animation:fsPoster 1.1s cubic-bezier(.2,.8,.2,1) both}
  @keyframes fsPoster{from{opacity:0;transform:scale(1.08)}to{opacity:1;transform:scale(1.015)}}
  #firexSplash .fs-vig{position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 34%,transparent 42%,rgba(8,8,12,.34) 100%)}
  #firexSplash .fs-sweep{position:absolute;top:-30%;left:-60%;width:38%;height:170%;transform:skewX(-18deg);mix-blend-mode:screen;opacity:.45;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:fsSweep 5.2s ease-in-out infinite}
  @keyframes fsSweep{0%{left:-60%}55%,100%{left:130%}}
  .fs-ember{position:absolute;width:5px;height:5px;border-radius:50%;background:#ffb62e;box-shadow:0 0 12px 3px rgba(255,150,20,.75);opacity:0;animation:fsEmber 4.6s linear infinite}
  @keyframes fsEmber{0%{opacity:0;transform:translateY(20px) scale(.5)}18%{opacity:.9}80%{opacity:.55}100%{opacity:0;transform:translateY(-190px) scale(1.25)}}
  #firexSplash .fs-console{position:absolute;left:0;right:0;bottom:0;padding:0 28px calc(24px + env(safe-area-inset-bottom));color:#14151a;text-align:center;background:linear-gradient(to bottom,rgba(255,255,255,0) 0%,rgba(255,255,255,.97) 20%,#fff 48%)}
  #firexSplash .fs-features{display:flex;justify-content:center;gap:6px;margin:44px 0 18px}
  #firexSplash .fs-feature{flex:1;max-width:110px;display:flex;flex-direction:column;align-items:center;gap:7px;font-size:9.5px;font-weight:800;letter-spacing:.11em;animation:fsUp .7s both}
  #firexSplash .fs-feature:nth-child(1){animation-delay:.45s}#firexSplash .fs-feature:nth-child(3){animation-delay:.58s}#firexSplash .fs-feature:nth-child(5){animation-delay:.71s}
  @keyframes fsUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  #firexSplash .fs-sep{width:1px;height:26px;background:linear-gradient(#ffb020,#ff7a00);opacity:.55;align-self:center}
  #firexSplash .fs-ico{font-size:24px;line-height:1;filter:drop-shadow(0 2px 3px rgba(255,150,0,.25))}
  #firexSplash .fs-loading{font-size:13px;font-weight:800;letter-spacing:.32em;margin:0 0 12px}
  #firexSplash .fs-loading span::after{content:'';animation:fsDots 1.4s steps(4,end) infinite}
  @keyframes fsDots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}100%{content:''}}
  #firexSplash .fs-track{position:relative;height:12px;border-radius:99px;background:#e7e7ec;box-shadow:inset 0 1px 3px rgba(0,0,0,.12)}
  #firexSplash .fs-fill{position:absolute;left:0;top:0;bottom:0;width:0%;border-radius:99px;background:linear-gradient(90deg,#ff7a00,#ff9d00 45%,#ffc72c);box-shadow:0 0 16px rgba(255,140,0,.6);transition:width .25s ease}
  #firexSplash .fs-fill::after{content:'';position:absolute;inset:0;border-radius:99px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);transform:translateX(-100%);animation:fsShimmer 1.5s linear infinite}
  @keyframes fsShimmer{to{transform:translateX(100%)}}
  #firexSplash .fs-spark{position:absolute;top:50%;width:30px;height:30px;left:0;transform:translate(-50%,-50%);filter:drop-shadow(0 0 9px rgba(140,60,255,.9));animation:fsSpark 1.3s ease-in-out infinite;transition:left .25s ease}
  @keyframes fsSpark{0%,100%{transform:translate(-50%,-50%) scale(.92)}50%{transform:translate(-50%,-50%) scale(1.12)}}
  #firexSplash .fs-foot{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px;font-size:10px;font-weight:800;letter-spacing:.28em}
  #firexSplash .fs-foot i{display:block;width:26px;height:2px;border-radius:2px;background:#ff9d00}
  #firexSplash .fs-pct{font-variant-numeric:tabular-nums;letter-spacing:.08em;color:#ff7a00}
  #firexSplash.hide{opacity:0;transition:opacity .55s ease;pointer-events:none}
  @media (prefers-reduced-motion:reduce){#firexSplash *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
  `;
  function buildSplash() {
    const st = document.createElement('style'); st.textContent = SPLASH_CSS; document.head.appendChild(st);
    const d = document.createElement('div'); d.id = 'firexSplash';
    d.innerHTML = `<div class="fs-stage">
      <div class="fs-poster"></div><div class="fs-vig"></div><div class="fs-sweep"></div>
      <div id="fsEmbers"></div>
      <div class="fs-console">
        <div class="fs-features">
          <div class="fs-feature"><div class="fs-ico">🏆</div>TOURNAMENTS</div><div class="fs-sep"></div>
          <div class="fs-feature"><div class="fs-ico">⚔️</div>MATCHES</div><div class="fs-sep"></div>
          <div class="fs-feature"><div class="fs-ico">🎁</div>REWARDS</div>
        </div>
        <div class="fs-loading">LOADING<span></span></div>
        <div class="fs-track"><div class="fs-fill" id="fsFill"></div><img class="fs-spark" id="fsSpark" src="assets/flame-logo.jpg" alt=""></div>
        <div class="fs-foot"><i></i><span>GET READY TO PLAY</span><i></i><span class="fs-pct" id="fsPct">0%</span></div>
      </div></div>`;
    document.body.appendChild(d);
    const box = d.querySelector('#fsEmbers');
    for (let i = 0; i < 14; i++) {
      const e = document.createElement('span'); e.className = 'fs-ember';
      e.style.left = (8 + Math.random() * 84) + '%'; e.style.top = (48 + Math.random() * 40) + '%';
      e.style.animationDelay = (Math.random() * 4.6) + 's'; e.style.animationDuration = (3.4 + Math.random() * 2.6) + 's';
      const s = (3 + Math.random() * 4).toFixed(1) + 'px'; e.style.width = e.style.height = s;
      box.appendChild(e);
    }
    return d;
  }
  const FireX = window.FireX = {};
  const splashEl = buildSplash();
  let splashPct = 0, splashDone = false;
  FireX.splash = {
    set(v) { splashPct = Math.max(splashPct, Math.min(100, Math.round(v))); const f = $('#fsFill'), s = $('#fsSpark'), p = $('#fsPct'); if (f) f.style.width = splashPct + '%'; if (s) s.style.left = splashPct + '%'; if (p) p.textContent = splashPct + '%'; },
    hide() { if (splashDone) return; splashDone = true; FireX.splash.set(100); setTimeout(() => { splashEl.classList.add('hide'); setTimeout(() => splashEl.remove(), 600); }, 350); }
  };
  const splashTimer = setInterval(() => { if (!splashDone) FireX.splash.set(splashPct + (splashPct < 80 ? 7 : 2)); }, 220);
  setTimeout(() => { clearInterval(splashTimer); FireX.splash.hide(); }, 6500);
  try { firebase.auth().onAuthStateChanged(() => { clearInterval(splashTimer); setTimeout(() => FireX.splash.hide(), 800); }); } catch (e) { }

  /* --------------------------------------------------------------- 2. THEMES */
  const THEMES = [
    { id: 'neon_blue', name: 'Neon Blue', dot: '#2f8bff', v: { '--bg-main': '#f4f8ff', '--surface-card': '#e8f1ff', '--primary': '#2f8bff', '--primary-glow': 'rgba(47,139,255,.3)', '--text-main': '#16233b', '--text-sub': '#5c7091', '--header-bg': 'rgba(244,248,255,.95)', '--border-color': 'rgba(30,80,160,.12)', '--input-bg': '#ffffff' } },
    { id: 'purple_neon_blue', name: 'Purple + Neon Blue', dot: '#a855f7', v: { '--bg-main': '#f7f4ff', '--surface-card': '#efe7ff', '--primary': '#8b5cf6', '--primary-glow': 'rgba(139,92,246,.3)', '--text-main': '#241640', '--text-sub': '#6b5a91', '--header-bg': 'rgba(247,244,255,.95)', '--border-color': 'rgba(100,60,170,.14)', '--input-bg': '#ffffff' } },
    { id: 'black_red', name: 'Black + Red', dot: '#ff3b5c', v: { '--bg-main': '#0d0f14', '--surface-card': '#181c25', '--primary': '#ff3b5c', '--primary-glow': 'rgba(255,59,92,.35)', '--text-main': '#f5f6fa', '--text-sub': '#9aa3b5', '--header-bg': 'rgba(13,15,20,.95)', '--border-color': 'rgba(255,255,255,.10)', '--input-bg': '#1b202b' } },
    { id: 'black_gold_vip', name: 'Black + Gold VIP', dot: '#ffc93c', v: { '--bg-main': '#0c0c0e', '--surface-card': '#1a1710', '--primary': '#ffc93c', '--primary-glow': 'rgba(255,201,60,.3)', '--text-main': '#fff8e6', '--text-sub': '#b6a983', '--header-bg': 'rgba(12,12,14,.96)', '--border-color': 'rgba(255,201,60,.16)', '--input-bg': '#1c1912' } },
    { id: 'neon_green', name: 'Neon Green', dot: '#28e07a', v: { '--bg-main': '#f3fff8', '--surface-card': '#e4f8ec', '--primary': '#1fbf68', '--primary-glow': 'rgba(31,191,104,.3)', '--text-main': '#123326', '--text-sub': '#5b7f6c', '--header-bg': 'rgba(243,255,248,.95)', '--border-color': 'rgba(20,130,80,.14)', '--input-bg': '#ffffff' } },
    { id: 'black_grey_dark', name: 'Black + Grey Dark', dot: '#8b93a5', v: { '--bg-main': '#111318', '--surface-card': '#1e222b', '--primary': '#9aa3b3', '--primary-glow': 'rgba(154,163,179,.25)', '--text-main': '#eef1f6', '--text-sub': '#969eae', '--header-bg': 'rgba(17,19,24,.96)', '--border-color': 'rgba(255,255,255,.09)', '--input-bg': '#20242e' } },
    { id: 'cyan_black', name: 'Cyan + Black', dot: '#00e5ff', v: { '--bg-main': '#05121a', '--surface-card': '#0d202b', '--primary': '#00d5f0', '--primary-glow': 'rgba(0,213,240,.3)', '--text-main': '#e8fdff', '--text-sub': '#82aeb9', '--header-bg': 'rgba(5,18,26,.96)', '--border-color': 'rgba(0,229,255,.14)', '--input-bg': '#0e2430' } },
    { id: 'black_orange', name: 'Black + Orange', dot: '#ff8c00', v: { '--bg-main': '#0e0f12', '--surface-card': '#1d1f24', '--primary': '#ff8c00', '--primary-glow': 'rgba(255,140,0,.32)', '--text-main': '#fff6ea', '--text-sub': '#a6a1a0', '--header-bg': 'rgba(14,15,18,.96)', '--border-color': 'rgba(255,140,0,.14)', '--input-bg': '#202228' } },
    { id: 'neon_pink', name: 'Neon Pink', dot: '#ff5cc8', v: { '--bg-main': '#fff4fb', '--surface-card': '#ffe6f5', '--primary': '#f43fb0', '--primary-glow': 'rgba(244,63,176,.3)', '--text-main': '#3d1230', '--text-sub': '#8c6280', '--header-bg': 'rgba(255,244,251,.95)', '--border-color': 'rgba(190,50,140,.14)', '--input-bg': '#ffffff' } },
    { id: 'rgb_cyberpunk', name: 'RGB Cyberpunk', dot: 'linear-gradient(90deg,#a855f7,#00e5ff)', v: { '--bg-main': '#080812', '--surface-card': '#141426', '--primary': '#a855f7', '--primary-glow': 'rgba(168,85,247,.35)', '--text-main': '#f2eaff', '--text-sub': '#9a90bd', '--header-bg': 'rgba(8,8,18,.96)', '--border-color': 'rgba(0,229,255,.18)', '--input-bg': '#17172b' } },
  ];
  const THEME_KEY = 'firex_theme_v3';
  function applyThemeVars(id) {
    const t = THEMES.find(x => x.id === id);
    const root = document.documentElement;
    if (!t) { THEMES.forEach(x => Object.keys(x.v).forEach(k => root.style.removeProperty(k))); return; }
    Object.entries(t.v).forEach(([k, v]) => root.style.setProperty(k, v));
  }
  function themeModalHTML(sel) {
    return `<div class="modal-overlay" id="firexThemeModal" style="display:flex"><div class="modal-content" style="border-radius:22px;max-height:88vh">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="font-size:18px">Choose a theme</h3><i class="fa-solid fa-xmark" style="font-size:22px;cursor:pointer" onclick="document.getElementById('firexThemeModal').remove()"></i></div>
      <p style="font-size:12px;color:var(--text-sub);margin-bottom:16px">Your selection is saved on this device. Use the Admin default to sync back to the shared theme.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${THEMES.map(t => `<div onclick="FireX.themes.pick('${t.id}')" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid ${sel === t.id ? 'var(--primary)' : 'var(--border-color)'};border-radius:12px;cursor:pointer;background:var(--surface-card)">
        <span style="width:36px;height:36px;border-radius:10px 14px 14px 10px;background:linear-gradient(90deg,#000 0 25%,${typeof t.dot === 'string' && t.dot.startsWith('#') ? t.dot : '#a855f7'} 25% 100%);flex:none"></span>
        <b style="font-size:12px">${esc(t.name)}</b>${sel === t.id ? '<span style="margin-left:auto;color:var(--primary)">✓</span>' : ''}</div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
        <button class="btn-outline" style="width:auto;padding:9px 16px;font-size:12px" onclick="FireX.themes.reset()">Use Admin default</button>
        <span style="font-size:11px;color:var(--text-sub)" id="firexThemeState">${sel ? 'Using device theme' : 'Using admin default'}</span>
      </div></div></div>`;
  }
  FireX.themes = {
    open() { const old = $('#firexThemeModal'); if (old) old.remove(); document.body.insertAdjacentHTML('beforeend', themeModalHTML(localStorage.getItem(THEME_KEY))); },
    pick(id) { localStorage.setItem(THEME_KEY, id); applyThemeVars(id); const old = $('#firexThemeModal'); if (old) old.remove(); toast('Theme saved on this device'); },
    async reset() {
      localStorage.removeItem(THEME_KEY); applyThemeVars(null);
      try { const s = await firebase.firestore().collection('settings').doc('theme').get(); if (s.exists) applyThemeVars(s.data().activeTheme || null); } catch (e) { }
      const old = $('#firexThemeModal'); if (old) old.remove(); toast('Synced to admin default');
    },
    init() {
      const local = localStorage.getItem(THEME_KEY);
      if (local) applyThemeVars(local);
      else firebase.firestore().collection('settings').doc('theme').get().then(s => { if (s.exists && s.data().activeTheme) applyThemeVars(s.data().activeTheme); }).catch(() => { });
    }
  };

  /* -------------------------------------------------- 3. PRESS AGAIN TO EXIT */
  let lastBack = 0;
  try { history.pushState({ firexGuard: true }, ''); } catch (e) { }
  window.addEventListener('popstate', () => {
    const t = Date.now();
    if (t - lastBack < 2000) {
      if (window.FireXBridge && window.FireXBridge.exitApp) window.FireXBridge.exitApp();
      else if (window.Android && window.Android.exitApp) window.Android.exitApp();
      else { try { window.close(); } catch (e) { } history.back(); }
    } else {
      lastBack = t; toast('Press back again to exit');
      try { history.pushState({ firexGuard: true }, ''); } catch (e) { }
    }
  });

  /* ----------------------------------------------------------- 4. REFRESH */
  FireX.refresh = async function () {
    const b = $('#firexRefreshBtn'); if (b) b.classList.add('spinning');
    try {
      const list = ['loadUserProfile', 'loadUserTransactions', 'fetchAppConfig', 'calculateProfileStats', 'loadNotifications'];
      for (const fn of list) {
        try { if (typeof window[fn] === 'function') { if (fn === 'loadUserProfile') await window[fn](window.currentUser?.uid); else await window[fn](); } } catch (e) { }
      }
      toast('Refreshed ✓');
    } finally { setTimeout(() => b && b.classList.remove('spinning'), 600); }
  };
  let pullY = 0;
  document.addEventListener('touchstart', (e) => { if ((document.scrollingElement || document.body).scrollTop <= 0) pullY = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!pullY) return; const dy = (e.changedTouches[0]?.clientY || 0) - pullY; pullY = 0;
    if (dy > 110 && (document.scrollingElement || document.body).scrollTop <= 0) FireX.refresh();
  }, { passive: true });

  /* --------------------------------------------------------------- 5. PUSH */
  FireX.push = {
    async token() {
      try { if (window.FireXBridge && window.FireXBridge.getFcmToken) return await window.FireXBridge.getFcmToken(); } catch (e) { }
      try {
        if (firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported() && window.FIREX_VAPID_KEY) {
          const m = firebase.messaging();
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') return null;
          const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
          return await m.getToken({ vapidKey: window.FIREX_VAPID_KEY, serviceWorkerRegistration: reg });
        }
      } catch (e) { console.warn('[firex] push unavailable', e.message); }
      return null;
    },
    async register() {
      const t = await FireX.push.token();
      if (!t) { FireX.pushStatus = 'Push unavailable (needs WebView FCM bridge or VAPID key)'; return; }
      try { await api('/push/register', { token: t, platform: window.FireXBridge ? 'android' : 'web' }); FireX.pushStatus = 'Push registered ✓'; }
      catch (e) { FireX.pushStatus = 'Push registration: ' + e.message; }
    }
  };

  /* ----------------------------------------------------------- 6. PAYMENT */
  const PAY_CSS = `
  #firexPayModal{position:fixed;inset:0;z-index:9999998;background:rgba(6,8,14,.75);display:flex;align-items:flex-end;justify-content:center}
  #firexPayModal .fp-sheet{width:100%;max-width:480px;background:#fff;border-radius:24px 24px 0 0;padding:18px 20px calc(20px + env(safe-area-inset-bottom));max-height:92vh;overflow:auto;animation:fpUp .3s ease}
  @keyframes fpUp{from{transform:translateY(100%)}to{transform:none}}
  #firexPayModal .fp-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  #firexPayModal .fp-amt{font-size:30px;font-weight:900;color:#7c4dff;text-align:center;margin:6px 0}
  #firexPayModal .fp-oid{text-align:center;font:11px monospace;color:#6b6480;background:#f1eefc;display:inline-block;padding:5px 12px;border-radius:99px;margin:0 auto 14px}
  #firexPayModal img.fp-qr{display:block;width:210px;height:210px;margin:0 auto 10px;border:6px solid #f3f0ff;border-radius:16px}
  #firexPayModal .fp-timer{background:#f4f5f8;border-radius:12px;padding:12px;text-align:center;font-weight:800;letter-spacing:.05em;margin:10px 0}
  #firexPayModal input{width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;margin:8px 0;font-size:14px}
  #firexPayModal button{width:100%;padding:14px;border:0;border-radius:12px;background:linear-gradient(90deg,#ff7a00,#ff9d00);color:#fff;font-weight:800;font-size:14px;margin-top:8px;cursor:pointer}
  #firexPayModal button.ghost{background:#f1f1f5;color:#333}
  #firexPayModal button.upi{background:linear-gradient(90deg,#6d3bff,#9a6bff)}
  #firexPayModal .fp-hint{font-size:10px;color:#888;text-align:center;margin:8px 0 0}
  .fp-spin{display:inline-block;width:16px;height:16px;border:2px solid #ffffff88;border-top-color:#fff;border-radius:50%;animation:fps .7s linear infinite}
  @keyframes fps{to{transform:rotate(360deg)}}
  `;
  let payState = null, payTimer = null, payPoll = null;
  FireX.pay = {
    async open(amount) {
      const amt = Number(amount);
      if (!amt || amt < 10) { toast('Minimum deposit ₹10', true); return; }
      const old = $('#firexPayModal'); if (old) old.remove();
      const st = document.createElement('style'); st.id = 'firexPayCSS'; st.textContent = PAY_CSS;
      if (!$('#firexPayCSS')) document.head.appendChild(st);
      document.body.insertAdjacentHTML('beforeend', `<div id="firexPayModal"><div class="fp-sheet">
        <div class="fp-head"><b style="font-size:15px">Pay Securely</b><span style="font-size:20px;cursor:pointer" onclick="FireX.pay.close()">✕</span></div>
        <div style="background:#1a1230;border-radius:16px;padding:16px;color:#c9c2e8">
          <div style="text-align:center;font-size:10px;letter-spacing:.18em;font-weight:800">AMOUNT TO PAY</div>
          <div class="fp-amt" style="color:#a99bff">₹${amt.toFixed(2)}</div>
          <div style="text-align:center"><span class="fp-oid" id="fpOid">creating order…</span></div>
        </div>
        <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#7c4dff;margin:14px 0 6px">▦ SCAN &amp; PAY</div>
        <img class="fp-qr" id="fpQr" alt="UPI QR">
        <button class="upi" id="fpUpiApp" onclick="FireX.pay.openUpi()">📱 PAY WITH UPI APP · FamPay / GPay / PhonePe / Paytm</button>
        <div class="fp-timer">⏳ SESSION TIMER · EXPIRES IN <span id="fpTime">08:00</span></div>
        <input id="fpUtr" placeholder="12-digit UTR (optional)">
        <button id="fpConfirm" onclick="FireX.pay.confirm()">I HAVE PAID · ADD COINS INSTANTLY</button>
        <button class="ghost" onclick="FireX.pay.close()">Cancel</button>
        <p style="font-size:10px;color:#888;text-align:center;margin-top:10px">UPI app me payment poora karte hi wapas aayein — coins apne aap wallet me add ho jayenge. Koi screenshot, UTR ya admin approval nahi.</p>
      </div></div>`);
      try {
        const o = await api('/payments/create', { amount: amt, idempotencyKey: uuid() });
        payState = o;
        $('#fpOid').textContent = '#' + String(o.orderId).slice(0, 16).toUpperCase();
        $('#fpQr').src = o.qrDataUrl;
        startCountdown(o.expiresAt); startPoll(o.orderId);
      } catch (e) { toast(e.message, true); FireX.pay.close(); }
    },
    close() { clearInterval(payTimer); clearInterval(payPoll); const m = $('#firexPayModal'); if (m) m.remove(); payState = null; },
    /* UPI deep link. APK me FireXNative.payWithUpi() startActivityForResult
       chalata hai, jisse payment ke baad UPI app ka result wapas milta hai.
       Browser me upi:// link seedha UPI app chooser khol deta hai. */
    openUpi() {
      if (!payState) return;
      const uri = payState.upiUri;
      if (!uri || !String(uri).startsWith('upi:')) return toast('UPI link unavailable', true);
      try {
        if (window.FireXNative && window.FireXNative.payWithUpi) window.FireXNative.payWithUpi(uri);
        else window.location.href = uri;
        toast('Payment poora karke app me wapas aa jayein — coins auto-add honge');
      } catch (e) { toast('UPI app nahi mila: ' + e.message, true); }
    },
    async confirm(extra) {
      if (!payState) return;
      const b = $('#fpConfirm'); if (b) { b.disabled = true; b.innerHTML = '<span class="fp-spin"></span> Verifying…'; }
      try {
        const r = await api('/payments/confirm', {
          orderId: payState.orderId,
          utr: ($('#fpUtr')?.value || '').trim(),
          ...(extra || {}),
        });
        if (r.ok === false && r.pending) {
          toast(r.error || 'Gateway abhi verify kar raha hai…', true);
          if (b) { b.disabled = false; b.textContent = 'I HAVE PAID · ADD COINS INSTANTLY'; }
          return;                       // modal khula rahega, poll chalega
        }
        toast('₹' + payState.amount + ' coins added automatically ✓');
        clearInterval(payTimer); clearInterval(payPoll); FireX.pay.close(); refreshViews();
      } catch (e) { toast(e.message, true); if (b) { b.disabled = false; b.textContent = 'I HAVE PAID · ADD COINS INSTANTLY'; } }
    }
  };

  /* UPI app (FamPay/GPay/PhonePe/Paytm) se wapas aane par APK ye call karta hai.
     Yahan se turant server /confirm jata hai — koi manual step nahi. */
  FireX.onUpiResult = function (raw) {
    try {
      const r = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      const status = String(r.status || r.Status || r.upiStatus || '').toUpperCase();
      if (/FAIL|DECLIN|CANCEL|REJECT/.test(status)) { toast('Payment cancel / fail ho gaya', true); return; }
      const txnRef = String(r.txnRef || r.txnRefNo || r.txnref || '');
      const approvalRef = String(r.approvalRef || r.ApprovalRefNo || r.approvalRefNo || '');
      if (/SUCCESS|COMPLET|PAID/.test(status) || txnRef || approvalRef) {
        FireX.pay.confirm({ upiStatus: status || 'SUCCESS', txnRef, approvalRef });
      } else {
        toast('Payment status clear nahi mila — "I HAVE PAID" dabayein', true);
      }
    } catch (e) { console.warn('[firex] upi result', e.message); }
  };
  function startCountdown(expiresAt) {
    clearInterval(payTimer);
    payTimer = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      const el = $('#fpTime'); if (el) el.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
      if (left <= 0) { clearInterval(payTimer); toast('Session expired. Please try again.', true); FireX.pay.close(); }
    }, 500);
  }
  function startPoll(orderId) {
    clearInterval(payPoll);
    payPoll = setInterval(async () => {
      try {
        const s = await api('/payments/status/' + orderId, {}, 'GET');
        if (s.status === 'paid') { clearInterval(payPoll); clearInterval(payTimer); toast('Payment confirmed automatically ✓'); FireX.pay.close(); refreshViews(); }
      } catch (e) { }
    }, 3000);
  }

  /* ------------------------------------------- 7. SECURE WALLET OVERRIDES */
  window.submitFinalDeposit = function () {
    const amt = Number(($('#depAmtInput') || {}).value || 0);
    try { closeDepositModal(); } catch (e) { }
    FireX.pay.open(amt);
  };
  window.applyRedeem = async function () {
    const code = ($('#redeemInput')?.value || '').trim();
    if (!code) return toast('Enter a code', true);
    try { const r = await api('/wallet/redeem', { code }); toast('₹' + r.credited + ' added to Bonus Wallet ✓'); const ri = $('#redeemInput'); if (ri) ri.value = ''; refreshViews(); }
    catch (e) { toast(e.message, true); }
  };
  window.submitWithdraw = async function () {
    const amount = Number(($('#widAmt')?.value) || 0);
    const upiId = ($('#widUpi')?.value || '').trim();
    const accountName = ($('#widName')?.value || '').trim();
    const method = ($('#widSelectedMethod')?.value) || 'upi';
    if (!amount || amount < 50) return toast('Minimum withdrawal ₹50', true);
    if (!upiId || !accountName) return toast('Fill UPI ID and account name', true);
    const b = $('#widSubmitBtn'); if (b) { b.disabled = true; b.innerText = 'Processing…'; }
    try { await api('/wallet/withdraw', { amount, upiId, accountName, method }); toast('Withdraw request placed ✓'); try { closeModal('withdrawModal'); } catch (e) { } refreshViews(); }
    catch (e) { toast(e.message, true); }
    finally { if (b) { b.disabled = false; b.innerText = 'Request Withdraw'; } }
  };
  window.confirmJoinMatch = async function () {
    const m = window.selectedMatch;
    if (!m) return toast('Select a match first', true);
    const slots = window.selectedSlots || [];
    if (!slots.length) { const el = $('#joinErrorMsg'); if (el) el.textContent = 'Error: Please select at least one slot.'; return; }
    const players = [];
    for (const slot of slots) {
      const fName = ($(`#mJoinFfName_${slot}`)?.value || '').trim(), fUid = ($(`#mJoinFfUid_${slot}`)?.value || '').trim();
      if (!fName || !fUid) { const el = $('#joinErrorMsg'); if (el) el.textContent = `Error: Fill Name and UID for Slot ${slot}.`; return; }
      players.push({ ffName: fName, ffUid: fUid, slot, avatar: (window.userData || {}).avatar || '👦' });
    }
    const b = $('#mJoinBtn'); if (b) { b.disabled = true; b.innerText = 'Joining…'; }
    try {
      const r = await api('/wallet/join', { tournamentId: m.id, players });
      toast('Joined successfully ✓');
      try { closeModal('matchModal'); closeCategoryScreen(); } catch (e) { }
      refreshViews();
    } catch (e) { const el = $('#joinErrorMsg'); if (el) el.textContent = 'Error: ' + e.message; toast(e.message, true); }
    finally { if (b) { b.disabled = false; b.innerText = 'Join Match'; } }
  };
  window.buyStoreItem = async function (itemKey) {
    const map = { AvatarDiscount: 'avatar_upload', CrownDiscount: 'gold_crown', TickDiscount: 'blue_tick', Gold_Crown: 'gold_crown', Blue_Tick: 'blue_tick' };
    const key = map[itemKey] || itemKey;
    try { const r = await api('/wallet/store', { itemKey: key }); toast('Purchased ₹' + r.price + ' ✓'); refreshViews(); }
    catch (e) { toast(e.message, true); }
  };
  window.claimLevelBonus = async function (level) {
    try { const r = await api('/wallet/level', { level: Number(level) }); toast(r.duplicate ? 'Already claimed' : '₹' + r.credited + ' bonus added ✓'); refreshViews(); }
    catch (e) { toast(e.message, true); }
  };
  window.submitAirdropPayment = async function () {
    const utr = ($('#adUtrInput')?.value || '').trim();
    const file = ($('#adFileInput') || {}).files?.[0];
    if (!utr && !file) return toast('Provide UTR or screenshot', true);
    try { await api('/wallet/airdrop', { utr, proofUrl: '', offerType: 'airdrop', amountPaid: 0 }); toast('Airdrop proof submitted ✓'); try { closeModal('airdropModal'); } catch (e) { } }
    catch (e) { toast(e.message, true); }
  };

  /* ---- images: chhoti karke bhejo (Firestore doc < 1 MB, Spark free) ----
     Cloud Storage Blaze-only hai, isliye images Firestore me jaati hain. */
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
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
      return blob && blob.size < file.size ? new File([blob], 'upload.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
  }
  function mediaUrl(u) {
    return /^https?:\/\//.test(u || '') ? u : ((window.FIREX_API_BASE || location.origin) + (u || ''));
  }

  /* ---- signup: client is NOT allowed to write users/transactions/referrals.
         The server creates the Auth user + profile + welcome bonus atomically. */
  window.registerUser = async function () {
    const btn = $('#signupBtn');
    const ffName = ($('#regFfName')?.value || '').trim();
    const email = ($('#regEmail')?.value || '').trim();
    const pass = $('#regPass')?.value || '';
    const refCode = ($('#regRefCode')?.value || '').trim();
    if (!ffName || !email || !pass) return toast('Fill required fields!', true);
    if (btn) { btn.innerText = 'Creating...'; btn.disabled = true; }
    try {
      const r = await fetch(API + '/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ffName, email, password: pass, refCode }),
      });
      const j = await r.json();
      if (!r.ok) {
        const m = /already registered/i.test(j.error || '') ? 'Email already in use!'
          : /already taken/i.test(j.error || '') ? 'Username already taken! Please choose another.'
          : (j.error || 'Signup Failed!');
        throw new Error(m);
      }
      await firebase.auth().signInWithEmailAndPassword(email, pass);
      toast('Welcome to FIREX! ₹' + (j.bonus || 0) + ' bonus added ✓');
    } catch (e) { toast(e.message || 'Signup Failed!', true); }
    finally { if (btn) { btn.innerText = 'Sign Up'; btn.disabled = false; } }
  };

  /* ---- image upload without the leaked ImgBB key (server-side now) ---- */
  window.uploadAvatar = async function () {
    const inp = $('#avatarFileInput'); const file = inp && inp.files && inp.files[0];
    if (!file) return toast('Select an image first', true);
    const btn = $('#avatarUploadBtn'); if (btn) { btn.innerText = 'Uploading…'; btn.disabled = true; }
    try {
      const t = await idToken();
      const payload = await shrinkImage(file);
      const r = await fetch(API + '/upload', {
        method: 'POST',
        headers: { 'Content-Type': payload.type || 'image/jpeg', 'x-file-ext': ((payload.name || 'upload.jpg').split('.').pop() || 'jpg').slice(0, 5), Authorization: 'Bearer ' + t },
        body: payload,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      const url = mediaUrl(j.url);
      await firebase.firestore().collection('users').doc(window.currentUser.uid).update({ avatar: url });
      if (window.userData) window.userData.avatar = url;
      toast('Profile picture updated ✓');
      try { closeModal('emojiModal'); } catch (e) { }
      refreshViews();
    } catch (e) { toast('Upload failed: ' + e.message, true); }
    finally { if (btn) { btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload'; btn.disabled = false; } }
  };

  /* ---------------------------------------------- 8. UI FIXES + HEADER BUTTONS */
  const FIX_CSS = `
  /* ── BUG FIX: screen bahut upar aa rahi thi ─────────────────────────────
     100vh mobile WebView me visible viewport se BADA hota hai (status bar /
     browser UI), isliye content upar khinch jata tha aur niche gaps aate the.
     100dvh = actual visible height; status bar ke liye top inset; overscroll
     band. Ye app ke kisi bhi feature ko badalta nahi, sirf layout theek karta hai. */
  html,body{margin:0;min-height:100%;overscroll-behavior-y:none;-webkit-text-size-adjust:100%}
  #mainApp{min-height:100dvh !important;padding-bottom:calc(100px + env(safe-area-inset-bottom)) !important}
  .top-header{position:sticky;top:0;padding-top:calc(15px + env(safe-area-inset-top)) !important}
  #authScreen,#splashScreen,#categoryMatchesScreen,.modal-overlay{height:100dvh !important;padding-top:env(safe-area-inset-top) !important}
  /* safe-area: bottom nav no longer collides with Android system nav bar */
  .bottom-nav{bottom:calc(15px + env(safe-area-inset-bottom)) !important}
  #mainApp{padding-bottom:calc(100px + env(safe-area-inset-bottom)) !important}
  .floating-wa{bottom:calc(112px + env(safe-area-inset-bottom)) !important;right:16px !important;width:50px !important;height:50px !important;font-size:24px !important}
  .floating-airdrop{bottom:calc(112px + env(safe-area-inset-bottom)) !important}
  #firexToast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:9999997;background:#ff8c00;color:#fff;padding:11px 22px;border-radius:99px;font-size:13px;font-weight:700;box-shadow:0 6px 20px rgba(0,0,0,.25);display:none;max-width:90vw;text-align:center}
  #firexRefreshBtn.spinning i{animation:frxSpin .7s linear infinite}
  @keyframes frxSpin{to{transform:rotate(360deg)}}
  .firex-hbtn{width:34px;height:34px;border-radius:11px;border:1px solid var(--border-color);background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--text-main);font-size:15px;flex:none}
  `;
  function injectUI() {
    const st = document.createElement('style'); st.textContent = FIX_CSS; document.head.appendChild(st);
    const t = document.createElement('div'); t.id = 'firexToast'; document.body.appendChild(t);
    const actions = $('.top-header .header-actions') || $('.top-header');
    if (actions) {
      actions.insertAdjacentHTML('afterbegin', `
        <button class="firex-hbtn" id="firexRefreshBtn" title="Refresh" onclick="FireX.refresh()"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="firex-hbtn" title="Themes" onclick="FireX.themes.open()" style="border-color:var(--primary)"><i class="fa-solid fa-palette" style="color:var(--primary)"></i></button>
        <button class="firex-hbtn" title="FireX server URL" onclick="FireX.server.prompt()"><i class="fa-solid fa-server"></i></button>`);
    }
  }

  /* ---------------------------------------------------- 9. ERROR GUARDS */
  window.addEventListener('error', (e) => { console.warn('[firex] handled error:', e.message); });
  window.addEventListener('unhandledrejection', (e) => { console.warn('[firex] handled rejection:', e.reason?.message || e.reason); });

  /* ------------------------------------- 10. EK HI URL (koi "API URL" nahi) */
  /* server/index.js HTML + /api dono ek hi address par deta hai. Agar koi
     sirf-HTML wala page (jaise Firebase Hosting) khul gaya ho to /api/health
     fail hoga — tab hum EK hi URL maang kar usi par bhej dete hain. Doosra
     koi field / setting nahi. */
  FireX.server = {
    async check() {
      if (sessionStorage.getItem('firex_skip_server')) return;
      let ok = false;
      // Hosting rewrites /api/health -> index.html (HTTP 200), isliye JSON body bhi check karo.
      try {
        const r = await fetch(API + '/health', { cache: 'no-store', headers: { Accept: 'application/json' } });
        if (r.ok) { const j = await r.json().catch(() => null); ok = !!(j && j.ok === true && j.projectId); }
      } catch (e) { }
      if (!ok) FireX.server.prompt();
    },
    prompt() {
      if ($('#firexServerBox')) return;
      document.body.insertAdjacentHTML('beforeend', `
        <div id="firexServerBox" style="position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9999999;background:#171b26;border:1px solid #ff8c00;border-radius:14px;padding:14px;color:#fff;font:13px system-ui;box-shadow:0 8px 30px #0009">
          <b style="color:#ff8c00">⚙ FireX server URL</b>
          <div style="font-size:11px;color:#9aa5bb;margin:6px 0 10px">Ye page sirf HTML dikha raha hai. Apne FireX server ka <b>ek hi URL</b> daalein — wahi app, payment, wallet aur push sab chalayega. Alag se koi API URL nahi.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="firexServerUrl" placeholder="https://firex-xxxx.onrender.com" style="flex:1;min-width:180px;background:#0d0f16;border:1px solid #2a3346;color:#fff;border-radius:9px;padding:9px 11px;font:13px system-ui">
            <button id="firexServerSave" style="background:#ff8c00;border:0;border-radius:9px;padding:9px 16px;color:#fff;font-weight:800">Open</button>
            <button id="firexServerSkip" style="background:#2a3346;border:0;border-radius:9px;padding:9px 13px;color:#fff">Skip</button>
          </div>
        </div>`);
      const go = () => {
        let v = ($('#firexServerUrl')?.value || '').trim().replace(/\/+$/, '');
        if (!/^https?:\/\//.test(v)) return toast('https:// se shuru hone wala URL daalein', true);
        try {
          const u = new URL(v);
          // /admin ya /staff par ho to wahi page naye server par kholein
          const here = location.pathname.replace(/\.html$/, '');
          if (/^\/(admin|staff|splash)$/.test(here) && (u.pathname === '/' || u.pathname === '')) u.pathname = here;
          location.href = u.href;                 // SAME URL for HTML + /api
        } catch (e) { location.href = v; }
      };
      $('#firexServerSave')?.addEventListener('click', go);
      $('#firexServerUrl')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      $('#firexServerSkip')?.addEventListener('click', () => {
        try { sessionStorage.setItem('firex_skip_server', '1'); } catch (e) { }
        $('#firexServerBox')?.remove();
      });
    }
  };

  /* ------------------------------------- fixes: password change + leaderboard
     Original in-page functions wrote wallets/transactions and listed `users`
     directly — dono hardened rules se deny hote the. Ab server endpoints. */
  window.saveNewPassword = async function () {
    const inp = document.getElementById('newPassInput');
    const p = (inp?.value || '').trim();
    if (p.length < 6) return toast('Password must be 6+ chars', true);
    try {
      const r = await api('/auth/change-password', { password: p });
      toast(r.note || 'Password Updated (₹10 deducted) ✓');
      try { closeModal('passwordModal'); } catch (e) { }
      if (inp) inp.value = '';
      refreshViews();
    } catch (e) { toast(e.message, true); }
  };

  window.loadLeaderboard = async function () {
    const box = document.getElementById('lbContainer');
    if (box) box.innerHTML = "<div class='loader'>Loading leaderboard...</div>";
    try {
      const r = await api('/leaderboard', {}, 'GET');
      const rows = Array.isArray(r.rows) ? r.rows : [];
      let h = '';
      for (const x of rows) {
        const av = String(x.avatar || '👦');
        const avHtml = /^https?:\/\//.test(av)
          ? `<img src="${esc(av)}" style="width:35px;height:35px;object-fit:cover;border-radius:50%">`
          : `<div style="width:35px;height:35px;display:flex;justify-content:center;align-items:center;font-size:24px">${esc(av)}</div>`;
        h += `<div class="bal-row" style="align-items:center;padding:15px 20px;">`
          + `<div style="display:flex;gap:15px;align-items:center;">`
          + `<div style="font-size:16px;font-weight:900;color:var(--text-sub);width:20px;text-align:center">${Number(x.rank)}</div>`
          + avHtml
          + `<div style="font-weight:bold;font-size:14px;color:var(--text-main)">${esc(x.ffName)}</div></div>`
          + `<div style="font-weight:900;color:var(--warning);font-size:16px">₹${Number(x.winning) || 0}</div></div>`;
      }
      if (box) box.innerHTML = h || "<div style='text-align:center;padding:20px;color:var(--text-sub)'>No data</div>";
    } catch (e) {
      if (box) box.innerHTML = "<div class='loader'>Error loading leaderboard</div>";
    }
  };

  /* ==========================================================================
   * 6b. PAYMENT v2 — "Add Cash" se seedha UPI apps, koi false failure nahi
   * --------------------------------------------------------------------------
   * Purana flow: Step 2 me static QR + "Enter UTR & Upload Screenshot,
   * Coin will not Add wait 2min" tha. Users wahi QR se pay kar dete the,
   * lekin koi /api/payments/create order hi nahi banta tha → coins nahi aate
   * the, aur app "payment fail" dikha deta tha. Ab Step 2 bypass hota hai:
   * Next Step → server se dynamic order → QR + FamPay/Zap/GPay/PhonePe/
   * Paytm/BHIM buttons → UPI app → wapas aate hi auto credit.
   * ========================================================================*/
  (() => {
    const S = { order: null, timer: null, poll: null, openedUpi: false, returned: false, busy: false, amount: 0 };
    const FALLBACK_APPS = [
      { key: 'fampay', label: 'FamPay', emoji: '🟣', pkg: 'com.fampay.in' },
      { key: 'zap', label: 'Zap UPI', emoji: '⚡', pkg: '' },
      { key: 'gpay', label: 'GPay', emoji: '🟢', pkg: 'com.google.android.apps.nbu.paisa.user' },
      { key: 'phonepe', label: 'PhonePe', emoji: '💜', pkg: 'com.phonepe.app' },
      { key: 'paytm', label: 'Paytm', emoji: '🔵', pkg: 'net.one97.paytm' },
      { key: 'bhim', label: 'BHIM', emoji: '🟠', pkg: 'in.org.npci.upiapp' },
    ];
    const el = (id) => document.getElementById(id);
    const stop = () => { clearInterval(S.timer); clearInterval(S.poll); };
    const vpaOf = (o) => {
      if (!o) return '';
      if (o.upiId) return o.upiId;
      try { return decodeURIComponent(new URLSearchParams(String(o.upiUri || '').split('?')[1] || '').get('pa') || ''); }
      catch (e) { return ''; }
    };

    const pay = {
      close() { stop(); const m = el('firexPayModal'); if (m) m.remove(); S.order = null; S.openedUpi = false; },
      async open(amount) {
        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt < 10) { toast('Minimum deposit ₹10', true); return; }
        const old = el('firexPayModal'); if (old) old.remove();
        stop(); S.amount = amt; S.order = null; S.openedUpi = false; S.returned = false; S.busy = false;
        if (!$('#firexPayCSS') && typeof PAY_CSS !== 'undefined') {
          const st = document.createElement('style'); st.id = 'firexPayCSS'; st.textContent = PAY_CSS; document.head.appendChild(st);
        }
        if (!el('firexPayCSS2')) {
          const st2 = document.createElement('style'); st2.id = 'firexPayCSS2';
          st2.textContent = `#firexPayModal .fp-apps{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}`
            + `#firexPayModal .fp-apps button{margin:0;padding:10px 3px;font-size:11px;background:#eee9ff;color:#4b2ea8;font-weight:800}`
            + `#firexPayModal .fp-vpa{text-align:center;font:12px monospace;font-weight:800;color:#1b7a4b;background:#e9fbef;padding:9px;border-radius:10px;margin:8px 0}`
            + `#firexPayModal button.ghost2{background:#eef0ff;color:#3b2b8f}`
            + `#firexPayModal .fp-err{text-align:center;font-size:11px;color:#d33;min-height:14px;margin-top:6px}`;
          document.head.appendChild(st2);
        }
        document.body.insertAdjacentHTML('beforeend', `<div id="firexPayModal"><div class="fp-sheet">
          <div class="fp-head"><b style="font-size:15px">Pay Securely</b><span style="font-size:20px;cursor:pointer" onclick="FireX.pay.close()">✕</span></div>
          <div style="background:#1a1230;border-radius:16px;padding:16px;color:#c9c2e8">
            <div style="text-align:center;font-size:10px;letter-spacing:.18em;font-weight:800">AMOUNT TO PAY</div>
            <div class="fp-amt" style="color:#a99bff">₹${amt.toFixed(2)}</div>
            <div style="text-align:center"><span class="fp-oid" id="fpOid">creating order…</span></div>
          </div>
          <div class="fp-vpa" id="fpVpa">UPI ID load ho raha hai…</div>
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#7c4dff;margin:12px 0 6px">▦ QR SE SCAN KARKE PAY KAREIN</div>
          <img class="fp-qr" id="fpQr" alt="UPI QR">
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#7c4dff;margin:12px 0 2px">📱 YA APP SE DIRECT PAY KAREIN</div>
          <div class="fp-apps" id="fpApps"></div>
          <button class="upi" id="fpUpiApp" onclick="FireX.pay.openUpi()">📲 KOI BHI UPI APP (Chooser)</button>
          <button class="ghost" onclick="FireX.pay.copyVpa()">📋 COPY UPI ID</button>
          <div class="fp-timer">⏳ SESSION · <span id="fpTime">30:00</span></div>
          <input id="fpUtr" placeholder="12-digit UTR (optional)">
          <button id="fpConfirm" onclick="FireX.pay.confirm()">I HAVE PAID · ADD COINS INSTANTLY</button>
          <button class="ghost" onclick="FireX.pay.close()">Cancel</button>
          <div class="fp-err" id="fpErr"></div>
          <p class="fp-hint">UPI app me payment poora karke wapas aayein — coins apne aap add ho jayenge. Screenshot, UTR ya admin approval ki zarurat nahi.</p>
        </div></div>`);
        await create(amt);
      },

      /* pkg = specific app. Naye APK me FireXNative.payWithUpi(uri, pkg)
         seedha us app ko kholta hai; purane APK me 1-arg bridge chooser
         kholta hai — dono me sab UPI apps chalte hain. */
      openUpi(key) {
        const o = S.order;
        if (!o || !o.upiUri) { toast('Order abhi ban raha hai, 2 second wait karein', true); return; }
        const app = (Array.isArray(o.upiApps) ? o.upiApps : FALLBACK_APPS).find(a => a.key === key);
        const uri = o.upiUri, pkg = app ? (app.pkg || '') : '';
        S.openedUpi = true; S.returned = false;
        try {
          const N = window.FireXNative;
          if (N && typeof N.payWithUpi === 'function') {
            try { N.payWithUpi(uri, pkg); }
            catch (e) { try { N.payWithUpi(uri); } catch (e2) { window.location.href = uri; } }
          } else window.location.href = uri;
          toast(app ? app.label + ' khul raha hai…' : 'UPI app chooser khul raha hai…');
          setTimeout(() => {
            if (S.order && document.visibilityState === 'visible' && el('fpErr'))
              el('fpErr').textContent = 'App nahi khula? "COPY UPI ID" dabayein aur kisi bhi UPI app me manually pay karein.';
          }, 2600);
        } catch (e) {
          toast('UPI app nahi mila: ' + e.message, true);
          if (el('fpErr')) el('fpErr').textContent = 'Koi UPI app nahi mila — UPI ID copy karke manually pay karein.';
        }
      },

      copyVpa() {
        const v = vpaOf(S.order);
        if (!v) return toast('UPI ID abhi load ho raha hai', true);
        const done = () => toast('UPI ID copied: ' + v);
        const fallback = () => {
          const t = document.createElement('textarea'); t.value = v; document.body.appendChild(t); t.select();
          try { document.execCommand('copy'); done(); } catch (e) { toast('UPI ID: ' + v, true); }
          t.remove();
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, fallback);
        else fallback();
      },

      async confirm(extra) {
        if (!S.order) return toast('Order nahi mila — dobara Add Cash karein', true);
        if (S.busy) return;
        S.busy = true;
        const b = el('fpConfirm');
        if (b) { b.disabled = true; b.innerHTML = '<span class="fp-spin"></span> Verifying…'; }
        try {
          const r = await api('/payments/confirm', {
            orderId: S.order.orderId,
            utr: (el('fpUtr')?.value || '').trim(),
            upiStatus: 'UNKNOWN',
            ...(extra || {}),
          });
          if (r.ok === false && r.pending) {
            toast(r.error || 'Gateway abhi verify kar raha hai…', true);
            if (el('fpErr')) el('fpErr').textContent = r.error || '';
            if (b) { b.disabled = false; b.textContent = 'I HAVE PAID · RETRY'; }
            return;
          }
          toast('₹' + S.order.amount + ' coins added automatically ✓');
          stop(); pay.close(); refreshViews();
        } catch (e) {
          if (el('fpErr')) el('fpErr').textContent = e.message;
          toast(e.message, true);
          if (b) { b.disabled = false; b.textContent = 'I HAVE PAID · RETRY'; }
        } finally { S.busy = false; }
      },
    };

    async function create(amt) {
      const b = el('fpConfirm');
      if (b) { b.disabled = true; b.textContent = 'Creating secure order…'; }
      try {
        const o = await api('/payments/create', { amount: amt, idempotencyKey: uuid() });
        S.order = o; S.returned = false;
        if (el('fpOid')) el('fpOid').textContent = '#' + String(o.orderId).slice(0, 16).toUpperCase();
        if (o.qrDataUrl && el('fpQr')) el('fpQr').src = o.qrDataUrl;
        if (el('fpVpa')) el('fpVpa').textContent = 'Pay to UPI ID: ' + (vpaOf(o) || '—');
        const apps = Array.isArray(o.upiApps) && o.upiApps.length ? o.upiApps : FALLBACK_APPS;
        if (el('fpApps')) el('fpApps').innerHTML = apps.map(a =>
          `<button onclick="FireX.pay.openUpi('${esc(a.key)}')">${esc(a.emoji || '📲')} ${esc(a.label)}</button>`).join('');
        if (b) { b.disabled = false; b.textContent = 'I HAVE PAID · ADD COINS INSTANTLY'; }
        countdown(o.expiresAt || Date.now() + (o.orderTtlMs || 1800000));
        poll(o.orderId);
      } catch (e) {
        // Modal band mat karo — user ko clear error + RETRY dikhao.
        if (el('fpErr')) el('fpErr').textContent = 'Order nahi bana: ' + e.message;
        if (el('fpOid')) el('fpOid').textContent = 'retry karein';
        toast(e.message, true);
        if (b) { b.disabled = false; b.textContent = '🔄 RETRY ORDER'; b.onclick = () => create(amt); }
      }
    }
    function countdown(expiresAt) {
      clearInterval(S.timer);
      S.timer = setInterval(() => {
        const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        const t = el('fpTime'); if (t) t.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
        if (left <= 0) { clearInterval(S.timer); if (el('fpErr')) el('fpErr').textContent = 'Session expire ho gaya — RETRY dabayein.'; }
      }, 500);
    }
    function poll(orderId) {
      clearInterval(S.poll);
      S.poll = setInterval(async () => {
        try {
          const s = await api('/payments/status/' + orderId, {}, 'GET');
          if (s.status === 'paid') { stop(); toast('Payment confirmed automatically ✓'); pay.close(); refreshViews(); }
        } catch (e) { }
      }, 3000);
    }

    FireX.pay = pay;
    /* Purana APK jab UPI app koi response na de to "Status=FAILURE" bhejta
       tha, jabki payment ho chuki hoti thi — isse "payment fail" dikhta tha.
       Ab aise ambiguous callback ko block nahi karte, verify karte hain. */
    FireX.onUpiResult = function (raw) {
      try {
        const r = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        const status = String(r.status || r.Status || r.upiStatus || '').toUpperCase();
        const txnRef = String(r.txnRef || r.txnRefNo || r.txnref || '');
        const approvalRef = String(r.approvalRef || r.ApprovalRefNo || r.approvalRefNo || '');
        const bad = /FAIL|DECLIN|CANCEL|REJECT/.test(status);
        if (bad && !txnRef && !approvalRef) {
          if (el('fpErr')) el('fpErr').textContent = 'Payment verify ho raha hai…';
          setTimeout(() => { if (S.order) pay.confirm({ upiStatus: 'UNKNOWN' }); }, 1200);
          return;
        }
        if (bad) { toast('Payment cancel/fail — dobara try karein', true); return; }
        pay.confirm({ upiStatus: status || 'UNKNOWN', txnRef, approvalRef });
      } catch (e) { console.warn('[firex] upi result', e.message); }
    };

    /* UPI app se wapas aate hi auto-verify (sirf tab jab user ne UPI button
       dabaya ho). Isse "payment ho gaya par coins nahi aaye" khatam hota hai. */
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !S.order || !S.openedUpi || S.returned) return;
      S.returned = true;
      setTimeout(() => { if (S.order && !S.busy) pay.confirm({ upiStatus: 'UNKNOWN', fromApp: true }); }, 1400);
    });

    /* ---- Purana 2-step deposit screen bypass ---- */
    function shortcutToPayment() {
      const amt = Number((el('depAmtInput') || {}).value || 0);
      const min = Number(window.appSettings?.minDeposit || 10);
      if (!Number.isFinite(amt) || amt < min) { toast('Minimum deposit ₹' + min, true); return; }
      try { closeDepositModal(); } catch (e) { }
      pay.open(amt);
    }
    window.goToDepositStep2 = shortcutToPayment;
    window.submitFinalDeposit = shortcutToPayment;
    window.copyAdminUpi = () => pay.copyVpa();
    // Agar app kisi async callback me inhe dobara define kare to wapas lagao.
    const rebind = () => { window.goToDepositStep2 = shortcutToPayment; window.submitFinalDeposit = shortcutToPayment; };
    try { firebase.auth().onAuthStateChanged(() => { rebind(); setTimeout(rebind, 400); setTimeout(rebind, 1600); }); } catch (e) { }
    document.addEventListener('DOMContentLoaded', rebind);
    setTimeout(rebind, 500); setTimeout(rebind, 2000);
    // 20s guard: chahe app kabhi bhi (slow auth / lazy script) purane functions
    // dobara define kare, hamara payment shortcut hi zinda rahega.
    const guard = setInterval(rebind, 1000);
    setTimeout(() => clearInterval(guard), 20000);
  })();

  /* -------------------------------------------------------------- INIT */
  function init() {
    injectUI();
    FireX.themes.init();
    setTimeout(() => { try { FireX.server.check(); } catch (e) { } }, 1200);
    try {
      firebase.auth().onAuthStateChanged(async (u) => {
        if (u) { try { await FireX.push.register(); } catch (e) { } }
      });
    } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
