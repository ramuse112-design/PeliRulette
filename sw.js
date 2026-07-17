self.addEventListener('install', (event) => {
  // Fuerza al Service Worker a activarse inmediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Toma el control de la app al momento
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Responde con la red de forma normal (requisito obligatorio de Chrome)
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
