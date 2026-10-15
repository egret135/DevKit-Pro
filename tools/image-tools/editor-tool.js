// Image Tools - Crop / Resize / Watermark Editor
// Committed pixels live in a HistoryStack of canvases (each geometric step is a
// new canvas, so undo/redo is just moving the index). The watermark is a
// non-destructive layer drawn over the current canvas on every render, until it
// is baked in (explicitly, or automatically before a crop/resize/rotate/flip).

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const MAX_DIM = 16384;
    const BATCH_MAX_FILES = 50;
    const BATCH_MAX_FILE_BYTES = 30 * 1024 * 1024;
    const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)$/i;

    const FONT_STACKS = {
        sans: 'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        serif: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
        mono: 'ui-monospace, Menlo, Consolas, "Courier New", monospace',
        yahei: '"Microsoft YaHei", "PingFang SC", sans-serif',
        pingfang: '"PingFang SC", "Microsoft YaHei", sans-serif'
    };

    const FORMAT_INFO = {
        'image/png': { ext: 'png', label: 'PNG', alpha: true },
        'image/jpeg': { ext: 'jpg', label: 'JPEG', alpha: false },
        'image/webp': { ext: 'webp', label: 'WebP', alpha: true },
        'image/avif': { ext: 'avif', label: 'AVIF', alpha: true }
    };

    const DEFAULT_WATERMARK = {
        type: 'text', text: '', font: 'sans', bold: false, size: 32, color: '#999999',
        stroke: false, strokeColor: '#ffffff', strokeWidth: 2, shadow: false,
        mode: 'tile', angle: -30, gapX: 2, gapY: 3,
        position: 'bottom-right', center: { rx: 0.5, ry: 0.5 }, margin: 24,
        opacity: 20, imageScale: 20
    };
    const DEFAULT_RESIZE = { mode: 'px', percent: 50, maxSide: 1920, lock: true, smoothing: 'high' };
    const DEFAULT_EXPORT = { format: 'image/png', quality: 92, bg: '#ffffff' };

    // ==================== Pure helpers ====================

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function parseRatio(value, current) {
        if (!value || value === 'free') return null;
        if (value === 'orig') return current && current.width && current.height ? current.width / current.height : null;
        const [a, b] = String(value).split(':').map(Number);
        return a > 0 && b > 0 ? a / b : null;
    }

    function anchorToXY(position, containerW, containerH, boxW, boxH, margin) {
        let x, y;
        if (position.includes('left')) x = margin;
        else if (position.includes('right')) x = containerW - boxW - margin;
        else x = (containerW - boxW) / 2;

        if (position.startsWith('top')) y = margin;
        else if (position.startsWith('bottom')) y = containerH - boxH - margin;
        else y = (containerH - boxH) / 2;

        return { x, y };
    }

    /** Largest `ratio` rect inside W×H, scaled by `fill`, centered; free ratio insets 10%. */
    function applyRatio(W, H, ratio, fill = 0.8) {
        if (!ratio) return { x: W * 0.1, y: H * 0.1, w: W * 0.8, h: H * 0.8 };
        let w = W;
        let h = w / ratio;
        if (h > H) { h = H; w = h * ratio; }
        w *= fill;
        h *= fill;
        return { x: (W - w) / 2, y: (H - h) / 2, w, h };
    }

    /**
     * New crop rect after dragging `handle` ('move' | n/s/e/w combos) by (dx, dy)
     * canvas pixels from `start`, kept inside W×H and, if given, at `ratio` (w/h).
     */
    function constrainCrop(start, handle, dx, dy, W, H, ratio, min = 8) {
        if (handle === 'move') {
            return {
                x: clamp(start.x + dx, 0, W - start.w),
                y: clamp(start.y + dy, 0, H - start.h),
                w: start.w,
                h: start.h
            };
        }
        const hasW = handle.includes('w');
        const hasE = handle.includes('e');
        const hasN = handle.includes('n');
        const hasS = handle.includes('s');
        let l = start.x;
        let t = start.y;
        let r = start.x + start.w;
        let b = start.y + start.h;
        if (hasW) l = clamp(l + dx, 0, r - min);
        if (hasE) r = clamp(r + dx, l + min, W);
        if (hasN) t = clamp(t + dy, 0, b - min);
        if (hasS) b = clamp(b + dy, t + min, H);
        if (!ratio) return { x: l, y: t, w: r - l, h: b - t };

        let w = r - l;
        let h = b - t;
        const horizontal = hasW || hasE;
        const vertical = hasN || hasS;

        if (horizontal && vertical) {
            if (Math.abs(dx) >= Math.abs(dy) * ratio) h = w / ratio;
            else w = h * ratio;
            const ax = hasW ? start.x + start.w : start.x;
            const ay = hasN ? start.y + start.h : start.y;
            const maxW = hasW ? ax : W - ax;
            const maxH = hasN ? ay : H - ay;
            if (w > maxW) { w = maxW; h = w / ratio; }
            if (h > maxH) { h = maxH; w = h * ratio; }
            return { x: hasW ? ax - w : ax, y: hasN ? ay - h : ay, w, h };
        }
        if (horizontal) {
            h = w / ratio;
            const ax = hasW ? start.x + start.w : start.x;
            const cy = start.y + start.h / 2;
            const maxW = hasW ? ax : W - ax;
            const maxH = H;
            if (w > maxW) { w = maxW; h = w / ratio; }
            if (h > maxH) { h = maxH; w = h * ratio; }
            return { x: hasW ? ax - w : ax, y: clamp(cy - h / 2, 0, H - h), w, h };
        }
        w = h * ratio;
        const ay = hasN ? start.y + start.h : start.y;
        const cx = start.x + start.w / 2;
        const maxH = hasN ? ay : H - ay;
        if (h > maxH) { h = maxH; w = h * ratio; }
        if (w > W) { w = W; h = w / ratio; }
        return { x: clamp(cx - w / 2, 0, W - w), y: hasN ? ay - h : ay, w, h };
    }

    /** Canvas size after `turns` quarter rotations. */
    function rotateSize(width, height, turns) {
        return ((turns % 2) + 2) % 2 ? { width: height, height: width } : { width, height };
    }

    /** opts: { mode: px|percent|max, width, height, percent, maxSide } -> { width, height }. */
    function computeResize(src, opts) {
        let w = src.width;
        let h = src.height;
        if (opts.mode === 'percent') {
            const p = clamp(Number(opts.percent) || 100, 1, 400) / 100;
            w = src.width * p;
            h = src.height * p;
        } else if (opts.mode === 'max') {
            const maxSide = Math.max(1, Number(opts.maxSide) || 0);
            const long = Math.max(src.width, src.height);
            if (long > maxSide) {
                const s = maxSide / long;
                w = src.width * s;
                h = src.height * s;
            }
        } else {
            w = Number(opts.width) || src.width;
            h = Number(opts.height) || src.height;
        }
        return {
            width: clamp(Math.round(w), 1, MAX_DIM),
            height: clamp(Math.round(h), 1, MAX_DIM)
        };
    }

    /** Scale pixel-sized watermark settings from a reference image to another, by short side. */
    function scaleWatermarkForSize(wm, ref, target) {
        const refShort = Math.min(ref.width, ref.height);
        const factor = refShort > 0 ? Math.min(target.width, target.height) / refShort : 1;
        return {
            ...wm,
            size: Math.max(4, wm.size * factor),
            strokeWidth: wm.strokeWidth * factor,
            margin: wm.margin * factor
        };
    }

    /**
     * Snapshot history of canvases. Undoing then pushing drops the redo branch.
     * Oldest steps are released once the total pixel count exceeds `maxPixels`,
     * but at least `minKeep` steps always survive.
     */
    class HistoryStack {
        constructor({ maxPixels = 100e6, minKeep = 5, release } = {}) {
            this.maxPixels = maxPixels;
            this.minKeep = minKeep;
            this.release = release || ((canvas) => { canvas.width = 0; canvas.height = 0; });
            this.entries = [];
            this.index = -1;
        }

        get size() { return this.entries.length; }
        get canUndo() { return this.index > 0; }
        get canRedo() { return this.index < this.entries.length - 1; }

        current() { return this.entries[this.index] || null; }

        totalPixels() {
            return this.entries.reduce((sum, e) => sum + e.canvas.width * e.canvas.height, 0);
        }

        push(canvas, label) {
            this.entries.splice(this.index + 1).forEach(e => this.release(e.canvas));
            this.entries.push({ canvas, label });
            this.index = this.entries.length - 1;
            while (this.entries.length > this.minKeep && this.index > 0 && this.totalPixels() > this.maxPixels) {
                this.release(this.entries.shift().canvas);
                this.index--;
            }
            return this.current();
        }

        undo() {
            if (this.canUndo) this.index--;
            return this.current();
        }

        redo() {
            if (this.canRedo) this.index++;
            return this.current();
        }

        clear() {
            this.entries.forEach(e => this.release(e.canvas));
            this.entries = [];
            this.index = -1;
        }
    }

    // ==================== Canvas helpers ====================

    function makeCanvas(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        return canvas;
    }

    function cloneCanvas(source) {
        const canvas = makeCanvas(source.width, source.height);
        canvas.getContext('2d').drawImage(source, 0, 0);
        return canvas;
    }

    function cropCanvas(source, rect) {
        const x = Math.round(rect.x);
        const y = Math.round(rect.y);
        const w = Math.max(1, Math.min(source.width - x, Math.round(rect.w)));
        const h = Math.max(1, Math.min(source.height - y, Math.round(rect.h)));
        const canvas = makeCanvas(w, h);
        canvas.getContext('2d').drawImage(source, x, y, w, h, 0, 0, w, h);
        return canvas;
    }

    function transformCanvas(source, kind) {
        const turns = kind === 'rotL' ? -1 : kind === 'rotR' ? 1 : 0;
        const size = rotateSize(source.width, source.height, turns);
        const canvas = makeCanvas(size.width, size.height);
        const ctx = canvas.getContext('2d');
        ctx.translate(size.width / 2, size.height / 2);
        if (turns) ctx.rotate(turns * Math.PI / 2);
        if (kind === 'flipH') ctx.scale(-1, 1);
        if (kind === 'flipV') ctx.scale(1, -1);
        ctx.drawImage(source, -source.width / 2, -source.height / 2);
        return canvas;
    }

    /** High quality halves repeatedly before the final draw, which avoids aliasing on big shrinks. */
    function resampleCanvas(source, width, height, smoothing) {
        let current = source;
        if (smoothing === 'high') {
            while (current.width / 2 >= width && current.height / 2 >= height) {
                const half = makeCanvas(current.width / 2, current.height / 2);
                const hctx = half.getContext('2d');
                hctx.imageSmoothingQuality = 'high';
                hctx.drawImage(current, 0, 0, half.width, half.height);
                if (current !== source) { current.width = 0; current.height = 0; }
                current = half;
            }
        }
        const canvas = makeCanvas(width, height);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = smoothing || 'high';
        ctx.drawImage(current, 0, 0, width, height);
        if (current !== source) { current.width = 0; current.height = 0; }
        return canvas;
    }

    function watermarkFont(wm) {
        return `${wm.bold ? 'bold ' : ''}${Math.round(wm.size)}px ${FONT_STACKS[wm.font] || FONT_STACKS.sans}`;
    }

    /** Size of one watermark unit (text run or image) on a W-wide canvas. */
    function watermarkUnitSize(ctx, wm, W, image) {
        if (wm.type === 'image') {
            if (!image) return null;
            const w = W * clamp(wm.imageScale, 1, 100) / 100;
            return { w, h: w * (image.naturalHeight / image.naturalWidth) };
        }
        if (!wm.text) return null;
        ctx.save();
        ctx.font = watermarkFont(wm);
        const w = ctx.measureText(wm.text).width;
        ctx.restore();
        return { w, h: wm.size * 1.2 };
    }

    /** Center (in canvas px) of a single watermark; anchored, or custom (relative) after dragging. */
    function watermarkCenter(wm, W, H, unit) {
        if (wm.position === 'custom') return { x: wm.center.rx * W, y: wm.center.ry * H };
        const { x, y } = anchorToXY(wm.position, W, H, unit.w, unit.h, wm.margin);
        return { x: x + unit.w / 2, y: y + unit.h / 2 };
    }

    function drawUnit(ctx, wm, image, unit, cx, cy) {
        if (wm.type === 'image') {
            ctx.drawImage(image, cx - unit.w / 2, cy - unit.h / 2, unit.w, unit.h);
            return;
        }
        if (wm.stroke && wm.strokeWidth > 0) ctx.strokeText(wm.text, cx, cy);
        ctx.fillText(wm.text, cx, cy);
    }

    /** Draws the watermark onto ctx (W×H). Returns the single-mode hit box, or null. */
    function drawWatermark(ctx, W, H, wm, image) {
        const unit = watermarkUnitSize(ctx, wm, W, image);
        if (!unit || unit.w <= 0 || unit.h <= 0) return null;
        ctx.save();
        ctx.globalAlpha = clamp(wm.opacity, 1, 100) / 100;
        if (wm.type === 'text') {
            ctx.font = watermarkFont(wm);
            ctx.fillStyle = wm.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = wm.strokeColor;
            ctx.lineWidth = wm.strokeWidth * 2;
            if (wm.shadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
                ctx.shadowBlur = Math.max(2, wm.size * 0.15);
                ctx.shadowOffsetX = ctx.shadowOffsetY = Math.max(1, wm.size * 0.05);
            }
        }
        let box = null;
        if (wm.mode === 'tile') {
            const base = wm.type === 'image' ? Math.min(unit.w, unit.h) : wm.size;
            const stepX = unit.w + base * wm.gapX;
            const stepY = unit.h + base * wm.gapY;
            const half = Math.sqrt(W * W + H * H) / 2 + Math.max(stepX, stepY);
            ctx.translate(W / 2, H / 2);
            ctx.rotate((Number(wm.angle) || 0) * Math.PI / 180);
            let row = 0;
            for (let y = -half; y <= half; y += stepY, row++) {
                const offset = row % 2 ? stepX / 2 : 0;
                for (let x = -half; x <= half; x += stepX) drawUnit(ctx, wm, image, unit, x + offset, y);
            }
        } else {
            const c = watermarkCenter(wm, W, H, unit);
            drawUnit(ctx, wm, image, unit, c.x, c.y);
            box = { x: c.x - unit.w / 2, y: c.y - unit.h / 2, w: unit.w, h: unit.h };
        }
        ctx.restore();
        return box;
    }

    function loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
    }

    function detectAvifEncoding() {
        return new Promise((resolve) => {
            try {
                const canvas = makeCanvas(2, 2);
                canvas.toBlob(blob => resolve(!!blob && blob.type === 'image/avif'), 'image/avif', 0.5);
            } catch (_) {
                resolve(false);
            }
        });
    }

    const fileStem = (name) => (name || 'image').replace(/\.[^.]+$/, '') || 'image';
    const sanitizeName = (name) => String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();
    const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const workerAvailable = () => typeof ImageEncodeClient !== 'undefined' && ImageEncodeClient.supported();

    /** quality 1..100 -> encoder args; PNG at 100 stays lossless, alpha-less formats get a fill. */
    function encodeParams(format, quality, background) {
        return {
            bg: FORMAT_INFO[format].alpha ? null : (background || '#ffffff'),
            q: format === 'image/png' ? (quality >= 100 ? undefined : quality / 100) : quality / 100
        };
    }

    /** Encodes pixels already loaded in the worker under `key`; null when the worker can't produce `format`. */
    async function encodeInWorker(key, width, height, format, quality, background) {
        const { bg, q } = encodeParams(format, quality, background);
        const blob = await ImageEncodeClient.encode(key, { format, width, height, background: bg, quality: q });
        return blob.type === format ? blob : null;
    }

    /**
     * Encode a canvas. Prefers the encode worker (off the main thread, including
     * lossy PNG quantization), falls back to main-thread canvas encoding.
     */
    async function encodeCanvasForExport(canvas, format, quality, background, workerKey) {
        const info = FORMAT_INFO[format];
        const { bg, q } = encodeParams(format, quality, background);
        if (workerKey && workerAvailable()) {
            try {
                await ImageEncodeClient.load(workerKey, canvas);
                const blob = await encodeInWorker(workerKey, canvas.width, canvas.height, format, quality, background);
                if (blob) return blob;
            } catch (_) { /* fall back below */ }
        }
        let source = canvas;
        if (bg) {
            source = makeCanvas(canvas.width, canvas.height);
            const ctx = source.getContext('2d');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, source.width, source.height);
            ctx.drawImage(canvas, 0, 0);
        }
        const blob = await ImageUtils.encodeCanvas(source, format, q);
        if (source !== canvas) { source.width = 0; source.height = 0; }
        if (blob.type !== format) throw new Error(`当前浏览器不支持导出 ${info.label}`);
        return blob;
    }

    // ==================== Editor ====================

    function initEditor() {
        const panel = document.getElementById('imgPanelEditor');
        const dropzone = document.getElementById('imgEdtDropzone');
        if (!panel || !dropzone) return;
        const $ = (id) => document.getElementById(id);

        const canvasWrap = $('imgEdtCanvasWrap');
        const canvas = $('imgEdtCanvas');
        const ctx = canvas.getContext('2d');
        const meta = $('imgEdtMeta');
        const side = $('imgEdtSide');
        const historyText = $('imgEdtHistory');
        const hintText = $('imgEdtHint');
        const undoBtn = $('imgEdtUndoBtn');
        const redoBtn = $('imgEdtRedoBtn');
        const resetBtn = $('imgEdtResetBtn');
        const changeBtn = $('imgEdtChangeBtn');
        const transformBtns = panel.querySelectorAll('[data-transform]');
        const tabBtns = panel.querySelectorAll('[data-tab]');
        const panes = panel.querySelectorAll('.edt-pane');

        const cropBox = $('imgEdtCropBox');
        const cropSize = $('imgEdtCropSize');
        const ratioBtns = panel.querySelectorAll('[data-ratio]');
        const cropInputs = { x: $('imgEdtCropX'), y: $('imgEdtCropY'), w: $('imgEdtCropW'), h: $('imgEdtCropH') };
        const cropResetBtn = $('imgEdtCropResetBtn');
        const cropApplyBtn = $('imgEdtCropApplyBtn');

        const rmodeBtns = panel.querySelectorAll('[data-rmode]');
        const resizeFields = { px: $('imgEdtResizePx'), percent: $('imgEdtResizePercent'), max: $('imgEdtResizeMax') };
        const resizeW = $('imgEdtResizeW');
        const resizeH = $('imgEdtResizeH');
        const resizeLock = $('imgEdtResizeLock');
        const percentRange = $('imgEdtResizePercentRange');
        const percentValue = $('imgEdtResizePercentValue');
        const maxValue = $('imgEdtResizeMaxValue');
        const presetBtns = panel.querySelectorAll('[data-preset]');
        const smoothBtns = panel.querySelectorAll('[data-smooth]');
        const resizePreview = $('imgEdtResizePreview');
        const resizeApplyBtn = $('imgEdtResizeApplyBtn');

        const wmTypeBtns = panel.querySelectorAll('[data-wmtype]');
        const wmModeBtns = panel.querySelectorAll('[data-wmmode]');
        const wmGroups = {
            text: $('imgEdtWmTextGroup'), image: $('imgEdtWmImageGroup'),
            tile: $('imgEdtWmTileGroup'), single: $('imgEdtWmSingleGroup')
        };
        const wmText = $('imgEdtWmText');
        const wmFont = $('imgEdtWmFont');
        const wmSize = $('imgEdtWmSize');
        const wmBold = $('imgEdtWmBold');
        const wmColor = $('imgEdtWmColor');
        const wmStroke = $('imgEdtWmStroke');
        const wmStrokeColor = $('imgEdtWmStrokeColor');
        const wmStrokeWidth = $('imgEdtWmStrokeWidth');
        const wmShadow = $('imgEdtWmShadow');
        const wmImageDrop = $('imgEdtWmImageDrop');
        const wmImageThumb = $('imgEdtWmImageThumb');
        const wmImageName = $('imgEdtWmImageName');
        const wmImageScale = $('imgEdtWmImageScale');
        const wmImageScaleValue = $('imgEdtWmImageScaleValue');
        const wmAngle = $('imgEdtWmAngle');
        const wmAngleValue = $('imgEdtWmAngleValue');
        const wmGapX = $('imgEdtWmGapX');
        const wmGapY = $('imgEdtWmGapY');
        const wmPosBtns = panel.querySelectorAll('[data-pos]');
        const wmMargin = $('imgEdtWmMargin');
        const wmMarginValue = $('imgEdtWmMarginValue');
        const wmOpacity = $('imgEdtWmOpacity');
        const wmOpacityValue = $('imgEdtWmOpacityValue');
        const wmStatus = $('imgEdtWmStatus');
        const wmClearBtn = $('imgEdtWmClearBtn');
        const wmBakeBtn = $('imgEdtWmBakeBtn');

        const batchDrop = $('imgEdtBatchDrop');
        const batchNotice = $('imgEdtBatchNotice');
        const batchList = $('imgEdtBatchList');
        const batchProgress = $('imgEdtBatchProgress');
        const batchClearBtn = $('imgEdtBatchClearBtn');
        const batchCancelBtn = $('imgEdtBatchCancelBtn');
        const batchRunBtn = $('imgEdtBatchRunBtn');

        const efmtBtns = panel.querySelectorAll('[data-efmt]');
        const exportQuality = $('imgEdtExportQuality');
        const exportQualityValue = $('imgEdtExportQualityValue');
        const exportPngNote = $('imgEdtExportPngNote');
        const exportBgField = $('imgEdtExportBgField');
        const exportBg = $('imgEdtExportBg');
        const filenameInput = $('imgEdtFilename');
        const fileExt = $('imgEdtFileExt');
        const exportChips = $('imgEdtExportChips');
        const copyBtn = $('imgEdtCopyBtn');
        const downloadBtn = $('imgEdtDownloadBtn');

        const state = {
            tab: 'crop',
            cropRatio: 'free',
            resize: { ...DEFAULT_RESIZE },
            wm: { ...DEFAULT_WATERMARK, center: { ...DEFAULT_WATERMARK.center } },
            exp: { ...DEFAULT_EXPORT }
        };

        // ~400MB of RGBA at the cap; huge images may keep fewer undo steps.
        const history = new HistoryStack({ maxPixels: 100e6, minKeep: 2 });
        let originalCanvas = null;
        let sourceName = 'image';
        let wmImage = null;
        let wmOn = false;
        let wmBox = null;
        let cropRect = null;
        let docVersion = 0;
        let avifSupported = false;

        const base = () => (history.current() ? history.current().canvas : null);
        const hasImage = () => !!base();

        const persist = (() => {
            const timers = {};
            return (key, value) => {
                if (typeof Settings === 'undefined') return;
                clearTimeout(timers[key]);
                timers[key] = setTimeout(() => Settings.set(key, value), 300);
            };
        })();
        const persistWm = () => persist('imgEditorWatermark', { ...state.wm, center: { ...state.wm.center } });
        const persistResize = () => persist('imgEditorResize', { ...state.resize });
        const persistExport = () => persist('imgEditorExport', { ...state.exp });

        function setSeg(btns, attr, value) {
            btns.forEach(btn => {
                const on = btn.dataset[attr] === value;
                btn.classList.toggle('active', on);
                if (btn.hasAttribute('role')) btn.setAttribute('aria-checked', String(on));
            });
        }

        // ---------- Render ----------

        let renderQueued = false;

        function render() {
            renderQueued = false;
            const src = base();
            if (!src) return;
            if (canvas.width !== src.width || canvas.height !== src.height) {
                canvas.width = src.width;
                canvas.height = src.height;
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(src, 0, 0);
            wmBox = watermarkVisible() ? drawWatermark(ctx, canvas.width, canvas.height, state.wm, wmImage) : null;
        }

        function requestRender() {
            docVersion++;
            scheduleEstimate();
            if (renderQueued) return;
            renderQueued = true;
            requestAnimationFrame(render);
        }

        function watermarkVisible() {
            if (!wmOn) return false;
            return state.wm.type === 'image' ? !!wmImage : !!state.wm.text.trim();
        }

        /** Current pixels including the live watermark, as a fresh canvas. */
        function composeCanvas() {
            const src = base();
            const out = cloneCanvas(src);
            if (watermarkVisible()) drawWatermark(out.getContext('2d'), out.width, out.height, state.wm, wmImage);
            return out;
        }

        // ---------- History ----------

        function updateHistoryUi() {
            const cur = history.current();
            undoBtn.disabled = !history.canUndo;
            redoBtn.disabled = !history.canRedo;
            historyText.textContent = cur ? `第 ${history.index + 1} / ${history.size} 步 · ${cur.label}` : '尚无操作';
        }

        function afterBaseChange() {
            const src = base();
            meta.textContent = src ? `${src.width} × ${src.height} px` : '未选择图片';
            syncResizeInputs();
            if (state.tab === 'crop' && src) startCrop();
            updateHistoryUi();
            render();
            docVersion++;
            scheduleEstimate();
        }

        /** Bakes a visible watermark into the history first, so geometric steps keep it and stay undoable. */
        function bakeWatermark() {
            if (!watermarkVisible()) return false;
            const baked = composeCanvas();
            wmOn = false;
            history.push(baked, state.wm.type === 'image' ? '图片水印' : '文字水印');
            updateWmStatus();
            return true;
        }

        function commit(canvasOut, label) {
            history.push(canvasOut, label);
            afterBaseChange();
        }

        function runGeometry(label, op) {
            if (!hasImage()) return;
            bakeWatermark();
            commit(op(base()), label);
        }

        function undo() {
            if (!history.canUndo) return;
            history.undo();
            afterBaseChange();
        }

        function redo() {
            if (!history.canRedo) return;
            history.redo();
            afterBaseChange();
        }

        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);

        resetBtn.addEventListener('click', () => {
            if (!originalCanvas) return;
            wmOn = false;
            updateWmStatus();
            commit(cloneCanvas(originalCanvas), '重置为原图');
        });

        const TRANSFORM_LABELS = { rotL: '向左旋转', rotR: '向右旋转', flipH: '水平翻转', flipV: '垂直翻转' };
        transformBtns.forEach(btn => btn.addEventListener('click', () => {
            const kind = btn.dataset.transform;
            runGeometry(TRANSFORM_LABELS[kind], src => transformCanvas(src, kind));
        }));

        // ---------- Loading ----------

        function setEnabled(on) {
            side.classList.toggle('is-disabled', !on);
            side.toggleAttribute('inert', !on);
            [resetBtn, changeBtn].forEach(b => { b.disabled = !on; });
            panel.querySelectorAll('.edt-toolbar [data-transform]').forEach(b => { b.disabled = !on; });
        }

        async function loadImage(file) {
            let url = '';
            try {
                url = URL.createObjectURL(file);
                const img = await loadImageFromUrl(url);
                if (img.naturalWidth > MAX_DIM || img.naturalHeight > MAX_DIM) {
                    hintText.textContent = `图片尺寸超过 ${MAX_DIM}px，无法编辑`;
                    return;
                }
                originalCanvas = ImageUtils.drawToCanvas(img);
                sourceName = fileStem(file.name);
                filenameInput.value = `${sourceName}-edited`;
                history.clear();
                history.push(cloneCanvas(originalCanvas), '打开图片');
                dropzone.classList.add('hidden');
                canvasWrap.classList.remove('hidden');
                panel.classList.add('has-image');
                setEnabled(true);
                hintText.textContent = '';
                afterBaseChange();
            } catch (err) {
                hintText.textContent = err.message || '图片加载失败';
            } finally {
                if (url) URL.revokeObjectURL(url);
            }
        }

        const dropzoneControl = ImageUtils.createDropZone(dropzone, { onFile: (file) => { loadImage(file); } });
        changeBtn.addEventListener('click', () => dropzoneControl.open());

        // ---------- Tabs ----------

        function setTab(tab) {
            if (state.tab === 'crop' && tab !== 'crop') cancelCrop();
            state.tab = tab;
            tabBtns.forEach(btn => {
                const on = btn.dataset.tab === tab;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-selected', String(on));
            });
            panes.forEach(p => p.classList.toggle('hidden', p.dataset.pane !== tab));
            if (tab === 'crop' && hasImage()) startCrop();
            if (tab === 'export') scheduleEstimate();
            updateCanvasCursorHint();
        }

        tabBtns.forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

        // ---------- Crop ----------

        function currentRatio() {
            const src = base();
            return parseRatio(state.cropRatio, src ? { width: src.width, height: src.height } : null);
        }

        function syncCropUi() {
            if (!cropRect) return;
            const src = base();
            const W = src.width;
            const H = src.height;
            cropBox.style.left = `${(cropRect.x / W) * 100}%`;
            cropBox.style.top = `${(cropRect.y / H) * 100}%`;
            cropBox.style.width = `${(cropRect.w / W) * 100}%`;
            cropBox.style.height = `${(cropRect.h / H) * 100}%`;
            const r = roundRect(cropRect);
            cropSize.textContent = `${r.w} × ${r.h}`;
            if (document.activeElement !== cropInputs.x) cropInputs.x.value = r.x;
            if (document.activeElement !== cropInputs.y) cropInputs.y.value = r.y;
            if (document.activeElement !== cropInputs.w) cropInputs.w.value = r.w;
            if (document.activeElement !== cropInputs.h) cropInputs.h.value = r.h;
        }

        const roundRect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) });

        function startCrop() {
            const src = base();
            if (!src) return;
            cropRect = applyRatio(src.width, src.height, currentRatio());
            cropBox.classList.remove('hidden');
            canvasWrap.classList.add('is-cropping');
            syncCropUi();
        }

        function cancelCrop() {
            cropRect = null;
            cropDrag = null;
            cropBox.classList.add('hidden');
            canvasWrap.classList.remove('is-cropping');
        }

        function applyCrop() {
            if (!cropRect || !hasImage()) return;
            const rect = roundRect(cropRect);
            const src = base();
            if (rect.x === 0 && rect.y === 0 && rect.w === src.width && rect.h === src.height) return;
            runGeometry(`裁剪 ${rect.w}×${rect.h}`, s => cropCanvas(s, rect));
        }

        ratioBtns.forEach(btn => btn.addEventListener('click', () => {
            state.cropRatio = btn.dataset.ratio;
            setSeg(ratioBtns, 'ratio', state.cropRatio);
            persist('imgEditorCropRatio', state.cropRatio);
            if (hasImage()) startCrop();
        }));

        cropResetBtn.addEventListener('click', () => { if (hasImage()) startCrop(); });
        cropApplyBtn.addEventListener('click', applyCrop);

        Object.values(cropInputs).forEach(input => input.addEventListener('change', () => {
            const src = base();
            if (!src || !cropRect) return;
            const W = src.width;
            const H = src.height;
            const ratio = currentRatio();
            const x = clamp(Number(cropInputs.x.value) || 0, 0, W - 1);
            const y = clamp(Number(cropInputs.y.value) || 0, 0, H - 1);
            let w = clamp(Number(cropInputs.w.value) || 1, 1, W - x);
            let h = clamp(Number(cropInputs.h.value) || 1, 1, H - y);
            if (ratio) {
                if (input === cropInputs.h) w = h * ratio; else h = w / ratio;
                if (x + w > W) { w = W - x; h = w / ratio; }
                if (y + h > H) { h = H - y; w = h * ratio; }
            }
            cropRect = { x, y, w, h };
            syncCropUi();
        }));

        let cropDrag = null;

        function canvasScale() {
            const rect = canvas.getBoundingClientRect();
            return rect.width ? rect.width / canvas.width : 1;
        }

        function canvasPoint(e) {
            const rect = canvas.getBoundingClientRect();
            const s = canvasScale();
            return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
        }

        cropBox.addEventListener('pointerdown', (e) => {
            if (!cropRect || e.button !== 0) return;
            const handle = e.target.closest('.edt-crop-handle');
            e.preventDefault();
            e.stopPropagation();
            cropBox.focus({ preventScroll: true });
            cropBox.setPointerCapture(e.pointerId);
            cropDrag = { handle: handle ? handle.dataset.handle : 'move', startX: e.clientX, startY: e.clientY, rect: { ...cropRect }, scale: canvasScale() };
            canvasWrap.classList.add('is-dragging');
        });

        cropBox.addEventListener('pointermove', (e) => {
            if (!cropDrag || !cropBox.hasPointerCapture(e.pointerId)) return;
            const src = base();
            const dx = (e.clientX - cropDrag.startX) / cropDrag.scale;
            const dy = (e.clientY - cropDrag.startY) / cropDrag.scale;
            cropRect = constrainCrop(cropDrag.rect, cropDrag.handle, dx, dy, src.width, src.height, currentRatio());
            syncCropUi();
        });

        const endCropDrag = (e) => {
            if (cropBox.hasPointerCapture(e.pointerId)) cropBox.releasePointerCapture(e.pointerId);
            cropDrag = null;
            canvasWrap.classList.remove('is-dragging');
        };
        cropBox.addEventListener('pointerup', endCropDrag);
        cropBox.addEventListener('pointercancel', endCropDrag);

        // ---------- Canvas pointer: new crop selection / watermark drag ----------

        let canvasDrag = null;

        function overWatermark(point) {
            return !!wmBox && point.x >= wmBox.x && point.x <= wmBox.x + wmBox.w && point.y >= wmBox.y && point.y <= wmBox.y + wmBox.h;
        }

        canvas.addEventListener('pointerdown', (e) => {
            if (!hasImage() || e.button !== 0) return;
            const p = canvasPoint(e);
            if (cropRect) {
                e.preventDefault();
                canvas.setPointerCapture(e.pointerId);
                canvasDrag = { kind: 'crop', origin: p, scale: canvasScale(), startX: e.clientX, startY: e.clientY };
                return;
            }
            if (state.wm.mode === 'single' && overWatermark(p)) {
                e.preventDefault();
                canvas.setPointerCapture(e.pointerId);
                canvasDrag = {
                    kind: 'wm',
                    startX: e.clientX,
                    startY: e.clientY,
                    scale: canvasScale(),
                    cx: wmBox.x + wmBox.w / 2,
                    cy: wmBox.y + wmBox.h / 2
                };
                canvasWrap.classList.add('is-dragging');
            }
        });

        canvas.addEventListener('pointermove', (e) => {
            if (canvasDrag && canvas.hasPointerCapture(e.pointerId)) {
                const src = base();
                const dx = (e.clientX - canvasDrag.startX) / canvasDrag.scale;
                const dy = (e.clientY - canvasDrag.startY) / canvasDrag.scale;
                if (canvasDrag.kind === 'crop') {
                    const o = canvasDrag.origin;
                    const handle = `${dy < 0 ? 'n' : 's'}${dx < 0 ? 'w' : 'e'}`;
                    const start = { x: clamp(o.x, 0, src.width), y: clamp(o.y, 0, src.height), w: 0, h: 0 };
                    const rect = constrainCrop(start, handle, dx, dy, src.width, src.height, currentRatio(), 1);
                    if (rect.w >= 4 && rect.h >= 4) {
                        cropRect = rect;
                        syncCropUi();
                    }
                } else {
                    state.wm.position = 'custom';
                    state.wm.center = {
                        rx: clamp((canvasDrag.cx + dx) / src.width, 0, 1),
                        ry: clamp((canvasDrag.cy + dy) / src.height, 0, 1)
                    };
                    setSeg(wmPosBtns, 'pos', 'custom');
                    requestRender();
                }
                return;
            }
            if (!cropRect && state.wm.mode === 'single') {
                canvas.style.cursor = overWatermark(canvasPoint(e)) ? 'move' : '';
            }
        });

        const endCanvasDrag = (e) => {
            if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
            if (canvasDrag && canvasDrag.kind === 'wm') persistWm();
            canvasDrag = null;
            canvasWrap.classList.remove('is-dragging');
        };
        canvas.addEventListener('pointerup', endCanvasDrag);
        canvas.addEventListener('pointercancel', endCanvasDrag);

        function updateCanvasCursorHint() {
            canvas.style.cursor = cropRect ? 'crosshair' : '';
        }

        // ---------- Keyboard ----------

        document.addEventListener('keydown', (e) => {
            if (!panel.classList.contains('active') || !hasImage()) return;
            const mod = e.ctrlKey || e.metaKey;
            const typing = isTyping(e.target);
            if (mod && !typing) {
                const key = e.key.toLowerCase();
                if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
                if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); return; }
            }
            if (!cropRect || typing || mod) return;
            if (e.key === 'Enter') { e.preventDefault(); applyCrop(); return; }
            if (e.key === 'Escape') {
                e.preventDefault();
                startCrop();
                return;
            }
            const step = e.shiftKey ? 10 : 1;
            const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            const mv = moves[e.key];
            if (!mv) return;
            e.preventDefault();
            const src = base();
            cropRect = constrainCrop(cropRect, 'move', mv[0], mv[1], src.width, src.height, null);
            syncCropUi();
        });

        // ---------- Resize ----------

        function resizeTarget() {
            const src = base();
            if (!src) return null;
            return computeResize({ width: src.width, height: src.height }, {
                mode: state.resize.mode,
                width: resizeW.value,
                height: resizeH.value,
                percent: state.resize.percent,
                maxSide: state.resize.maxSide
            });
        }

        function updateResizePreview() {
            const src = base();
            const t = resizeTarget();
            if (!src || !t) { resizePreview.textContent = ''; return; }
            const same = t.width === src.width && t.height === src.height;
            resizePreview.textContent = same ? `尺寸不变 ${src.width} × ${src.height}` : `${src.width} × ${src.height} → ${t.width} × ${t.height}`;
            resizeApplyBtn.disabled = same;
        }

        function syncResizeInputs() {
            const src = base();
            if (src) {
                resizeW.value = src.width;
                resizeH.value = src.height;
            }
            updateResizePreview();
        }

        function syncResizeUi() {
            setSeg(rmodeBtns, 'rmode', state.resize.mode);
            Object.entries(resizeFields).forEach(([mode, el]) => el.classList.toggle('hidden', mode !== state.resize.mode));
            resizeLock.checked = state.resize.lock;
            percentRange.value = String(clamp(state.resize.percent, 5, 200));
            percentValue.value = String(state.resize.percent);
            maxValue.value = String(state.resize.maxSide);
            setSeg(smoothBtns, 'smooth', state.resize.smoothing);
            presetBtns.forEach(btn => btn.classList.toggle('active', state.resize.mode === 'max' && Number(btn.dataset.preset) === state.resize.maxSide));
            updateResizePreview();
        }

        rmodeBtns.forEach(btn => btn.addEventListener('click', () => {
            state.resize.mode = btn.dataset.rmode;
            persistResize();
            syncResizeUi();
        }));

        resizeW.addEventListener('input', () => {
            const src = base();
            if (src && state.resize.lock) resizeH.value = Math.max(1, Math.round((Number(resizeW.value) || 0) * src.height / src.width)) || '';
            updateResizePreview();
        });
        resizeH.addEventListener('input', () => {
            const src = base();
            if (src && state.resize.lock) resizeW.value = Math.max(1, Math.round((Number(resizeH.value) || 0) * src.width / src.height)) || '';
            updateResizePreview();
        });
        resizeLock.addEventListener('change', () => {
            state.resize.lock = resizeLock.checked;
            persistResize();
            if (state.resize.lock) resizeW.dispatchEvent(new Event('input'));
        });

        percentRange.addEventListener('input', () => {
            state.resize.percent = Number(percentRange.value);
            percentValue.value = percentRange.value;
            persistResize();
            updateResizePreview();
        });
        percentValue.addEventListener('input', () => {
            const v = Number(percentValue.value);
            if (!(v > 0)) return;
            state.resize.percent = clamp(Math.round(v), 1, 400);
            percentRange.value = String(clamp(state.resize.percent, 5, 200));
            persistResize();
            updateResizePreview();
        });

        maxValue.addEventListener('input', () => {
            const v = Number(maxValue.value);
            if (!(v > 0)) return;
            state.resize.maxSide = clamp(Math.round(v), 16, MAX_DIM);
            persistResize();
            syncResizeUi();
        });

        presetBtns.forEach(btn => btn.addEventListener('click', () => {
            state.resize.mode = 'max';
            state.resize.maxSide = Number(btn.dataset.preset);
            persistResize();
            syncResizeUi();
        }));

        smoothBtns.forEach(btn => btn.addEventListener('click', () => {
            state.resize.smoothing = btn.dataset.smooth;
            persistResize();
            setSeg(smoothBtns, 'smooth', state.resize.smoothing);
        }));

        resizeApplyBtn.addEventListener('click', () => {
            const t = resizeTarget();
            const src = base();
            if (!t || (t.width === src.width && t.height === src.height)) return;
            runGeometry(`缩放 ${t.width}×${t.height}`, s => resampleCanvas(s, t.width, t.height, state.resize.smoothing));
        });

        // ---------- Watermark ----------

        function updateWmStatus() {
            const visible = watermarkVisible();
            const content = state.wm.type === 'image' ? !!wmImage : !!state.wm.text.trim();
            wmStatus.textContent = visible
                ? (state.wm.mode === 'single' ? '预览中 · 可在画布上拖动' : '预览中')
                : (content ? '已隐藏，修改任一参数重新显示' : (state.wm.type === 'image' ? '请选择水印图片' : '输入文字即可预览'));
            wmClearBtn.disabled = !visible;
            wmBakeBtn.disabled = !visible || !hasImage();
            batchRunBtn.disabled = batchBusy || !batchEntries.length || !content;
        }

        function syncWmUi() {
            const wm = state.wm;
            setSeg(wmTypeBtns, 'wmtype', wm.type);
            setSeg(wmModeBtns, 'wmmode', wm.mode);
            wmGroups.text.classList.toggle('hidden', wm.type !== 'text');
            wmGroups.image.classList.toggle('hidden', wm.type !== 'image');
            wmGroups.tile.classList.toggle('hidden', wm.mode !== 'tile');
            wmGroups.single.classList.toggle('hidden', wm.mode !== 'single');
            if (wmText.value !== wm.text) wmText.value = wm.text;
            wmFont.value = wm.font;
            wmSize.value = String(wm.size);
            wmBold.classList.toggle('active', wm.bold);
            wmBold.setAttribute('aria-pressed', String(wm.bold));
            wmColor.value = wm.color;
            wmStroke.checked = wm.stroke;
            wmStrokeColor.value = wm.strokeColor;
            wmStrokeWidth.value = String(wm.strokeWidth);
            wmStrokeColor.disabled = wmStrokeWidth.disabled = !wm.stroke;
            wmShadow.checked = wm.shadow;
            wmImageScale.value = String(wm.imageScale);
            wmImageScaleValue.textContent = `${wm.imageScale}%`;
            wmAngle.value = String(wm.angle);
            wmAngleValue.textContent = `${wm.angle}°`;
            wmGapX.value = String(wm.gapX);
            wmGapY.value = String(wm.gapY);
            setSeg(wmPosBtns, 'pos', wm.position);
            wmMargin.value = String(wm.margin);
            wmMarginValue.textContent = `${wm.margin}px`;
            wmOpacity.value = String(wm.opacity);
            wmOpacityValue.textContent = `${wm.opacity}%`;
            updateWmStatus();
        }

        /** Any watermark edit shows the layer again and re-renders. */
        function wmChanged(patch) {
            Object.assign(state.wm, patch);
            wmOn = true;
            persistWm();
            syncWmUi();
            requestRender();
        }

        wmTypeBtns.forEach(btn => btn.addEventListener('click', () => wmChanged({ type: btn.dataset.wmtype })));
        wmModeBtns.forEach(btn => btn.addEventListener('click', () => wmChanged({ mode: btn.dataset.wmmode })));
        wmText.addEventListener('input', () => wmChanged({ text: wmText.value }));
        wmFont.addEventListener('change', () => wmChanged({ font: wmFont.value }));
        wmSize.addEventListener('input', () => {
            const v = Number(wmSize.value);
            if (v >= 4) wmChanged({ size: Math.min(2000, Math.round(v)) });
        });
        wmBold.addEventListener('click', () => wmChanged({ bold: !state.wm.bold }));
        wmColor.addEventListener('input', () => wmChanged({ color: wmColor.value }));
        wmStroke.addEventListener('change', () => wmChanged({ stroke: wmStroke.checked }));
        wmStrokeColor.addEventListener('input', () => wmChanged({ strokeColor: wmStrokeColor.value }));
        wmStrokeWidth.addEventListener('input', () => {
            const v = Number(wmStrokeWidth.value);
            if (v > 0) wmChanged({ strokeWidth: Math.min(50, v) });
        });
        wmShadow.addEventListener('change', () => wmChanged({ shadow: wmShadow.checked }));
        wmImageScale.addEventListener('input', () => wmChanged({ imageScale: Number(wmImageScale.value) }));
        wmAngle.addEventListener('input', () => wmChanged({ angle: Number(wmAngle.value) }));
        wmGapX.addEventListener('input', () => wmChanged({ gapX: Number(wmGapX.value) }));
        wmGapY.addEventListener('input', () => wmChanged({ gapY: Number(wmGapY.value) }));
        wmPosBtns.forEach(btn => btn.addEventListener('click', () => wmChanged({ position: btn.dataset.pos, mode: 'single' })));
        wmMargin.addEventListener('input', () => wmChanged({ margin: Number(wmMargin.value) }));
        wmOpacity.addEventListener('input', () => wmChanged({ opacity: Number(wmOpacity.value) }));

        ImageUtils.createDropZone(wmImageDrop, {
            enablePaste: false,
            onFile: async (file) => {
                const url = URL.createObjectURL(file);
                try {
                    const img = await loadImageFromUrl(url);
                    if (wmImage && wmImage.src.startsWith('blob:')) URL.revokeObjectURL(wmImage.src);
                    wmImage = img;
                    wmImageThumb.src = url;
                    wmImageThumb.classList.remove('hidden');
                    wmImageName.textContent = `${file.name}（${img.naturalWidth} × ${img.naturalHeight}）`;
                    wmChanged({ type: 'image' });
                } catch (err) {
                    URL.revokeObjectURL(url);
                    wmImageName.textContent = err.message || '图片加载失败';
                }
            }
        });

        wmClearBtn.addEventListener('click', () => {
            wmOn = false;
            updateWmStatus();
            requestRender();
        });

        wmBakeBtn.addEventListener('click', () => {
            if (!bakeWatermark()) return;
            afterBaseChange();
        });

        // ---------- Export ----------

        function syncExportUi() {
            const fmt = state.exp.format;
            setSeg(efmtBtns, 'efmt', fmt);
            exportQuality.value = String(state.exp.quality);
            exportQualityValue.textContent = `${state.exp.quality}%`;
            exportPngNote.classList.toggle('hidden', fmt !== 'image/png');
            exportBgField.classList.toggle('hidden', FORMAT_INFO[fmt].alpha);
            exportBg.value = state.exp.bg;
            fileExt.textContent = `.${FORMAT_INFO[fmt].ext}`;
        }

        function exportChanged() {
            persistExport();
            syncExportUi();
            scheduleEstimate();
        }

        efmtBtns.forEach(btn => btn.addEventListener('click', () => {
            state.exp.format = btn.dataset.efmt;
            exportChanged();
        }));
        exportQuality.addEventListener('input', () => {
            state.exp.quality = Number(exportQuality.value);
            exportChanged();
        });
        exportBg.addEventListener('input', () => {
            state.exp.bg = exportBg.value;
            exportChanged();
        });

        function outputFilename(stemOverride) {
            const stem = sanitizeName(stemOverride != null ? stemOverride : filenameInput.value) || `${sourceName}-edited`;
            return `${stem}.${FORMAT_INFO[state.exp.format].ext}`;
        }

        let estimateTimer = 0;
        let estimateSeq = 0;
        let lastEstimate = null;

        function chip(text, cls) {
            const el = document.createElement('span');
            el.className = `b64-chip${cls ? ` ${cls}` : ''}`;
            el.textContent = text;
            return el;
        }

        function renderEstimate(blob, error) {
            const src = base();
            exportChips.replaceChildren();
            if (!src) return;
            exportChips.append(chip(`${src.width} × ${src.height}`));
            if (error) exportChips.append(chip(error, 'is-warn'));
            else if (blob) exportChips.append(chip(`预估 ${ImageUtils.formatFileSize(blob.size)}`, 'is-accent'));
            else exportChips.append(chip('估算中…'));
            if (watermarkVisible()) exportChips.append(chip('含水印预览'));
        }

        function estimateKey() {
            return `${docVersion}|${state.exp.format}|${state.exp.quality}|${state.exp.bg}`;
        }

        function scheduleEstimate() {
            clearTimeout(estimateTimer);
            if (!hasImage() || state.tab !== 'export') return;
            if (lastEstimate && lastEstimate.key === estimateKey()) {
                renderEstimate(lastEstimate.blob);
                return;
            }
            renderEstimate(null);
            estimateTimer = setTimeout(runEstimate, 400);
        }

        // Pixels in the worker only need re-uploading when the document changed,
        // not when just the format / quality / background did.
        let workerVersion = -1;

        async function encodeCurrent() {
            const key = estimateKey();
            if (lastEstimate && lastEstimate.key === key) return lastEstimate.blob;
            const version = docVersion;
            const { format, quality, bg } = state.exp;
            const src = base();
            let blob = null;
            if (workerAvailable()) {
                try {
                    if (workerVersion !== version) {
                        workerVersion = -1;
                        const composed = composeCanvas();
                        try {
                            await ImageEncodeClient.load('edt-export', composed);
                        } finally {
                            composed.width = 0;
                            composed.height = 0;
                        }
                        workerVersion = version;
                    }
                    blob = await encodeInWorker('edt-export', src.width, src.height, format, quality, bg);
                } catch (_) {
                    workerVersion = -1;
                    blob = null;
                }
            }
            if (!blob) {
                const composed = composeCanvas();
                try {
                    blob = await encodeCanvasForExport(composed, format, quality, bg, null);
                } finally {
                    composed.width = 0;
                    composed.height = 0;
                }
            }
            lastEstimate = { key, blob };
            return blob;
        }

        async function runEstimate() {
            const seq = ++estimateSeq;
            try {
                const blob = await encodeCurrent();
                if (seq === estimateSeq && state.tab === 'export') renderEstimate(blob);
            } catch (err) {
                if (seq === estimateSeq) renderEstimate(null, err.message || '估算失败');
            }
        }

        downloadBtn.addEventListener('click', async () => {
            if (!hasImage()) return;
            downloadBtn.disabled = true;
            try {
                const blob = await encodeCurrent();
                ImageUtils.downloadBlob(blob, outputFilename());
                if (state.tab === 'export') renderEstimate(blob);
            } catch (err) {
                renderEstimate(null, err.message || '导出失败');
            } finally {
                downloadBtn.disabled = false;
            }
        });

        function flashButton(btn, text) {
            const original = btn.dataset.label || btn.textContent;
            btn.dataset.label = original;
            btn.textContent = text;
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('copied');
            }, 1400);
        }

        copyBtn.addEventListener('click', async () => {
            if (!hasImage()) return;
            if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
                flashButton(copyBtn, '浏览器不支持');
                return;
            }
            const composed = composeCanvas();
            try {
                const blob = await ImageUtils.canvasToBlob(composed, 'image/png');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                flashButton(copyBtn, '已复制');
            } catch (_) {
                flashButton(copyBtn, '复制失败');
            } finally {
                composed.width = 0;
                composed.height = 0;
            }
        });

        // ---------- Batch watermark ----------

        let batchEntries = [];
        let batchNextId = 1;
        let batchBusy = false;
        let batchCancelled = false;

        function renderBatch() {
            batchList.replaceChildren();
            batchList.classList.toggle('hidden', !batchEntries.length);
            batchClearBtn.classList.toggle('hidden', !batchEntries.length || batchBusy);
            batchCancelBtn.classList.toggle('hidden', !batchBusy);
            batchEntries.forEach(entry => {
                const li = document.createElement('li');
                li.className = 'b64-file edt-batch-item';
                li.dataset.id = String(entry.id);
                const thumb = document.createElement('img');
                thumb.className = 'b64-file-thumb';
                thumb.src = entry.url;
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
                if (entry.status) {
                    const tag = document.createElement('span');
                    tag.className = entry.error ? 'cvt-file-error' : 'edt-batch-status';
                    tag.textContent = entry.status;
                    sub.append(' · ', tag);
                }
                info.append(name, sub);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'b64-file-remove';
                remove.dataset.action = 'remove';
                remove.setAttribute('aria-label', `移除 ${entry.name}`);
                remove.textContent = '×';
                remove.disabled = batchBusy;
                li.append(thumb, info, remove);
                batchList.append(li);
            });
            updateWmStatus();
        }

        function addBatchFiles(files) {
            if (batchBusy) return;
            const skipped = [];
            for (const file of files) {
                const ok = (file.type && file.type.startsWith('image/')) || IMAGE_EXT_RE.test(file.name || '');
                if (!ok) { skipped.push(`${file.name}（不是图片）`); continue; }
                if (file.size > BATCH_MAX_FILE_BYTES) { skipped.push(`${file.name}（超过 30MB）`); continue; }
                if (batchEntries.length >= BATCH_MAX_FILES) { skipped.push(`${file.name}（超过 ${BATCH_MAX_FILES} 张上限）`); continue; }
                batchEntries.push({ id: batchNextId++, file, name: file.name || 'image', size: file.size, url: URL.createObjectURL(file), status: '', error: false });
            }
            batchNotice.classList.toggle('hidden', !skipped.length);
            batchNotice.textContent = skipped.length ? `已跳过：${skipped.join('、')}` : '';
            batchProgress.textContent = batchEntries.length ? `共 ${batchEntries.length} 张` : '';
            renderBatch();
        }

        ImageUtils.createDropZone(batchDrop, { multiple: true, enablePaste: false, onFiles: addBatchFiles });

        batchList.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="remove"]');
            if (!btn || batchBusy) return;
            const id = Number(btn.closest('.b64-file').dataset.id);
            const entry = batchEntries.find(x => x.id === id);
            if (entry) URL.revokeObjectURL(entry.url);
            batchEntries = batchEntries.filter(x => x.id !== id);
            batchProgress.textContent = batchEntries.length ? `共 ${batchEntries.length} 张` : '';
            renderBatch();
        });

        batchClearBtn.addEventListener('click', () => {
            if (batchBusy) return;
            batchEntries.forEach(x => URL.revokeObjectURL(x.url));
            batchEntries = [];
            batchNotice.classList.add('hidden');
            batchProgress.textContent = '';
            renderBatch();
        });

        batchCancelBtn.addEventListener('click', () => { batchCancelled = true; });

        batchRunBtn.addEventListener('click', async () => {
            if (batchBusy || !batchEntries.length) return;
            batchBusy = true;
            batchCancelled = false;
            batchEntries.forEach(x => { x.status = '等待中'; x.error = false; });
            renderBatch();
            const wm = { ...state.wm, center: { ...state.wm.center } };
            const ref = hasImage() ? { width: base().width, height: base().height } : null;
            const { format, quality, bg } = state.exp;
            const ext = FORMAT_INFO[format].ext;
            const results = [];
            let done = 0;
            try {
                for (const entry of batchEntries) {
                    if (batchCancelled) break;
                    entry.status = '处理中';
                    renderBatch();
                    let work = null;
                    try {
                        const img = await loadImageFromUrl(entry.url);
                        work = ImageUtils.drawToCanvas(img);
                        const size = { width: work.width, height: work.height };
                        const scaled = ref ? scaleWatermarkForSize(wm, ref, size) : wm;
                        drawWatermark(work.getContext('2d'), work.width, work.height, scaled, wmImage);
                        const blob = await encodeCanvasForExport(work, format, quality, bg, 'edt-batch');
                        results.push({ name: `${sanitizeName(fileStem(entry.name)) || 'image'}-wm.${ext}`, blob });
                        entry.status = `完成 ${ImageUtils.formatFileSize(blob.size)}`;
                    } catch (err) {
                        entry.status = err.message || '处理失败';
                        entry.error = true;
                    } finally {
                        if (work) { work.width = 0; work.height = 0; }
                    }
                    done++;
                    batchProgress.textContent = `${done} / ${batchEntries.length}`;
                    renderBatch();
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                if (typeof ImageEncodeClient !== 'undefined') ImageEncodeClient.drop('edt-batch');
                if (batchCancelled) {
                    batchEntries.forEach(x => { if (x.status === '等待中') x.status = '已取消'; });
                    batchProgress.textContent = `已取消，完成 ${results.length} 张`;
                } else if (results.length === 1) {
                    ImageUtils.downloadBlob(results[0].blob, results[0].name);
                    batchProgress.textContent = '已下载 1 张';
                } else if (results.length > 1) {
                    batchProgress.textContent = '正在打包 ZIP…';
                    const zip = await ZipWriter.build(results);
                    ImageUtils.downloadBlob(zip, ImageUtils.generateFilename('watermarked', 'zip'));
                    batchProgress.textContent = `已打包 ${results.length} 张 · ${ImageUtils.formatFileSize(zip.size)}`;
                } else {
                    batchProgress.textContent = '没有成功处理的图片';
                }
            } finally {
                batchBusy = false;
                renderBatch();
            }
        });

        // ---------- Init ----------

        setEnabled(false);
        setTab('crop');
        setSeg(ratioBtns, 'ratio', state.cropRatio);
        syncResizeUi();
        syncWmUi();
        syncExportUi();

        detectAvifEncoding().then(ok => {
            avifSupported = ok;
            panel.querySelector('[data-efmt="image/avif"]').classList.toggle('hidden', !ok);
            if (!ok && state.exp.format === 'image/avif') {
                state.exp.format = 'image/webp';
                syncExportUi();
            }
        });

        const savedPromise = typeof Settings !== 'undefined' ? Settings.load().catch(() => ({})) : Promise.resolve({});
        savedPromise.then(saved => {
            if (!saved) return;
            if (saved.imgEditorCropRatio) state.cropRatio = String(saved.imgEditorCropRatio);
            if (saved.imgEditorResize) Object.assign(state.resize, saved.imgEditorResize);
            if (saved.imgEditorWatermark) {
                Object.assign(state.wm, saved.imgEditorWatermark);
                state.wm.center = { ...DEFAULT_WATERMARK.center, ...(saved.imgEditorWatermark.center || {}) };
            }
            if (saved.imgEditorExport) Object.assign(state.exp, saved.imgEditorExport);
            if (!FORMAT_INFO[state.exp.format] || (state.exp.format === 'image/avif' && !avifSupported)) state.exp.format = DEFAULT_EXPORT.format;
            setSeg(ratioBtns, 'ratio', state.cropRatio);
            syncResizeUi();
            syncWmUi();
            syncExportUi();
        });
    }

    DevKit.ImageEditor = { constrainCrop, applyRatio, parseRatio, rotateSize, computeResize, scaleWatermarkForSize, anchorToXY, HistoryStack };
    DevKit.ImageTools.editor = { init: initEditor };
})();
