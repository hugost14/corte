// Corte · guarda la app completa en el teléfono para que funcione sin internet
const APP='corte-app-a0123fb85b', MODEL='corte-model-8af8ce772a';
const APP_FILES=["./", "fonts/archivo-black-latin-400-normal.woff2", "fonts/archivo-black-latin-ext-400-normal.woff2", "fonts/bricolage-grotesque-latin-ext-wght-normal.woff2", "fonts/bricolage-grotesque-latin-wght-normal.woff2", "fonts/fonts.css", "fonts/jetbrains-mono-latin-500-normal.woff2", "fonts/jetbrains-mono-latin-ext-500-normal.woff2", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "index.html", "manifest.webmanifest"];
const MODEL_FILES=["asr/asr.mjs", "asr/m/config.json", "asr/m/decoder-0.wasm", "asr/m/decoder-1.wasm", "asr/m/decoder-2.wasm", "asr/m/decoder-3.wasm", "asr/m/decoder-4.wasm", "asr/m/encoder-0.wasm", "asr/m/encoder-1.wasm", "asr/m/encoder-2.wasm", "asr/m/generation_config.json", "asr/m/manifest.json", "asr/m/preprocessor_config.json", "asr/m/tokenizer.json", "asr/m/tokenizer_config.json", "asr/ort.wasm", "asr/tf.mjs"];
const post=async m=>{(await self.clients.matchAll({includeUncontrolled:true,type:'window'})).forEach(c=>c.postMessage(m))};
async function precache(){
  const total=APP_FILES.length+MODEL_FILES.length;let done=0;
  const step=()=>{done++;post({type:'progress',p:done/total})};
  const app=await caches.open(APP),model=await caches.open(MODEL);
  const one=async(cache,u)=>{if(await cache.match(u)){step();return}
    for(let i=0;i<3;i++){try{const r=await fetch(new Request(u,{cache:'reload'}));if(!r.ok)throw new Error(r.status);await cache.put(u,r);step();return}catch(e){if(i===2)throw e}}};
  const run=async(cache,list)=>{const q=[...list];await Promise.all([0,1,2].map(async()=>{while(q.length)await one(cache,q.shift())}))};
  await run(app,APP_FILES);await run(model,MODEL_FILES);
}
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(precache().then(()=>post({type:'ready'}),err=>{post({type:'failed'});throw err}))});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('corte-')&&k!==APP&&k!==MODEL)await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
  e.respondWith((async()=>{const c=await caches.match(r,{ignoreSearch:true});if(c)return c;
    if(r.mode==='navigate'){const i=await caches.match('./',{ignoreSearch:true})||await caches.match('index.html');if(i)return i}
    try{return await fetch(r)}catch(err){return new Response('Sin conexión',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}})}})())});
