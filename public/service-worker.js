/*
 * @license
 * Your First PWA Codelab (https://g.co/codelabs/pwa)
 * Copyright 2019 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */
'use strict';

// CODELAB: Update cache names any time any of the cached files change.
// const CACHE_NAME = 'static-cache-v1.2';
// const DATA_CACHE_NAME = 'data-cache-v1';
const CACHE_NAME = 'static-cache-v2.0.1';
const DATA_CACHE_NAME = 'data-cache-v2.0.1';

// CODELAB: Add list of files to cache here.
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/install.js',
  '/offline.html',
  '/style.css'/*,
  '/assets/AK.json',
  '/assets/CO.json',
  '/assets/CA.json',
  '/assets/UT.json',
  '/assets/WA.json'*/
];

self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install');
  // CODELAB: Precache static resources here.
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching offline page');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  // CODELAB: Remove previous cached data from disk.
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {

  console.log('[ServiceWorker] Fetch', evt.request.url);
  // CODELAB: Add fetch event handler here.
  if (evt.request.url.includes('/hourly/')) {
    console.log('[Service Worker] Fetch (data)', evt.request.url);
    evt.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(evt.request)
          .then((response) => {
            // If the response was good, clone it and store it in the cache.
            if (response.status === 200) {
              // Add a custom header with the timestamp
              const newHeaders = new Headers(response.headers);
              newHeaders.append('sw-fetched-on', new Date().getTime());
              const responseToCache = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
              });

              // We need to clone the response before reading the body, 
              // but we can't clone a stream repeatedly easily to create a new Response.
              // Actually, simpler: just put the response in cache directly, 
              // and manage expiration by checking the Date header or just relying on the fact 
              // we don't have an easy way to append metadata without reading the whole stream.

              // Alternative: Store the timestamp in IndexedDB or just rely on a simpler pruning mechanism.
              // For simplicity in this file without external libs, let's just clone standard response
              // and assume we prune old entries on activation or lazily.

              // Let's implement lazy expiration on retrieval.
              cache.put(evt.request.url, response.clone());
            }
            return response;
          }).catch((err) => {
            // Network request failed, try to get it from the cache.
            return cache.match(evt.request).then(response => {
              if (!response) return undefined;

              // Check Date header if available to determine age
              const dateHeader = response.headers.get('date');
              if (dateHeader) {
                const age = new Date().getTime() - new Date(dateHeader).getTime();
                const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
                if (age > sevenDaysInMs) {
                  console.log('[Service Worker] Expired cache entry found, deleting.');
                  cache.delete(evt.request.url);
                  return undefined; // Return nothing so the app handles the error
                }
              }
              return response;
            });
          });
      }));
    return;
  }

  evt.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(evt.request)
        .then((response) => {
          return response || fetch(evt.request);
        });
    })
  );

});