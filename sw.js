// Bewaart de app op de telefoon zodat hij ook zonder internet werkt.
// Verhoog VERSIE bij elke wijziging zodat iPhones de nieuwe versie ophalen.
const VERSIE = 'boekhouding-v2';
const BESTANDEN = ['./', 'index.html', 'styles.css', 'btw.js', 'bonlezer.js', 'ib.js', 'scan.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSIE).then((c) => c.addAll(BESTANDEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((sleutels) => Promise.all(sleutels.filter((k) => k !== VERSIE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Eerst netwerk (altijd de nieuwste versie), anders uit de cache
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((antwoord) => {
        const kopie = antwoord.clone();
        caches.open(VERSIE).then((c) => c.put(e.request, kopie));
        return antwoord;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
