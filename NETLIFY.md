# "Poora source zip Netlify par live kar du to sahi rahega?"

**Short answer: nahi — poora app nahi chalega. Sirf UI dikhega.**

## Kyun
Netlify **static hosting** hai: sirf HTML / CSS / JS / images serve karta hai.
Hamara backend `server/index.js` ek **Node/Express server** hai jo hamesha chalna chahiye
(Firebase Admin SDK, wallet transactions, UPI auto-credit, FCM push, signup, staff/admin APIs).

Netlify par `/api/health`, `/api/payments/*`, `/api/auth/signup` … koi bhi route **exist nahi
karega**. Result:

| Cheez | Netlify (static) par |
|---|---|
| App ka UI / themes / splash | ✅ dikhega |
| Login / signup | ❌ `/api/auth/signup` → 404 |
| Deposit / UPI QR / coins add | ❌ |
| Wallet, withdraw, tournaments join | ❌ |
| Push notification | ❌ |
| Admin / staff panel actions | ❌ |

App khud detect karega (`/api/health` fail) aur **"FireX server URL"** prompt dikhayega —
matlab Netlify sirf ek jump-page ban jayega, kaam ka nahi.

## Sahi raasta (pehle se ready hai)
**`free-host/` → Render Blueprint.** Wahan poora Node server chalega aur **ek hi URL** par
HTML + `/api` dono milenge. 5 step, sirf 1 value paste karni hai.
Guide: `free-host/README.md` · Tested ✅.

Agar Netlify par **sirf HTML** rakhna hi ho (jaise preview/landing page), to:
- `netlify.toml` diya hai (publish = `web`), drag-and-drop se UI live ho jayegi.
- Lekin app ke andar ka ⚙ prompt aapko asli Node server URL par le jayega.
- Isliye iski zarurat nahi — Render wala ek URL hi kaafi hai.

> Netlify Functions se Express chalana technically possible hai, par usme build/CI,
> `serverless-http`, cold starts aur bundling issues aate hain — "easy" nahi hai.
> Isliye wo raasta nahi apnaya.

## Storage kahan milega / Blaze lagega? — **Nahi lagega, zarurat hi nahi** ✅
**3 Feb 2026 se Firebase Cloud Storage sirf Blaze (pay-as-you-go, card) plan par available
hai.** Spark (free) project me Storage ka bucket hi nahi banta; console upgrade page par le
jata hai aur API 402/403 deti hai. "5 GB free" quota bhi sirf Blaze par unlock hota hai.

Console me **Build → Storage** dikhe to wo upgrade prompt hi hoga — usse chhedne ki zarurat
nahi. Hamara app Storage use karta hi nahi:

| Pehle | Ab (Spark-free) |
|---|---|
| Cloud Storage SDK se file save | `media/{id}` doc me base64 (Firestore) |
| `https://storage.googleapis.com/...` | `/api/media/:id` (server se, normal http URL) |
| ImgBB key client me (leak) | server-side upload, key kahin nahi |

Spark par Firestore **1 GiB stored + 50,000 reads/day + 20,000 writes/day free** hai —
chhoti compressed images (max 700 KB, client-side resize) ke liye kaafi.
`firebase.json` se `storage` section hata diya gaya hai; `storage.rules` sirf optional
reference ke liye rakha hai (deploy mat karein).

Baaki free: **Auth, Firestore, Hosting, FCM** — sab Spark par. ❌ Blaze-only: Cloud Storage,
Cloud Functions, Phone Auth. Isliye backend Node/Express self-hosted hai (Render free),
Cloud Functions nahi.
