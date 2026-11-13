/* JBH-88 offline shell.

   Network-first: online always serves the newest deployed build, offline falls
   back to the last good copy.

   The subtlety is that "network-first" is not enough on its own. A plain
   fetch() still goes through the browser's own HTTP cache, so an installed app
   could be handed a stale index.html while perfectly online — and then this
   worker would write that stale copy into its cache and keep serving it. A
   tester could sit on a broken build long after it was fixed. The shell is
   therefore revalidated with cache:'no-store', which bypasses the HTTP cache
   for exactly the files that change on every deploy.

   Samples and icons are deliberately NOT no-store: they are large, they almost
   never change, and forcing a re-download of a 14 MB sample pack on every
   launch would be worse than useless. */
const CACHE = 'jbh88-shell-v7';   // bumped: the precache no longer fails whole
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-256.png', './icons/icon-512.png',
  './icons/maskable-192.png', './icons/maskable-512.png'];

/* ONE 404 USED TO COST THE WHOLE OFFLINE SHELL, and nothing said so.

   `cache.addAll()` is ATOMIC: if any one request fails, the promise
   rejects and NOTHING is written. That rejection was handed to
   `install`'s waitUntil, so the install failed, the worker never
   activated, and the cache sat there empty — while the page that
   registered it swallowed the error in a bare `.catch(()=>{})`.

   Measured on a static server that does not serve a directory index,
   which is every `python3 -m http.server` and the test harness here:

     cacheNames  ["jbh88-shell-v5"]
     cached      { "jbh88-shell-v5": [] }     <- empty
     rootStatus  404                           <- './' does not resolve
     state       "none"   controlled  false    <- never activated

   GitHub Pages does serve `/` as an index, so the deployed site was
   getting away with it. But the failure mode is that ONE renamed icon
   silently costs every bit of offline capability the app has, and the
   only symptom is that the app does not open on a train.

   So each entry is cached on its own and the failures are reported.
   `'./'` is kept because a person navigating to the bare directory URL
   requests exactly that, but it is no longer allowed to take the other
   eight with it — and the fetch handler below caches the navigation
   response on the first online visit anyway, so it is belt and braces
   rather than the only route. */
async function precache(c) {
  const done = await Promise.allSettled(SHELL.map(async u => {
    const res = await fetch(new Request(u, { cache: 'reload' }));
    if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
    await c.put(u, res);
    return u;
  }));
  const bad = done.map((d, i) => [SHELL[i], d]).filter(([, d]) => d.status === 'rejected');
  if (bad.length) {
    /* REPORTED, NEVER SWALLOWED. A shell that is missing a file still
       works; a shell that is empty does not, and the difference has to
       be visible. The page reads this back for DIAG. */
    const msg = 'sw: ' + bad.length + ' of ' + SHELL.length + ' shell files failed — '
      + bad.map(([u, d]) => u + ' (' + (d.reason && d.reason.message) + ')').join(', ');
    console.warn(msg);
    const cs = await self.clients.matchAll({ includeUncontrolled: true });
    for (const cl of cs) { try { cl.postMessage({ jbhSw: 'shell-partial', says: msg }); } catch (e) {} }
  }
  return SHELL.length - bad.length;
}

/* Files that change every time the app is rebuilt, and so must never be served
   from a stale HTTP cache: the page itself and its install metadata. */
function isShellDoc(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /(^|\/)$|\.html$|\.webmanifest$/.test(url.pathname);
}

self.addEventListener('install', e => {
  self.skipWaiting();
  /* precache() resolves even when some entries fail, so the install
     completes and the worker activates with whatever it did get. An
     install that rejects leaves no worker at all, which is strictly
     worse than a shell with a missing icon in it. */
  e.waitUntil(caches.open(CACHE).then(precache));
});

/* WHETHER THIS WILL WORK OFFLINE, ANSWERABLE FROM THE PAGE. "Is it
   cached yet" was not a question anything could ask, so the only way to
   find out was to lose the connection and see. */
self.addEventListener('message', e => {
  if (!e.data || e.data.jbhSw !== 'shell-status') return;
  e.waitUntil((async () => {
    let have = [], err = null;
    try { have = (await (await caches.open(CACHE)).keys()).map(q => q.url); }
    catch (x) { err = String(x && x.message || x); }
    const reply = { jbhSw: 'shell-status', cache: CACHE, want: SHELL.length,
      have: have.length, missing: have.length < SHELL.length, err };
    if (e.source) { try { e.source.postMessage(reply); } catch (x) {} }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const shell = isShellDoc(e.request);
  e.respondWith((async () => {
    try {
      const fresh = await fetch(shell ? new Request(e.request, { cache: 'no-store' }) : e.request);
      if (fresh && fresh.ok) {
        const c = await caches.open(CACHE);
        c.put(e.request, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
