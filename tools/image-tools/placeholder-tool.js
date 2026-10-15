// Image Tools - Placeholder Generator
// Layout A: size/style settings | preview + export/snippets.
// Presets, lock aspect, patterns, multi-format export, batch ZIP, Settings.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const MAX_SIDE = 4096;
    const PRESETS = {
        '16:9': { w: 1280, h: 720 },
        '4:3': { w: 1024, h: 768 },
        '1:1': { w: 512, h: 512 },
        social: { w: 1200, h: 630 },
        banner: { w: 728, h: 90 },
        custom: null
    };
    const EXT_FOR = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp'
    };

    function clampSize(value) {
        const n = Math.round(Number(value));
        if (!Number.isFinite(n) || n <= 0) return 1;
        return Math.min(n, MAX_SIDE);
    }

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function fillPattern(ctx, width, height, opts) {
        const bg = opts.bg || '#D1D5DB';
        const bg2 = opts.bg2 || '#9CA3AF';
        const pattern = opts.pattern || 'solid';

        if (pattern === 'gradient') {
            const g = ctx.createLinearGradient(0, 0, width, height);
            g.addColorStop(0, bg);
            g.addColorStop(1, bg2);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, width, height);
            return;
        }

        if (pattern === 'checker') {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);
            const cell = Math.max(8, Math.round(Math.min(width, height) / 16));
            ctx.fillStyle = bg2;
            for (let y = 0; y < height; y += cell) {
                for (let x = 0; x < width; x += cell) {
                    if (((x / cell) + (y / cell)) % 2 === 0) {
                        ctx.fillRect(x, y, cell, cell);
                    }
                }
            }
            return;
        }

        if (pattern === 'stripe') {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);
            const step = Math.max(10, Math.round(Math.min(width, height) / 12));
            ctx.strokeStyle = bg2;
            ctx.lineWidth = Math.max(2, Math.round(step / 3));
            ctx.beginPath();
            const diag = width + height;
            for (let i = -height; i < diag; i += step) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i + height, height);
            }
            ctx.stroke();
            return;
        }

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} opts
     */
    function drawPlaceholder(canvas, opts) {
        const width = clampSize(opts.width);
        const height = clampSize(opts.height);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        fillPattern(ctx, width, height, opts);

        if (opts.diagonal) {
            const mark = `${width} × ${height}`;
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate(-Math.PI / 6);
            ctx.fillStyle = opts.fg || '#4B5563';
            ctx.globalAlpha = 0.18;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const dSize = Math.max(14, Math.min(width, height) / 5);
            ctx.font = `600 ${dSize}px ${opts.fontFamily || 'sans-serif'}`;
            ctx.fillText(mark, 0, 0);
            ctx.restore();
        }

        const label = (opts.text && String(opts.text).trim()) || `${width} × ${height}`;
        const scale = clamp(Number(opts.fontScale) || 100, 50, 200) / 100;
        const base = Math.max(12, Math.min(width, height) / 8);
        const fontSize = Math.round(base * scale);
        const weight = opts.bold ? '700' : '600';
        ctx.fillStyle = opts.fg || '#4B5563';
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${weight} ${fontSize}px ${opts.fontFamily || 'sans-serif'}`;
        ctx.fillText(label, width / 2, height / 2, width * 0.9);
        return canvas;
    }

    function initPlaceholder() {
        const canvas = document.getElementById('imgPlaceholderCanvas');
        if (!canvas) return;

        const $ = (id) => document.getElementById(id);
        const widthInput = $('imgPlaceholderWidth');
        const heightInput = $('imgPlaceholderHeight');
        const lockInput = $('imgPhLock');
        const bgInput = $('imgPlaceholderBg');
        const bg2Input = $('imgPhBg2');
        const fgInput = $('imgPlaceholderFg');
        const textInput = $('imgPlaceholderText');
        const fontScaleInput = $('imgPhFontScale');
        const fontScaleValue = $('imgPhFontScaleValue');
        const boldInput = $('imgPhBold');
        const diagonalInput = $('imgPhDiagonal');
        const metaEl = $('imgPhMeta');
        const qualityField = $('imgPhQualityField');
        const qualityInput = $('imgPhQuality');
        const qualityValue = $('imgPhQualityValue');
        const filenameInput = $('imgPhFilename');
        const fileExt = $('imgPhFileExt');
        const downloadBtn = $('imgPlaceholderDownloadBtn');
        const copyImgBtn = $('imgPhCopyImgBtn');
        const zipBtn = $('imgPhZipBtn');
        const snippetEl = $('imgPhSnippet');
        const copySnippetBtn = $('imgPhCopySnippetBtn');
        const presetRoot = $('imgPhPresets');
        const batchRoot = $('imgPhBatch');
        const snippetSeg = $('imgPhSnippetSeg');
        const settingsCard = document.querySelector('#imgPanelPlaceholder .ph-settings-card');
        const resultCard = document.querySelector('#imgPanelPlaceholder .ph-result-card');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            width: defaults.imgPhWidth || 640,
            height: defaults.imgPhHeight || 360,
            lock: defaults.imgPhLock !== false,
            preset: defaults.imgPhPreset || 'custom',
            pattern: defaults.imgPhPattern || 'solid',
            bg: defaults.imgPhBg || '#D1D5DB',
            bg2: defaults.imgPhBg2 || '#9CA3AF',
            fg: defaults.imgPhFg || '#4B5563',
            text: defaults.imgPhText || '',
            fontScale: defaults.imgPhFontScale || 100,
            bold: !!defaults.imgPhBold,
            diagonal: !!defaults.imgPhDiagonal,
            format: defaults.imgPhFormat || 'image/png',
            quality: defaults.imgPhQuality || 92,
            filename: defaults.imgPhFilename || '',
            snippet: defaults.imgPhSnippet || 'dataUri',
            batch: Array.isArray(defaults.imgPhBatch) ? [...defaults.imgPhBatch] : [],
            ratio: (defaults.imgPhWidth || 640) / Math.max(1, defaults.imgPhHeight || 360),
            autoFilename: true,
            lastBlob: null,
            lastDataUrl: ''
        };

        let debounceTimer = null;
        let sizeToken = 0;

        function persist(key, value) {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        }

        function fontFamily() {
            return getComputedStyle(document.body).fontFamily || 'sans-serif';
        }

        function defaultFilename(w, h) {
            return `placeholder-${w}x${h}`;
        }

        function syncPresetUi() {
            presetRoot?.querySelectorAll('[data-preset]').forEach((btn) => {
                const on = btn.dataset.preset === state.preset;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }

        function syncPatternUi() {
            settingsCard?.querySelectorAll('[data-pattern]').forEach((btn) => {
                const on = btn.dataset.pattern === state.pattern;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }

        function syncFormatUi() {
            resultCard?.querySelectorAll('[data-phfmt]').forEach((btn) => {
                const on = btn.dataset.phfmt === state.format;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            const needsQ = state.format !== 'image/png';
            qualityField?.classList.toggle('hidden', !needsQ);
            if (fileExt) fileExt.textContent = '.' + (EXT_FOR[state.format] || 'png');
        }

        function syncSnippetUi() {
            snippetSeg?.querySelectorAll('[data-snippet]').forEach((btn) => {
                const on = btn.dataset.snippet === state.snippet;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }

        function syncBatchUi() {
            batchRoot?.querySelectorAll('[data-batch]').forEach((btn) => {
                const n = Number(btn.dataset.batch);
                const on = state.batch.includes(n);
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            if (zipBtn) zipBtn.disabled = state.batch.length === 0;
        }

        function syncFormFromState() {
            if (widthInput) widthInput.value = String(state.width);
            if (heightInput) heightInput.value = String(state.height);
            if (lockInput) {
                lockInput.classList.toggle('active', state.lock);
                lockInput.setAttribute('aria-pressed', state.lock ? 'true' : 'false');
            }
            if (bgInput) bgInput.value = state.bg;
            if (bg2Input) bg2Input.value = state.bg2;
            if (fgInput) fgInput.value = state.fg;
            if (textInput) textInput.value = state.text;
            if (fontScaleInput) fontScaleInput.value = String(state.fontScale);
            if (fontScaleValue) fontScaleValue.textContent = `${state.fontScale}%`;
            if (boldInput) boldInput.checked = state.bold;
            if (diagonalInput) diagonalInput.checked = state.diagonal;
            if (qualityInput) qualityInput.value = String(state.quality);
            if (qualityValue) qualityValue.textContent = `${state.quality}%`;
            if (filenameInput) {
                filenameInput.value = state.filename || defaultFilename(state.width, state.height);
            }
            syncPresetUi();
            syncPatternUi();
            syncFormatUi();
            syncSnippetUi();
            syncBatchUi();
        }

        function optsFor(w, h) {
            return {
                width: w,
                height: h,
                pattern: state.pattern,
                bg: state.bg,
                bg2: state.bg2,
                fg: state.fg,
                text: state.text,
                fontScale: state.fontScale,
                bold: state.bold,
                diagonal: state.diagonal,
                fontFamily: fontFamily()
            };
        }

        function buildSnippet(dataUrl, w, h, name) {
            const alt = `${w}×${h}`;
            switch (state.snippet) {
                case 'html':
                    return `<img src="${dataUrl}" width="${w}" height="${h}" alt="${alt}">`;
                case 'markdown':
                    return `![${alt}](${dataUrl})`;
                case 'css':
                    return `background: url("${dataUrl}") center / cover no-repeat;`;
                case 'dataUri':
                default:
                    return dataUrl;
            }
        }

        async function refreshExportArtifacts() {
            const token = ++sizeToken;
            const q = state.format === 'image/png' ? undefined : state.quality / 100;
            try {
                const blob = await ImageUtils.canvasToBlob(canvas, state.format, q);
                if (token !== sizeToken) return;
                state.lastBlob = blob;
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ''));
                    reader.onerror = () => reject(reader.error || new Error('read failed'));
                    reader.readAsDataURL(blob);
                });
                if (token !== sizeToken) return;
                state.lastDataUrl = dataUrl;
                const sizeText = ImageUtils.formatFileSize(blob.size);
                if (metaEl) metaEl.textContent = `${state.width} × ${state.height} · ${sizeText}`;
                if (snippetEl) snippetEl.value = buildSnippet(dataUrl, state.width, state.height, filenameInput?.value);
            } catch (e) {
                if (token !== sizeToken) return;
                if (metaEl) metaEl.textContent = `${state.width} × ${state.height}`;
                if (snippetEl) snippetEl.value = '';
            }
        }

        function redraw() {
            drawPlaceholder(canvas, optsFor(state.width, state.height));
            if (state.autoFilename && filenameInput) {
                const name = defaultFilename(state.width, state.height);
                state.filename = name;
                filenameInput.value = name;
            }
            refreshExportArtifacts();
        }

        function scheduleDraw() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(redraw, 80);
        }

        function setSize(w, h, { fromPreset } = {}) {
            state.width = clampSize(w);
            state.height = clampSize(h);
            state.ratio = state.width / Math.max(1, state.height);
            if (widthInput) widthInput.value = String(state.width);
            if (heightInput) heightInput.value = String(state.height);
            persist('imgPhWidth', state.width);
            persist('imgPhHeight', state.height);
            if (!fromPreset && state.preset !== 'custom') {
                state.preset = 'custom';
                persist('imgPhPreset', 'custom');
                syncPresetUi();
            }
            scheduleDraw();
        }

        function applyPreset(id) {
            const p = PRESETS[id];
            state.preset = PRESETS[id] !== undefined ? id : 'custom';
            persist('imgPhPreset', state.preset);
            syncPresetUi();
            if (p) {
                if (state.lock) state.ratio = p.w / p.h;
                setSize(p.w, p.h, { fromPreset: true });
            }
        }

        // --- bindings ---
        presetRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preset]');
            if (!btn) return;
            applyPreset(btn.dataset.preset);
        });

        settingsCard?.querySelectorAll('[data-pattern]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.pattern = btn.dataset.pattern || 'solid';
                persist('imgPhPattern', state.pattern);
                syncPatternUi();
                scheduleDraw();
            });
        });

        widthInput?.addEventListener('input', () => {
            let w = clampSize(widthInput.value);
            let h = state.height;
            if (state.lock) {
                h = clampSize(Math.round(w / Math.max(0.0001, state.ratio)));
            } else {
                state.ratio = w / Math.max(1, h);
            }
            setSize(w, h);
        });

        heightInput?.addEventListener('input', () => {
            let h = clampSize(heightInput.value);
            let w = state.width;
            if (state.lock) {
                w = clampSize(Math.round(h * state.ratio));
            } else {
                state.ratio = w / Math.max(1, h);
            }
            setSize(w, h);
        });

        lockInput?.addEventListener('click', () => {
            state.lock = !state.lock;
            state.ratio = state.width / Math.max(1, state.height);
            lockInput.classList.toggle('active', state.lock);
            lockInput.setAttribute('aria-pressed', state.lock ? 'true' : 'false');
            persist('imgPhLock', state.lock);
        });

        bgInput?.addEventListener('input', () => {
            state.bg = bgInput.value;
            persist('imgPhBg', state.bg);
            scheduleDraw();
        });
        bg2Input?.addEventListener('input', () => {
            state.bg2 = bg2Input.value;
            persist('imgPhBg2', state.bg2);
            scheduleDraw();
        });
        fgInput?.addEventListener('input', () => {
            state.fg = fgInput.value;
            persist('imgPhFg', state.fg);
            scheduleDraw();
        });
        textInput?.addEventListener('input', () => {
            state.text = textInput.value;
            persist('imgPhText', state.text);
            scheduleDraw();
        });
        fontScaleInput?.addEventListener('input', () => {
            state.fontScale = clamp(Number(fontScaleInput.value) || 100, 50, 200);
            if (fontScaleValue) fontScaleValue.textContent = `${state.fontScale}%`;
            persist('imgPhFontScale', state.fontScale);
            scheduleDraw();
        });
        boldInput?.addEventListener('change', () => {
            state.bold = boldInput.checked;
            persist('imgPhBold', state.bold);
            scheduleDraw();
        });
        diagonalInput?.addEventListener('change', () => {
            state.diagonal = diagonalInput.checked;
            persist('imgPhDiagonal', state.diagonal);
            scheduleDraw();
        });

        resultCard?.querySelectorAll('[data-phfmt]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.format = btn.dataset.phfmt || 'image/png';
                persist('imgPhFormat', state.format);
                syncFormatUi();
                refreshExportArtifacts();
            });
        });

        qualityInput?.addEventListener('input', () => {
            state.quality = clamp(Number(qualityInput.value) || 92, 1, 100);
            if (qualityValue) qualityValue.textContent = `${state.quality}%`;
            persist('imgPhQuality', state.quality);
            refreshExportArtifacts();
        });

        filenameInput?.addEventListener('input', () => {
            state.autoFilename = false;
            state.filename = filenameInput.value;
            persist('imgPhFilename', state.filename);
        });

        batchRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-batch]');
            if (!btn) return;
            const n = Number(btn.dataset.batch);
            if (!Number.isFinite(n)) return;
            const set = new Set(state.batch);
            if (set.has(n)) set.delete(n);
            else set.add(n);
            state.batch = [...set].sort((a, b) => a - b);
            persist('imgPhBatch', state.batch);
            syncBatchUi();
        });

        snippetSeg?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-snippet]');
            if (!btn) return;
            state.snippet = btn.dataset.snippet || 'dataUri';
            persist('imgPhSnippet', state.snippet);
            syncSnippetUi();
            if (state.lastDataUrl && snippetEl) {
                snippetEl.value = buildSnippet(state.lastDataUrl, state.width, state.height);
            }
        });

        downloadBtn?.addEventListener('click', async () => {
            const name = (filenameInput?.value || defaultFilename(state.width, state.height)).replace(/\.(png|jpe?g|webp)$/i, '');
            const ext = EXT_FOR[state.format] || 'png';
            const q = state.format === 'image/png' ? undefined : state.quality / 100;
            await ImageUtils.downloadCanvas(canvas, `${name}.${ext}`, state.format, q);
        });

        copyImgBtn?.addEventListener('click', async () => {
            try {
                let blob = state.lastBlob;
                if (!blob || state.format !== 'image/png') {
                    blob = await ImageUtils.canvasToBlob(canvas, 'image/png');
                }
                if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
                    copyImgBtn.textContent = '不支持';
                    setTimeout(() => { copyImgBtn.textContent = '复制图片'; }, 1200);
                    return;
                }
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                const prev = copyImgBtn.textContent;
                copyImgBtn.textContent = '已复制';
                setTimeout(() => { copyImgBtn.textContent = prev; }, 1200);
            } catch (e) {
                copyImgBtn.textContent = '复制失败';
                setTimeout(() => { copyImgBtn.textContent = '复制图片'; }, 1200);
            }
        });

        zipBtn?.addEventListener('click', async () => {
            if (!state.batch.length || typeof ZipWriter === 'undefined') return;
            const prev = zipBtn.textContent;
            zipBtn.disabled = true;
            zipBtn.textContent = '打包中…';
            try {
                const ratio = state.width / Math.max(1, state.height);
                const ext = EXT_FOR[state.format] || 'png';
                const q = state.format === 'image/png' ? undefined : state.quality / 100;
                const entries = [];
                const tmp = document.createElement('canvas');
                for (const bw of state.batch) {
                    const w = clampSize(bw);
                    const h = clampSize(Math.round(w / ratio));
                    drawPlaceholder(tmp, optsFor(w, h));
                    const blob = await ImageUtils.canvasToBlob(tmp, state.format, q);
                    entries.push({ name: `placeholder-${w}x${h}.${ext}`, blob });
                }
                // Also include current size if not already in batch
                const curName = `placeholder-${state.width}x${state.height}.${ext}`;
                if (!entries.some((e) => e.name === curName)) {
                    const blob = await ImageUtils.canvasToBlob(canvas, state.format, q);
                    entries.unshift({ name: curName, blob });
                }
                const zip = await ZipWriter.build(entries);
                ImageUtils.downloadBlob(zip, 'placeholders.zip');
            } catch (e) {
                if (metaEl) metaEl.textContent = '打包失败：' + e.message;
            } finally {
                zipBtn.textContent = prev;
                syncBatchUi();
            }
        });

        copySnippetBtn?.addEventListener('click', () => {
            if (!snippetEl?.value) return;
            ImageUtils.copyText(snippetEl.value, copySnippetBtn);
        });

        async function loadSettings() {
            if (typeof Settings === 'undefined') return;
            try {
                const s = await Settings.load();
                if (Number.isFinite(s.imgPhWidth)) state.width = clampSize(s.imgPhWidth);
                if (Number.isFinite(s.imgPhHeight)) state.height = clampSize(s.imgPhHeight);
                if (typeof s.imgPhLock === 'boolean') state.lock = s.imgPhLock;
                if (s.imgPhPreset && PRESETS[s.imgPhPreset] !== undefined) state.preset = s.imgPhPreset;
                if (s.imgPhPattern) state.pattern = s.imgPhPattern;
                if (typeof s.imgPhBg === 'string') state.bg = s.imgPhBg;
                if (typeof s.imgPhBg2 === 'string') state.bg2 = s.imgPhBg2;
                if (typeof s.imgPhFg === 'string') state.fg = s.imgPhFg;
                if (typeof s.imgPhText === 'string') state.text = s.imgPhText;
                if (Number.isFinite(s.imgPhFontScale)) state.fontScale = clamp(s.imgPhFontScale, 50, 200);
                if (typeof s.imgPhBold === 'boolean') state.bold = s.imgPhBold;
                if (typeof s.imgPhDiagonal === 'boolean') state.diagonal = s.imgPhDiagonal;
                if (s.imgPhFormat && EXT_FOR[s.imgPhFormat]) state.format = s.imgPhFormat;
                if (Number.isFinite(s.imgPhQuality)) state.quality = clamp(s.imgPhQuality, 1, 100);
                if (typeof s.imgPhFilename === 'string' && s.imgPhFilename) {
                    state.filename = s.imgPhFilename;
                    state.autoFilename = false;
                }
                if (s.imgPhSnippet) state.snippet = s.imgPhSnippet;
                if (Array.isArray(s.imgPhBatch)) {
                    state.batch = s.imgPhBatch.map(Number).filter((n) => Number.isFinite(n));
                }
                state.ratio = state.width / Math.max(1, state.height);
            } catch (_) { /* ignore */ }
        }

        loadSettings().then(() => {
            syncFormFromState();
            redraw();
        });
    }

    DevKit.ImageTools.placeholder = { init: initPlaceholder, drawPlaceholder, PRESETS };
})();
