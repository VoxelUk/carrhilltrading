const CACHE="carr-hill-v34";
const CORE=["./","./index.html","./manifest.json","./logo.svg"];
const MAX_RUNTIME_ENTRIES=60;
const STATIC_DESTINATIONS=new Set(["script","style","font","image"]);

async function trimCache(cacheName,maxEntries=MAX_RUNTIME_ENTRIES){
  const cache=await caches.open(cacheName);
  const keys=await cache.keys();
  if(keys.length<=maxEntries)return;
  await Promise.all(keys.slice(0,keys.length-maxEntries).map(request=>cache.delete(request)));
}

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

  // Never cache Supabase API/auth/realtime requests. They contain live user data
  // and must always go directly to the network.
  if(url.hostname.includes("supabase.co")) return;

  // Pages and same-origin app files are network-first so deployed updates appear
  // immediately, while the last working copy remains available offline.
  if(event.request.mode==="navigate" || url.origin===self.location.origin){
    event.respondWith(
      fetch(event.request)
        .then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            event.waitUntil(
              caches.open(CACHE)
                .then(cache=>cache.put(event.request,copy))
                .then(()=>trimCache(CACHE))
            );
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

  // Only cache third-party static assets. Other external requests stay network-only
  // so live or potentially sensitive responses never end up in the PWA cache.
  if(!STATIC_DESTINATIONS.has(event.request.destination)) return;

  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached) return cached;

    try{
      const response=await fetch(event.request);
      if(response && (response.ok || response.type==="opaque")){
        const copy=response.clone();
        event.waitUntil(
          caches.open(CACHE)
            .then(cache=>cache.put(event.request,copy))
            .then(()=>trimCache(CACHE))
        );
      }
      return response;
    }catch(_){
      return new Response("Offline",{
        status:503,
        statusText:"Offline",
        headers:{"Content-Type":"text/plain; charset=utf-8"}
      });
    }
  })());
});