// Media Tools - Video Frame Capture (Layout A)
// Drop video, seek/step, capture scaled frame, multi-format export, strip + ZIP.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const STRIP_MAX = 24;
    const FRAME_STEP = 1 / 30;
    const EXT_FOR = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp'
    };
    const STEP_MAP = {
        frame: FRAME_STEP,
        '0.1': 0.1,
        '1': 1,
        '5': 5
    };

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function initFrame() {
        const panel = document.getElementById('mediaPanelFrame');
        const dropzone = document.getElementById('mediaFrameDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('mediaFrmStatus');
        const work = $('mediaFrameWork');
        const video = $('mediaFrameVideo');
        const scrubRoot = $('mediaFrmScrub');
        const seek = $('mediaFrmSeek');
        const timeInput = $('mediaFrmTimeInput');
        const timeEl = $('mediaFrameTime');
        const timeCur = $('mediaFrmTimeCur');
        const timeDur = $('mediaFrmTimeDur');
        const stepRoot = $('mediaFrmStep');
        const prevBtn = $('mediaFramePrevBtn');
        const nextBtn = $('mediaFrameNextBtn');
        const captureBtn = $('mediaFrameCaptureBtn');
        const downloadBtn = $('mediaFrameDownloadBtn');
        const copyBtn = $('mediaFrmCopyBtn');
        const zipBtn = $('mediaFrmZipBtn');
        const clearStripBtn = $('mediaFrmClearStripBtn');
        const stripCount = $('mediaFrmStripCount');
        const resultImg = $('mediaFrameResult');
        const resultEmpty = $('mediaFrmResultEmpty');
        const resultMeta = $('mediaFrmResultMeta');
        const formatRoot = $('mediaFrmFormat');
        const qualityField = $('mediaFrmQualityField');
        const qualityInput = $('mediaFrmQuality');
        const qualityValue = $('mediaFrmQualityValue');
        const scaleRoot = $('mediaFrmScale');
        const customWrap = $('mediaFrmCustomWrap');
        const customW = $('mediaFrmCustomW');
        const filenameInput = $('mediaFrmFilename');
        const fileExt = $('mediaFrmFileExt');
        const stripEl = $('mediaFrmStrip');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            stepKey: defaults.mediaFrmStep || 'frame',
            format: defaults.mediaFrmFormat || 'image/png',
            quality: defaults.mediaFrmQuality || 92,
            scale: defaults.mediaFrmScale || 'original',
            customW: defaults.mediaFrmCustomW || 1280,
            filename: defaults.mediaFrmFilename || 'frame',
            autoFilename: true
        };

        let videoUrl = '';
        let fileName = '';
        let capturedBlob = null;
        let capturedUrl = '';
        let capturedStamp = '';
        let strip = []; // { id, blob, url, name, time, w, h }
        let activeStripId = '';
        let syncingSeek = false;
        let scrubbing = false; // user is dragging the timeline
        let pendingSeek = null; // Promise resolved on next seeked
        let displayTime = 0; // authoritative UI time while scrubbing / after seek
        let knownDuration = 0; // finite duration after WebM probe
        let probingDuration = false;

        function persist(key, value) {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        }

        function stepSec() {
            return STEP_MAP[state.stepKey] || FRAME_STEP;
        }

        function setChipGroup(root, attr, value) {
            root?.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
                const on = String(btn.dataset[attr]) === String(value);
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }

        function syncFormatUi() {
            setChipGroup(formatRoot, 'fmt', state.format);
            const needsQ = state.format !== 'image/png';
            qualityField?.classList.toggle('hidden', !needsQ);
            if (fileExt) fileExt.textContent = '.' + (EXT_FOR[state.format] || 'png');
        }

        function syncScaleUi() {
            setChipGroup(scaleRoot, 'scale', state.scale);
            customWrap?.classList.toggle('hidden', state.scale !== 'custom');
        }

        function syncStepUi() {
            setChipGroup(stepRoot, 'step', state.stepKey);
        }

        function syncFormFromState() {
            syncStepUi();
            syncFormatUi();
            syncScaleUi();
            if (qualityInput) qualityInput.value = String(state.quality);
            if (qualityValue) qualityValue.textContent = `${state.quality}%`;
            if (customW) customW.value = String(state.customW);
            if (filenameInput) filenameInput.value = state.filename || 'frame';
        }

        function setCaptureEnabled(on) {
            if (captureBtn) captureBtn.disabled = !on;
        }

        function setResultActions(on) {
            if (downloadBtn) downloadBtn.disabled = !on;
            if (copyBtn) copyBtn.disabled = !on;
        }

        function readNativeDuration() {
            const d = video.duration;
            if (Number.isFinite(d) && d > 0) return d;
            try {
                if (video.seekable && video.seekable.length > 0) {
                    const end = video.seekable.end(video.seekable.length - 1);
                    if (Number.isFinite(end) && end > 0) return end;
                }
            } catch (_) { /* ignore */ }
            return 0;
        }

        function mediaDuration() {
            const native = readNativeDuration();
            if (native > 0) knownDuration = Math.max(knownDuration, native);
            return knownDuration || native;
        }

        function setScrubEnabled(on) {
            if (seek) seek.disabled = !on;
            if (timeInput) timeInput.disabled = !on;
            scrubRoot?.classList.toggle('is-ready', !!on);
        }

        function syncSeekRange() {
            const dur = mediaDuration();
            if (!seek) return dur;
            if (dur > 0) {
                seek.min = '0';
                seek.step = '0.001';
                const maxStr = String(dur);
                if (seek.getAttribute('max') !== maxStr) seek.max = maxStr;
                if (timeInput) timeInput.max = maxStr;
                setScrubEnabled(true);
            } else {
                setScrubEnabled(false);
            }
            return dur;
        }

        /**
         * MediaRecorder WebM often has duration=Infinity until you seek near the end.
         * Force the browser to materialize a finite duration, then reset to 0.
         */
        function resolveDuration() {
            const already = mediaDuration();
            if (already > 0) {
                syncSeekRange();
                return Promise.resolve(already);
            }
            if (probingDuration) {
                return new Promise((resolve) => {
                    const tick = () => {
                        if (!probingDuration) resolve(mediaDuration());
                        else requestAnimationFrame(tick);
                    };
                    tick();
                });
            }
            probingDuration = true;
            if (status) status.textContent = `${fileName} · 正在读取时长…`;

            return new Promise((resolve) => {
                let settled = false;
                const finish = (dur) => {
                    if (settled) return;
                    settled = true;
                    probingDuration = false;
                    video.removeEventListener('timeupdate', onProbe);
                    video.removeEventListener('durationchange', onProbe);
                    video.removeEventListener('seeked', onProbeSeeked);
                    if (dur > 0) knownDuration = dur;
                    syncSeekRange();
                    const goZero = () => {
                        video.removeEventListener('seeked', goZero);
                        paintTime(0);
                        resolve(mediaDuration());
                    };
                    video.addEventListener('seeked', goZero, { once: true });
                    try {
                        video.currentTime = 0;
                    } catch (_) {
                        paintTime(0);
                        resolve(mediaDuration());
                    }
                };

                const onProbe = () => {
                    const d = readNativeDuration();
                    if (d > 0) finish(d);
                };

                const onProbeSeeked = () => onProbe();

                video.addEventListener('timeupdate', onProbe);
                video.addEventListener('durationchange', onProbe);
                video.addEventListener('seeked', onProbeSeeked);
                try {
                    // Classic Chrome trick: seek far past EOF to force duration.
                    video.currentTime = 1e101;
                } catch (_) {
                    finish(readNativeDuration());
                    return;
                }
                setTimeout(() => finish(readNativeDuration()), 2500);
            });
        }

        function paintTime(t) {
            const dur = syncSeekRange();
            displayTime = t;
            const clamped = dur > 0 ? clamp(t, 0, dur) : Math.max(0, t);
            const cur = MediaUtils.formatDuration(clamped, true);
            const total = dur > 0 ? MediaUtils.formatDuration(dur, true) : '––:––.–––';
            if (timeCur) timeCur.textContent = cur;
            if (timeDur) timeDur.textContent = total;
            if (timeEl) timeEl.textContent = `${cur} / ${total}`;
            const pct = dur > 0 ? (clamped / dur) * 100 : 0;
            if (scrubRoot) scrubRoot.style.setProperty('--frm-progress', `${pct}%`);
            if (!syncingSeek && seek && !scrubbing && dur > 0) {
                syncingSeek = true;
                seek.value = String(clamped);
                syncingSeek = false;
            }
            if (timeInput && document.activeElement !== timeInput) {
                timeInput.value = (Math.round(clamped * 1000) / 1000).toFixed(3);
            }
        }

        function syncTimeLabels() {
            if (scrubbing || probingDuration) return;
            paintTime(video.currentTime || 0);
        }

        function seekTo(t, { fromScrub } = {}) {
            const dur = syncSeekRange();
            if (!dur) return;
            const target = clamp(t, 0, dur);
            paintTime(target);
            video.pause();
            const wait = new Promise((resolve) => {
                const done = () => {
                    video.removeEventListener('seeked', done);
                    paintTime(video.currentTime || target);
                    resolve(video.currentTime);
                };
                video.addEventListener('seeked', done, { once: true });
            });
            pendingSeek = wait;
            try {
                video.currentTime = target;
            } catch (_) {
                pendingSeek = null;
            }
            if (!fromScrub) scrubbing = false;
            return wait;
        }

        function step(direction) {
            const dur = syncSeekRange();
            if (!dur) return;
            const base = scrubbing ? displayTime : (video.currentTime || 0);
            seekTo(base + direction * stepSec());
        }

        async function waitReadyFrame() {
            if (pendingSeek) {
                try { await pendingSeek; } catch (_) { /* ignore */ }
                pendingSeek = null;
            }
            // One rAF so the decoded frame matches currentTime after seek.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        }

        function targetSize() {
            const vw = video.videoWidth || 0;
            const vh = video.videoHeight || 0;
            if (!vw || !vh) return { w: 0, h: 0 };
            let maxW = vw;
            if (state.scale === '1080') maxW = 1920;
            else if (state.scale === '720') maxW = 1280;
            else if (state.scale === 'custom') maxW = clamp(Number(state.customW) || 1280, 16, 7680);
            if (maxW >= vw) return { w: vw, h: vh };
            const scale = maxW / vw;
            return { w: Math.max(1, Math.round(vw * scale)), h: Math.max(1, Math.round(vh * scale)) };
        }

        async function captureFrame() {
            if (!video.videoWidth) return null;
            video.pause();
            await waitReadyFrame();
            const { w, h } = targetSize();
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(video, 0, 0, w, h);
            const q = state.format === 'image/png' ? undefined : state.quality / 100;
            const blob = await ImageUtils.canvasToBlob(canvas, state.format, q);
            return { blob, w, h, time: video.currentTime };
        }

        function downloadName() {
            const base = (filenameInput?.value || state.filename || 'frame').replace(/\.(png|jpe?g|webp)$/i, '');
            return `${base}.${EXT_FOR[state.format] || 'png'}`;
        }

        function selectStripItem(item, { openLightbox } = {}) {
            if (!item) return;
            activeStripId = item.id;
            // Reuse strip blob in the result pane without revoking strip URL.
            if (capturedUrl && capturedUrl !== item.url && !strip.some((s) => s.url === capturedUrl)) {
                URL.revokeObjectURL(capturedUrl);
            }
            capturedBlob = item.blob;
            capturedUrl = item.url;
            capturedStamp = MediaUtils.formatDuration(item.time, true).replace(/[:.]/g, '-');
            resultImg.src = item.url;
            resultImg.classList.remove('hidden');
            resultEmpty?.classList.add('hidden');
            setResultActions(true);
            if (resultMeta) {
                const dim = item.w && item.h ? `${item.w}×${item.h} · ` : '';
                resultMeta.textContent = `${dim}${MediaUtils.formatDuration(item.time, true)} · ${ImageUtils.formatFileSize(item.blob.size)}`;
            }
            renderStrip();
            if (openLightbox && window.ImageLightbox) {
                ImageLightbox.openImage(item.url, item.name);
            }
        }

        function renderStrip() {
            if (!stripEl) return;
            stripEl.innerHTML = '';
            const has = strip.length > 0;
            if (stripCount) stripCount.textContent = String(strip.length);
            if (zipBtn) zipBtn.disabled = !has;
            if (clearStripBtn) clearStripBtn.disabled = !has;
            if (!has) {
                const empty = document.createElement('div');
                empty.className = 'frm-film-empty';
                empty.innerHTML = '<span>截取的帧会出现在这里</span><span>最多 24 张 · 刷新后清空</span>';
                stripEl.appendChild(empty);
                return;
            }
            strip.forEach((item) => {
                const card = document.createElement('div');
                card.className = 'frm-film-item' + (item.id === activeStripId ? ' is-active' : '');
                card.setAttribute('role', 'listitem');
                card.tabIndex = 0;

                const img = document.createElement('img');
                img.className = 'frm-film-thumb';
                img.src = item.url;
                img.alt = item.name;
                img.draggable = false;

                const overlay = document.createElement('div');
                overlay.className = 'frm-film-overlay';
                const dl = document.createElement('button');
                dl.type = 'button';
                dl.textContent = '下载';
                dl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    ImageUtils.downloadBlob(item.blob, item.name);
                });
                const del = document.createElement('button');
                del.type = 'button';
                del.textContent = '删除';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeStrip(item.id);
                });
                overlay.append(dl, del);

                const meta = document.createElement('div');
                meta.className = 'frm-film-meta';
                const time = document.createElement('span');
                time.className = 'frm-film-time';
                time.textContent = MediaUtils.formatDuration(item.time, true);
                const name = document.createElement('span');
                name.className = 'frm-film-name';
                name.textContent = item.name;
                meta.append(time, name);

                card.append(img, overlay, meta);
                card.addEventListener('click', () => selectStripItem(item));
                card.addEventListener('dblclick', () => selectStripItem(item, { openLightbox: true }));
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectStripItem(item);
                    }
                });
                stripEl.appendChild(card);
            });
        }

        function removeStrip(id) {
            const idx = strip.findIndex((s) => s.id === id);
            if (idx < 0) return;
            const [item] = strip.splice(idx, 1);
            const wasActive = activeStripId === item.id;
            if (item.url && item.url !== capturedUrl) URL.revokeObjectURL(item.url);
            if (wasActive) {
                activeStripId = '';
                if (strip[0]) selectStripItem(strip[0]);
                else {
                    capturedBlob = null;
                    if (capturedUrl && !strip.some((s) => s.url === capturedUrl)) {
                        URL.revokeObjectURL(capturedUrl);
                    }
                    capturedUrl = '';
                    resultImg.removeAttribute('src');
                    resultImg.classList.add('hidden');
                    resultEmpty?.classList.remove('hidden');
                    setResultActions(false);
                    if (resultMeta) resultMeta.textContent = '尚未截取';
                    renderStrip();
                    return;
                }
            }
            renderStrip();
        }

        function clearStrip() {
            strip.forEach((item) => {
                if (item.url && item.url !== capturedUrl) URL.revokeObjectURL(item.url);
            });
            strip = [];
            activeStripId = '';
            renderStrip();
        }

        function addToStrip(blob, w, h, time, name) {
            const url = URL.createObjectURL(blob);
            const item = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                blob,
                url,
                name: name || downloadName(),
                time,
                w,
                h
            };
            strip.unshift(item);
            activeStripId = item.id;
            while (strip.length > STRIP_MAX) {
                const old = strip.pop();
                if (old?.url && old.url !== capturedUrl && old.id !== activeStripId) {
                    URL.revokeObjectURL(old.url);
                }
            }
            renderStrip();
            // Keep newest item visible in the horizontal rail.
            const first = stripEl?.querySelector('.frm-film-item');
            first?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
        }

        // --- bindings ---
        ImageUtils.createDropZone(dropzone, {
            accept: 'video/*',
            enablePaste: false,
            onFile: (file) => {
                if (!file.type || !file.type.startsWith('video/')) return;
                if (videoUrl) URL.revokeObjectURL(videoUrl);
                videoUrl = URL.createObjectURL(file);
                fileName = file.name || 'video';
                video.src = videoUrl;
                if (status) status.textContent = '加载中…';
                const onReady = async () => {
                    work?.classList.remove('hidden');
                    dropzone.classList.add('has-file');
                    setCaptureEnabled(true);
                    scrubbing = false;
                    knownDuration = 0;
                    setScrubEnabled(false);
                    paintTime(0);
                    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
                    capturedBlob = null;
                    capturedUrl = '';
                    resultImg.removeAttribute('src');
                    resultImg.classList.add('hidden');
                    resultEmpty?.classList.remove('hidden');
                    setResultActions(false);
                    if (resultMeta) resultMeta.textContent = '尚未截取';

                    const dur = await resolveDuration();
                    const dim = video.videoWidth
                        ? ` · ${video.videoWidth}×${video.videoHeight}`
                        : '';
                    const durText = dur
                        ? MediaUtils.formatDuration(dur)
                        : '时长未知';
                    if (status) status.textContent = `${fileName} · ${durText}${dim}`;
                    paintTime(video.currentTime || 0);
                };
                video.onloadedmetadata = onReady;
                video.onerror = () => {
                    if (status) status.textContent = '视频加载失败，浏览器可能不支持该格式';
                    setCaptureEnabled(false);
                };
            }
        });

        video.addEventListener('durationchange', () => {
            // MediaRecorder WebM often flips Infinity → real duration later.
            const dur = syncSeekRange();
            if (dur && status && fileName) {
                const dim = video.videoWidth
                    ? ` · ${video.videoWidth}×${video.videoHeight}`
                    : '';
                status.textContent = `${fileName} · ${MediaUtils.formatDuration(dur)}${dim}`;
            }
            if (!scrubbing) syncTimeLabels();
        });
        video.addEventListener('timeupdate', () => {
            syncSeekRange();
            syncTimeLabels();
        });
        video.addEventListener('seeked', () => {
            scrubbing = false;
            syncSeekRange();
            syncTimeLabels();
        });

        seek?.addEventListener('pointerdown', () => { scrubbing = true; });
        seek?.addEventListener('pointerup', () => {
            scrubbing = false;
            syncTimeLabels();
        });
        seek?.addEventListener('input', () => {
            if (syncingSeek) return;
            const t = Number(seek.value) || 0;
            scrubbing = true;
            paintTime(t);
            seekTo(t, { fromScrub: true });
        });

        timeInput?.addEventListener('change', () => {
            scrubbing = false;
            seekTo(Number(timeInput.value) || 0);
        });
        timeInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                scrubbing = false;
                seekTo(Number(timeInput.value) || 0);
            }
        });

        stepRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-step]');
            if (!btn) return;
            state.stepKey = btn.dataset.step || 'frame';
            persist('mediaFrmStep', state.stepKey);
            syncStepUi();
        });

        prevBtn?.addEventListener('click', () => step(-1));
        nextBtn?.addEventListener('click', () => step(1));

        formatRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fmt]');
            if (!btn) return;
            state.format = btn.dataset.fmt || 'image/png';
            persist('mediaFrmFormat', state.format);
            syncFormatUi();
        });

        qualityInput?.addEventListener('input', () => {
            state.quality = clamp(Number(qualityInput.value) || 92, 1, 100);
            if (qualityValue) qualityValue.textContent = `${state.quality}%`;
            persist('mediaFrmQuality', state.quality);
        });

        scaleRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-scale]');
            if (!btn) return;
            state.scale = btn.dataset.scale || 'original';
            persist('mediaFrmScale', state.scale);
            syncScaleUi();
        });

        customW?.addEventListener('change', () => {
            state.customW = clamp(Number(customW.value) || 1280, 16, 7680);
            customW.value = String(state.customW);
            persist('mediaFrmCustomW', state.customW);
        });

        filenameInput?.addEventListener('input', () => {
            state.autoFilename = false;
            state.filename = filenameInput.value;
            persist('mediaFrmFilename', state.filename);
        });

        captureBtn?.addEventListener('click', async () => {
            try {
                const result = await captureFrame();
                if (!result) return;
                if (state.autoFilename && filenameInput) {
                    capturedStamp = MediaUtils.formatDuration(result.time, true).replace(/[:.]/g, '-');
                    const base = `frame-${capturedStamp}`;
                    state.filename = base;
                    filenameInput.value = base;
                }
                addToStrip(result.blob, result.w, result.h, result.time, downloadName());
                // Preview the newest strip item (shares its object URL).
                if (strip[0]) selectStripItem(strip[0]);
            } catch (e) {
                if (resultMeta) resultMeta.textContent = '截帧失败: ' + e.message;
            }
        });

        downloadBtn?.addEventListener('click', () => {
            if (!capturedBlob) return;
            ImageUtils.downloadBlob(capturedBlob, downloadName());
        });

        copyBtn?.addEventListener('click', async () => {
            if (!capturedBlob) return;
            try {
                let blob = capturedBlob;
                if (state.format !== 'image/png') {
                    // Clipboard typically wants PNG
                    const result = await (async () => {
                        const img = new Image();
                        img.src = capturedUrl;
                        await img.decode();
                        const c = document.createElement('canvas');
                        c.width = img.naturalWidth;
                        c.height = img.naturalHeight;
                        c.getContext('2d').drawImage(img, 0, 0);
                        return ImageUtils.canvasToBlob(c, 'image/png');
                    })();
                    blob = result;
                }
                if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
                    copyBtn.textContent = '不支持';
                    setTimeout(() => { copyBtn.textContent = '复制图片'; }, 1200);
                    return;
                }
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                const prev = copyBtn.textContent;
                copyBtn.textContent = '已复制';
                setTimeout(() => { copyBtn.textContent = prev; }, 1200);
            } catch (_) {
                copyBtn.textContent = '复制失败';
                setTimeout(() => { copyBtn.textContent = '复制图片'; }, 1200);
            }
        });

        zipBtn?.addEventListener('click', async () => {
            if (!strip.length || typeof ZipWriter === 'undefined') return;
            try {
                const entries = strip.map((s) => ({ name: s.name, blob: s.blob }));
                const zip = await ZipWriter.build(entries);
                ImageUtils.downloadBlob(zip, 'frames.zip');
            } catch (e) {
                if (resultMeta) resultMeta.textContent = '打包失败: ' + e.message;
            }
        });

        clearStripBtn?.addEventListener('click', clearStrip);

        resultImg?.addEventListener('click', () => {
            if (capturedUrl && window.ImageLightbox) ImageLightbox.openImage(capturedUrl, '截帧结果');
        });

        panel.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (!video.duration) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                step(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                step(1);
            }
        });

        async function loadSettings() {
            if (typeof Settings === 'undefined') return;
            try {
                const s = await Settings.load();
                if (s.mediaFrmStep && STEP_MAP[s.mediaFrmStep] != null) state.stepKey = s.mediaFrmStep;
                if (s.mediaFrmFormat && EXT_FOR[s.mediaFrmFormat]) state.format = s.mediaFrmFormat;
                if (Number.isFinite(s.mediaFrmQuality)) state.quality = clamp(s.mediaFrmQuality, 1, 100);
                if (s.mediaFrmScale) state.scale = s.mediaFrmScale;
                if (Number.isFinite(s.mediaFrmCustomW)) state.customW = clamp(s.mediaFrmCustomW, 16, 7680);
                if (typeof s.mediaFrmFilename === 'string' && s.mediaFrmFilename) {
                    state.filename = s.mediaFrmFilename;
                    state.autoFilename = false;
                }
            } catch (_) { /* ignore */ }
        }

        setCaptureEnabled(false);
        setResultActions(false);
        loadSettings().then(() => {
            syncFormFromState();
            renderStrip();
        });
    }

    DevKit.MediaTools.frame = { init: initFrame };
})();
