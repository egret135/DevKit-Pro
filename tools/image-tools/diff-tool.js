// Image Tools - Pixel-level Image Diff
// Aligns A/B onto a shared canvas, runs pixelmatch (prefer worker), and shows
 // diff / slider / onion-skin views with auto-rerun on option changes.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const MAX_COMPARE_SIDE = 4096;
    const WORKER_URL = 'workers/image-diff-worker.js';

    // ==================== Pure helpers ====================

    /** Target canvas size for align modes: toA | toB | fit. */
    function alignSize(sizeA, sizeB, mode) {
        if (mode === 'toB') return { width: sizeB.width, height: sizeB.height, scaled: sizeA.width !== sizeB.width || sizeA.height !== sizeB.height };
        if (mode === 'fit') {
            return {
                width: Math.max(sizeA.width, sizeB.width),
                height: Math.max(sizeA.height, sizeB.height),
                scaled: sizeA.width !== sizeB.width || sizeA.height !== sizeB.height
            };
        }
        return { width: sizeA.width, height: sizeA.height, scaled: sizeA.width !== sizeB.width || sizeA.height !== sizeB.height };
    }

    /** If long side exceeds maxSide, return scaled size; otherwise unchanged. */
    function limitLongSide(size, maxSide) {
        const long = Math.max(size.width, size.height);
        if (long <= maxSide) return { width: size.width, height: size.height, scaled: false, factor: 1 };
        const factor = maxSide / long;
        return {
            width: Math.max(1, Math.round(size.width * factor)),
            height: Math.max(1, Math.round(size.height * factor)),
            scaled: true,
            factor
        };
    }

    function summarize(mismatch, width, height) {
        const total = Math.max(0, width * height);
        const pct = total ? (mismatch / total) * 100 : 0;
        return {
            mismatch,
            total,
            percent: pct,
            identical: mismatch === 0,
            label: mismatch === 0
                ? '完全一致'
                : `不匹配 ${mismatch.toLocaleString()} / ${total.toLocaleString()} (${pct.toFixed(3)}%)`
        };
    }

    /** Hex #rrggbb -> [r,g,b]. */
    function hexToRgb(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return [255, 0, 0];
        const n = parseInt(m[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    /**
     * Draw img into a W×H canvas. Modes:
     * - stretch: fill exactly (default for toA/toB)
     * - center: contain and center on transparent canvas (fit)
     */
    function drawAligned(img, width, height, mode) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (mode === 'center') {
            const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const x = Math.floor((width - w) / 2);
            const y = Math.floor((height - h) / 2);
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, x, y, w, h);
        } else {
            ctx.drawImage(img, 0, 0, width, height);
        }
        return canvas;
    }

    /** Build A | Diff | B side-by-side PNG canvas (gap 8px, labels). */
    function buildSideBySide(canvasA, canvasDiff, canvasB, gap) {
        const g = gap == null ? 8 : gap;
        const h = Math.max(canvasA.height, canvasDiff.height, canvasB.height);
        const labelH = 24;
        const width = canvasA.width + canvasDiff.width + canvasB.width + g * 2;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = h + labelH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#333333';
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        const labels = ['A', 'Diff', 'B'];
        const xs = [0, canvasA.width + g, canvasA.width + canvasDiff.width + g * 2];
        const canvases = [canvasA, canvasDiff, canvasB];
        canvases.forEach((c, i) => {
            ctx.fillText(labels[i], xs[i] + 4, labelH / 2);
            ctx.drawImage(c, xs[i], labelH);
        });
        return canvas;
    }

    function debounce(fn, wait) {
        let t = 0;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function createLatestRunner(task) {
        let generation = 0;
        let chain = Promise.resolve();
        return function run() {
            const mine = ++generation;
            const isStale = () => mine !== generation;
            chain = chain
                .then(() => (isStale() ? undefined : task(isStale)))
                .catch((err) => {
                    if (!err || err.name !== 'AbortError') console.error(err);
                });
            return chain;
        };
    }

    // ==================== Diff client (worker with fallback) ====================

    const DiffClient = (() => {
        let worker = null;
        let broken = false;
        let seq = 0;
        const pending = new Map();

        function supported() {
            return !broken && typeof Worker !== 'undefined';
        }

        function getWorker() {
            if (worker) return worker;
            worker = new Worker(WORKER_URL);
            worker.onmessage = (event) => {
                const data = event.data || {};
                const p = pending.get(data.id);
                if (!p) return;
                pending.delete(data.id);
                if (data.ok) p.resolve(data);
                else p.reject(new Error(data.error || '对比失败'));
            };
            worker.onerror = (event) => {
                event.preventDefault();
                broken = true;
                pending.forEach((p) => p.reject(new Error('对比线程不可用')));
                pending.clear();
                try { worker.terminate(); } catch (_) { /* ignore */ }
                worker = null;
            };
            return worker;
        }

        function runLocal(dataA, dataB, width, height, options) {
            if (typeof pixelmatch !== 'function') throw new Error('pixelmatch 未加载');
            const diff = new Uint8ClampedArray(width * height * 4);
            const mismatch = pixelmatch(dataA, dataB, diff, width, height, options);
            return { mismatch, width, height, diff };
        }

        async function compare(imageDataA, imageDataB, options) {
            const width = imageDataA.width;
            const height = imageDataA.height;
            if (width !== imageDataB.width || height !== imageDataB.height) {
                throw new Error('两图对齐后尺寸不一致');
            }
            if (supported()) {
                try {
                    const id = ++seq;
                    const aBuf = imageDataA.data.buffer.slice(0);
                    const bBuf = imageDataB.data.buffer.slice(0);
                    const result = await new Promise((resolve, reject) => {
                        pending.set(id, { resolve, reject });
                        getWorker().postMessage(
                            { id, width, height, a: aBuf, b: bBuf, options },
                            [aBuf, bBuf]
                        );
                    });
                    return {
                        mismatch: result.mismatch,
                        width,
                        height,
                        diff: new Uint8ClampedArray(result.diff)
                    };
                } catch (_) {
                    // fall through to local
                }
            }
            return runLocal(imageDataA.data, imageDataB.data, width, height, options);
        }

        return { compare, supported };
    })();

    // ==================== UI ====================

    function initDiff() {
        const panel = document.getElementById('imgPanelDiff');
        const dropzoneA = document.getElementById('imgDiffDropzoneA');
        if (!panel || !dropzoneA) return;
        const $ = (id) => document.getElementById(id);

        const dropzoneB = $('imgDiffDropzoneB');
        const hintA = $('imgDiffHintA');
        const hintB = $('imgDiffHintB');
        const previewA = $('imgDiffPreviewA');
        const previewB = $('imgDiffPreviewB');
        const emptyA = $('imgDiffEmptyA');
        const emptyB = $('imgDiffEmptyB');
        const chipsA = $('imgDiffChipsA');
        const chipsB = $('imgDiffChipsB');
        const metaA = $('imgDiffMetaA');
        const metaB = $('imgDiffMetaB');
        const changeA = $('imgDiffChangeA');
        const changeB = $('imgDiffChangeB');
        const swapBtn = $('imgDiffSwapBtn');
        const clearBtn = $('imgDiffClearBtn');

        const status = $('imgDiffStatus');
        const stage = $('imgDiffStage');
        const stageInner = $('imgDiffStageInner');
        const emptyStage = $('imgDiffEmptyStage');
        const diffCanvas = $('imgDiffCanvas');
        const slideA = $('imgDiffSlideA');
        const slideB = $('imgDiffSlideB');
        const divider = $('imgDiffDivider');
        const splitRange = $('imgDiffSplit');
        const onionA = $('imgDiffOnionA');
        const onionB = $('imgDiffOnionB');
        const onionField = $('imgDiffOnionField');
        const onionOpacity = $('imgDiffOnionOpacity');
        const onionValue = $('imgDiffOnionValue');
        const lightboxBtn = $('imgDiffLightboxBtn');

        const threshold = $('imgDiffThreshold');
        const thresholdValue = $('imgDiffThresholdValue');
        const includeAA = $('imgDiffIncludeAA');
        const diffMask = $('imgDiffMask');
        const diffColor = $('imgDiffDiffColor');
        const aaColor = $('imgDiffAaColor');
        const alphaInput = $('imgDiffAlpha');
        const alphaValue = $('imgDiffAlphaValue');
        const statsEl = $('imgDiffStats');
        const rerunBtn = $('imgDiffRerunBtn');
        const downloadBtn = $('imgDiffDownloadBtn');
        const sideBtn = $('imgDiffSideBtn');
        const copyBtn = $('imgDiffCopyBtn');

        const viewBtns = panel.querySelectorAll('[data-view]');
        const zoomBtns = panel.querySelectorAll('[data-zoom]');
        const alignBtns = panel.querySelectorAll('[data-align]');
        const presetBtns = panel.querySelectorAll('[data-preset]');

        const state = {
            view: 'diff',
            zoom: 'fit',
            align: 'toA',
            threshold: 0.1,
            includeAA: false,
            diffMask: false,
            diffColor: '#ff0000',
            aaColor: '#ffff00',
            alpha: 0.1,
            onion: 50
        };

        let slotA = null; // { img, url, name, size, mime, width, height }
        let slotB = null;
        let alignedA = null; // canvas
        let alignedB = null;
        let lastStats = null;
        let slideUrlA = '';
        let slideUrlB = '';

        const persist = (key, value) => {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        };

        function setSeg(btns, attr, value) {
            btns.forEach((btn) => {
                const on = String(btn.dataset[attr]) === String(value);
                btn.classList.toggle('active', on);
                if (btn.hasAttribute('role')) btn.setAttribute('aria-checked', String(on));
            });
        }

        function syncControls() {
            setSeg(viewBtns, 'view', state.view);
            setSeg(zoomBtns, 'zoom', state.zoom);
            setSeg(alignBtns, 'align', state.align);
            threshold.value = String(state.threshold);
            thresholdValue.textContent = Number(state.threshold).toFixed(2);
            includeAA.checked = state.includeAA;
            diffMask.checked = state.diffMask;
            diffColor.value = state.diffColor;
            aaColor.value = state.aaColor;
            alphaInput.value = String(Math.round(state.alpha * 100));
            alphaValue.textContent = `${Math.round(state.alpha * 100)}%`;
            onionOpacity.value = String(state.onion);
            onionValue.textContent = `${state.onion}%`;
            presetBtns.forEach((btn) => {
                btn.classList.toggle('active', Number(btn.dataset.preset) === Number(state.threshold));
            });
            onionField.classList.toggle('hidden', state.view !== 'onion');
            stage.classList.toggle('is-actual', state.zoom === 'actual');
        }

        function chipList(el, slot) {
            el.replaceChildren();
            if (!slot) return;
            const add = (t, cls) => {
                const s = document.createElement('span');
                s.className = `b64-chip${cls ? ` ${cls}` : ''}`;
                s.textContent = t;
                el.append(s);
            };
            add(`${slot.width} × ${slot.height}`);
            add(ImageUtils.formatFileSize(slot.size));
        }

        function showSlot(side, slot) {
            const isA = side === 'A';
            const preview = isA ? previewA : previewB;
            const empty = isA ? emptyA : emptyB;
            const chips = isA ? chipsA : chipsB;
            const meta = isA ? metaA : metaB;
            const change = isA ? changeA : changeB;
            const dropzone = isA ? dropzoneA : dropzoneB;
            if (!slot) {
                preview.classList.add('hidden');
                preview.removeAttribute('src');
                empty.classList.remove('hidden');
                chips.replaceChildren();
                meta.textContent = '未选择';
                change.classList.add('hidden');
                dropzone.classList.remove('has-file');
                return;
            }
            preview.src = slot.url;
            preview.classList.remove('hidden');
            empty.classList.add('hidden');
            meta.textContent = slot.name;
            meta.title = slot.name;
            change.classList.remove('hidden');
            dropzone.classList.add('has-file');
            chipList(chips, slot);
        }

        function updateChrome() {
            const ready = !!(slotA && slotB);
            swapBtn.disabled = !(slotA || slotB);
            clearBtn.disabled = !(slotA || slotB);
            rerunBtn.disabled = !ready;
            downloadBtn.disabled = !lastStats;
            sideBtn.disabled = !lastStats;
            copyBtn.disabled = !lastStats;
            lightboxBtn.disabled = !lastStats && !slotA;
            panel.classList.toggle('has-a', !!slotA);
            panel.classList.toggle('has-b', !!slotB);
            panel.classList.toggle('has-both', ready);
        }

        function revokeSlideUrls() {
            if (slideUrlA) { URL.revokeObjectURL(slideUrlA); slideUrlA = ''; }
            if (slideUrlB) { URL.revokeObjectURL(slideUrlB); slideUrlB = ''; }
        }

        async function loadSlot(file) {
            const url = URL.createObjectURL(file);
            try {
                const img = await new Promise((resolve, reject) => {
                    const image = new Image();
                    image.onload = () => resolve(image);
                    image.onerror = () => reject(new Error('图片加载失败'));
                    image.src = url;
                });
                return {
                    img,
                    url,
                    name: file.name || 'image',
                    size: file.size || 0,
                    mime: (file.type || '').toLowerCase(),
                    width: img.naturalWidth,
                    height: img.naturalHeight
                };
            } catch (err) {
                URL.revokeObjectURL(url);
                throw err;
            }
        }

        function releaseSlot(slot) {
            if (slot && slot.url) URL.revokeObjectURL(slot.url);
        }

        async function setSlot(side, file) {
            const slot = await loadSlot(file);
            if (side === 'A') {
                releaseSlot(slotA);
                slotA = slot;
                showSlot('A', slotA);
            } else {
                releaseSlot(slotB);
                slotB = slot;
                showSlot('B', slotB);
            }
            updateChrome();
            schedule();
        }

        const dropA = ImageUtils.createDropZone(dropzoneA, {
            onFile: (file) => { setSlot('A', file).catch((e) => { status.textContent = e.message; }); }
        });
        const dropB = ImageUtils.createDropZone(dropzoneB, {
            onFile: (file) => { setSlot('B', file).catch((e) => { status.textContent = e.message; }); }
        });
        changeA.addEventListener('click', (e) => { e.stopPropagation(); dropA.open(); });
        changeB.addEventListener('click', (e) => { e.stopPropagation(); dropB.open(); });

        swapBtn.addEventListener('click', () => {
            const tmp = slotA;
            slotA = slotB;
            slotB = tmp;
            showSlot('A', slotA);
            showSlot('B', slotB);
            updateChrome();
            schedule();
        });

        clearBtn.addEventListener('click', () => {
            releaseSlot(slotA);
            releaseSlot(slotB);
            slotA = slotB = null;
            alignedA = alignedB = null;
            lastStats = null;
            revokeSlideUrls();
            showSlot('A', null);
            showSlot('B', null);
            stageInner.classList.add('hidden');
            emptyStage.classList.remove('hidden');
            diffCanvas.width = diffCanvas.height = 0;
            statsEl.classList.add('hidden');
            status.textContent = '选择两张图片后自动对比';
            updateChrome();
        });

        // ---------- Views ----------

        function setSplit(percent) {
            const p = Math.min(100, Math.max(0, percent));
            stage.style.setProperty('--split', `${p}%`);
            splitRange.value = String(Math.round(p));
        }

        function applyView() {
            const v = state.view;
            const has = !!(alignedA && alignedB && lastStats);
            diffCanvas.classList.toggle('hidden', v !== 'diff' || !has);
            slideA.classList.toggle('hidden', v !== 'slider' || !has);
            slideB.classList.toggle('hidden', v !== 'slider' || !has);
            divider.classList.toggle('hidden', v !== 'slider' || !has);
            onionA.classList.toggle('hidden', v !== 'onion' || !has);
            onionB.classList.toggle('hidden', v !== 'onion' || !has);
            onionField.classList.toggle('hidden', v !== 'onion');
            stage.classList.toggle('is-slider', v === 'slider');
            stage.classList.toggle('is-onion', v === 'onion');
            if (v === 'onion' && has) {
                onionB.style.opacity = String(state.onion / 100);
            }
        }

        function splitFromPointer(e) {
            const rect = stageInner.getBoundingClientRect();
            if (!rect.width) return;
            setSplit(((e.clientX - rect.left) / rect.width) * 100);
        }

        stageInner.addEventListener('pointerdown', (e) => {
            if (state.view !== 'slider' || e.button !== 0) return;
            if (state.zoom === 'actual' && !e.target.closest('.diff-divider')) return;
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

        onionOpacity.addEventListener('input', () => {
            state.onion = Number(onionOpacity.value);
            onionValue.textContent = `${state.onion}%`;
            if (state.view === 'onion') onionB.style.opacity = String(state.onion / 100);
        });

        viewBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.view = btn.dataset.view;
            persist('imgDiffView', state.view);
            syncControls();
            applyView();
        }));
        zoomBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.zoom = btn.dataset.zoom;
            syncControls();
        }));

        lightboxBtn.addEventListener('click', () => {
            if (!window.ImageLightbox) return;
            if (state.view === 'diff' && diffCanvas.width) {
                ImageLightbox.openImage(diffCanvas.toDataURL('image/png'), '差异图');
            } else if (slotA) {
                ImageLightbox.openImage(slotA.url, slotA.name);
            }
        });
        previewA.addEventListener('click', () => {
            if (slotA && window.ImageLightbox) ImageLightbox.openImage(slotA.url, slotA.name);
        });
        previewB.addEventListener('click', () => {
            if (slotB && window.ImageLightbox) ImageLightbox.openImage(slotB.url, slotB.name);
        });

        // ---------- Compare ----------

        function pixelOptions() {
            return {
                threshold: state.threshold,
                includeAA: state.includeAA,
                diffMask: state.diffMask,
                alpha: state.alpha,
                diffColor: hexToRgb(state.diffColor),
                aaColor: hexToRgb(state.aaColor)
            };
        }

        function renderStats(stats, notes) {
            statsEl.replaceChildren();
            if (!stats) {
                statsEl.classList.add('hidden');
                return;
            }
            statsEl.classList.remove('hidden');
            const items = [
                ['分辨率', `${stats.width} × ${stats.height}`],
                ['总像素', stats.total.toLocaleString()],
                ['不匹配', stats.mismatch.toLocaleString()],
                ['占比', `${stats.percent.toFixed(3)}%`],
                ['结果', stats.identical ? '完全一致' : '有差异']
            ];
            items.forEach(([k, v]) => {
                const row = document.createElement('div');
                row.className = 'diff-stat-row';
                const lab = document.createElement('span');
                lab.textContent = k;
                const val = document.createElement('strong');
                val.textContent = v;
                if (k === '结果') val.className = stats.identical ? 'is-ok' : 'is-diff';
                row.append(lab, val);
                statsEl.append(row);
            });
            if (notes && notes.length) {
                const note = document.createElement('p');
                note.className = 'cvt-note';
                note.textContent = notes.join(' · ');
                statsEl.append(note);
            }
        }

        async function runDiff(isStale) {
            if (!slotA || !slotB) return;
            status.textContent = '对比中…';
            panel.classList.add('is-busy');
            rerunBtn.disabled = true;

            const notes = [];
            try {
                const target = alignSize(
                    { width: slotA.width, height: slotA.height },
                    { width: slotB.width, height: slotB.height },
                    state.align
                );
                if (target.scaled) notes.push('已缩放对齐');

                let size = { width: target.width, height: target.height };
                const limited = limitLongSide(size, MAX_COMPARE_SIDE);
                if (limited.scaled) {
                    size = { width: limited.width, height: limited.height };
                    notes.push('已降采样对比');
                }

                if (isStale && isStale()) return;

                const place = state.align === 'fit' ? 'center' : 'stretch';
                const canvasA = drawAligned(slotA.img, size.width, size.height, place);
                const canvasB = drawAligned(slotB.img, size.width, size.height, place);
                const dataA = canvasA.getContext('2d').getImageData(0, 0, size.width, size.height);
                const dataB = canvasB.getContext('2d').getImageData(0, 0, size.width, size.height);

                if (isStale && isStale()) return;

                const result = await DiffClient.compare(dataA, dataB, pixelOptions());
                if (isStale && isStale()) return;

                alignedA = canvasA;
                alignedB = canvasB;
                diffCanvas.width = size.width;
                diffCanvas.height = size.height;
                const ctx = diffCanvas.getContext('2d');
                ctx.putImageData(new ImageData(result.diff, size.width, size.height), 0, 0);

                revokeSlideUrls();
                slideUrlA = canvasA.toDataURL('image/png');
                slideUrlB = canvasB.toDataURL('image/png');
                slideA.src = slideUrlA;
                slideB.src = slideUrlB;
                onionA.src = slideUrlA;
                onionB.src = slideUrlB;

                const summary = summarize(result.mismatch, size.width, size.height);
                lastStats = { ...summary, width: size.width, height: size.height };
                status.textContent = summary.label + (notes.length ? `（${notes.join(' · ')}）` : '');
                renderStats(lastStats, notes);
                stageInner.classList.remove('hidden');
                emptyStage.classList.add('hidden');
                setSplit(Number(splitRange.value) || 50);
                applyView();
                updateChrome();
            } catch (err) {
                if (isStale && isStale()) return;
                status.textContent = '对比失败：' + (err.message || String(err));
                lastStats = null;
                renderStats(null);
                updateChrome();
            } finally {
                panel.classList.remove('is-busy');
                rerunBtn.disabled = !(slotA && slotB);
            }
        }

        const runLive = createLatestRunner(runDiff);
        const schedule = debounce(runLive, 250);

        rerunBtn.addEventListener('click', () => runLive());

        function optsChanged() {
            persist('imgDiffThreshold', state.threshold);
            persist('imgDiffIncludeAA', state.includeAA);
            persist('imgDiffAlign', state.align);
            persist('imgDiffDiffColor', state.diffColor);
            persist('imgDiffAaColor', state.aaColor);
            persist('imgDiffAlpha', state.alpha);
            persist('imgDiffMask', state.diffMask);
            schedule();
        }

        alignBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.align = btn.dataset.align;
            setSeg(alignBtns, 'align', state.align);
            optsChanged();
        }));

        threshold.addEventListener('input', () => {
            state.threshold = Number(threshold.value);
            thresholdValue.textContent = state.threshold.toFixed(2);
            presetBtns.forEach((btn) => {
                btn.classList.toggle('active', Number(btn.dataset.preset) === state.threshold);
            });
            optsChanged();
        });
        presetBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.threshold = Number(btn.dataset.preset);
            syncControls();
            optsChanged();
        }));
        includeAA.addEventListener('change', () => {
            state.includeAA = includeAA.checked;
            optsChanged();
        });
        diffMask.addEventListener('change', () => {
            state.diffMask = diffMask.checked;
            optsChanged();
        });
        diffColor.addEventListener('input', () => {
            state.diffColor = diffColor.value;
            optsChanged();
        });
        aaColor.addEventListener('input', () => {
            state.aaColor = aaColor.value;
            optsChanged();
        });
        alphaInput.addEventListener('input', () => {
            state.alpha = Number(alphaInput.value) / 100;
            alphaValue.textContent = `${Math.round(state.alpha * 100)}%`;
            optsChanged();
        });

        // ---------- Export ----------

        downloadBtn.addEventListener('click', async () => {
            if (!diffCanvas.width) return;
            await ImageUtils.downloadCanvas(diffCanvas, ImageUtils.generateFilename('diff', 'png'), 'image/png');
        });

        sideBtn.addEventListener('click', async () => {
            if (!alignedA || !alignedB || !diffCanvas.width) return;
            const side = buildSideBySide(alignedA, diffCanvas, alignedB);
            await ImageUtils.downloadCanvas(side, ImageUtils.generateFilename('diff-side', 'png'), 'image/png');
            side.width = side.height = 0;
        });

        copyBtn.addEventListener('click', async () => {
            if (!diffCanvas.width) return;
            if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
                copyBtn.textContent = '不支持';
                setTimeout(() => { copyBtn.textContent = '复制差异图'; }, 1200);
                return;
            }
            try {
                const blob = await ImageUtils.canvasToBlob(diffCanvas, 'image/png');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                const original = copyBtn.textContent;
                copyBtn.textContent = '已复制';
                setTimeout(() => { copyBtn.textContent = original; }, 1200);
            } catch (_) {
                copyBtn.textContent = '复制失败';
                setTimeout(() => { copyBtn.textContent = '复制差异图'; }, 1200);
            }
        });

        // ---------- Init ----------

        showSlot('A', null);
        showSlot('B', null);
        syncControls();
        setSplit(50);
        updateChrome();

        const savedPromise = typeof Settings !== 'undefined' ? Settings.load().catch(() => ({})) : Promise.resolve({});
        savedPromise.then((saved) => {
            if (!saved) return;
            if (Number.isFinite(saved.imgDiffThreshold)) state.threshold = saved.imgDiffThreshold;
            if (typeof saved.imgDiffIncludeAA === 'boolean') state.includeAA = saved.imgDiffIncludeAA;
            if (saved.imgDiffAlign) state.align = saved.imgDiffAlign;
            if (saved.imgDiffView) state.view = saved.imgDiffView;
            if (saved.imgDiffDiffColor) state.diffColor = saved.imgDiffDiffColor;
            if (saved.imgDiffAaColor) state.aaColor = saved.imgDiffAaColor;
            if (Number.isFinite(saved.imgDiffAlpha)) state.alpha = saved.imgDiffAlpha;
            if (typeof saved.imgDiffMask === 'boolean') state.diffMask = saved.imgDiffMask;
            syncControls();
            applyView();
        });
    }

    DevKit.ImageDiff = {
        alignSize,
        limitLongSide,
        summarize,
        hexToRgb,
        buildSideBySide,
        DiffClient
    };
    DevKit.ImageTools.diff = { init: initDiff };
})();
