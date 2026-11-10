// Corte · transcripción en el dispositivo con Whisper base (palabras con tiempo)
import { pipeline, env } from './tf.mjs';

const base = new URL('./', import.meta.url);
const WASM_SIZE = 14264838;
const VER = 'v1:';
const NO_IDB = true; // versión instalable: el modelo vive en la caché de la app
let pipeP = null;

const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('corte-asr', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('f');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  return {
    async get(k) {
      if (NO_IDB) return undefined;
      try { const db = await open(); return await new Promise(res => { const q = db.transaction('f').objectStore('f').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
      catch (e) { return undefined; }
    },
    async put(k, v) {
      if (NO_IDB) return;
      try { const db = await open(); await new Promise(res => { const t = db.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = res; t.onerror = res; t.onabort = res; }); }
      catch (e) { /* sin caché: se descargará otra vez la próxima vez */ }
    }
  };
})();

async function fetchBlob(rel) {
  const r = await fetch(new URL(rel, base));
  if (!r.ok) throw new Error('No pude descargar ' + rel + ' (' + r.status + ')');
  return r.blob();
}

export function isLoaded() { return !!pipeP; }

export function load(onProgress) {
  if (pipeP) return pipeP;
  pipeP = (async () => {
    const man = await (await fetch(new URL('m/manifest.json', base))).json();
    const total = Object.values(man).reduce((a, x) => a + x.size, 0) + WASM_SIZE;
    let done = 0;
    const tick = (n, label) => { done += n; if (onProgress) onProgress(Math.min(1, done / total), label); };

    let wasm = await idb.get(VER + 'wasm');
    if (!wasm) { wasm = await fetchBlob('ort.wasm'); idb.put(VER + 'wasm', wasm); }
    tick(WASM_SIZE, 'Motor de voz');

    const files = {};
    for (const [rel, info] of Object.entries(man)) {
      let b = await idb.get(VER + rel);
      if (!b) {
        // cada parte lleva 8 bytes de cabecera wasm para poder publicarse; se quitan aquí
        const parts = await Promise.all(Array.from({ length: info.parts }, (_, i) =>
          fetchBlob(`m/${info.stem}-${i}.wasm`).then(p => { const body = p.slice(8); tick(body.size, 'Modelo de voz'); return body; })));
        b = new Blob(parts);
        if (b.size !== info.size) throw new Error('El modelo llegó incompleto; inténtalo otra vez.');
        idb.put(VER + rel, b);
      } else tick(info.size, 'Modelo de voz');
      files[rel] = b;
    }

    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = base.href + 'm/';
    env.useBrowserCache = false;
    env.useWasmCache = false;
    env.useCustomCache = true;
    env.customCache = {
      async match(key) {
        const k = String(key);
        for (const rel of Object.keys(files)) if (k.endsWith(rel)) return new Response(files[rel], { headers: { 'content-length': String(files[rel].size) } });
        const name = k.split('/').pop();
        try { const r = await fetch(new URL('m/' + name, base)); if (r.ok) return r; } catch (e) { }
        return undefined;
      },
      async put() { }
    };
    const o = env.backends.onnx;
    o.wasm.wasmBinary = await wasm.arrayBuffer();
    o.wasm.wasmPaths = { wasm: new URL('ort.wasm', base).href };
    o.wasm.numThreads = 1;
    o.wasm.proxy = false;
    if (onProgress) onProgress(1, 'Preparando el modelo');
    return pipeline('automatic-speech-recognition', 'whisper', { dtype: 'q8', device: 'wasm' });
  })();
  pipeP.catch(() => { pipeP = null; });
  return pipeP;
}

// pcm: Float32Array mono a 16 kHz → [{w, a, b}] en segundos del audio
export async function transcribe(pcm, onProgress) {
  const asr = await load(onProgress);
  const out = await asr(pcm, { language: 'spanish', task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
  return (out.chunks || []).map(c => {
    const a = c.timestamp[0] ?? 0, b = c.timestamp[1] ?? a + 0.3;
    return { w: (c.text || '').trim(), a, b: Math.max(b, a + 0.05) };
  }).filter(x => x.w);
}
