// Client for workers/image-encode-worker.js.
// Keeps one worker per page; callers fall back to main-thread canvas encoding
// when `supported()` is false (no OffscreenCanvas, or the worker failed).

const ImageEncodeClient = (() => {
    const WORKER_URL = 'workers/image-encode-worker.js';
    let worker = null;
    let broken = false;
    let seq = 0;
    const pending = new Map();

    function supported() {
        return !broken
            && typeof Worker !== 'undefined'
            && typeof OffscreenCanvas !== 'undefined'
            && typeof OffscreenCanvas.prototype.convertToBlob === 'function'
            && typeof createImageBitmap === 'function';
    }

    function failAll(message) {
        pending.forEach(p => p.reject(new Error(message)));
        pending.clear();
    }

    function getWorker() {
        if (worker) return worker;
        worker = new Worker(WORKER_URL);
        worker.onmessage = (event) => {
            const data = event.data || {};
            const p = pending.get(data.id);
            if (!p) return;
            pending.delete(data.id);
            if (data.ok) p.resolve(data.blob);
            else p.reject(new Error(data.error || '编码失败'));
        };
        worker.onerror = (event) => {
            event.preventDefault();
            broken = true;
            failAll('编码线程不可用');
            worker.terminate();
            worker = null;
        };
        return worker;
    }

    function call(message, transfer) {
        return new Promise((resolve, reject) => {
            const id = ++seq;
            pending.set(id, { resolve, reject });
            try {
                getWorker().postMessage({ ...message, id }, transfer || []);
            } catch (err) {
                pending.delete(id);
                reject(err);
            }
        });
    }

    /** Decode `source` (off the main thread for File/Blob) and hand it to the worker. */
    async function load(key, source, fallbackImage) {
        let bitmap;
        try {
            bitmap = await createImageBitmap(source);
        } catch (err) {
            // e.g. SVG blobs can't be decoded by createImageBitmap; a loaded <img> can.
            if (!fallbackImage) throw err;
            bitmap = await createImageBitmap(fallbackImage);
        }
        await call({ cmd: 'load', key, bitmap }, [bitmap]);
    }

    /** opts: { width, height, background, format, quality (0..1 or undefined) } -> Blob */
    function encode(key, opts) {
        return call({ cmd: 'encode', key, ...opts });
    }

    function drop(key) {
        if (!worker) return Promise.resolve();
        return call({ cmd: 'drop', key }).catch(() => {});
    }

    return { supported, load, encode, drop };
})();

if (typeof window !== 'undefined') {
    window.ImageEncodeClient = ImageEncodeClient;
}
