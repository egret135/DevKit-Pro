// Media Tools - Audio Waveform Trim (Layout A)
// Decode audio, drag a selection on the waveform, audition with playhead,
// export WAV / MP3 with format chips and Settings persistence.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const MIN_RANGE_SEC = 0.01;

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function initTrim() {
        const panel = document.getElementById('mediaPanelTrim');
        const dropzone = document.getElementById('mediaTrimDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('mediaTrimStatus');
        const work = $('mediaTrimWork');
        const meta = $('mediaTrimMeta');
        const waveWrap = $('mediaTrimWaveWrap');
        const waveCanvas = $('mediaTrimWave');
        const selection = $('mediaTrimSelection');
        const playhead = $('mediaTrimPlayhead');
        const rangeLabel = $('mediaTrimRangeLabel');
        const selDurEl = $('mediaTrimSelDur');
        const startInput = $('mediaTrimStart');
        const endInput = $('mediaTrimEnd');
        const setStartBtn = $('mediaTrimSetStartBtn');
        const setEndBtn = $('mediaTrimSetEndBtn');
        const playBtn = $('mediaTrimPlayBtn');
        const stopBtn = $('mediaTrimStopBtn');
        const formatRoot = $('mediaTrimFormat');
        const bitrateField = $('mediaTrimBitrateField');
        const bitrateRoot = $('mediaTrimMp3Bitrate');
        const filenameInput = $('mediaTrimFilename');
        const fileExt = $('mediaTrimFileExt');
        const estimateEl = $('mediaTrimEstimate');
        const exportMeta = $('mediaTrimExportMeta');
        const exportBtn = $('mediaTrimExportBtn');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            format: defaults.mediaAtrFormat || 'wav',
            mp3Bitrate: Number(defaults.mediaAtrMp3Bitrate) || 192,
            filename: defaults.mediaAtrFilename || 'trim'
        };

        let audioBuffer = null;
        let srcFile = null;
        let selStart = 0;
        let selEnd = 0;
        let drag = null;
        let playCtx = null;
        let playSource = null;
        let playStartedAt = 0;
        let playOffset = 0;
        let playLen = 0;
        let playheadRaf = 0;

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
            setChipGroup(formatRoot, 'fmt', state.format);
            setChipGroup(bitrateRoot, 'kbps', state.mp3Bitrate);
            bitrateField?.classList.toggle('hidden', state.format !== 'mp3');
            if (fileExt) fileExt.textContent = state.format === 'mp3' ? '.mp3' : '.wav';
            if (filenameInput && document.activeElement !== filenameInput) {
                filenameInput.value = state.filename;
            }
        }

        function drawWave() {
            if (!audioBuffer || !waveWrap?.clientWidth) return;
            const dpr = window.devicePixelRatio || 1;
            const width = waveWrap.clientWidth;
            const height = waveWrap.clientHeight;
            waveCanvas.width = width * dpr;
            waveCanvas.height = height * dpr;
            const ctx = waveCanvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, width, height);

            const data = audioBuffer.getChannelData(0);
            const samplesPerPx = Math.max(1, Math.floor(data.length / width));
            const mid = height / 2;

            ctx.strokeStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-accent').trim() || '#1F6FEB';
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            for (let x = 0; x < width; x++) {
                let min = 1;
                let max = -1;
                const base = x * samplesPerPx;
                const step = Math.max(1, Math.floor(samplesPerPx / 50));
                for (let i = 0; i < samplesPerPx; i += step) {
                    const v = data[base + i];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
                ctx.moveTo(x + 0.5, mid + min * mid * 0.92);
                ctx.lineTo(x + 0.5, mid + max * mid * 0.92);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        function syncSelection() {
            if (!audioBuffer) return;
            const duration = audioBuffer.duration;
            const gap = Math.min(MIN_RANGE_SEC, duration || MIN_RANGE_SEC);
            selStart = clamp(selStart, 0, Math.max(0, duration - gap));
            selEnd = clamp(selEnd, selStart + gap, duration);

            if (selection) {
                selection.style.left = `${(selStart / duration) * 100}%`;
                selection.style.width = `${((selEnd - selStart) / duration) * 100}%`;
            }
            if (startInput && document.activeElement !== startInput) {
                startInput.value = selStart.toFixed(2);
            }
            if (endInput && document.activeElement !== endInput) {
                endInput.value = selEnd.toFixed(2);
            }
            if (rangeLabel) {
                rangeLabel.textContent = `${MediaUtils.formatDuration(selStart, true)} – ${MediaUtils.formatDuration(selEnd, true)}`;
            }
            if (selDurEl) {
                selDurEl.textContent = `选区 ${MediaUtils.formatDuration(selEnd - selStart, true)}`;
            }
            updateEstimate();
            updateExportMeta();
        }

        function setRange(start, end) {
            selStart = start;
            selEnd = end;
            syncSelection();
        }

        function estimateBytes() {
            if (!audioBuffer) return 0;
            const span = Math.max(0, selEnd - selStart);
            if (state.format === 'mp3') {
                return Math.round((state.mp3Bitrate * 1000 / 8) * span);
            }
            return Math.round(audioBuffer.sampleRate * audioBuffer.numberOfChannels * 2 * span);
        }

        function updateEstimate() {
            if (!estimateEl) return;
            if (!audioBuffer || !srcFile) {
                estimateEl.textContent = '加载音频后显示体积预估';
                estimateEl.classList.remove('is-warn', 'is-save');
                return;
            }
            const bytes = estimateBytes();
            const span = selEnd - selStart;
            const fmt = state.format === 'mp3' ? `MP3 ${state.mp3Bitrate} kbps` : 'WAV 16-bit';
            let text = `预估约 ${ImageUtils.formatFileSize(bytes)} · ${fmt} · ${MediaUtils.formatDuration(span, true)}`;
            const fullRatio = span / audioBuffer.duration;
            const srcSliceApprox = srcFile.size * fullRatio;
            const ratio = srcSliceApprox > 0 ? 1 - bytes / srcSliceApprox : 0;
            if (ratio >= 0.08) {
                text += ` · 相对源片段约减 ${(ratio * 100).toFixed(0)}%`;
                estimateEl.classList.add('is-save');
                estimateEl.classList.remove('is-warn');
            } else if (ratio <= -0.08) {
                text += ` · 相对源片段约增 ${(-ratio * 100).toFixed(0)}%`;
                estimateEl.classList.add('is-warn');
                estimateEl.classList.remove('is-save');
            } else {
                estimateEl.classList.remove('is-warn', 'is-save');
            }
            estimateEl.textContent = text;
        }

        function updateExportMeta() {
            if (!exportMeta) return;
            if (!audioBuffer) {
                exportMeta.textContent = '尚未加载';
                return;
            }
            exportMeta.textContent = `${MediaUtils.formatDuration(selEnd - selStart, true)} · ${state.format.toUpperCase()}`;
        }

        function setExportEnabled(on) {
            if (exportBtn) exportBtn.disabled = !on;
            [setStartBtn, setEndBtn, playBtn].forEach((el) => {
                if (el) el.disabled = !on;
            });
            if (startInput) startInput.disabled = !on;
            if (endInput) endInput.disabled = !on;
        }

        function downloadName() {
            const ext = state.format === 'mp3' ? 'mp3' : 'wav';
            const base = (filenameInput?.value || state.filename || 'trim')
                .replace(/\.(wav|mp3)$/i, '');
            return `${base || 'trim'}.${ext}`;
        }

        function stopPlayheadAnim() {
            if (playheadRaf) {
                cancelAnimationFrame(playheadRaf);
                playheadRaf = 0;
            }
            playhead?.classList.add('hidden');
        }

        function paintPlayhead(t) {
            if (!audioBuffer || !playhead) return;
            const duration = audioBuffer.duration;
            const pct = duration > 0 ? (clamp(t, 0, duration) / duration) * 100 : 0;
            playhead.style.left = `${pct}%`;
            playhead.classList.remove('hidden');
        }

        function tickPlayhead() {
            if (!playCtx || !audioBuffer) return;
            const elapsed = playCtx.currentTime - playStartedAt;
            const t = playOffset + elapsed;
            if (t >= playOffset + playLen - 0.001) {
                paintPlayhead(playOffset + playLen);
                return;
            }
            paintPlayhead(t);
            playheadRaf = requestAnimationFrame(tickPlayhead);
        }

        function stopPlayback() {
            stopPlayheadAnim();
            if (playSource) {
                try { playSource.stop(); } catch (_) { /* already stopped */ }
                playSource = null;
            }
            if (playCtx) {
                try { playCtx.close(); } catch (_) { /* ignore */ }
                playCtx = null;
            }
            if (stopBtn) stopBtn.disabled = true;
            if (playBtn) playBtn.disabled = !audioBuffer;
        }

        // --- bindings ---
        ImageUtils.createDropZone(dropzone, {
            accept: 'audio/*',
            enablePaste: false,
            onFile: async (file) => {
                try {
                    stopPlayback();
                    if (status) status.textContent = '解码中…';
                    srcFile = file;
                    audioBuffer = await MediaUtils.decodeAudioFile(file);
                    selStart = 0;
                    selEnd = audioBuffer.duration;
                    work?.classList.remove('hidden');
                    dropzone.classList.add('has-file');
                    if (status) {
                        status.textContent = `${file.name || 'audio'} · ${MediaUtils.formatDuration(audioBuffer.duration, true)}`;
                    }
                    if (meta) {
                        meta.textContent = [
                            MediaUtils.formatDuration(audioBuffer.duration, true),
                            `${audioBuffer.sampleRate} Hz`,
                            `${audioBuffer.numberOfChannels} 声道`,
                            ImageUtils.formatFileSize(file.size)
                        ].join(' · ');
                    }
                    setExportEnabled(true);
                    requestAnimationFrame(() => {
                        drawWave();
                        syncSelection();
                    });
                } catch (e) {
                    if (status) status.textContent = e.message;
                    setExportEnabled(false);
                }
            }
        });

        selection?.addEventListener('mousedown', (e) => {
            if (!audioBuffer) return;
            e.preventDefault();
            const handle = e.target.closest('.media-wave-handle');
            drag = {
                type: handle ? handle.dataset.handle : 'move',
                startX: e.clientX,
                origStart: selStart,
                origEnd: selEnd
            };
        });

        document.addEventListener('mousemove', (e) => {
            if (!drag || !audioBuffer) return;
            const rect = waveWrap.getBoundingClientRect();
            const duration = audioBuffer.duration;
            const dt = ((e.clientX - drag.startX) / rect.width) * duration;
            const minLen = MIN_RANGE_SEC;

            if (drag.type === 'move') {
                const len = drag.origEnd - drag.origStart;
                selStart = clamp(drag.origStart + dt, 0, duration - len);
                selEnd = selStart + len;
            } else if (drag.type === 'start') {
                selStart = clamp(drag.origStart + dt, 0, drag.origEnd - minLen);
            } else {
                selEnd = clamp(drag.origEnd + dt, drag.origStart + minLen, duration);
            }
            syncSelection();
        });

        document.addEventListener('mouseup', () => { drag = null; });

        waveWrap?.addEventListener('mousedown', (e) => {
            if (!audioBuffer || e.target.closest('.media-wave-selection') || e.target.closest('.atr-playhead')) return;
            const rect = waveWrap.getBoundingClientRect();
            const t = clamp(
                ((e.clientX - rect.left) / rect.width) * audioBuffer.duration,
                0,
                audioBuffer.duration
            );
            if (Math.abs(t - selStart) <= Math.abs(t - selEnd)) {
                selStart = Math.min(t, selEnd - MIN_RANGE_SEC);
            } else {
                selEnd = Math.max(t, selStart + MIN_RANGE_SEC);
            }
            syncSelection();
        });

        startInput?.addEventListener('change', () => {
            if (!audioBuffer) return;
            const v = Number(startInput.value);
            if (!Number.isFinite(v)) return;
            if (v >= selEnd) setRange(Math.max(0, selEnd - MIN_RANGE_SEC), selEnd);
            else setRange(v, selEnd);
        });
        endInput?.addEventListener('change', () => {
            if (!audioBuffer) return;
            const v = Number(endInput.value);
            if (!Number.isFinite(v)) return;
            if (v <= selStart) setRange(selStart, selStart + MIN_RANGE_SEC);
            else setRange(selStart, v);
        });

        setStartBtn?.addEventListener('click', () => {
            if (!audioBuffer) return;
            setRange(0, selEnd);
        });
        setEndBtn?.addEventListener('click', () => {
            if (!audioBuffer) return;
            setRange(selStart, audioBuffer.duration);
        });

        window.addEventListener('resize', () => {
            if (audioBuffer && waveWrap?.clientWidth) drawWave();
        });

        playBtn?.addEventListener('click', async () => {
            if (!audioBuffer) return;
            stopPlayback();
            playCtx = new AudioContext();
            try {
                if (playCtx.state === 'suspended') await playCtx.resume();
            } catch (_) { /* ignore */ }
            playSource = playCtx.createBufferSource();
            playSource.buffer = audioBuffer;
            playSource.connect(playCtx.destination);
            playOffset = selStart;
            playLen = Math.max(MIN_RANGE_SEC, selEnd - selStart);
            playStartedAt = playCtx.currentTime;
            playSource.onended = () => {
                stopPlayheadAnim();
                playSource = null;
                if (playCtx) {
                    try { playCtx.close(); } catch (_) { /* ignore */ }
                    playCtx = null;
                }
                if (stopBtn) stopBtn.disabled = true;
                if (playBtn) playBtn.disabled = false;
                paintPlayhead(selEnd);
                setTimeout(() => playhead?.classList.add('hidden'), 400);
            };
            playSource.start(0, playOffset, playLen);
            if (stopBtn) stopBtn.disabled = false;
            if (playBtn) playBtn.disabled = true;
            paintPlayhead(playOffset);
            playheadRaf = requestAnimationFrame(tickPlayhead);
        });

        stopBtn?.addEventListener('click', stopPlayback);

        formatRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fmt]');
            if (!btn) return;
            state.format = btn.dataset.fmt === 'mp3' ? 'mp3' : 'wav';
            syncParamUi();
            persist('mediaAtrFormat', state.format);
            updateEstimate();
            updateExportMeta();
        });
        bitrateRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-kbps]');
            if (!btn) return;
            state.mp3Bitrate = Number(btn.dataset.kbps) || 192;
            syncParamUi();
            persist('mediaAtrMp3Bitrate', state.mp3Bitrate);
            updateEstimate();
        });
        filenameInput?.addEventListener('change', () => {
            const v = (filenameInput.value || 'trim').trim() || 'trim';
            state.filename = v.replace(/\.(wav|mp3)$/i, '');
            filenameInput.value = state.filename;
            persist('mediaAtrFilename', state.filename);
        });

        exportBtn?.addEventListener('click', () => {
            if (!audioBuffer) return;
            try {
                let blob;
                if (state.format === 'mp3') {
                    blob = MediaUtils.audioBufferToMp3Blob(
                        audioBuffer, selStart, selEnd, state.mp3Bitrate
                    );
                } else {
                    blob = MediaUtils.audioBufferToWavBlob(audioBuffer, selStart, selEnd);
                }
                ImageUtils.downloadBlob(blob, downloadName());
                if (exportMeta) {
                    exportMeta.textContent = `已导出 · ${ImageUtils.formatFileSize(blob.size)}`;
                }
            } catch (e) {
                if (exportMeta) exportMeta.textContent = e.message;
            }
        });

        syncParamUi();
        setExportEnabled(false);

        if (typeof Settings !== 'undefined') {
            Settings.load().then((s) => {
                if (!s) return;
                if (s.mediaAtrFormat === 'wav' || s.mediaAtrFormat === 'mp3') {
                    state.format = s.mediaAtrFormat;
                }
                if ([128, 192, 320].includes(Number(s.mediaAtrMp3Bitrate))) {
                    state.mp3Bitrate = Number(s.mediaAtrMp3Bitrate);
                }
                if (typeof s.mediaAtrFilename === 'string' && s.mediaAtrFilename) {
                    state.filename = s.mediaAtrFilename;
                }
                syncParamUi();
                updateEstimate();
            }).catch(() => {});
        }
    }

    DevKit.MediaTools.trim = { init: initTrim };
})();
