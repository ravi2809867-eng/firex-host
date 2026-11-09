/* ============================================================================
 * FireX — Server URL control for Admin / Staff pages.
 *
 * User app me ye control firex-upgrade.js ke andar hai (header ka ⚙ button).
 * Admin/Staff HTML me wo pack load nahi hota, isliye yahan chhota floating
 * ⚙ button add karte hain. Ye AUTOMATIC kuch nahi maangta — sirf tap karne
 * par native URL dialog khulti hai.
 *
 * Pehle yahan /api/health check karke warning banner dikhaya jata tha, par
 * free server ke cold start me wo galati se "galat host" batata tha. Ab
 * koi automatic banner/prompt nahi. Existing APK ke bridge ka use hota hai,
 * isliye naya APK banane ki zarurat nahi.
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

  /* Purana static mirror (new-firex.web.app) khul gaya ho to bina kuch
     maange chupchap asli server par bhej do — koi prompt/banner nahi. */
  function maybeRedirect() {
    var CANON = 'https://firex-3mup.onrender.com';
    var h = String(location.hostname || '');
    if (!/^(new-firex\.web\.app|new-firex\.firebaseapp\.com)$/i.test(h)) return;
    var p = String(location.pathname || '/').replace(/\/+$/, '') || '/';
    if (!/^\/(admin|staff|downloads|splash)?$/.test(p)) p = '/';
    try { location.replace(CANON + (p === '/' ? '/' : p)); } catch (e) { }
  }

  function init() {
    maybeRedirect();
    if (document.getElementById('firexServerGear')) return;
    var b = document.createElement('button');
    b.id = 'firexServerGear';
    b.type = 'button';
    b.textContent = '⚙';
    b.title = 'FireX server URL badalne ke liye tap karein';
    b.setAttribute('aria-label', 'FireX server URL');
    b.style.cssText = 'position:fixed;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));'
      + 'z-index:9999998;background:#2a3346;color:#fff;border:1px solid #ff8c00;'
      + 'border-radius:50%;width:36px;height:36px;font-size:15px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.45);cursor:pointer;opacity:.82';
    b.addEventListener('click', openDialog);
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
