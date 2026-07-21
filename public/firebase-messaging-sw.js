// BumuBumu Firebase Cloud Messaging Background Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCKIcJBN66qonY2krdNxKDLrnNzYrfDtII",
  authDomain: "bumubumu-app.firebaseapp.com",
  projectId: "bumubumu-app",
  storageBucket: "bumubumu-app.firebasestorage.app",
  messagingSenderId: "865374160634",
  appId: "1:865374160634:web:c294ff923cd3ecbee86b43",
  measurementId: "G-5L1X6D3R6E"
};

// Initialize Firebase App in service worker context
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const notificationTitle = payload.notification?.title || payload.data?.title || 'BumuBumu';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'Yeni bir karşılaştırma var, hemen oy ver!',
    icon: payload.notification?.icon || payload.data?.icon || '/logo_v5.png',
    badge: '/logo_v5.png',
    data: payload.data,
    tag: payload.data?.tag || 'bumubumu-notification',
    renotify: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click to open the app or a specific URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = event.notification.data?.path || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a tab open with this app
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // If no tab is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
