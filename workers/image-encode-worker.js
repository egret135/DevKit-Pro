// Image encode worker: renders a cached ImageBitmap onto an OffscreenCanvas and
// encodes it, so resizing, canvas readback and encoding (including the
// synchronous UPNG palette quantization) never block the page.
//
// Messages (all carry an `id`, answered with { id, ok, blob? , error? }):
//   { cmd: 'load',   key, bitmap }                       - bitmap is transferred
//   { cmd: 'encode', key, width, height, background, format, quality }
//   { cmd: 'drop',   key }

// upng.min.js publishes itself on `window` and reads `window.pako`.
self.window = self;
importScripts('../lib/pako.min.js', '../lib/upng.min.js');

const sources = new Map();
let surface = null; // { key, width, height, background, canvas }

function releaseSurface() {
    if (!surface) return;
    surface.canvas.width = 0;
    surface.canvas.height = 0;
    surface = null;
}

function getSurface(key, width, height, background) {
    if (surface && surface.key === key && surface.width === width
        && surface.height === height && surface.background === background) {
        return surface.canvas;
    }
    const bitmap = sources.get(key);
    if (!bitmap) throw new Error('图片尚未加载到编码线程');
    releaseSurface();
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    surface = { key, width, height, background, canvas };
    return canvas;
}

async function encode(msg) {
    const { key, width, height, format, quality } = msg;
    const canvas = getSurface(key, width, height, msg.background || null);
    const lossyPng = format === 'image/png' && typeof quality === 'number' && quality > 0 && quality < 1;
    if (lossyPng) {
        const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data.buffer;
        const colorCount = Math.max(2, Math.min(256, Math.round(quality * 256)));
        return new Blob([UPNG.encode([rgba], width, height, colorCount)], { type: 'image/png' });
    }
    const options = { type: format };
    if (typeof quality === 'number' && format !== 'image/png') options.quality = quality;
    return canvas.convertToBlob(options);
}

self.onmessage = async (event) => {
    const msg = event.data || {};
    const { id, cmd, key } = msg;
    try {
        if (cmd === 'load') {
            const old = sources.get(key);
            if (old) old.close();
            if (surface && surface.key === key) releaseSurface();
            sources.set(key, msg.bitmap);
            self.postMessage({ id, ok: true });
        } else if (cmd === 'drop') {
            const bitmap = sources.get(key);
            if (bitmap) bitmap.close();
            sources.delete(key);
            if (surface && surface.key === key) releaseSurface();
            self.postMessage({ id, ok: true });
        } else if (cmd === 'encode') {
            const blob = await encode(msg);
            self.postMessage({ id, ok: true, blob });
        } else {
            throw new Error(`未知命令：${cmd}`);
        }
    } catch (err) {
        self.postMessage({ id, ok: false, error: (err && err.message) || String(err) });
    }
};
