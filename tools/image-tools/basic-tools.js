// Image Tools - Basic Tools
// Four self-contained sub-tools that need no external library:
// Base64 codec, format conversion, and compression.
// Placeholder generation lives in tools/image-tools/placeholder-tool.js.
// All rely on utils/image-utils.js (ImageUtils) for shared dropzone/canvas/download helpers.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // ==================== Base64 Codec ====================

    const B64_MAX_FILES = 20;
    const B64_MAX_FILE_BYTES = 20 * 1024 * 1024;
    // Above this, inlining usually costs more than a separate request.
    const B64_INLINE_WARN_BYTES = 100 * 1024;
    const B64_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i;

    const B64_MIME_INFO = {
        'image/png': { label: 'PNG', ext: 'png' },
        'image/jpeg': { label: 'JPEG', ext: 'jpg' },
        'image/gif': { label: 'GIF', ext: 'gif' },
        'image/webp': { label: 'WebP', ext: 'webp' },
        'image/bmp': { label: 'BMP', ext: 'bmp' },
        'image/x-icon': { label: 'ICO', ext: 'ico' },
        'image/svg+xml': { label: 'SVG', ext: 'svg' },
        'image/avif': { label: 'AVIF', ext: 'avif' }
    };
    const B64_MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/vnd.microsoft.icon': 'image/x-icon', 'image/ico': 'image/x-icon' };

    function canonicalMime(mime) {
        const m = String(mime || '').toLowerCase().trim();
        return B64_MIME_ALIASES[m] || m;
    }

    function mimeLabel(mime) {
        const info = B64_MIME_INFO[canonicalMime(mime)];
        return info ? info.label : (mime || '未知');
    }

    function mimeExt(mime) {
        const info = B64_MIME_INFO[canonicalMime(mime)];
        return info ? info.ext : 'png';
    }

    /**
     * Accepts a Data URI, bare Base64 (standard or URL-safe, any padding/whitespace),
     * or a Data URI wrapped in CSS url(...) / HTML attribute quotes.
     * Returns { base64, declaredMime, isBase64:true } | { text, declaredMime, isBase64:false } | { error }.
     */
    function normalizeBase64Input(input) {
        let s = String(input || '').trim();
        if (!s) return { error: '' };

        const dataIdx = s.search(/data:/i);
        if (dataIdx > 0) {
            const opener = s[dataIdx - 1];
            s = s.slice(dataIdx);
            if (opener === '"' || opener === "'") {
                const close = s.indexOf(opener);
                if (close > 0) s = s.slice(0, close);
            } else if (opener === '(') {
                const close = s.lastIndexOf(')');
                if (close > 0) s = s.slice(0, close);
            }
        }
        if (/^data:/i.test(s)) {
            s = s.replace(/[\s;]+$/, '');

            const comma = s.indexOf(',');
            if (comma < 0) return { error: 'Data URI 缺少逗号分隔的数据部分' };
            const header = s.slice(5, comma);
            const payload = s.slice(comma + 1);
            const declaredMime = canonicalMime(header.split(';')[0]);
            if (!/;base64$/i.test(header.trim())) {
                try {
                    return { text: decodeURIComponent(payload), declaredMime, isBase64: false };
                } catch (_) {
                    return { error: 'URL 编码的 Data URI 无法解码' };
                }
            }
            return finishBase64(payload, declaredMime);
        }

        if (/^\s*</.test(s)) {
            return { text: s, declaredMime: '', isBase64: false };
        }
        return finishBase64(s, '');
    }

    function finishBase64(payload, declaredMime) {
        let b = payload.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
        if (!b) return { error: '没有 Base64 数据' };
        if (/[^A-Za-z0-9+/=]/.test(b)) return { error: '包含非法 Base64 字符' };
        b = b.replace(/=+$/, '');
        if (b.includes('=')) return { error: '包含非法 Base64 字符（数据中间出现 =）' };
        if (b.length % 4 === 1) return { error: 'Base64 长度不正确，数据可能被截断' };
        b += '='.repeat((4 - (b.length % 4)) % 4);
        return { base64: b, declaredMime, isBase64: true };
    }

    function base64HeadBytes(base64, count) {
        const bin = atob(base64.slice(0, Math.ceil(count / 3) * 4));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    function looksLikeSvgText(text) {
        const head = String(text || '').replace(/^\uFEFF/, '').trimStart().slice(0, 1024).toLowerCase();
        if (head.startsWith('<svg')) return true;
        return (head.startsWith('<?xml') || head.startsWith('<!doctype svg') || head.startsWith('<!--')) && head.includes('<svg');
    }

    /** Identify an image type from its leading bytes; '' when unknown. */
    function sniffImageMime(bytes) {
        const b = bytes;
        const at = (i, ...vals) => vals.every((v, k) => b[i + k] === v);
        if (b.length >= 8 && at(0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return 'image/png';
        if (b.length >= 3 && at(0, 0xFF, 0xD8, 0xFF)) return 'image/jpeg';
        if (b.length >= 6 && at(0, 0x47, 0x49, 0x46, 0x38) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
        if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
        if (b.length >= 12 && at(4, 0x66, 0x74, 0x79, 0x70) && (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x61, 0x76, 0x69, 0x73))) return 'image/avif';
        if (b.length >= 2 && at(0, 0x42, 0x4D)) return 'image/bmp';
        if (b.length >= 4 && at(0, 0x00, 0x00, 0x01, 0x00)) return 'image/x-icon';
        let text = '';
        for (let i = 0; i < Math.min(b.length, 1024); i++) text += String.fromCharCode(b[i]);
        if (text.charCodeAt(0) === 0xEF && text.charCodeAt(1) === 0xBB && text.charCodeAt(2) === 0xBF) text = text.slice(3);
        return looksLikeSvgText(text) ? 'image/svg+xml' : '';
    }

    /** URL-encoded SVG Data URI; usually shorter than Base64 for SVG sources. */
    function svgToDataUri(svgText) {
        let s = String(svgText || '')
            .replace(/^\uFEFF/, '')
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/>\s+</g, '><')
            .replace(/\s{2,}/g, ' ')
            .trim();
        // Single quotes avoid %22 noise; only safe when the source has none of its own.
        if (!s.includes("'")) s = s.replace(/"/g, "'");
        const encoded = encodeURIComponent(s)
            .replace(/%3D/g, '=')
            .replace(/%3A/g, ':')
            .replace(/%2F/g, '/')
            .replace(/%2C/g, ',')
            .replace(/%3B/g, ';')
            .replace(/%40/g, '@')
            .replace(/%2B/g, '+');
        return 'data:image/svg+xml,' + encoded;
    }

    function escapeAttr(value) {
        return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escapeMdAlt(value) {
        return String(value).replace(/[\[\]\\]/g, '\\$&');
    }

    /**
     * kind: dataUri | raw | css | html | markdown.
     * `uri` is the Data URI to embed; `base64Uri` backs the raw format.
     */
    function buildSnippet(kind, uri, info = {}) {
        const alt = String(info.name || 'image').replace(/\.[^.]+$/, '');
        switch (kind) {
            case 'raw': {
                const src = info.base64Uri || uri;
                return src.slice(src.indexOf(',') + 1);
            }
            case 'css':
                return `background-image: url("${uri}");`;
            case 'html': {
                const size = info.width && info.height ? ` width="${info.width}" height="${info.height}"` : '';
                return `<img src="${uri}"${size} alt="${escapeAttr(alt)}">`;
            }
            case 'markdown':
                return `![${escapeMdAlt(alt)}](${uri.replace(/ /g, '%20').replace(/\)/g, '%29')})`;
            default:
                return uri;
        }
    }

    function isAcceptedImageFile(file) {
        return (file.type && file.type.startsWith('image/')) || B64_IMAGE_EXT_RE.test(file.name || '');
    }

    function initBase64() {
        const panel = document.getElementById('imgPanelBase64');
        const dropzone = document.getElementById('imgBase64Dropzone');
        const notice = document.getElementById('imgB64Notice');
        const fileList = document.getElementById('imgB64FileList');
        const clearBtn = document.getElementById('imgB64ClearBtn');
        const current = document.getElementById('imgB64Current');
        const preview = document.getElementById('imgBase64Preview');
        const meta = document.getElementById('imgBase64Meta');
        const outputWrap = document.getElementById('imgB64Output');
        const output = document.getElementById('imgBase64Output');
        const outputSize = document.getElementById('imgB64OutputSize');
        const svgChip = document.getElementById('imgB64SvgChip');
        const copyBtn = document.getElementById('imgBase64CopyDataUrlBtn');
        const downloadBtn = document.getElementById('imgBase64DownloadBtn');
        const segBtns = Array.from(panel.querySelectorAll('.b64-seg-btn[data-snippet]'));
        const modeBtns = Array.from(panel.querySelectorAll('.b64-seg-btn[data-mode]'));
        const encodePane = document.getElementById('imgB64PaneEncode');
        const decodePane = document.getElementById('imgB64PaneDecode');
        const encodeHint = document.getElementById('imgB64EncodeHint');

        const input = document.getElementById('imgBase64Input');
        const status = document.getElementById('imgBase64DecodeStatus');
        const decodeBtn = document.getElementById('imgBase64DecodeBtn');
        const decodedPreview = document.getElementById('imgBase64DecodedPreview');
        const decodedEmpty = document.getElementById('imgB64DecodedEmpty');
        const decodedBox = document.getElementById('imgB64DecodedBox');
        const decodedCopyBtn = document.getElementById('imgB64CopyDecodedBtn');
        const decodedDownloadBtn = document.getElementById('imgBase64DecodedDownloadBtn');

        // ---------- Tabs ----------

        let mode = 'encode';

        function syncAside() {
            const encoding = mode === 'encode';
            encodeHint.classList.toggle('hidden', !encoding || entries.length > 0);
            clearBtn.classList.toggle('hidden', !encoding || entries.length === 0);
            status.classList.toggle('hidden', encoding || !status.textContent);
        }

        function setMode(next, focus = false) {
            mode = next === 'decode' ? 'decode' : 'encode';
            modeBtns.forEach(btn => {
                const on = btn.dataset.mode === mode;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-selected', String(on));
                btn.tabIndex = on ? 0 : -1;
                if (on && focus) btn.focus();
            });
            encodePane.classList.toggle('hidden', mode !== 'encode');
            decodePane.classList.toggle('hidden', mode !== 'decode');
            syncAside();
            if (mode === 'decode' && !focus) input.focus();
        }

        modeBtns.forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
        panel.querySelector('.b64-mode-seg').addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            setMode(mode === 'encode' ? 'decode' : 'encode', true);
        });

        // ---------- Encode ----------

        let entries = [];
        let currentId = null;
        let nextId = 1;
        let snippetKind = 'dataUri';
        let svgUrlMode = false;

        const getEntry = (id) => entries.find(e => e.id === id) || null;

        function showNotice(text) {
            notice.textContent = text || '';
            notice.classList.toggle('hidden', !text);
        }

        async function ensureEncoded(entry) {
            if (entry.base64Uri) return entry;
            const raw = await ImageUtils.readFileAsDataURL(entry.file);
            const comma = raw.indexOf(',');
            const base64 = raw.slice(comma + 1);
            let mime = canonicalMime(entry.file.type);
            const sniffed = sniffImageMime(base64HeadBytes(base64, 1024));
            if (sniffed) mime = sniffed;
            entry.mime = mime || 'application/octet-stream';
            entry.base64Uri = `data:${entry.mime};base64,${base64}`;
            if (entry.mime === 'image/svg+xml') {
                entry.svgUri = svgToDataUri(await entry.file.text());
            }
            return entry;
        }

        function entryUri(entry) {
            return svgUrlMode && entry.svgUri ? entry.svgUri : entry.base64Uri;
        }

        function entrySnippet(entry, kind = snippetKind) {
            return buildSnippet(kind, entryUri(entry), {
                name: entry.name,
                width: entry.width,
                height: entry.height,
                base64Uri: entry.base64Uri
            });
        }

        function chip(text, cls = '') {
            const el = document.createElement('span');
            el.className = `b64-chip${cls ? ' ' + cls : ''}`;
            el.textContent = text;
            return el;
        }

        function renderMeta(entry) {
            meta.replaceChildren();
            const encodedLen = entryUri(entry).length;
            const growth = entry.size > 0 ? Math.round((encodedLen / entry.size - 1) * 100) : 0;
            if (entry.width && entry.height) meta.append(chip(`${entry.width} × ${entry.height}`));
            meta.append(chip(mimeLabel(entry.mime)));
            meta.append(chip(`原始 ${ImageUtils.formatFileSize(entry.size)}`));
            const encodedLabel = svgUrlMode && entry.svgUri ? 'URL 编码' : 'Base64';
            meta.append(chip(`${encodedLabel} ${ImageUtils.formatFileSize(encodedLen)}`, 'is-accent'));
            meta.append(chip(`${growth >= 0 ? '+' : ''}${growth}%`, growth > 0 ? '' : 'is-success'));
            if (encodedLen > B64_INLINE_WARN_BYTES) {
                const warn = chip('体积较大，不建议内联', 'is-warn');
                warn.title = `编码后超过 ${ImageUtils.formatFileSize(B64_INLINE_WARN_BYTES)}，内联会拖慢 HTML/CSS 解析且无法被单独缓存`;
                meta.append(warn);
            }
        }

        function renderOutput() {
            const entry = getEntry(currentId);
            if (!entry || !entry.base64Uri) return;
            const isSvg = !!entry.svgUri;
            svgChip.classList.toggle('hidden', !isSvg);
            svgChip.classList.toggle('active', isSvg && svgUrlMode);
            svgChip.setAttribute('aria-pressed', String(isSvg && svgUrlMode));
            segBtns.forEach(btn => {
                const on = btn.dataset.snippet === snippetKind;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-selected', String(on));
            });
            const text = entrySnippet(entry);
            output.value = text;
            output.scrollTop = 0;
            outputSize.textContent = `${text.length.toLocaleString()} 字符`;
            renderMeta(entry);
        }

        function renderList() {
            fileList.replaceChildren();
            const multi = entries.length > 1;
            fileList.classList.toggle('hidden', !multi);
            encodePane.classList.toggle('has-files', entries.length > 0);
            syncAside();
            if (!multi) return;
            entries.forEach(entry => {
                const li = document.createElement('li');
                li.className = `b64-file${entry.id === currentId ? ' active' : ''}`;
                li.dataset.id = String(entry.id);
                li.tabIndex = 0;
                li.setAttribute('aria-current', entry.id === currentId ? 'true' : 'false');

                const thumb = document.createElement('img');
                thumb.className = 'b64-file-thumb';
                thumb.src = entry.thumbUrl;
                thumb.alt = '';

                const info = document.createElement('div');
                info.className = 'b64-file-info';
                const name = document.createElement('span');
                name.className = 'b64-file-name';
                name.textContent = entry.name;
                name.title = entry.name;
                const sub = document.createElement('span');
                sub.className = 'b64-file-sub';
                const dims = entry.width ? `${entry.width} × ${entry.height} · ` : '';
                sub.textContent = `${dims}${ImageUtils.formatFileSize(entry.size)}`;
                info.append(name, sub);

                const copy = document.createElement('button');
                copy.type = 'button';
                copy.className = 'b64-mini-btn';
                copy.dataset.action = 'copy';
                copy.textContent = '复制';
                copy.title = '按当前格式复制';

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'b64-file-remove';
                remove.dataset.action = 'remove';
                remove.setAttribute('aria-label', `移除 ${entry.name}`);
                remove.textContent = '×';

                li.append(thumb, info, copy, remove);
                fileList.append(li);
            });
        }

        async function selectEntry(id) {
            const entry = getEntry(id);
            if (!entry) return;
            currentId = id;
            renderList();
            current.classList.remove('hidden');
            preview.src = entry.thumbUrl;
            preview.alt = entry.name;
            try {
                await ensureEncoded(entry);
            } catch (err) {
                showNotice(`读取失败：${err.message || err}`);
                return;
            }
            if (currentId !== id) return;
            outputWrap.classList.remove('hidden');
            renderOutput();
        }

        function measure(entry) {
            const img = new Image();
            img.onload = () => {
                entry.width = img.naturalWidth;
                entry.height = img.naturalHeight;
                if (!getEntry(entry.id)) return;
                renderList();
                if (entry.id === currentId && entry.base64Uri) renderOutput();
            };
            img.src = entry.thumbUrl;
        }

        function addFiles(files) {
            const skipped = [];
            const added = [];
            for (const file of files) {
                if (!isAcceptedImageFile(file)) { skipped.push(`${file.name}（不是图片）`); continue; }
                if (file.size > B64_MAX_FILE_BYTES) { skipped.push(`${file.name}（超过 20MB）`); continue; }
                if (entries.length >= B64_MAX_FILES) { skipped.push(`${file.name}（超过 ${B64_MAX_FILES} 张上限）`); continue; }
                const entry = {
                    id: nextId++,
                    file,
                    name: file.name || 'image',
                    size: file.size,
                    mime: canonicalMime(file.type),
                    thumbUrl: URL.createObjectURL(file),
                    width: 0,
                    height: 0,
                    base64Uri: '',
                    svgUri: ''
                };
                entries.push(entry);
                added.push(entry);
                measure(entry);
            }
            showNotice(skipped.length ? `已跳过：${skipped.join('、')}` : '');
            if (added.length) selectEntry(added[0].id);
            else renderList();
        }

        function removeEntry(id) {
            const idx = entries.findIndex(e => e.id === id);
            if (idx < 0) return;
            URL.revokeObjectURL(entries[idx].thumbUrl);
            entries.splice(idx, 1);
            if (!entries.length) { clearAll(); return; }
            if (currentId === id) selectEntry(entries[Math.min(idx, entries.length - 1)].id);
            else renderList();
        }

        function clearAll() {
            entries.forEach(e => URL.revokeObjectURL(e.thumbUrl));
            entries = [];
            currentId = null;
            preview.removeAttribute('src');
            meta.replaceChildren();
            output.value = '';
            outputSize.textContent = '';
            current.classList.add('hidden');
            outputWrap.classList.add('hidden');
            showNotice('');
            renderList();
        }

        ImageUtils.createDropZone(dropzone, {
            accept: 'image/*,.svg,.ico',
            multiple: true,
            onFiles: addFiles
        });

        fileList.addEventListener('click', async (e) => {
            const li = e.target.closest('.b64-file');
            if (!li) return;
            const id = Number(li.dataset.id);
            const action = e.target.closest('[data-action]');
            if (action && action.dataset.action === 'remove') { removeEntry(id); return; }
            if (action && action.dataset.action === 'copy') {
                const entry = getEntry(id);
                if (!entry) return;
                await ensureEncoded(entry);
                ImageUtils.copyText(entrySnippet(entry), action);
                return;
            }
            if (id !== currentId) selectEntry(id);
        });

        fileList.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const li = e.target.closest('.b64-file');
            if (!li || e.target !== li) return;
            e.preventDefault();
            selectEntry(Number(li.dataset.id));
        });

        clearBtn.addEventListener('click', clearAll);

        segBtns.forEach(btn => btn.addEventListener('click', () => {
            snippetKind = btn.dataset.snippet;
            renderOutput();
        }));

        svgChip.addEventListener('click', () => {
            svgUrlMode = !svgUrlMode;
            renderOutput();
        });

        copyBtn.addEventListener('click', () => ImageUtils.copyText(output.value, copyBtn));

        downloadBtn.addEventListener('click', () => {
            const entry = getEntry(currentId);
            if (entry) ImageUtils.downloadBlob(entry.file, entry.name);
        });

        preview.addEventListener('click', () => {
            const entry = getEntry(currentId);
            if (entry && window.ImageLightbox) ImageLightbox.openImage(entry.thumbUrl, entry.name);
        });

        // ---------- Decode ----------

        let decoded = null;
        let decodeToken = 0;

        function setStatus(text, kind) {
            status.textContent = text || '';
            status.className = `b64-status${kind ? ' is-' + kind : ''}`;
            syncAside();
        }

        function resetDecoded() {
            decoded = null;
            decodedPreview.classList.add('hidden');
            decodedPreview.removeAttribute('src');
            decodedEmpty.classList.remove('hidden');
            decodedBox.classList.remove('has-image');
            decodedCopyBtn.disabled = true;
            decodedDownloadBtn.disabled = true;
        }

        async function decode() {
            const token = ++decodeToken;
            const raw = input.value;
            if (!raw.trim()) { resetDecoded(); setStatus(''); return; }

            const norm = normalizeBase64Input(raw);
            if (norm.error) { resetDecoded(); setStatus(norm.error, 'error'); return; }

            let mime;
            let dataUri;
            let byteSize;
            let svgText = '';
            const declared = norm.declaredMime;

            if (!norm.isBase64) {
                if (!looksLikeSvgText(norm.text)) { resetDecoded(); setStatus('不是图片数据（无法识别为 SVG）', 'error'); return; }
                mime = 'image/svg+xml';
                svgText = norm.text;
                dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
                byteSize = new Blob([svgText]).size;
            } else {
                let head;
                try {
                    head = base64HeadBytes(norm.base64, 1024);
                } catch (_) {
                    resetDecoded(); setStatus('包含非法 Base64 字符', 'error'); return;
                }
                mime = sniffImageMime(head);
                if (!mime) {
                    if (declared && declared.startsWith('image/')) {
                        mime = declared;
                    } else {
                        resetDecoded(); setStatus('不是图片数据（无法识别文件头）', 'error'); return;
                    }
                }
                dataUri = `data:${mime};base64,${norm.base64}`;
                byteSize = ImageUtils.estimateBase64Size(norm.base64);
            }

            let loaded;
            try {
                loaded = await ImageUtils.loadImageFile(dataUri);
            } catch (_) {
                if (token !== decodeToken) return;
                resetDecoded(); setStatus(`识别为 ${mimeLabel(mime)}，但图片无法渲染，数据可能已损坏`, 'error'); return;
            }
            if (token !== decodeToken) return;

            decoded = { mime, dataUri, svgText };
            decodedPreview.src = dataUri;
            decodedPreview.classList.remove('hidden');
            decodedEmpty.classList.add('hidden');
            decodedBox.classList.add('has-image');
            decodedCopyBtn.disabled = false;
            decodedDownloadBtn.disabled = false;

            const parts = [`识别为 ${mimeLabel(mime)}`];
            if (loaded.width && loaded.height) parts.push(`${loaded.width} × ${loaded.height}`);
            parts.push(ImageUtils.formatFileSize(byteSize));
            const mismatch = declared && canonicalMime(declared) !== mime;
            if (mismatch) parts.push(`声明为 ${mimeLabel(declared)}，已按实际类型处理`);
            setStatus(parts.join(' · '), mismatch ? 'warn' : 'ok');
        }

        const debouncedDecode = debounce(decode, 300);
        input.addEventListener('input', debouncedDecode);
        input.addEventListener('paste', () => setTimeout(decode, 0));
        decodeBtn.addEventListener('click', decode);

        decodedCopyBtn.addEventListener('click', () => {
            if (decoded) ImageUtils.copyText(decoded.dataUri, decodedCopyBtn);
        });

        decodedDownloadBtn.addEventListener('click', () => {
            if (!decoded) return;
            const blob = decoded.svgText
                ? new Blob([decoded.svgText], { type: 'image/svg+xml' })
                : ImageUtils.dataURLToBlob(decoded.dataUri);
            ImageUtils.downloadBlob(blob, ImageUtils.generateFilename('decoded', mimeExt(decoded.mime)));
        });

        decodedPreview.addEventListener('click', () => {
            if (decoded && window.ImageLightbox) ImageLightbox.openImage(decoded.dataUri, '解码结果');
        });

        resetDecoded();
    }

    DevKit.Base64Image = { normalizeBase64Input, sniffImageMime, svgToDataUri, buildSnippet, base64HeadBytes };

    // ==================== Format Conversion ====================

    const CVT_MAX_FILES = 30;
    const CVT_MAX_FILE_BYTES = 30 * 1024 * 1024;
    const CVT_MAX_DIM = 16384;
    const CVT_ICO_SIZES = [16, 32, 48, 256];
    const CVT_FORMATS = {
        'image/png': { label: 'PNG', ext: 'png', quality: true, alpha: true },
        'image/jpeg': { label: 'JPEG', ext: 'jpg', quality: true, alpha: false },
        'image/webp': { label: 'WebP', ext: 'webp', quality: true, alpha: true },
        'image/avif': { label: 'AVIF', ext: 'avif', quality: true, alpha: true },
        'image/x-icon': { label: 'ICO', ext: 'ico', quality: false, alpha: true },
        'image/bmp': { label: 'BMP', ext: 'bmp', quality: false, alpha: false }
    };
    const CVT_IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i;

    function clampDim(n) {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v) || v < 1) return 1;
        return Math.min(CVT_MAX_DIM, v);
    }

    /**
     * resize: { mode: original|width|height|percent, width, height, percent, lock }.
     * Missing values fall back to the source dimension.
     */
    function computeTargetSize(src, resize) {
        const sw = Math.max(1, src.width || 1);
        const sh = Math.max(1, src.height || 1);
        const r = resize || {};
        const lock = r.lock !== false;
        switch (r.mode) {
            case 'width': {
                const w = clampDim(r.width > 0 ? r.width : sw);
                const h = lock ? clampDim(w * sh / sw) : clampDim(r.height > 0 ? r.height : sh);
                return { width: w, height: h };
            }
            case 'height': {
                const h = clampDim(r.height > 0 ? r.height : sh);
                const w = lock ? clampDim(h * sw / sh) : clampDim(r.width > 0 ? r.width : sw);
                return { width: w, height: h };
            }
            case 'percent': {
                const p = r.percent > 0 ? r.percent : 100;
                return { width: clampDim(sw * p / 100), height: clampDim(sh * p / 100) };
            }
            default:
                return { width: clampDim(sw), height: clampDim(sh) };
        }
    }

    /** ICO entries can't exceed the source's longer side; keep at least the smallest choice. */
    function icoSizesFor(src, chosen) {
        const picked = (chosen && chosen.length ? chosen : [32]).filter(s => CVT_ICO_SIZES.includes(s)).sort((a, b) => a - b);
        const longest = Math.max(src.width || 1, src.height || 1);
        const fit = picked.filter(s => s <= longest);
        return fit.length ? fit : picked.slice(0, 1);
    }

    function deriveOutputName(name, mime, size) {
        const info = CVT_FORMATS[mime] || { ext: 'png' };
        const base = String(name || 'image').replace(/\.[^./\\]+$/, '') || 'image';
        const suffix = size && size.resized ? `-${size.width}x${size.height}` : '';
        return `${base}${suffix}.${info.ext}`;
    }

    /** 24-bit bottom-up BMP from RGBA pixels (alpha must already be flattened). */
    function encodeBmp(imageData) {
        const { width, height, data } = imageData;
        const rowSize = Math.ceil((width * 3) / 4) * 4;
        const pixelBytes = rowSize * height;
        const out = new Uint8Array(54 + pixelBytes);
        const view = new DataView(out.buffer);
        out[0] = 0x42; out[1] = 0x4D;
        view.setUint32(2, out.length, true);
        view.setUint32(10, 54, true);
        view.setUint32(14, 40, true);
        view.setInt32(18, width, true);
        view.setInt32(22, height, true);
        view.setUint16(26, 1, true);
        view.setUint16(28, 24, true);
        view.setUint32(34, pixelBytes, true);
        view.setInt32(38, 2835, true);
        view.setInt32(42, 2835, true);
        for (let y = 0; y < height; y++) {
            const src = (height - 1 - y) * width * 4;
            let dst = 54 + y * rowSize;
            for (let x = 0; x < width; x++) {
                const i = src + x * 4;
                out[dst++] = data[i + 2];
                out[dst++] = data[i + 1];
                out[dst++] = data[i];
            }
        }
        return out;
    }

    function percentDelta(before, after) {
        if (!before) return 0;
        return Math.round((after / before - 1) * 100);
    }

    function loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片无法解码'));
            img.src = url;
        });
    }

    function renderToCanvas(img, width, height, background) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, width, height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        return canvas;
    }

    function renderSquare(img, size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const w = img.naturalWidth || size;
        const h = img.naturalHeight || size;
        const scale = Math.min(size / w, size / h);
        const dw = Math.max(1, Math.round(w * scale));
        const dh = Math.max(1, Math.round(h * scale));
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
        return canvas;
    }

    function imageHasAlpha(img) {
        const w = img.naturalWidth || 1;
        const h = img.naturalHeight || 1;
        const scale = Math.min(1, 256 / Math.max(w, h));
        const canvas = renderToCanvas(img, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), null);
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) return true;
        }
        return false;
    }

    function detectAvifEncoding() {
        return new Promise((resolve) => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 2;
                canvas.toBlob(blob => resolve(!!blob && blob.type === 'image/avif'), 'image/avif', 0.5);
            } catch (_) {
                resolve(false);
            }
        });
    }

    /**
     * opts: { format, quality (1..100), pngQuality (1..100), background, resize }.
     * Returns { blob, width, height, resized }.
     */
    async function convertImage(img, opts) {
        const src = { width: img.naturalWidth, height: img.naturalHeight };
        const format = opts.format;

        if (format === 'image/x-icon') {
            const sizes = icoSizesFor(src, opts.resize.icoSizes);
            const entries = [];
            for (const size of sizes) {
                const square = renderSquare(img, size);
                entries.push({ size, blob: await ImageUtils.canvasToBlob(square, 'image/png') });
                releaseCanvas(square);
            }
            const top = sizes[sizes.length - 1];
            return { blob: await IcoEncoder.encode(entries), width: top, height: top, resized: true, icoSizes: sizes };
        }

        const target = computeTargetSize(src, opts.resize);
        const resized = target.width !== src.width || target.height !== src.height;
        const background = CVT_FORMATS[format].alpha ? null : (opts.background || '#ffffff');

        let blob;
        if (format === 'image/bmp') {
            const canvas = renderToCanvas(img, target.width, target.height, background);
            try {
                const data = canvas.getContext('2d').getImageData(0, 0, target.width, target.height);
                blob = new Blob([encodeBmp(data)], { type: 'image/bmp' });
            } finally {
                releaseCanvas(canvas);
            }
        } else {
            const encoder = opts.encoder || createEncoder(img, null);
            const quality = format === 'image/png' ? opts.pngQuality : opts.quality;
            try {
                blob = await encodeAs(encoder, format, target, background, quality);
            } finally {
                encoder.dispose();
            }
        }
        return { blob, width: target.width, height: target.height, resized };
    }

    function initConvert() {
        const panel = document.getElementById('imgPanelConvert');
        const dropzone = document.getElementById('imgConvertDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const hint = $('imgCvtHint');
        const clearBtn = $('imgCvtClearBtn');
        const notice = $('imgCvtNotice');
        const fileList = $('imgCvtFileList');
        const formatBtns = Array.from(panel.querySelectorAll('[data-format]'));
        const qualityField = $('imgCvtQualityField');
        const qualityInput = $('imgConvertQuality');
        const qualityValue = $('imgConvertQualityValue');
        const qualityNote = $('imgCvtQualityNote');
        const bgField = $('imgCvtBgField');
        const bgBtns = Array.from(panel.querySelectorAll('[data-bg]'));
        const bgColor = $('imgCvtBgColor');
        const resizeField = $('imgCvtResizeField');
        const resizeBtns = Array.from(panel.querySelectorAll('[data-resize]'));
        const resizeInputs = $('imgCvtResizeInputs');
        const widthInput = $('imgCvtWidth');
        const heightInput = $('imgCvtHeight');
        const percentInput = $('imgCvtPercent');
        const lockInput = $('imgCvtLock');
        const icoField = $('imgCvtIcoField');
        const icoBtns = Array.from(panel.querySelectorAll('[data-ico]'));
        const status = $('imgCvtStatus');
        const beforeImg = $('imgConvertBeforeImg');
        const afterImg = $('imgConvertAfterImg');
        const afterEmpty = $('imgCvtAfterEmpty');
        const chips = $('imgCvtChips');
        const progress = $('imgCvtProgress');
        const downloadBtn = $('imgConvertDownloadBtn');
        const zipBtn = $('imgCvtZipBtn');
        const eachBtn = $('imgCvtDownloadEachBtn');

        const state = {
            format: 'image/webp',
            quality: 90,
            pngQuality: 100,
            background: '#ffffff',
            resize: { mode: 'original', width: 0, height: 0, percent: 100, lock: true, icoSizes: [16, 32, 48] }
        };
        let avifSupported = false;
        let entries = [];
        let currentId = null;
        let nextId = 1;
        let busy = false;
        let currentResult = null; // { blob, url, width, height, resized, entryId }

        const getEntry = (id) => entries.find(e => e.id === id) || null;
        const persist = (key, value) => { if (typeof Settings !== 'undefined') Settings.set(key, value); };

        function showNotice(text) {
            notice.textContent = text || '';
            notice.classList.toggle('hidden', !text);
        }

        function setStatus(text) {
            status.textContent = text || '';
        }

        function chip(text, cls = '') {
            const el = document.createElement('span');
            el.className = `b64-chip${cls ? ' ' + cls : ''}`;
            el.textContent = text;
            return el;
        }

        // ---------- Controls ----------

        function setSegActive(btns, attr, value) {
            btns.forEach(btn => {
                const on = btn.dataset[attr] === value;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', String(on));
            });
        }

        function syncControls() {
            const fmt = CVT_FORMATS[state.format];
            const isIco = state.format === 'image/x-icon';
            const current = getEntry(currentId);

            setSegActive(formatBtns, 'format', state.format);

            qualityField.classList.toggle('hidden', !fmt.quality);
            const q = state.format === 'image/png' ? state.pngQuality : state.quality;
            qualityInput.value = String(q);
            qualityValue.textContent = `${q}%`;
            qualityNote.textContent = state.format === 'image/png'
                ? '100% 为无损；低于 100% 会减少颜色数以缩小体积'
                : '';
            qualityNote.classList.toggle('hidden', state.format !== 'image/png');

            const needsBg = !fmt.alpha && !!(current && current.alpha);
            bgField.classList.toggle('hidden', !needsBg);
            const preset = bgBtns.some(b => b.dataset.bg === state.background) ? state.background : 'custom';
            setSegActive(bgBtns, 'bg', preset);
            bgColor.classList.toggle('hidden', preset !== 'custom');
            if (preset === 'custom') bgColor.value = state.background;

            resizeField.classList.toggle('hidden', isIco);
            icoField.classList.toggle('hidden', !isIco);
            const r = state.resize;
            setSegActive(resizeBtns, 'resize', r.mode);
            const showInputs = r.mode !== 'original';
            resizeInputs.classList.toggle('hidden', !showInputs);
            const showW = r.mode === 'width' || (r.mode === 'height' && !r.lock);
            const showH = r.mode === 'height' || (r.mode === 'width' && !r.lock);
            widthInput.parentElement.classList.toggle('hidden', !showW);
            heightInput.parentElement.classList.toggle('hidden', !showH);
            percentInput.parentElement.classList.toggle('hidden', r.mode !== 'percent');
            lockInput.parentElement.classList.toggle('hidden', r.mode === 'percent');
            lockInput.checked = r.lock;
            if (document.activeElement !== widthInput) widthInput.value = r.width > 0 ? String(r.width) : '';
            if (document.activeElement !== heightInput) heightInput.value = r.height > 0 ? String(r.height) : '';
            if (document.activeElement !== percentInput) percentInput.value = String(r.percent || 100);
            if (current) {
                const t = computeTargetSize(current, r);
                widthInput.placeholder = String(t.width);
                heightInput.placeholder = String(t.height);
            }

            icoBtns.forEach(btn => {
                const on = r.icoSizes.includes(Number(btn.dataset.ico));
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-pressed', String(on));
            });
        }

        function onSettingsChanged() {
            syncControls();
            scheduleConvert();
        }

        formatBtns.forEach(btn => btn.addEventListener('click', () => {
            state.format = btn.dataset.format;
            persist('imgConvertFormat', state.format);
            onSettingsChanged();
        }));

        qualityInput.addEventListener('input', () => {
            const q = Math.min(100, Math.max(1, Number(qualityInput.value) || 90));
            if (state.format === 'image/png') {
                state.pngQuality = q;
            } else {
                state.quality = q;
                persist('imgConvertQuality', q);
            }
            qualityValue.textContent = `${q}%`;
            scheduleConvert();
        });

        bgBtns.forEach(btn => btn.addEventListener('click', () => {
            state.background = btn.dataset.bg === 'custom' ? bgColor.value : btn.dataset.bg;
            persist('imgConvertBg', state.background);
            onSettingsChanged();
        }));

        bgColor.addEventListener('input', () => {
            state.background = bgColor.value;
            persist('imgConvertBg', state.background);
            scheduleConvert();
        });

        function persistResize() {
            persist('imgConvertResize', { ...state.resize, icoSizes: [...state.resize.icoSizes] });
        }

        resizeBtns.forEach(btn => btn.addEventListener('click', () => {
            const r = state.resize;
            r.mode = btn.dataset.resize;
            const current = getEntry(currentId);
            if (current) {
                if (r.mode === 'width' && !(r.width > 0)) r.width = current.width;
                if (r.mode === 'height' && !(r.height > 0)) r.height = current.height;
            }
            persistResize();
            onSettingsChanged();
        }));

        function bindNumber(input, key, max) {
            input.addEventListener('input', () => {
                const v = Math.round(Number(input.value));
                state.resize[key] = Number.isFinite(v) && v > 0 ? Math.min(max, v) : 0;
                persistResize();
                syncControls();
                scheduleConvert();
            });
        }
        bindNumber(widthInput, 'width', CVT_MAX_DIM);
        bindNumber(heightInput, 'height', CVT_MAX_DIM);
        bindNumber(percentInput, 'percent', 1000);

        lockInput.addEventListener('change', () => {
            const r = state.resize;
            r.lock = lockInput.checked;
            const current = getEntry(currentId);
            if (!r.lock && current) {
                const t = computeTargetSize(current, { ...r, lock: true });
                r.width = t.width;
                r.height = t.height;
            }
            persistResize();
            onSettingsChanged();
        });

        icoBtns.forEach(btn => btn.addEventListener('click', () => {
            const size = Number(btn.dataset.ico);
            const set = new Set(state.resize.icoSizes);
            if (set.has(size)) {
                if (set.size === 1) return;
                set.delete(size);
            } else {
                set.add(size);
            }
            state.resize.icoSizes = [...set].sort((a, b) => a - b);
            persistResize();
            onSettingsChanged();
        }));

        // ---------- Files ----------

        function renderList() {
            fileList.replaceChildren();
            const multi = entries.length > 1;
            fileList.classList.toggle('hidden', !multi);
            panel.classList.toggle('has-files', entries.length > 0);
            hint.classList.toggle('hidden', entries.length > 0);
            clearBtn.classList.toggle('hidden', entries.length === 0);
            zipBtn.classList.toggle('hidden', !multi);
            eachBtn.classList.toggle('hidden', !multi);
            if (!multi) return;

            entries.forEach(entry => {
                const li = document.createElement('li');
                li.className = `b64-file${entry.id === currentId ? ' active' : ''}`;
                li.dataset.id = String(entry.id);
                li.tabIndex = 0;
                li.setAttribute('aria-current', entry.id === currentId ? 'true' : 'false');

                const thumb = document.createElement('img');
                thumb.className = 'b64-file-thumb';
                thumb.src = entry.thumbUrl;
                thumb.alt = '';

                const info = document.createElement('div');
                info.className = 'b64-file-info';
                const name = document.createElement('span');
                name.className = 'b64-file-name';
                name.textContent = entry.name;
                name.title = entry.name;
                const sub = document.createElement('span');
                sub.className = 'b64-file-sub';
                const dims = entry.width ? `${entry.width} × ${entry.height} · ` : '';
                sub.textContent = `${dims}${ImageUtils.formatFileSize(entry.size)}`;
                if (entry.error) {
                    sub.append(' · ', Object.assign(document.createElement('span'), { className: 'cvt-file-error', textContent: entry.error }));
                } else if (entry.resultSize) {
                    const delta = percentDelta(entry.size, entry.resultSize);
                    const tag = document.createElement('span');
                    tag.className = `cvt-file-delta ${delta <= 0 ? 'is-down' : 'is-up'}`;
                    tag.textContent = `→ ${ImageUtils.formatFileSize(entry.resultSize)} (${delta > 0 ? '+' : ''}${delta}%)`;
                    sub.append(' ', tag);
                }
                info.append(name, sub);

                const dl = document.createElement('button');
                dl.type = 'button';
                dl.className = 'b64-mini-btn';
                dl.dataset.action = 'download';
                dl.textContent = '下载';
                dl.disabled = busy;

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'b64-file-remove';
                remove.dataset.action = 'remove';
                remove.setAttribute('aria-label', `移除 ${entry.name}`);
                remove.textContent = '×';
                remove.disabled = busy;

                li.append(thumb, info, dl, remove);
                fileList.append(li);
            });
        }

        function isAcceptedFile(file) {
            return (file.type && file.type.startsWith('image/')) || CVT_IMAGE_EXT_RE.test(file.name || '');
        }

        async function ensureImage(entry) {
            if (entry.img) return entry.img;
            const img = await loadImageFromUrl(entry.thumbUrl);
            entry.width = img.naturalWidth;
            entry.height = img.naturalHeight;
            if (entry.alpha === null) {
                try { entry.alpha = imageHasAlpha(img); } catch (_) { entry.alpha = true; }
            }
            return img;
        }

        function addFiles(files) {
            if (busy) return;
            const skipped = [];
            const added = [];
            for (const file of files) {
                if (!isAcceptedFile(file)) { skipped.push(`${file.name}（不是图片）`); continue; }
                if (file.size > CVT_MAX_FILE_BYTES) { skipped.push(`${file.name}（超过 30MB）`); continue; }
                if (entries.length >= CVT_MAX_FILES) { skipped.push(`${file.name}（超过 ${CVT_MAX_FILES} 张上限）`); continue; }
                const entry = {
                    id: nextId++,
                    file,
                    name: file.name || 'image',
                    size: file.size,
                    mime: (file.type || '').toLowerCase(),
                    thumbUrl: URL.createObjectURL(file),
                    width: 0,
                    height: 0,
                    alpha: null,
                    img: null,
                    resultSize: 0,
                    error: '',
                    cache: new Map(),
                    workerKey: null
                };
                entries.push(entry);
                added.push(entry);
                loadImageFromUrl(entry.thumbUrl).then(img => {
                    entry.width = img.naturalWidth;
                    entry.height = img.naturalHeight;
                    if (getEntry(entry.id)) renderList();
                }).catch(() => {
                    entry.error = '无法解码';
                    if (getEntry(entry.id)) renderList();
                });
            }
            showNotice(skipped.length ? `已跳过：${skipped.join('、')}` : '');
            if (added.length) selectEntry(added[0].id);
            else renderList();
        }

        function releaseResult() {
            if (currentResult) URL.revokeObjectURL(currentResult.url);
            currentResult = null;
        }

        function resetResultView() {
            releaseResult();
            afterImg.classList.add('hidden');
            afterImg.removeAttribute('src');
            afterEmpty.classList.remove('hidden');
            chips.replaceChildren();
            downloadBtn.disabled = true;
        }

        async function selectEntry(id) {
            const entry = getEntry(id);
            if (!entry) return;
            const previous = getEntry(currentId);
            if (previous && previous !== entry) retireEntry(previous);
            currentId = id;
            renderList();
            beforeImg.src = entry.thumbUrl;
            beforeImg.alt = entry.name;
            beforeImg.classList.remove('hidden');
            beforeImg.nextElementSibling.classList.add('hidden');
            resetResultView();
            runConvert();
        }

        function removeEntry(id) {
            const idx = entries.findIndex(e => e.id === id);
            if (idx < 0) return;
            URL.revokeObjectURL(entries[idx].thumbUrl);
            retireEntry(entries[idx]);
            entries.splice(idx, 1);
            if (!entries.length) { clearAll(); return; }
            if (currentId === id) selectEntry(entries[Math.min(idx, entries.length - 1)].id);
            else renderList();
        }

        function clearAll() {
            if (busy) return;
            runConvert();
            entries.forEach(e => { URL.revokeObjectURL(e.thumbUrl); retireEntry(e); });
            entries = [];
            currentId = null;
            resetResultView();
            beforeImg.classList.add('hidden');
            beforeImg.removeAttribute('src');
            beforeImg.nextElementSibling.classList.remove('hidden');
            showNotice('');
            setStatus('');
            progress.textContent = '';
            renderList();
            syncControls();
        }

        // ---------- Conversion ----------

        function convertOptions() {
            return {
                format: state.format,
                quality: state.quality,
                pngQuality: state.pngQuality,
                background: state.background,
                resize: { ...state.resize }
            };
        }

        function renderResultChips(entry, result) {
            chips.replaceChildren();
            const srcFmt = CVT_FORMATS[entry.mime] ? CVT_FORMATS[entry.mime].label : (entry.mime.replace('image/', '').toUpperCase() || '未知');
            chips.append(chip(`${srcFmt} → ${CVT_FORMATS[state.format].label}`, 'is-accent'));
            if (result.icoSizes) {
                chips.append(chip(`包含 ${result.icoSizes.join(' / ')} px`));
            } else if (result.resized) {
                chips.append(chip(`${entry.width} × ${entry.height} → ${result.width} × ${result.height}`));
            } else {
                chips.append(chip(`${result.width} × ${result.height}`));
            }
            chips.append(chip(`${ImageUtils.formatFileSize(entry.size)} → ${ImageUtils.formatFileSize(result.blob.size)}`));
            const delta = percentDelta(entry.size, result.blob.size);
            chips.append(chip(`${delta > 0 ? '+' : ''}${delta}%`, delta <= 0 ? 'is-success' : 'is-warn'));
            if (entry.mime === 'image/gif') chips.append(chip('GIF 动图仅转换首帧', 'is-warn'));
        }

        async function convertCurrent(isStale) {
            const entry = getEntry(currentId);
            if (!entry || busy) return;
            setStatus('转换中…');
            try {
                const img = await ensureImage(entry);
                if (isStale()) return;
                entry.img = img;
                syncControls();
                const opts = convertOptions();
                const cacheKey = JSON.stringify(opts);
                let result = entry.cache.get(cacheKey);
                if (!result) {
                    await checkpoint(isStale);
                    const workerKey = await loadIntoWorker(entry, `cvt-${entry.id}`, img);
                    if (isStale()) return;
                    result = await convertImage(img, { ...opts, encoder: createEncoder(img, workerKey) });
                    if (isStale()) return;
                    rememberResult(entry, cacheKey, result);
                }
                releaseResult();
                currentResult = { ...result, url: URL.createObjectURL(result.blob), entryId: entry.id };
                afterImg.src = currentResult.url;
                afterImg.classList.remove('hidden');
                afterEmpty.classList.add('hidden');
                downloadBtn.disabled = busy;
                entry.resultSize = result.blob.size;
                entry.error = '';
                renderResultChips(entry, result);
                renderList();
                setStatus('');
            } catch (err) {
                if (isStale() || isAbortError(err)) return;
                resetResultView();
                entry.error = '转换失败';
                setStatus(`转换失败：${err.message || err}`);
                renderList();
            }
        }

        const runConvert = createLatestRunner(convertCurrent);
        const scheduleConvert = debounce(runConvert, 250);

        async function convertEntryForExport(entry) {
            const opts = convertOptions();
            const cacheKey = JSON.stringify(opts);
            let result = entry.cache.get(cacheKey);
            if (!result) {
                const img = entry.img || await ensureImage(entry);
                const workerKey = await loadIntoWorker(entry, `cvt-${entry.id}`, img);
                try {
                    result = await convertImage(img, { ...opts, encoder: createEncoder(img, workerKey) });
                } finally {
                    if (entry.id !== currentId) dropFromWorker(entry);
                }
                if (entry.id === currentId) rememberResult(entry, cacheKey, result);
            }
            entry.resultSize = result.blob.size;
            return { blob: result.blob, name: deriveOutputName(entry.name, state.format, result) };
        }

        function setBusy(on) {
            busy = on;
            [downloadBtn, zipBtn, eachBtn, clearBtn].forEach(btn => { btn.disabled = on; });
            if (!on) downloadBtn.disabled = !currentResult;
            renderList();
            if (!on) scheduleConvert();
        }

        async function exportAll(mode) {
            if (busy || !entries.length) return;
            setBusy(true);
            await runConvert();
            setStatus('');
            const outputs = [];
            const failed = [];
            try {
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    progress.textContent = `正在转换 ${i + 1} / ${entries.length}`;
                    try {
                        const out = await convertEntryForExport(entry);
                        entry.error = '';
                        if (mode === 'each') {
                            ImageUtils.downloadBlob(out.blob, out.name);
                            await new Promise(r => setTimeout(r, 200));
                        } else {
                            outputs.push(out);
                        }
                    } catch (err) {
                        entry.error = '转换失败';
                        failed.push(entry.name);
                    }
                }
                if (mode === 'zip' && outputs.length) {
                    progress.textContent = '正在打包 ZIP…';
                    const zip = await ZipWriter.build(outputs);
                    ImageUtils.downloadBlob(zip, ImageUtils.generateFilename('converted', 'zip'));
                }
                progress.textContent = failed.length
                    ? `完成，${failed.length} 张失败：${failed.join('、')}`
                    : `已完成 ${entries.length} 张`;
            } finally {
                setBusy(false);
            }
        }

        // ---------- Events ----------

        ImageUtils.createDropZone(dropzone, {
            accept: 'image/*,.svg,.ico,.avif',
            multiple: true,
            onFiles: addFiles
        });

        fileList.addEventListener('click', async (e) => {
            const li = e.target.closest('.b64-file');
            if (!li || busy) return;
            const id = Number(li.dataset.id);
            const action = e.target.closest('[data-action]');
            if (action && action.dataset.action === 'remove') { removeEntry(id); return; }
            if (action && action.dataset.action === 'download') {
                const entry = getEntry(id);
                if (!entry) return;
                try {
                    const out = await convertEntryForExport(entry);
                    ImageUtils.downloadBlob(out.blob, out.name);
                    renderList();
                } catch (err) {
                    setStatus(`转换失败：${err.message || err}`);
                }
                return;
            }
            if (id !== currentId) selectEntry(id);
        });

        fileList.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const li = e.target.closest('.b64-file');
            if (!li || e.target !== li) return;
            e.preventDefault();
            selectEntry(Number(li.dataset.id));
        });

        clearBtn.addEventListener('click', clearAll);

        downloadBtn.addEventListener('click', () => {
            const entry = getEntry(currentId);
            if (!entry || !currentResult) return;
            ImageUtils.downloadBlob(currentResult.blob, deriveOutputName(entry.name, state.format, currentResult));
        });

        zipBtn.addEventListener('click', () => exportAll('zip'));
        eachBtn.addEventListener('click', () => exportAll('each'));

        beforeImg.addEventListener('click', () => {
            const entry = getEntry(currentId);
            if (entry && window.ImageLightbox) ImageLightbox.openImage(entry.thumbUrl, entry.name);
        });

        afterImg.addEventListener('click', () => {
            if (currentResult && window.ImageLightbox) ImageLightbox.openImage(currentResult.url, '转换结果');
        });

        // ---------- Init ----------

        function applySaved(saved) {
            if (CVT_FORMATS[saved.imgConvertFormat]) state.format = saved.imgConvertFormat;
            const q = Number(saved.imgConvertQuality);
            if (q >= 1 && q <= 100) state.quality = q;
            if (/^#[0-9a-f]{6}$/i.test(saved.imgConvertBg || '')) state.background = saved.imgConvertBg;
            const r = saved.imgConvertResize;
            if (r && typeof r === 'object') {
                state.resize = {
                    ...state.resize,
                    ...r,
                    icoSizes: Array.isArray(r.icoSizes) && r.icoSizes.length
                        ? r.icoSizes.filter(s => CVT_ICO_SIZES.includes(s))
                        : state.resize.icoSizes
                };
                if (!state.resize.icoSizes.length) state.resize.icoSizes = [16, 32, 48];
            }
        }

        syncControls();
        const savedPromise = typeof Settings !== 'undefined' ? Settings.load().catch(() => ({})) : Promise.resolve({});
        Promise.all([savedPromise, detectAvifEncoding()]).then(([saved, avif]) => {
            avifSupported = avif;
            applySaved(saved || {});
            formatBtns.forEach(btn => {
                if (btn.dataset.format === 'image/avif') btn.classList.toggle('hidden', !avifSupported);
            });
            if (state.format === 'image/avif' && !avifSupported) state.format = 'image/webp';
            syncControls();
            if (currentId !== null) scheduleConvert();
        });
    }

    DevKit.ImageConvert = { computeTargetSize, icoSizesFor, deriveOutputName, encodeBmp, percentDelta };

    // ==================== Compression ====================

    const CMP_MAX_FILES = 30;
    const CMP_MAX_FILE_BYTES = 30 * 1024 * 1024;
    const CMP_MIN_SIDE = 16;
    const CMP_SHRINK_ROUNDS = 4;
    const CMP_MAXDIM_PRESETS = [0, 3840, 2560, 1920, 1280];

    /** Scale the longer side down to maxDim; never enlarge. 0 = no limit. */
    function limitDimensions(src, maxDim) {
        const w = Math.max(1, src.width || 1);
        const h = Math.max(1, src.height || 1);
        const longest = Math.max(w, h);
        if (!(maxDim > 0) || longest <= maxDim) return { width: w, height: h };
        const scale = maxDim / longest;
        return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
    }

    /** Candidate output formats for a choice: auto | keep | explicit MIME. */
    function resolveCompressFormats(choice, sourceMime, hasAlpha, avifOk) {
        const src = String(sourceMime || '').toLowerCase().replace('image/jpg', 'image/jpeg');
        if (choice === 'auto') {
            const list = ['image/webp'];
            if (avifOk) list.push('image/avif');
            if (!hasAlpha) list.push('image/jpeg');
            return list;
        }
        if (choice === 'keep') {
            if (['image/png', 'image/jpeg', 'image/webp'].includes(src)) return [src];
            if (src === 'image/avif' && avifOk) return [src];
            return ['image/webp'];
        }
        if (choice === 'image/avif' && !avifOk) return ['image/webp'];
        return CVT_FORMATS[choice] ? [choice] : ['image/webp'];
    }

    /**
     * Binary-search the highest quality whose output fits targetBytes.
     * encodeAt(q) -> Promise<Blob>, q in min..max. Returns { blob, quality, reached, steps }.
     */
    async function searchQuality(encodeAt, targetBytes, options = {}) {
        const min = options.min ?? 5;
        const max = options.max ?? 95;
        const maxSteps = options.steps ?? 7;
        let lo = min;
        let hi = max;
        let best = null;
        let smallest = null;
        let steps = 0;
        const tried = new Set();
        while (lo <= hi && steps < maxSteps) {
            const q = Math.round((lo + hi) / 2);
            const blob = await encodeAt(q);
            steps++;
            tried.add(q);
            if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality: q };
            if (blob.size <= targetBytes) {
                best = { blob, quality: q };
                lo = q + 1;
            } else {
                hi = q - 1;
            }
        }
        if (best) return { ...best, reached: true, steps };
        if (!tried.has(min)) {
            const blob = await encodeAt(min);
            steps++;
            if (blob.size <= targetBytes) return { blob, quality: min, reached: true, steps };
            if (blob.size < smallest.blob.size) smallest = { blob, quality: min };
        }
        return { ...smallest, reached: false, steps };
    }

    function summarizeSavings(entries) {
        let count = 0;
        let before = 0;
        let after = 0;
        (entries || []).forEach(e => {
            if (!(e.resultSize > 0)) return;
            count++;
            before += e.size;
            after += e.resultSize;
        });
        const percent = before > 0 ? Math.round((1 - after / before) * 100) : 0;
        return { count, before, after, percent };
    }

    /** quality is 1..100; for PNG, 100 means lossless and lower values quantize the palette. */
    async function encodeAs(encoder, format, size, background, quality) {
        const q = format === 'image/png'
            ? (quality >= 100 ? undefined : quality / 100)
            : quality / 100;
        const blob = await encoder.encode(format, size.width, size.height, background, q);
        if (format !== 'image/png' && blob.type !== format) {
            throw new Error(`当前浏览器不支持编码为 ${CVT_FORMATS[format].label}`);
        }
        return blob;
    }

    function abortError() {
        const err = new Error('aborted');
        err.name = 'AbortError';
        return err;
    }

    const isAbortError = (err) => !!err && err.name === 'AbortError';

    /** Yield to the event loop, then bail out if a newer run has superseded this one. */
    async function checkpoint(isStale) {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (isStale && isStale()) throw abortError();
    }

    function releaseCanvas(canvas) {
        if (!canvas) return;
        canvas.width = 0;
        canvas.height = 0;
    }

    const workerAvailable = () => typeof ImageEncodeClient !== 'undefined' && ImageEncodeClient.supported();

    /**
     * Encoder for one image. Prefers the encode worker (pixels already loaded
     * under `workerKey`); otherwise renders on a main-thread canvas.
     * encode(format, width, height, background|null, quality 0..1|undefined) -> Blob.
     */
    function createEncoder(img, workerKey) {
        let useWorker = !!workerKey && workerAvailable();
        let canvas = null;
        let canvasKey = '';
        return {
            async encode(format, width, height, background, quality) {
                if (useWorker) {
                    try {
                        return await ImageEncodeClient.encode(workerKey, { format, width, height, background: background || null, quality });
                    } catch (err) {
                        if (workerAvailable()) throw err;
                        useWorker = false;
                    }
                }
                const key = `${width}x${height}|${background || ''}`;
                if (key !== canvasKey) {
                    releaseCanvas(canvas);
                    canvas = renderToCanvas(img, width, height, background || null);
                    canvasKey = key;
                }
                return ImageUtils.encodeCanvas(canvas, format, quality);
            },
            dispose() {
                releaseCanvas(canvas);
                canvas = null;
                canvasKey = '';
            }
        };
    }

    /** Loads the entry's pixels into the worker once; returns the key, or null to use the main thread. */
    async function loadIntoWorker(entry, key, img) {
        if (!workerAvailable()) return null;
        if (entry.workerKey === key) return key;
        try {
            await ImageEncodeClient.load(key, entry.file, img);
            entry.workerKey = key;
            return key;
        } catch (_) {
            return null;
        }
    }

    function dropFromWorker(entry) {
        if (!entry || !entry.workerKey) return;
        ImageEncodeClient.drop(entry.workerKey);
        entry.workerKey = null;
    }

    const RESULT_CACHE_LIMIT = 8;

    function rememberResult(entry, key, result) {
        entry.cache.delete(key);
        entry.cache.set(key, result);
        while (entry.cache.size > RESULT_CACHE_LIMIT) entry.cache.delete(entry.cache.keys().next().value);
    }

    /** Free everything held for an entry that is no longer selected. */
    function retireEntry(entry) {
        if (!entry) return;
        entry.img = null;
        entry.cache.clear();
        dropFromWorker(entry);
    }

    /**
     * Runs `task(isStale)` one at a time. A newer call makes older ones stale:
     * queued ones are skipped, and the running one stops at its next checkpoint.
     */
    function createLatestRunner(task) {
        let generation = 0;
        let chain = Promise.resolve();
        return function run() {
            const mine = ++generation;
            const isStale = () => mine !== generation;
            chain = chain
                .then(() => (isStale() ? undefined : task(isStale)))
                .catch(err => { if (!isAbortError(err)) console.error(err); });
            return chain;
        };
    }

    /**
     * opts: { formats, mode: quality|target, quality, targetBytes, allowShrink, maxDim, guard, background, isStale }.
     * Returns { blob, format, quality, width, height, resized, reached, kept }.
     */
    async function compressImage(img, file, opts) {
        const src = { width: img.naturalWidth, height: img.naturalHeight };
        const isStale = opts.isStale;
        const encoder = opts.encoder || createEncoder(img, null);
        let size = limitDimensions(src, opts.maxDim);
        const backgroundFor = (format) => (CVT_FORMATS[format].alpha ? null : (opts.background || '#ffffff'));

        let best = null;
        try {
            if (opts.mode === 'target') {
                const target = Math.max(1, opts.targetBytes || 1);
                for (let round = 0; ; round++) {
                    let reached = null;
                    let smallest = null;
                    for (const format of opts.formats) {
                        await checkpoint(isStale);
                        const runSize = size;
                        // UPNG quantization is slow on big images; search it more coarsely.
                        const steps = format === 'image/png' ? 5 : 7;
                        const r = await searchQuality(async (q) => {
                            await checkpoint(isStale);
                            return encodeAs(encoder, format, runSize, backgroundFor(format), q);
                        }, target, { steps });
                        const candidate = { blob: r.blob, format, quality: r.quality, width: size.width, height: size.height, reached: r.reached };
                        if (r.reached && (!reached || r.blob.size < reached.blob.size)) reached = candidate;
                        if (!smallest || r.blob.size < smallest.blob.size) smallest = candidate;
                    }
                    best = reached || smallest;
                    if (reached || !opts.allowShrink || round >= CMP_SHRINK_ROUNDS - 1) break;
                    const factor = Math.sqrt(target / smallest.blob.size) * 0.95;
                    const next = { width: Math.round(size.width * factor), height: Math.round(size.height * factor) };
                    if (Math.min(next.width, next.height) < CMP_MIN_SIDE) break;
                    size = next;
                }
            } else {
                for (const format of opts.formats) {
                    await checkpoint(isStale);
                    const blob = await encodeAs(encoder, format, size, backgroundFor(format), opts.quality);
                    if (!best || blob.size < best.blob.size) {
                        best = { blob, format, quality: opts.quality, width: size.width, height: size.height, reached: true };
                    }
                }
            }
        } finally {
            encoder.dispose();
        }
        await checkpoint(isStale);

        const resized = best.width !== src.width || best.height !== src.height;
        if (opts.guard && !resized && best.blob.size >= file.size) {
            return { ...best, blob: file, format: (file.type || '').toLowerCase(), resized: false, kept: true };
        }
        return { ...best, resized, kept: false };
    }

    function initCompress() {
        const panel = document.getElementById('imgPanelCompress');
        const dropzone = document.getElementById('imgCompressDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const hint = $('imgCmpHint');
        const clearBtn = $('imgCmpClearBtn');
        const notice = $('imgCmpNotice');
        const fileList = $('imgCmpFileList');
        const formatBtns = Array.from(panel.querySelectorAll('[data-cfmt]'));
        const modeBtns = Array.from(panel.querySelectorAll('[data-cmode]'));
        const qualityField = $('imgCmpQualityField');
        const qualityInput = $('imgCompressQuality');
        const qualityValue = $('imgCompressQualityValue');
        const qualityNote = $('imgCmpQualityNote');
        const targetField = $('imgCmpTargetField');
        const targetInput = $('imgCmpTargetValue');
        const unitBtns = Array.from(panel.querySelectorAll('[data-unit]'));
        const shrinkInput = $('imgCmpAllowShrink');
        const maxDimBtns = Array.from(panel.querySelectorAll('[data-maxdim]'));
        const maxDimCustomWrap = $('imgCmpMaxDimCustomWrap');
        const maxDimCustom = $('imgCmpMaxDimCustom');
        const guardInput = $('imgCmpGuard');
        const bgField = $('imgCmpBgField');
        const bgBtns = Array.from(panel.querySelectorAll('[data-cbg]'));
        const bgColor = $('imgCmpBgColor');
        const status = $('imgCmpStatus');
        const zoomBtns = Array.from(panel.querySelectorAll('[data-zoom]'));
        const lightboxBtn = $('imgCmpLightboxBtn');
        const stage = $('imgCmpStage');
        const stageInner = $('imgCmpStageInner');
        const splitRange = $('imgCmpSplit');
        const beforeImg = $('imgCompressBeforeImg');
        const afterImg = $('imgCompressAfterImg');
        const divider = stageInner.querySelector('.cmp-divider');
        const afterTag = stageInner.querySelector('.cmp-tag-after');
        const emptyText = $('imgCmpEmpty');
        const chips = $('imgCmpChips');
        const summary = $('imgCmpSummary');
        const progress = $('imgCmpProgress');
        const downloadBtn = $('imgCompressDownloadBtn');
        const zipBtn = $('imgCmpZipBtn');
        const eachBtn = $('imgCmpDownloadEachBtn');

        const state = {
            format: 'auto',
            mode: 'quality',
            quality: 75,
            target: { value: 200, unit: 'KB', allowShrink: true },
            maxDim: 0,
            customMaxDim: false,
            guard: true,
            background: '#ffffff'
        };
        let avifSupported = false;
        let entries = [];
        let currentId = null;
        let nextId = 1;
        let busy = false;
        let currentResult = null; // compressImage result + { url, entryId }

        const getEntry = (id) => entries.find(e => e.id === id) || null;
        const persist = (key, value) => { if (typeof Settings !== 'undefined') Settings.set(key, value); };

        function showNotice(text) {
            notice.textContent = text || '';
            notice.classList.toggle('hidden', !text);
        }

        function chip(text, cls = '') {
            const el = document.createElement('span');
            el.className = `b64-chip${cls ? ' ' + cls : ''}`;
            el.textContent = text;
            return el;
        }

        function formatLabel(mime) {
            const m = String(mime || '').toLowerCase();
            return CVT_FORMATS[m] ? CVT_FORMATS[m].label : (m.replace('image/', '').toUpperCase() || '未知');
        }

        function targetBytes() {
            const v = Number(state.target.value) || 0;
            return Math.round(v * (state.target.unit === 'MB' ? 1024 * 1024 : 1024));
        }

        function outputName(entry, result) {
            if (result.kept) return entry.name;
            return deriveOutputName(entry.name, result.format, result);
        }

        // ---------- Controls ----------

        function setSeg(btns, attr, value) {
            btns.forEach(btn => {
                const on = btn.dataset[attr] === value;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', String(on));
            });
        }

        function candidateFormats(entry) {
            return resolveCompressFormats(state.format, entry ? entry.mime : '', !!(entry && entry.alpha), avifSupported);
        }

        function syncControls() {
            const current = getEntry(currentId);
            setSeg(formatBtns, 'cfmt', state.format);
            setSeg(modeBtns, 'cmode', state.mode);

            qualityField.classList.toggle('hidden', state.mode !== 'quality');
            qualityInput.value = String(state.quality);
            qualityValue.textContent = `${state.quality}%`;
            const formats = candidateFormats(current);
            qualityNote.classList.toggle('hidden', !formats.includes('image/png'));

            targetField.classList.toggle('hidden', state.mode !== 'target');
            if (document.activeElement !== targetInput) targetInput.value = String(state.target.value || '');
            setSeg(unitBtns, 'unit', state.target.unit);
            shrinkInput.checked = !!state.target.allowShrink;

            const preset = !state.customMaxDim && CMP_MAXDIM_PRESETS.includes(state.maxDim) ? String(state.maxDim) : 'custom';
            setSeg(maxDimBtns, 'maxdim', preset);
            maxDimBtns.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.maxdim === preset)));
            maxDimCustomWrap.classList.toggle('hidden', preset !== 'custom');
            if (document.activeElement !== maxDimCustom) maxDimCustom.value = state.maxDim > 0 ? String(state.maxDim) : '';

            guardInput.checked = state.guard;

            const needsBg = !!(current && current.alpha) && formats.some(f => !CVT_FORMATS[f].alpha);
            bgField.classList.toggle('hidden', !needsBg);
            const bgPreset = bgBtns.some(b => b.dataset.cbg === state.background) ? state.background : 'custom';
            setSeg(bgBtns, 'cbg', bgPreset);
            bgColor.classList.toggle('hidden', bgPreset !== 'custom');
            if (bgPreset === 'custom') bgColor.value = state.background;
        }

        function changed() {
            syncControls();
            schedule();
        }

        formatBtns.forEach(btn => btn.addEventListener('click', () => {
            state.format = btn.dataset.cfmt;
            persist('imgCompressFormat', state.format);
            changed();
        }));

        modeBtns.forEach(btn => btn.addEventListener('click', () => {
            state.mode = btn.dataset.cmode;
            persist('imgCompressMode', state.mode);
            changed();
        }));

        qualityInput.addEventListener('input', () => {
            state.quality = Math.min(100, Math.max(1, Number(qualityInput.value) || 75));
            qualityValue.textContent = `${state.quality}%`;
            persist('imgCompressQuality', state.quality);
            schedule();
        });

        const persistTarget = () => persist('imgCompressTarget', { ...state.target });

        targetInput.addEventListener('input', () => {
            const v = Number(targetInput.value);
            state.target.value = Number.isFinite(v) && v > 0 ? v : 0;
            persistTarget();
            if (state.target.value > 0) schedule();
        });

        unitBtns.forEach(btn => btn.addEventListener('click', () => {
            state.target.unit = btn.dataset.unit;
            persistTarget();
            changed();
        }));

        shrinkInput.addEventListener('change', () => {
            state.target.allowShrink = shrinkInput.checked;
            persistTarget();
            schedule();
        });

        maxDimBtns.forEach(btn => btn.addEventListener('click', () => {
            if (btn.dataset.maxdim === 'custom') {
                state.customMaxDim = true;
                if (!(state.maxDim > 0)) state.maxDim = 1600;
            } else {
                state.customMaxDim = false;
                state.maxDim = Number(btn.dataset.maxdim);
            }
            persist('imgCompressMaxDim', state.maxDim);
            changed();
            if (state.customMaxDim) maxDimCustom.focus();
        }));

        maxDimCustom.addEventListener('input', () => {
            const v = Math.round(Number(maxDimCustom.value));
            if (!Number.isFinite(v) || v < CMP_MIN_SIDE) return;
            state.maxDim = Math.min(CVT_MAX_DIM, v);
            persist('imgCompressMaxDim', state.maxDim);
            schedule();
        });

        guardInput.addEventListener('change', () => {
            state.guard = guardInput.checked;
            persist('imgCompressGuard', state.guard);
            schedule();
        });

        bgBtns.forEach(btn => btn.addEventListener('click', () => {
            state.background = btn.dataset.cbg === 'custom' ? bgColor.value : btn.dataset.cbg;
            persist('imgCompressBg', state.background);
            changed();
        }));

        bgColor.addEventListener('input', () => {
            state.background = bgColor.value;
            persist('imgCompressBg', state.background);
            schedule();
        });

        // ---------- Slider compare ----------

        let zoom = 'fit';

        function setSplit(percent) {
            const p = Math.min(100, Math.max(0, percent));
            stage.style.setProperty('--split', `${p}%`);
            splitRange.value = String(Math.round(p));
        }

        function splitFromPointer(e) {
            const rect = stageInner.getBoundingClientRect();
            if (!rect.width) return;
            setSplit(((e.clientX - rect.left) / rect.width) * 100);
        }

        stageInner.addEventListener('pointerdown', (e) => {
            if (!currentResult || e.button !== 0) return;
            if (zoom === 'actual' && !e.target.closest('.cmp-divider')) return;
            e.preventDefault();
            stageInner.setPointerCapture(e.pointerId);
            stage.classList.add('is-dragging');
            splitFromPointer(e);
        });
        stageInner.addEventListener('pointermove', (e) => {
            if (stageInner.hasPointerCapture(e.pointerId)) splitFromPointer(e);
        });
        const endDrag = (e) => {
            if (stageInner.hasPointerCapture(e.pointerId)) stageInner.releasePointerCapture(e.pointerId);
            stage.classList.remove('is-dragging');
        };
        stageInner.addEventListener('pointerup', endDrag);
        stageInner.addEventListener('pointercancel', endDrag);
        splitRange.addEventListener('input', () => setSplit(Number(splitRange.value)));

        zoomBtns.forEach(btn => btn.addEventListener('click', () => {
            zoom = btn.dataset.zoom;
            setSeg(zoomBtns, 'zoom', zoom);
            stage.classList.toggle('is-actual', zoom === 'actual');
        }));

        lightboxBtn.addEventListener('click', () => {
            if (!window.ImageLightbox) return;
            const entry = getEntry(currentId);
            if (currentResult) ImageLightbox.openImage(currentResult.url, '压缩结果');
            else if (entry) ImageLightbox.openImage(entry.thumbUrl, entry.name);
        });

        function showStage(entry) {
            const has = !!entry;
            stageInner.classList.toggle('hidden', !has);
            emptyText.classList.toggle('hidden', has);
            stage.classList.toggle('has-image', has);
            lightboxBtn.disabled = !has;
            if (has) {
                beforeImg.src = entry.thumbUrl;
            } else {
                beforeImg.removeAttribute('src');
            }
        }

        function showResultLayer(on) {
            afterImg.classList.toggle('hidden', !on);
            divider.classList.toggle('hidden', !on);
            afterTag.classList.toggle('hidden', !on);
            stage.classList.toggle('has-result', on);
        }

        // ---------- Files ----------

        function renderSummary() {
            const s = summarizeSavings(entries);
            const show = entries.length > 1 && s.count > 0;
            summary.classList.toggle('hidden', !show);
            if (!show) return;
            summary.replaceChildren();
            const strong = document.createElement('strong');
            strong.textContent = s.percent >= 0 ? `节省 ${s.percent}%` : `增加 ${-s.percent}%`;
            strong.className = s.percent >= 0 ? 'is-down' : 'is-up';
            const pending = entries.length - s.count;
            summary.append(
                `共 ${entries.length} 张 · 已处理 ${s.count} 张 · ${ImageUtils.formatFileSize(s.before)} → ${ImageUtils.formatFileSize(s.after)} · `,
                strong
            );
            if (pending > 0) summary.append(` · ${pending} 张待处理`);
        }

        function renderList() {
            fileList.replaceChildren();
            const multi = entries.length > 1;
            fileList.classList.toggle('hidden', !multi);
            panel.classList.toggle('has-files', entries.length > 0);
            hint.classList.toggle('hidden', entries.length > 0);
            clearBtn.classList.toggle('hidden', entries.length === 0);
            zipBtn.classList.toggle('hidden', !multi);
            eachBtn.classList.toggle('hidden', !multi);
            renderSummary();
            if (!multi) return;

            entries.forEach(entry => {
                const li = document.createElement('li');
                li.className = `b64-file${entry.id === currentId ? ' active' : ''}`;
                li.dataset.id = String(entry.id);
                li.tabIndex = 0;
                li.setAttribute('aria-current', entry.id === currentId ? 'true' : 'false');

                const thumb = document.createElement('img');
                thumb.className = 'b64-file-thumb';
                thumb.src = entry.thumbUrl;
                thumb.alt = '';

                const info = document.createElement('div');
                info.className = 'b64-file-info';
                const name = document.createElement('span');
                name.className = 'b64-file-name';
                name.textContent = entry.name;
                name.title = entry.name;
                const sub = document.createElement('span');
                sub.className = 'b64-file-sub';
                sub.textContent = ImageUtils.formatFileSize(entry.size);
                if (entry.error) {
                    sub.append(' · ', Object.assign(document.createElement('span'), { className: 'cvt-file-error', textContent: entry.error }));
                } else if (entry.kept) {
                    sub.append(' · ', Object.assign(document.createElement('span'), { className: 'cmp-kept', textContent: '已保留原图' }));
                } else if (entry.resultSize) {
                    const delta = percentDelta(entry.size, entry.resultSize);
                    const tag = document.createElement('span');
                    tag.className = `cvt-file-delta ${delta <= 0 ? 'is-down' : 'is-up'}`;
                    tag.textContent = `→ ${ImageUtils.formatFileSize(entry.resultSize)} (${delta > 0 ? '+' : ''}${delta}%)`;
                    sub.append(' ', tag);
                }
                info.append(name, sub);

                const dl = document.createElement('button');
                dl.type = 'button';
                dl.className = 'b64-mini-btn';
                dl.dataset.action = 'download';
                dl.textContent = '下载';
                dl.disabled = busy;

                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'b64-file-remove';
                remove.dataset.action = 'remove';
                remove.setAttribute('aria-label', `移除 ${entry.name}`);
                remove.textContent = '×';
                remove.disabled = busy;

                li.append(thumb, info, dl, remove);
                fileList.append(li);
            });
        }

        function isAcceptedFile(file) {
            return (file.type && file.type.startsWith('image/')) || CVT_IMAGE_EXT_RE.test(file.name || '');
        }

        async function ensureImage(entry) {
            if (entry.img) return entry.img;
            const img = await loadImageFromUrl(entry.thumbUrl);
            entry.width = img.naturalWidth;
            entry.height = img.naturalHeight;
            if (entry.alpha === null) {
                try { entry.alpha = imageHasAlpha(img); } catch (_) { entry.alpha = true; }
            }
            return img;
        }

        function addFiles(files) {
            if (busy) return;
            const skipped = [];
            const added = [];
            for (const file of files) {
                if (!isAcceptedFile(file)) { skipped.push(`${file.name}（不是图片）`); continue; }
                if (file.size > CMP_MAX_FILE_BYTES) { skipped.push(`${file.name}（超过 30MB）`); continue; }
                if (entries.length >= CMP_MAX_FILES) { skipped.push(`${file.name}（超过 ${CMP_MAX_FILES} 张上限）`); continue; }
                const entry = {
                    id: nextId++,
                    file,
                    name: file.name || 'image',
                    size: file.size,
                    mime: (file.type || '').toLowerCase(),
                    thumbUrl: URL.createObjectURL(file),
                    width: 0,
                    height: 0,
                    alpha: null,
                    img: null,
                    resultSize: 0,
                    kept: false,
                    error: '',
                    cache: new Map(),
                    workerKey: null
                };
                entries.push(entry);
                added.push(entry);
            }
            showNotice(skipped.length ? `已跳过：${skipped.join('、')}` : '');
            if (added.length) select(added[0].id);
            else renderList();
        }

        function releaseResult() {
            if (currentResult && !currentResult.kept) URL.revokeObjectURL(currentResult.url);
            currentResult = null;
        }

        function resetResult() {
            releaseResult();
            showResultLayer(false);
            afterImg.removeAttribute('src');
            chips.replaceChildren();
            downloadBtn.disabled = true;
        }

        function select(id) {
            const entry = getEntry(id);
            if (!entry) return;
            const previous = getEntry(currentId);
            if (previous && previous !== entry) retireEntry(previous);
            currentId = id;
            renderList();
            resetResult();
            showStage(entry);
            setSplit(50);
            runLive();
        }

        function removeEntry(id) {
            const idx = entries.findIndex(e => e.id === id);
            if (idx < 0) return;
            URL.revokeObjectURL(entries[idx].thumbUrl);
            retireEntry(entries[idx]);
            entries.splice(idx, 1);
            if (!entries.length) { clearAll(); return; }
            if (currentId === id) select(entries[Math.min(idx, entries.length - 1)].id);
            else renderList();
        }

        function clearAll() {
            if (busy) return;
            runLive();
            entries.forEach(e => { URL.revokeObjectURL(e.thumbUrl); retireEntry(e); });
            entries = [];
            currentId = null;
            resetResult();
            showStage(null);
            showNotice('');
            status.textContent = '';
            progress.textContent = '';
            renderList();
            syncControls();
        }

        // ---------- Compression ----------

        function options(entry) {
            return {
                formats: candidateFormats(entry),
                mode: state.mode,
                quality: state.quality,
                targetBytes: targetBytes(),
                allowShrink: !!state.target.allowShrink,
                maxDim: state.maxDim,
                guard: state.guard,
                background: state.background
            };
        }

        function renderChips(entry, result) {
            chips.replaceChildren();
            if (result.kept) {
                const kept = chip('已保留原图', 'is-warn');
                kept.title = '压缩后反而更大，已保留原文件（可关闭「不变大保护」查看压缩结果）';
                chips.append(kept, chip(`${formatLabel(entry.mime)} · ${ImageUtils.formatFileSize(entry.size)}`));
                return;
            }
            chips.append(chip(`${formatLabel(entry.mime)} → ${formatLabel(result.format)}`, 'is-accent'));
            chips.append(chip(result.resized
                ? `${entry.width} × ${entry.height} → ${result.width} × ${result.height}`
                : `${result.width} × ${result.height}`));
            chips.append(chip(`${ImageUtils.formatFileSize(entry.size)} → ${ImageUtils.formatFileSize(result.blob.size)}`));
            const delta = percentDelta(entry.size, result.blob.size);
            chips.append(chip(`${delta > 0 ? '+' : ''}${delta}%`, delta <= 0 ? 'is-success' : 'is-warn'));
            if (state.mode === 'target') {
                chips.append(chip(`实际质量 ${result.quality}%`));
                if (!result.reached) {
                    const warn = chip(`未达目标：最小 ${ImageUtils.formatFileSize(result.blob.size)}`, 'is-warn');
                    warn.title = state.target.allowShrink ? '已尝试缩小尺寸仍无法达到目标' : '可勾选「不够时自动缩小尺寸」';
                    chips.append(warn);
                }
            }
            if (entry.mime === 'image/gif') chips.append(chip('GIF 动图仅压缩首帧', 'is-warn'));
        }

        async function compressCurrent(isStale) {
            const entry = getEntry(currentId);
            if (!entry || busy) return;
            if (state.mode === 'target' && !(targetBytes() > 0)) return;
            status.textContent = '压缩中…';
            try {
                const img = await ensureImage(entry);
                if (isStale()) return;
                entry.img = img;
                syncControls();
                const opts = options(entry);
                const cacheKey = JSON.stringify(opts);
                let result = entry.cache.get(cacheKey);
                if (!result) {
                    const workerKey = await loadIntoWorker(entry, `cmp-${entry.id}`, img);
                    if (isStale()) return;
                    result = await compressImage(img, entry.file, { ...opts, isStale, encoder: createEncoder(img, workerKey) });
                    if (isStale()) return;
                    rememberResult(entry, cacheKey, result);
                }
                releaseResult();
                currentResult = {
                    ...result,
                    url: result.kept ? entry.thumbUrl : URL.createObjectURL(result.blob),
                    entryId: entry.id
                };
                afterImg.src = currentResult.url;
                showResultLayer(true);
                downloadBtn.disabled = busy;
                entry.resultSize = result.blob.size;
                entry.kept = result.kept;
                entry.error = '';
                renderChips(entry, result);
                renderList();
                status.textContent = '';
            } catch (err) {
                if (isStale() || isAbortError(err)) return;
                resetResult();
                entry.error = '压缩失败';
                status.textContent = `压缩失败：${err.message || err}`;
                renderList();
            }
        }

        const runLive = createLatestRunner(compressCurrent);
        const schedule = debounce(runLive, 250);

        async function compressForExport(entry) {
            const opts = options(entry);
            const cacheKey = JSON.stringify(opts);
            let result = entry.cache.get(cacheKey);
            if (!result) {
                const img = entry.img || await ensureImage(entry);
                const workerKey = await loadIntoWorker(entry, `cmp-${entry.id}`, img);
                try {
                    result = await compressImage(img, entry.file, { ...opts, encoder: createEncoder(img, workerKey) });
                } finally {
                    if (entry.id !== currentId) dropFromWorker(entry);
                }
                if (entry.id === currentId) rememberResult(entry, cacheKey, result);
            }
            entry.resultSize = result.blob.size;
            entry.kept = result.kept;
            entry.error = '';
            return { blob: result.blob, name: outputName(entry, result) };
        }

        function setBusy(on) {
            busy = on;
            [downloadBtn, zipBtn, eachBtn, clearBtn].forEach(btn => { btn.disabled = on; });
            if (!on) downloadBtn.disabled = !currentResult;
            renderList();
            if (!on) schedule();
        }

        async function exportAll(mode) {
            if (busy || !entries.length) return;
            setBusy(true);
            await runLive();
            status.textContent = '';
            const outputs = [];
            const failed = [];
            try {
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    progress.textContent = `正在压缩 ${i + 1} / ${entries.length}`;
                    try {
                        const out = await compressForExport(entry);
                        if (mode === 'each') {
                            ImageUtils.downloadBlob(out.blob, out.name);
                            await new Promise(r => setTimeout(r, 200));
                        } else {
                            outputs.push(out);
                        }
                    } catch (_) {
                        entry.error = '压缩失败';
                        failed.push(entry.name);
                    }
                    renderList();
                }
                if (mode === 'zip' && outputs.length) {
                    progress.textContent = '正在打包 ZIP…';
                    const zip = await ZipWriter.build(outputs);
                    ImageUtils.downloadBlob(zip, ImageUtils.generateFilename('compressed', 'zip'));
                }
                progress.textContent = failed.length
                    ? `完成，${failed.length} 张失败：${failed.join('、')}`
                    : `已完成 ${entries.length} 张`;
            } finally {
                setBusy(false);
            }
        }

        // ---------- Events ----------

        ImageUtils.createDropZone(dropzone, {
            accept: 'image/*,.avif',
            multiple: true,
            onFiles: addFiles
        });

        fileList.addEventListener('click', async (e) => {
            const li = e.target.closest('.b64-file');
            if (!li || busy) return;
            const id = Number(li.dataset.id);
            const action = e.target.closest('[data-action]');
            if (action && action.dataset.action === 'remove') { removeEntry(id); return; }
            if (action && action.dataset.action === 'download') {
                const entry = getEntry(id);
                if (!entry) return;
                try {
                    const out = await compressForExport(entry);
                    ImageUtils.downloadBlob(out.blob, out.name);
                    renderList();
                } catch (err) {
                    status.textContent = `压缩失败：${err.message || err}`;
                }
                return;
            }
            if (id !== currentId) select(id);
        });

        fileList.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const li = e.target.closest('.b64-file');
            if (!li || e.target !== li) return;
            e.preventDefault();
            select(Number(li.dataset.id));
        });

        clearBtn.addEventListener('click', clearAll);

        downloadBtn.addEventListener('click', () => {
            const entry = getEntry(currentId);
            if (!entry || !currentResult) return;
            ImageUtils.downloadBlob(currentResult.blob, outputName(entry, currentResult));
        });

        zipBtn.addEventListener('click', () => exportAll('zip'));
        eachBtn.addEventListener('click', () => exportAll('each'));

        // ---------- Init ----------

        function applySaved(saved) {
            const fmt = saved.imgCompressFormat;
            if (fmt === 'auto' || fmt === 'keep' || CVT_FORMATS[fmt]) state.format = fmt;
            if (saved.imgCompressMode === 'quality' || saved.imgCompressMode === 'target') state.mode = saved.imgCompressMode;
            const q = Number(saved.imgCompressQuality);
            if (q >= 1 && q <= 100) state.quality = q;
            const t = saved.imgCompressTarget;
            if (t && typeof t === 'object') {
                state.target = {
                    value: Number(t.value) > 0 ? Number(t.value) : state.target.value,
                    unit: t.unit === 'MB' ? 'MB' : 'KB',
                    allowShrink: t.allowShrink !== false
                };
            }
            const md = Number(saved.imgCompressMaxDim);
            if (md >= 0) {
                state.maxDim = Math.min(CVT_MAX_DIM, Math.round(md));
                state.customMaxDim = !CMP_MAXDIM_PRESETS.includes(state.maxDim);
            }
            if (typeof saved.imgCompressGuard === 'boolean') state.guard = saved.imgCompressGuard;
            if (/^#[0-9a-f]{6}$/i.test(saved.imgCompressBg || '')) state.background = saved.imgCompressBg;
        }

        setSplit(50);
        showStage(null);
        syncControls();
        const savedPromise = typeof Settings !== 'undefined' ? Settings.load().catch(() => ({})) : Promise.resolve({});
        Promise.all([savedPromise, detectAvifEncoding()]).then(([saved, avif]) => {
            avifSupported = avif;
            applySaved(saved || {});
            formatBtns.forEach(btn => {
                if (btn.dataset.cfmt === 'image/avif') btn.classList.toggle('hidden', !avifSupported);
            });
            if (state.format === 'image/avif' && !avifSupported) state.format = 'auto';
            syncControls();
            if (currentId !== null) schedule();
        });
    }

    DevKit.ImageCompress = { limitDimensions, resolveCompressFormats, searchQuality, summarizeSavings, createLatestRunner, checkpoint };

    DevKit.ImageTools.base64 = { init: initBase64 };
    DevKit.ImageTools.convert = { init: initConvert };
    DevKit.ImageTools.compress = { init: initCompress };
})();
