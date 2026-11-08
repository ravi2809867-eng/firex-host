/* ============================================================================
 * FireX — Server URL control for Admin / Staff pages.
 *
 * User app me ye control firex-upgrade.js ke andar hai (FireX.server.prompt()).
 * Admin/Staff HTML me wo pack load hi nahi hota tha, isliye wahan URL badalne
 * ka koi button nahi tha — sirf pehli launch ka native dialog milta tha aur
 * update ke baad saved URL reh jata tha to wo bhi nahi aata tha.
 *
 * Ye file teeno APK ke existing bridge (FireXNative.openServerSettings) ko
 * use karti hai, isliye naya APK banane ki zarurat nahi.
 * ==========================================================================*/
(function () {
  'use strict';
  var PREFERRED = 'https://firex-3mup.onrender.com';

  function openDialog() {
    try {
      if (window.FireXNative && typeof window.FireXNative.openServerSettings === 'function') {
        window.FireXNative.openServerSettings();
        return;
      }
    } catch (e) { }
    // Normal browser me (APK bridge nahi hai) simple prompt + redirect.
    var path = /^\/staff/.test(location.pathname) ? '/staff'
      : /^\/admin/.test(location.pathname) ? '/admin' : '/';
    var u = window.prompt('FireX server URL — ek hi URL, bina /admin ya /staff:', PREFERRED);
    if (!u) return;
    u = String(u).trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(u)) u = 'https://' + u;
    location.href = u + path;
  }
  window.firexServerSettings = openDialog;

  function addGear() {
    if (document.getElementById('firexServerGear')) return;
    var b = document.createElement('button');
    b.id = 'firexServerGear';
    b.type = 'button';
    b.textContent = '⚙ Server URL';
    b.title = 'FireX server URL badalne ke liye tap karein';
    b.style.cssText = 'position:fixed;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));'
      + 'z-index:9999998;background:#2a3346;color:#fff;border:1px solid #ff8c00;'
      + 'border-radius:20px;padding:8px 13px;font-size:11px;font-weight:800;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer';
    b.addEventListener('click', openDialog);
    document.body.appendChild(b);
  }

  /* Agar ye page kisi aise host par khula hai jahan /api kaam nahi karta
     (jaise Firebase Hosting), to upar ek warning banner dikhao. */
  function addBanner() {
    if (document.getElementById('firexServerBanner')) return;
    var d = document.createElement('div');
    d.id = 'firexServerBanner';
    d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999999;'
      + 'background:#ff8c00;color:#111;text-align:center;padding:9px 12px;'
      + 'font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.4)';
    d.textContent = '⚠ ' + location.hostname + ' par /api kaam nahi karega — server URL set karne ke liye yahan tap karein';
    d.addEventListener('click', openDialog);
    document.body.appendChild(d);
  }

  function init() {
    addGear();
    try {
      fetch('/api/health', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) addBanner(); })
        .catch(addBanner);
    } catch (e) { addBanner(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
