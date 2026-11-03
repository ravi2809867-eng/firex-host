/* FireX Esports — PUBLIC Firebase web config (safe to ship in a client).
   Fetched from Firebase Management API using the service account server-side.
   NEVER put a private key / service-account JSON in this file. */
window.FIREX_CONFIG = {
  apiKey: "AIzaSyDQh4WPGmZ0BZsTZNIISo7eaaeC__vtE7I",
  authDomain: "new-firex.firebaseapp.com",
  projectId: "new-firex",
  storageBucket: "new-firex.firebasestorage.app",
  messagingSenderId: "694101804542",
  appId: "1:694101804542:web:5de47bf040fc5fe8ffacaf",
  measurementId: ""
};

/* KOI ALAG "API URL" NAHI.
   server/index.js HTML (web/) AUR backend (/api) dono EK HI address par deta hai,
   isliye khali string = "apne hi server par /api call karo". Bas ek URL yaad rakho.
   (Advanced: agar kabhi API alag host par le jana ho to is script se PEHLE
    window.FIREX_API_BASE = "https://..." set kar dena — aam taur par kabhi nahi.) */
window.FIREX_API_BASE = window.FIREX_API_BASE || "";
window.FIREX_APP_NAME = "FIREX Esports";
