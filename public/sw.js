const CACHE_NAME = 'bumubumu-cache-v7';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json?v=6',
  '/logo_v5.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Clearing old PWA cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip dynamic firebase or external requests
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('firebase') ||
    event.request.url.includes('chrome-extension')
  ) {
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  const isHtmlRequest = isNavigation || 
                        event.request.url.endsWith('/') || 
                        event.request.url.endsWith('index.html') ||
                        (!event.request.url.split('/').pop().includes('.') && !event.request.url.includes('/api/'));

  if (isHtmlRequest) {
    // Network-First Strategy for HTML/Navigation:
    // Always request the freshest HTML page from the network first.
    // If the network request fails (offline), fall back to cached '/' or '/index.html'.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Store it in the cache under '/' for general fallback
              cache.put('/', responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/') || caches.match('/index.html');
        })
    );
    return;
  }

  // Cache-First with Network-Fallback Strategy for static assets (JS, CSS, images, etc.)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background for non-HTML assets to keep cache updated
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }
      
      // If not cached, fetch from network and store in cache
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && !event.request.url.includes('/api/')) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});

// PWA Bildirim Tıklama Etkinliği (Notification Click Event)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Uygulama penceresini odakla veya yeni pencerede aç
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      let targetUrl = '/';
      if (event.notification.data && event.notification.data.url) {
        targetUrl = event.notification.data.url;
      }
      
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
            break;
          }
        }
        return client.focus();
      }
      return clients.openWindow(targetUrl);
    })
  );
});

// PWA Arkaplan Push Bildirim Etkinliği (Background Web Push Protocol Support)
self.addEventListener('push', (event) => {
  let payload = { title: 'BumuBumu', body: 'Yeni bir etkileşiminiz var!' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload = { title: 'BumuBumu', body: event.data.text() };
    }
  }

  const title = payload.title || 'BumuBumu 🗳️';
  const options = {
    body: payload.body || 'Yeni bir bildirim aldınız.',
    icon: payload.icon || '/logo_v5.png',
    badge: payload.badge || '/logo_v5.png',
    vibrate: payload.vibrate || [200, 100, 200],
    data: {
      url: payload.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

