// Media Tools - Media Info Viewer
// Basic facts come from the File object; deep track details (codecs, bitrates,
// channels, container) come from mediainfo.js. Its Emscripten glue needs
// 'unsafe-eval', which MV3 forbids on extension pages, so it runs inside a
// sandboxed iframe (sandbox/mediainfo-sandbox.html) and this module talks to
// it over postMessage. File bytes stay here: the sandbox requests chunks on
// demand ('mi-read'), so large files are never fully loaded into memory.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    // Track fields that are noise for humans (mediainfo internals / dupes).
    const SKIP_FIELDS = new Set(['@type', 'extra', 'UniqueID', 'ID', 'StreamOrder', 'Count', 'StreamCount']);

    const TRACK_TYPE_LABELS = {
        General: '容器 (General)',
        Video: '视频轨 (Video)',
        Audio: '音频轨 (Audio)',
        Text: '字幕轨 (Text)',
        Image: '图像 (Image)',
        Menu: '章节 (Menu)'
    };

    // ---- Sandbox bridge ----
    let sandboxReadyPromise = null;
    let analyzeSeq = 0;
    let currentFile = null;
    const pendingAnalyses = new Map();

    function initSandboxBridge() {
        if (sandboxReadyPromise) return sandboxReadyPromise;
        const iframe = document.getElementById('mediaInfoSandbox');

        sandboxReadyPromise = new Promise((resolve, reject) => {
            let settled = false;

            window.addEventListener('message', async (event) => {
                if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
                const msg = event.data;
                if (!msg || typeof msg !== 'object') return;

                if (msg.type === 'mi-ready') {
                    if (settled) return;
                    settled = true;
                    try {
                        const resp = await fetch('lib/mediainfo/MediaInfoModule.wasm');
                        const buf = await resp.arrayBuffer();
                        iframe.contentWindow.postMessage({ type: 'mi-init', wasmBuffer: buf }, '*', [buf]);
                        resolve(iframe.contentWindow);
                    } catch (e) {
                        reject(new Error('加载 MediaInfo WASM 失败: ' + e.message));
                    }
                } else if (msg.type === 'mi-read') {
                    if (!currentFile) return;
                    try {
                        const buf = await currentFile
                            .slice(msg.offset, msg.offset + msg.size)
                            .arrayBuffer();
                        iframe.contentWindow.postMessage(
                            { type: 'mi-chunk', requestId: msg.requestId, buffer: buf }, '*', [buf]
                        );
                    } catch (e) {
                        iframe.contentWindow.postMessage(
                            { type: 'mi-chunk', requestId: msg.requestId, error: e.message }, '*'
                        );
                    }
                } else if (msg.type === 'mi-result' || msg.type === 'mi-error') {
                    const pending = pendingAnalyses.get(msg.id);
                    if (!pending) return;
                    pendingAnalyses.delete(msg.id);
                    if (msg.type === 'mi-result') pending.resolve(msg.result);
                    else pending.reject(new Error(msg.message));
                }
            });

            // Handshake: the sandbox announces itself with 'mi-ready' on load,
            // but that can fire before this listener exists, so also ping it.
            const pingTimer = setInterval(() => {
                if (settled) {
                    clearInterval(pingTimer);
                    return;
                }
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'mi-ping' }, '*');
                }
            }, 200);
            setTimeout(() => {
                clearInterval(pingTimer);
                if (!settled) {
                    settled = true;
                    reject(new Error('MediaInfo 沙箱初始化超时'));
                }
            }, 10000);
        });
        return sandboxReadyPromise;
    }

    async function analyzeDeep(file) {
        const sandboxWindow = await initSandboxBridge();
        currentFile = file;
        const id = ++analyzeSeq;
        return new Promise((resolve, reject) => {
            pendingAnalyses.set(id, { resolve, reject });
            sandboxWindow.postMessage({ type: 'mi-analyze', id, size: file.size }, '*');
        });
    }

    // ---- Rendering ----
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function renderTracks(table, tracks) {
        const rows = [];
        tracks.forEach(track => {
            const label = TRACK_TYPE_LABELS[track['@type']] || track['@type'];
            rows.push(`<tr class="media-info-track"><td colspan="2">${escapeHtml(label)}</td></tr>`);
            Object.keys(track).forEach(key => {
                if (SKIP_FIELDS.has(key)) return;
                const value = track[key];
                if (value === null || typeof value === 'object') return;
                rows.push(`<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`);
            });
        });
        table.innerHTML = rows.join('');
    }

    function initInfo() {
        const dropzone = document.getElementById('mediaInfoDropzone');
        if (!dropzone) return;
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');
        const result = document.getElementById('mediaInfoResult');
        const basic = document.getElementById('mediaInfoBasic');
        const table = document.getElementById('mediaInfoTable');

        let latestFileToken = 0;

        ImageUtils.createDropZone(dropzone, {
            accept: 'video/*,audio/*',
            enablePaste: false,
            onFile: async (file) => {
                const token = ++latestFileToken;
                result.classList.remove('hidden');
                basic.textContent = `${file.name} · ${file.type || '未知类型'} · ${ImageUtils.formatFileSize(file.size)}`;
                table.innerHTML = '<tr><td colspan="2">解析中…</td></tr>';
                hintSub.textContent = `已加载: ${file.name} · 可再次点击更换文件`;

                try {
                    const data = await analyzeDeep(file);
                    if (token !== latestFileToken) return; // superseded by a newer file
                    const tracks = data && data.media && data.media.track;
                    if (tracks && tracks.length) {
                        renderTracks(table, tracks);
                    } else {
                        table.innerHTML = '<tr><td colspan="2">未解析出媒体轨道信息</td></tr>';
                    }
                } catch (e) {
                    if (token !== latestFileToken) return;
                    table.innerHTML = `<tr><td colspan="2">解析失败: ${escapeHtml(e.message)}</td></tr>`;
                }
            }
        });
    }

    DevKit.MediaTools.info = { init: initInfo };
})();
