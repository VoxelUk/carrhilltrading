const CACHE="carr-hill-v32";
const CORE=["./","./index.html","./manifest.json","./logo.svg"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(async cache=>{
      for(const asset of CORE){
        try{await cache.add(asset)}catch(_){/* stay installable if one asset is temporarily unavailable */}
      }
    })
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;

  const url=new URL(event.request.url);
  if(url.hostname.includes("supabase.co")) return;

  // Pages and same-origin app files are network-first so deployed updates appear
  // immediately, while the last working copy remains available offline.
  if(event.request.mode==="navigate" || url.origin===self.location.origin){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(event.request,copy));
          }
          return response;
        })
        .catch(async()=>{
          const cached=await caches.match(event.request);
          return cached || caches.match("./index.html");
        })
    );
    return;
  }

  // Third-party GETs use cache fallback without blocking live data APIs.
  event.respondWith(
    fetch(event.request).catch(()=>caches.match(event.request))
  );
});