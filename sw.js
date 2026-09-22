const CACHE="carr-hill-v33";
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

  // Cache successful third-party static assets (for example the Supabase JS CDN)
  // after first use. This keeps the installed app shell usable offline without
  // caching any Supabase user data or API responses.
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached) return cached;

    try{
      const response=await fetch(event.request);
      if(response && (response.ok || response.type==="opaque")){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
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