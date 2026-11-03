# FIREX Esports — Free Host (Render Blueprint)

**Ek hi URL** par app + `/api` dono. Koi alag "API URL" nahi.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ravi2809867-eng/firex-host)

## Deploy (2 minute)
1. Upar **Deploy to Render** dabayein → GitHub/Google se login (free account).
   Ya seedha: `https://dashboard.render.com/` → **New → Blueprint** → ye repo connect karein.
   `render.yaml` root me hai, sab auto-fill ho jayega (Docker, free plan, health check).
2. Blueprint form me **2 values** bharo:
   - `FIREBASE_SERVICE_ACCOUNT` → poora Admin SDK **JSON** (jo aapne pehle diya tha).
     ⚠️ Is JSON ko **kabhi repo me commit mat karo** — sirf Render env me.
   - `MERCHANT_UPI_ID` → apna asli UPI ID, jaise `name@okhdfcbank` (QR isi par pay hoga).
3. **Apply / Create Web Service** → 2–3 min me `https://firex-xxxx.onrender.com` mil jayega.
   Test: `https://firex-xxxx.onrender.com/api/health` → `{"ok":true,"firebase":true,...}`

Bas yahi URL user/admin/staff APK me "FireX server URL" me daalna hai. Ek hi URL. ✅

## Free plan ki 2 baatein
- 15 min idle ke baad service sleep → pehli request 30–60 sec leti hai (cold start). Normal hai.
- **Cloud Storage / Blaze ki zarurat nahi** — images Firestore me hain (`/api/media/:id`).
  Details: `NETLIFY.md`.

## Local test
```bash
npm install
FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/key.json)" npm start
# http://localhost:3000
```

Owner console (agar baki ho): Auth → Email/Password Enable, Cloud Messaging Enable,
composite indexes, `firebase deploy --only storage` **mat** karein.
