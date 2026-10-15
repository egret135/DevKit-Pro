// Pixel diff worker: runs mapbox/pixelmatch off the main thread.
// Message: { id, width, height, a: ArrayBuffer, b: ArrayBuffer, options }
// Reply:   { id, ok, mismatch, diff: ArrayBuffer } | { id, ok:false, error }

importScripts('../lib/pixelmatch.min.js');

self.onmessage = (event) => {
    const msg = event.data || {};
    const { id, width, height, options } = msg;
    try {
        if (typeof pixelmatch !== 'function') throw new Error('pixelmatch 未加载');
        const len = width * height * 4;
        const a = new Uint8ClampedArray(msg.a);
        const b = new Uint8ClampedArray(msg.b);
        if (a.length !== len || b.length !== len) {
            throw new Error(`像素缓冲长度不符：期望 ${len}，收到 ${a.length}/${b.length}`);
        }
        const diff = new Uint8ClampedArray(len);
        const mismatch = pixelmatch(a, b, diff, width, height, options || {});
        const buf = diff.buffer;
        self.postMessage({ id, ok: true, mismatch, width, height, diff: buf }, [buf]);
    } catch (err) {
        self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
    }
};
