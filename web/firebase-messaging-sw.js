/* Firebase Cloud Messaging service worker (web / Chrome WebView).
   Replace the config below with your PUBLIC web config (config.js values). */
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDQh4WPGmZ0BZsTZNIISo7eaaeC__vtE7I",
  authDomain: "new-firex.firebaseapp.com",
  projectId: "new-firex",
  storageBucket: "new-firex.firebasestorage.app",
  messagingSenderId: "694101804542",
  appId: "1:694101804542:web:5de47bf040fc5fe8ffacaf"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'FIREX Esports';
  const body = payload.notification?.body || payload.data?.body || 'You have a new update.';
  return self.registration.showNotification(title, {
    body, icon: '/assets/flame-logo.jpg', badge: '/assets/flame-logo.jpg',
    data: { url: payload.data?.url || '/' }, tag: 'firex-alert'
  });
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow(e.notification.data?.url || '/');
  }));
});
