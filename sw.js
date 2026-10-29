const CACHE_NAME = 'geomercado-pro-final-v1';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://unpkg.com/html5-qrcode'
];

// 1. INSTALACIÓN: Guarda los archivos principales y toma el control de inmediato
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                ASSETS_TO_CACHE.map((url) => cache.add(url).catch(() => {}))
            );
        })
    );
});

// 2. ACTIVACIÓN: Elimina cualquier caché de versiones viejas automáticamente
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. INTERCEPTOR INTELIGENTE: Red primero para código fresco, Caché si no hay internet
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Ignorar peticiones que no sean GET o que vayan a Firebase, Gemini IA o Tasas BCV
    if (
        req.method !== 'GET' ||
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('generativelanguage.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('dolarvzla.com') ||
        url.hostname.includes('dolarapi.com') ||
        url.hostname.includes('qrserver.com')
    ) {
        return;
    }

    event.respondWith(
        fetch(req)
            .then((networkResponse) => {
                // Si hay internet, actualiza el caché silenciosamente con la versión más reciente
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(req, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Si se va el internet, entrega el archivo desde la memoria del teléfono
                return caches.match(req).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    if (req.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
