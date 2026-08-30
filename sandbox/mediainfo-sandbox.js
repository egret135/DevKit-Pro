// MediaInfo sandbox worker page.
//
// Message protocol (parent <-> this sandboxed iframe):
//   parent -> sandbox:
//     { type: 'mi-ping' }                                  handshake probe
//     { type: 'mi-init', wasmBuffer }                      WASM bytes (transferred)
//     { type: 'mi-analyze', id, size }                     start analysis of a file
//     { type: 'mi-chunk', requestId, buffer | error }      reply to a read request
//   sandbox -> parent:
//     { type: 'mi-ready' }                                 sandbox is listening
//     { type: 'mi-read', requestId, offset, size }         request file bytes
//     { type: 'mi-result', id, result }                    analysis result
//     { type: 'mi-error', id, message }                    analysis failed
//
// The sandbox has an opaque origin, so it cannot fetch extension resources
// itself; the parent fetches MediaInfoModule.wasm and transfers the bytes
// here, where a fetch() override serves them to the Emscripten loader.

(function () {
    'use strict';

    let wasmBuffer = null;
    let factoryPromise = null;
    let readSeq = 0;
    const pendingReads = new Map();

    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (wasmBuffer && url.indexOf('MediaInfoModule.wasm') !== -1) {
            return Promise.resolve(new Response(wasmBuffer.slice(0), {
                status: 200,
                headers: { 'Content-Type': 'application/wasm' }
            }));
        }
        return realFetch(input, init);
    };

    function getFactory() {
        if (!factoryPromise) {
            factoryPromise = MediaInfo.mediaInfoFactory({
                format: 'object',
                locateFile: (path) => path
            });
        }
        return factoryPromise;
    }

    function readChunkFromParent(size, offset) {
        return new Promise((resolve, reject) => {
            const requestId = ++readSeq;
            pendingReads.set(requestId, { resolve, reject });
            window.parent.postMessage({ type: 'mi-read', requestId, offset, size }, '*');
        });
    }

    window.addEventListener('message', async (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'mi-ping') {
            window.parent.postMessage({ type: 'mi-ready' }, '*');
            return;
        }

        if (msg.type === 'mi-init') {
            if (!wasmBuffer) wasmBuffer = msg.wasmBuffer;
            return;
        }

        if (msg.type === 'mi-chunk') {
            const pending = pendingReads.get(msg.requestId);
            if (!pending) return;
            pendingReads.delete(msg.requestId);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(new Uint8Array(msg.buffer));
            return;
        }

        if (msg.type === 'mi-analyze') {
            try {
                if (!wasmBuffer) throw new Error('WASM 尚未初始化');
                const mi = await getFactory();
                const result = await mi.analyzeData(
                    () => msg.size,
                    (chunkSize, offset) => readChunkFromParent(chunkSize, offset)
                );
                // JSON round-trip guarantees the payload is structured-cloneable.
                window.parent.postMessage({
                    type: 'mi-result',
                    id: msg.id,
                    result: JSON.parse(JSON.stringify(result))
                }, '*');
            } catch (e) {
                window.parent.postMessage({
                    type: 'mi-error',
                    id: msg.id,
                    message: (e && e.message) || String(e)
                }, '*');
            }
        }
    });

    window.parent.postMessage({ type: 'mi-ready' }, '*');
})();
