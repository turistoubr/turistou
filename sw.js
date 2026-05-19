// ============================================================
// TURISTOU — Service Worker
// Estratégia: Cache-first para assets estáticos
//             Network-first para API (Supabase/Asaas)
// ============================================================

const CACHE_NAME = 'turistou-v1';

const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Playfair+Display:ital,wght@0,700;0,800;1,700&display=swap',
];

// Instalar — pré-cachear assets principais
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativar — limpar caches antigos
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch — lógica de cache
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Deixar passar sem cache: Supabase, Asaas, CDNs de script
  if (
    url.includes('supabase.co') ||
    url.includes('asaas.com') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdn.sheetjs.com') ||
    url.includes('fonts.gstatic.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first para assets estáticos (imagens, fontes CSS)
  if (
    event.request.method === 'GET' &&
    (url.includes('fonts.googleapis.com') ||
     url.endsWith('.png') ||
     url.endsWith('.jpg') ||
     url.endsWith('.svg') ||
     url.endsWith('.ico'))
  ) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          return response;
        });
      })
    );
    return;
  }

  // Network-first para o HTML principal (sempre busca versão mais recente)
  if (event.request.mode === 'navigate' || url.endsWith('/') || url.endsWith('/index.html')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          return response;
        })
        .catch(function() {
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Default: tenta rede, cai no cache se offline
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

// ── PUSH: receber e exibir notificação ───────────────────────
self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}

  var title   = data.title || 'Turistou';
  var options = {
    body:    data.body  || '',
    icon:    data.icon  || '/icon-192.png',
    badge:   '/badge.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/' },
    actions: data.url ? [{ action: 'open', title: 'Abrir →' }] : []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── CLICK: abrir app ao clicar na notificação ────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var c of list) {
        if (c.url.includes(self.location.origin)) {
          c.focus();
          c.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
