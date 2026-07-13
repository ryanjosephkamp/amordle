const CACHE_NAME = 'brrrdle-shell-v1'
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon.svg', '/icons/maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const clone = response.clone()
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)))
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/'))),
  )
})
