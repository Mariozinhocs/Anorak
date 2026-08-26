/**
 * ANORAK OASIS - Service Worker
 * Desenvolvido por Mario Henrique (mariozinhocs) - mariozinhocs@gmail.com
 * "si vis pacem para bellum"
 */

const CACHE_NAME = 'anorak-oasis-cache-v1.9.0';
const STATIC_ASSETS = [
  './',
  'index.html',
  'login.html',
  'app.html',
  'admin.html',
  'help.html',
  'manifest.json',
  'assets/favicon.svg',
  'css/variables.css',
  'css/base.css',
  'css/components.css',
  'css/animations.css',
  'css/home.css',
  'css/login.css',
  'css/admin.css',
  'css/help.css',
  'js/models.js',
  'js/db.js',
  'js/voice.js',
  'js/matrix.js',
  'js/sync.js',
  'js/app.js',
  'js/admin.js'
];

// Instalação: Pré-cache dos ativos essenciais do app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Alguns recursos estáticos não puderam ser pré-cacheados:', err);
      });
    })
  );
  self.skipWaiting();
});

// Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de Requisições
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requisições de API e POST/PUT/DELETE do cache estático (trabalham em tempo real com sync híbrido)
  if (url.pathname.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Retorna do cache se existir, e em paralelo atualiza a versão mais recente na rede (Stale-While-Revalidate)
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
