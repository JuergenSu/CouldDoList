'use strict';

const cachePrefix = 'coulddolist:' + self.registration.scope + ':';
const cacheName = cachePrefix + '1';
const shell = ['./index.html', './style.css', './app.js'].map((file) => new URL(file, self.registration.scope).href);
const home = new URL('./', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) =>
    cache.addAll(shell.map((url) => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key))
  )));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const page = request.mode === 'navigate' && (home === url.origin + url.pathname || shell[0] === url.origin + url.pathname);
  if (!page && !shell.includes(request.url)) return;

  event.respondWith(fetch(request).catch(async (error) => {
    const cache = await caches.open(cacheName);
    const fallback = await cache.match(page ? shell[0] : request);
    if (fallback) return fallback;
    throw error;
  }));
});
