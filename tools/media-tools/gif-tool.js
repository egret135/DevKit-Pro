// Media Tools - Video to GIF (Layout A)
// Drop video, pick range, encode with gif.js (local workers), download / copy.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const MAX_FRAMES = 300;
    const MAX_WIDTH = 640;
    const DEFAULT_RANGE_SEC = 5;
    const MIN_RANGE_SEC = 0.1;
    const QUALITY_MAP = { high: 5, mid: 10, low: 20 };
    const WARN_SEC = 12;

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function seekTo(video, time) {
        return new Promise((resolve, reject) => {
            const onSeeked = () => {
                cleanup();
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error('跳转失败'));
            };
            const cleanup = () => {
                video.removeEventListener('seeked', onSeeked);
                video.removeEventListener('error', onError);
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.addEventListener('error', onError, { once: true });
            try {
                video.currentTime = time;
            } catch (e) {
                cleanup();
                reject(e);
            }
        });
    }

    function initGif() {
        const panel = document.getElementById('mediaPanelGif');
        const dropzone = document.getElementById('mediaGifDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('mediaGifStatus');
        const work = $('mediaGifWork');
        const video = $('mediaGifVideo');
        const rangeRoot = $('mediaGifRange');
        const startRange = $('mediaGifStartRange');
        const endRange = $('mediaGifEndRange');
        const rangeFill = $('mediaGifRangeFill');
        const rangeLabel = $('mediaGifRangeLabel');
        const durLabel = $('mediaGifDurLabel');
        const startInput = $('mediaGifStart');
        const endInput = $('mediaGifEnd');
        const setStartBtn = $('mediaGifSetStartBtn');
        const setEndBtn = $('mediaGifSetEndBtn');
        const previewRangeBtn = $('mediaGifPreviewRangeBtn');
        const fpsRoot = $('mediaGifFps');
        const widthRoot = $('mediaGifWidth');
        const qualityRoot = $('mediaGifQuality');
        const filenameInput = $('mediaGifFilename');
        const estimateEl = $('mediaGifEstimate');
        const progressWrap = $('mediaGifProgressWrap');
        const progressBar = $('mediaGifProgressBar');
        const progressText = $('mediaGifProgressText');
        const runBtn = $('mediaGifRunBtn');
        const cancelBtn = $('mediaGifCancelBtn');
        const downloadBtn = $('mediaGifDownloadBtn');
        const copyBtn = $('mediaGifCopyBtn');
        const resultImg = $('mediaGifResult');
        const resultEmpty = $('mediaGifResultEmpty');
        const resultMeta = $('mediaGifResultMeta');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            fps: Number(defaults.mediaGifFps) || 10,
            width: defaults.mediaGifWidth || '320',
            quality: defaults.mediaGifQuality || 'mid',
            filename: defaults.mediaGifFilename || 'video'
        };

        let videoUrl = '';
        let fileName = '';
        let gifBlob = null;
        let gifUrl = '';
        let running = false;
        let cancelRequested = false;
        let activeGif = null;
        let knownDuration = 0;
        let probingDuration = false;
        let rangeStart = 0;
        let rangeEnd = DEFAULT_RANGE_SEC;
        let syncingRange = false;

        function persist(key, value) {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        }

        function setChipGroup(root, attr, value) {
            root?.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
                const on = String(btn.dataset[attr]) === String(value);
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }

        function syncParamUi() {
            setChipGroup(fpsRoot, 'fps', state.fps);
            setChipGroup(widthRoot, 'width', state.width);
            setChipGroup(qualityRoot, 'q', state.quality);
            if (filenameInput && document.activeElement !== filenameInput) {
                filenameInput.value = state.filename;
            }
        }

        function readNativeDuration() {
            const d = video.duration;
            return Number.isFinite(d) && d > 0 ? d : 0;
        }

        function mediaDuration() {
            const native = readNativeDuration();
            if (native > 0) {
                knownDuration = native;
                return native;
            }
            return knownDuration > 0 ? knownDuration : 0;
        }

        function syncRangeInputsEnabled(on) {
            [startRange, endRange, startInput, endInput].forEach((el) => {
                if (el) el.disabled = !on;
            });
            [setStartBtn, setEndBtn, previewRangeBtn, runBtn].forEach((el) => {
                if (el) el.disabled = !on || running;
            });
            if (rangeRoot) rangeRoot.classList.toggle('is-ready', on);
        }

        function syncSeekRangeMax() {
            const dur = mediaDuration();
            if (startRange) {
                startRange.max = String(dur || 0);
                startRange.step = '0.01';
            }
            if (endRange) {
                endRange.max = String(dur || 0);
                endRange.step = '0.01';
            }
            return dur;
        }

        /**
         * MediaRecorder WebM often has duration=Infinity until you seek near the end.
         */
        function resolveDuration() {
            const already = mediaDuration();
            if (already > 0) {
                syncSeekRangeMax();
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
                    syncSeekRangeMax();
                    const goZero = () => {
                        video.removeEventListener('seeked', goZero);
                        resolve(mediaDuration());
                    };
                    video.addEventListener('seeked', goZero, { once: true });
                    try {
                        video.currentTime = 0;
                    } catch (_) {
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
                    video.currentTime = 1e101;
                } catch (_) {
                    finish(readNativeDuration());
                    return;
                }
                setTimeout(() => finish(readNativeDuration()), 2500);
            });
        }

        function paintRange() {
            const dur = syncSeekRangeMax();
            const gap = Math.min(MIN_RANGE_SEC, dur > 0 ? dur : MIN_RANGE_SEC);
            if (dur > 0) {
                rangeStart = clamp(rangeStart, 0, Math.max(0, dur - gap));
                rangeEnd = clamp(rangeEnd, rangeStart + gap, dur);
            } else {
                rangeStart = Math.max(0, rangeStart);
                rangeEnd = Math.max(rangeStart + gap, rangeEnd);
            }

            syncingRange = true;
            if (startRange) startRange.value = String(rangeStart);
            if (endRange) endRange.value = String(rangeEnd);
            if (startInput && document.activeElement !== startInput) {
                startInput.value = (Math.round(rangeStart * 100) / 100).toFixed(2);
            }
            if (endInput && document.activeElement !== endInput) {
                endInput.value = (Math.round(rangeEnd * 100) / 100).toFixed(2);
            }
            syncingRange = false;

            const startPct = dur > 0 ? (rangeStart / dur) * 100 : 0;
            const endPct = dur > 0 ? (rangeEnd / dur) * 100 : 0;
            if (rangeFill) {
                rangeFill.style.left = `${startPct}%`;
                rangeFill.style.width = `${Math.max(0, endPct - startPct)}%`;
            }
            if (rangeRoot) {
                rangeRoot.style.setProperty('--gif-start', `${startPct}%`);
                rangeRoot.style.setProperty('--gif-end', `${endPct}%`);
            }
            if (rangeLabel) {
                rangeLabel.textContent = `${MediaUtils.formatDuration(rangeStart, true)} – ${MediaUtils.formatDuration(rangeEnd, true)}`;
            }
            if (durLabel) {
                durLabel.textContent = dur > 0 ? MediaUtils.formatDuration(dur, true) : '––:––.–––';
            }
            updateEstimate();
        }

        function setRange(start, end, { seekVideo } = {}) {
            rangeStart = start;
            rangeEnd = end;
            paintRange();
            if (seekVideo && mediaDuration() > 0) {
                try {
                    video.currentTime = rangeStart;
                } catch (_) { /* ignore */ }
            }
        }

        /** Snap export-range start to timeline 0 (keep end). */
        function snapRangeStartToZero() {
            if (!mediaDuration()) return;
            setRange(0, rangeEnd);
        }

        /** Snap export-range end to timeline end / video duration (keep start). */
        function snapRangeEndToDuration() {
            const dur = mediaDuration();
            if (!dur) return;
            setRange(rangeStart, dur);
        }

        function outWidth() {
            const vw = video.videoWidth || 0;
            if (state.width === 'original') {
                return vw > 0 ? Math.min(vw, MAX_WIDTH) : 320;
            }
            return Number(state.width) || 320;
        }

        function plannedFrames() {
            const fps = state.fps || 10;
            const span = Math.max(0, rangeEnd - rangeStart);
            return Math.max(1, Math.ceil(span * fps));
        }

        function updateEstimate() {
            if (!estimateEl) return;
            const dur = mediaDuration();
            if (!dur) {
                estimateEl.textContent = '加载视频后显示帧数预估';
                estimateEl.classList.remove('is-warn', 'is-cap');
                return;
            }
            const raw = plannedFrames();
            const capped = Math.min(MAX_FRAMES, raw);
            const span = rangeEnd - rangeStart;
            const w = outWidth();
            const h = video.videoHeight && video.videoWidth
                ? Math.round(w * (video.videoHeight / video.videoWidth) / 2) * 2
                : 0;
            const dim = h ? `${w}×${h}` : `${w}px 宽`;
            let text = `约 ${capped} 帧 · ${dim} · ${state.fps} fps`;
            if (raw > MAX_FRAMES) {
                text += ` · 已截断至 ${MAX_FRAMES} 帧上限`;
                estimateEl.classList.add('is-cap');
                estimateEl.classList.remove('is-warn');
            } else if (span > WARN_SEC) {
                text += ' · 区间较长，体积可能偏大';
                estimateEl.classList.add('is-warn');
                estimateEl.classList.remove('is-cap');
            } else {
                estimateEl.classList.remove('is-warn', 'is-cap');
            }
            estimateEl.textContent = text;
        }

        function setResultActions(on) {
            if (downloadBtn) downloadBtn.disabled = !on;
            if (copyBtn) copyBtn.disabled = !on;
        }

        function clearResult() {
            gifBlob = null;
            if (gifUrl) {
                URL.revokeObjectURL(gifUrl);
                gifUrl = '';
            }
            resultImg?.removeAttribute('src');
            resultImg?.classList.add('hidden');
            resultEmpty?.classList.remove('hidden');
            setResultActions(false);
            if (resultMeta) resultMeta.textContent = '尚未生成';
        }

        function setProgress(pct, text) {
            if (progressWrap) progressWrap.classList.remove('hidden');
            if (progressBar) progressBar.style.width = `${clamp(pct, 0, 100)}%`;
            if (progressText) progressText.textContent = text || '';
        }

        function hideProgress() {
            progressWrap?.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
        }

        function setRunning(on) {
            running = on;
            if (runBtn) {
                runBtn.disabled = on || !mediaDuration();
                runBtn.classList.toggle('hidden', on);
            }
            if (cancelBtn) {
                cancelBtn.classList.toggle('hidden', !on);
                cancelBtn.disabled = !on;
            }
            syncRangeInputsEnabled(!!mediaDuration() && !on);
            [setStartBtn, setEndBtn, previewRangeBtn].forEach((el) => {
                if (el) el.disabled = on || !mediaDuration();
            });
        }

        function downloadName() {
            const base = (filenameInput?.value || state.filename || 'video').replace(/\.gif$/i, '');
            return `${base || 'video'}.gif`;
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
                knownDuration = 0;
                clearResult();
                hideProgress();

                const onReady = async () => {
                    work?.classList.remove('hidden');
                    dropzone.classList.add('has-file');
                    syncRangeInputsEnabled(false);
                    const dur = await resolveDuration();
                    const dim = video.videoWidth
                        ? ` · ${video.videoWidth}×${video.videoHeight}`
                        : '';
                    const durText = dur ? MediaUtils.formatDuration(dur) : '时长未知';
                    if (status) status.textContent = `${fileName} · ${durText}${dim}`;
                    const end = dur ? Math.min(dur, DEFAULT_RANGE_SEC) : DEFAULT_RANGE_SEC;
                    setRange(0, end, { seekVideo: true });
                    syncRangeInputsEnabled(!!dur);
                    updateEstimate();
                };
                video.onloadedmetadata = onReady;
                video.onerror = () => {
                    if (status) status.textContent = '视频加载失败，浏览器可能不支持该格式';
                    syncRangeInputsEnabled(false);
                };
            }
        });

        startRange?.addEventListener('input', () => {
            if (syncingRange) return;
            const v = Number(startRange.value);
            const gap = MIN_RANGE_SEC;
            // Dragging start past end clamps start just before end (do not collapse).
            if (v >= rangeEnd) setRange(Math.max(0, rangeEnd - gap), rangeEnd);
            else setRange(v, rangeEnd);
        });
        endRange?.addEventListener('input', () => {
            if (syncingRange) return;
            const v = Number(endRange.value);
            const gap = MIN_RANGE_SEC;
            // Dragging end before start clamps end just after start (do not move start).
            if (v <= rangeStart) setRange(rangeStart, rangeStart + gap);
            else setRange(rangeStart, v);
        });

        startInput?.addEventListener('change', () => {
            const v = Number(startInput.value);
            if (!Number.isFinite(v)) return;
            const gap = MIN_RANGE_SEC;
            if (v >= rangeEnd) setRange(Math.max(0, rangeEnd - gap), rangeEnd);
            else setRange(v, rangeEnd);
        });
        endInput?.addEventListener('change', () => {
            const v = Number(endInput.value);
            if (!Number.isFinite(v)) return;
            const gap = MIN_RANGE_SEC;
            if (v <= rangeStart) setRange(rangeStart, rangeStart + gap);
            else setRange(rangeStart, v);
        });

        setStartBtn?.addEventListener('click', () => snapRangeStartToZero());
        setEndBtn?.addEventListener('click', () => snapRangeEndToDuration());

        previewRangeBtn?.addEventListener('click', async () => {
            if (!mediaDuration()) return;
            try {
                video.pause();
                await seekTo(video, rangeStart);
                video.play().catch(() => {});
                const stopAt = rangeEnd;
                const onTime = () => {
                    if (video.currentTime >= stopAt - 0.04) {
                        video.pause();
                        video.removeEventListener('timeupdate', onTime);
                    }
                };
                video.addEventListener('timeupdate', onTime);
            } catch (e) {
                if (status) status.textContent = '预览失败: ' + e.message;
            }
        });

        fpsRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fps]');
            if (!btn) return;
            state.fps = Number(btn.dataset.fps) || 10;
            syncParamUi();
            persist('mediaGifFps', state.fps);
            updateEstimate();
        });
        widthRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-width]');
            if (!btn) return;
            state.width = btn.dataset.width;
            syncParamUi();
            persist('mediaGifWidth', state.width);
            updateEstimate();
        });
        qualityRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-q]');
            if (!btn) return;
            state.quality = btn.dataset.q;
            syncParamUi();
            persist('mediaGifQuality', state.quality);
        });
        filenameInput?.addEventListener('change', () => {
            const v = (filenameInput.value || 'video').trim() || 'video';
            state.filename = v.replace(/\.gif$/i, '');
            filenameInput.value = state.filename;
            persist('mediaGifFilename', state.filename);
        });

        cancelBtn?.addEventListener('click', () => {
            if (!running) return;
            cancelRequested = true;
            try {
                activeGif?.abort();
            } catch (_) { /* ignore */ }
            if (progressText) progressText.textContent = '已取消';
        });

        runBtn?.addEventListener('click', async () => {
            if (running || !mediaDuration()) return;
            const fps = state.fps || 10;
            const start = rangeStart;
            const end = rangeEnd;
            if (end <= start) {
                if (resultMeta) resultMeta.textContent = '终点必须大于起点';
                return;
            }
            const frameCount = Math.min(MAX_FRAMES, Math.ceil((end - start) * fps));
            const width = outWidth();
            const height = Math.round(width * (video.videoHeight / video.videoWidth) / 2) * 2;
            const quality = QUALITY_MAP[state.quality] || 10;

            cancelRequested = false;
            setRunning(true);
            video.pause();
            clearResult();
            setProgress(0, `采样中 0/${frameCount} 帧…`);

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            const gif = new GIF({
                workers: 2,
                quality,
                width,
                height,
                workerScript: 'lib/gif.worker.js'
            });
            activeGif = gif;

            try {
                for (let i = 0; i < frameCount; i++) {
                    if (cancelRequested) throw new Error('已取消');
                    await seekTo(video, start + i / fps);
                    if (cancelRequested) throw new Error('已取消');
                    ctx.drawImage(video, 0, 0, width, height);
                    gif.addFrame(ctx, { copy: true, delay: Math.round(1000 / fps) });
                    const samplePct = ((i + 1) / frameCount) * 55;
                    setProgress(samplePct, `采样中 ${i + 1}/${frameCount} 帧…`);
                }

                if (cancelRequested) throw new Error('已取消');
                setProgress(55, '编码中…');

                gifBlob = await new Promise((resolve, reject) => {
                    gif.on('finished', resolve);
                    gif.on('abort', () => reject(new Error('已取消')));
                    gif.on('progress', (p) => {
                        setProgress(55 + p * 45, `编码中 ${Math.round(p * 100)}%…`);
                    });
                    gif.render();
                });

                if (gifUrl) URL.revokeObjectURL(gifUrl);
                gifUrl = URL.createObjectURL(gifBlob);
                resultImg.src = gifUrl;
                resultImg.classList.remove('hidden');
                resultEmpty?.classList.add('hidden');
                setResultActions(true);
                if (resultMeta) {
                    resultMeta.textContent = `${width}×${height} · ${frameCount} 帧 @ ${fps}fps · ${ImageUtils.formatFileSize(gifBlob.size)}`;
                }
                setProgress(100, '完成');
                setTimeout(hideProgress, 800);
            } catch (e) {
                clearResult();
                if (resultMeta) resultMeta.textContent = e.message === '已取消' ? '已取消' : ('生成失败: ' + e.message);
                hideProgress();
            } finally {
                activeGif = null;
                setRunning(false);
            }
        });

        downloadBtn?.addEventListener('click', () => {
            if (!gifBlob) return;
            ImageUtils.downloadBlob(gifBlob, downloadName());
        });

        copyBtn?.addEventListener('click', async () => {
            if (!gifBlob) return;
            try {
                // Clipboard image/* support is mostly PNG; rasterize first frame.
                const pngBlob = await new Promise((resolve, reject) => {
                    const img = new Image();
                    const url = URL.createObjectURL(gifBlob);
                    img.onload = () => {
                        const c = document.createElement('canvas');
                        c.width = img.naturalWidth;
                        c.height = img.naturalHeight;
                        c.getContext('2d').drawImage(img, 0, 0);
                        URL.revokeObjectURL(url);
                        c.toBlob((b) => (b ? resolve(b) : reject(new Error('无法转换'))), 'image/png');
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('预览加载失败'));
                    };
                    img.src = url;
                });
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                const prev = copyBtn.textContent;
                copyBtn.textContent = '已复制';
                setTimeout(() => { copyBtn.textContent = prev; }, 1200);
            } catch (e) {
                if (resultMeta) resultMeta.textContent = '复制失败: ' + e.message;
            }
        });

        resultImg?.addEventListener('click', () => {
            if (gifUrl && window.ImageLightbox) ImageLightbox.openImage(gifUrl, downloadName());
        });

        video.addEventListener('durationchange', () => {
            const d = readNativeDuration();
            if (d > 0) {
                knownDuration = d;
                paintRange();
            }
        });

        syncParamUi();
        paintRange();
        setResultActions(false);

        if (typeof Settings !== 'undefined') {
            Settings.load().then((s) => {
                if (!s) return;
                if (Number.isFinite(s.mediaGifFps) && [5, 10, 15, 20].includes(s.mediaGifFps)) {
                    state.fps = s.mediaGifFps;
                }
                if (s.mediaGifWidth && ['240', '320', '480', '640', 'original'].includes(String(s.mediaGifWidth))) {
                    state.width = String(s.mediaGifWidth);
                }
                if (s.mediaGifQuality && QUALITY_MAP[s.mediaGifQuality]) {
                    state.quality = s.mediaGifQuality;
                }
                if (typeof s.mediaGifFilename === 'string' && s.mediaGifFilename) {
                    state.filename = s.mediaGifFilename;
                }
                syncParamUi();
                updateEstimate();
            }).catch(() => {});
        }
    }

    DevKit.MediaTools.gif = { init: initGif };
})();
