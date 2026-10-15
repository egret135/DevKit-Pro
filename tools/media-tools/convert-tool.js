// Media Tools - Audio Format Conversion (Layout A)
// Decode any browser-supported audio, preview a mini waveform, re-encode
// as WAV or MP3 with chips, size estimate, progress, and Settings.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function initConvert() {
        const panel = document.getElementById('mediaPanelConvert');
        const dropzone = document.getElementById('mediaConvDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('mediaConvStatus');
        const work = $('mediaConvWork');
        const meta = $('mediaConvMeta');
        const waveWrap = $('mediaConvWaveWrap');
        const waveCanvas = $('mediaConvWave');
        const formatRoot = $('mediaConvFormat');
        const bitrateField = $('mediaConvBitrateField');
        const bitrateRoot = $('mediaConvBitrate');
        const filenameInput = $('mediaConvFilename');
        const fileExt = $('mediaConvFileExt');
        const estimateEl = $('mediaConvEstimate');
        const progressWrap = $('mediaConvProgressWrap');
        const progressBar = $('mediaConvProgressBar');
        const progressText = $('mediaConvProgressText');
        const runBtn = $('mediaConvRunBtn');
        const downloadBtn = $('mediaConvDownloadBtn');
        const resultAudio = $('mediaConvResultAudio');
        const resultEmpty = $('mediaConvResultEmpty');
        const resultMeta = $('mediaConvResultMeta');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            format: defaults.mediaAcvFormat || 'wav',
            mp3Bitrate: Number(defaults.mediaAcvMp3Bitrate) || 192,
            filename: defaults.mediaAcvFilename || 'audio'
        };

        let audioBuffer = null;
        let srcFile = null;
        let srcSize = 0;
        let resultBlob = null;
        let resultUrl = '';
        let running = false;

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
            if (!audioBuffer || !waveWrap?.clientWidth || !waveCanvas) return;
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
                ctx.moveTo(x + 0.5, mid + min * mid * 0.9);
                ctx.lineTo(x + 0.5, mid + max * mid * 0.9);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        function estimateBytes() {
            if (!audioBuffer) return 0;
            const dur = audioBuffer.duration;
            if (state.format === 'mp3') {
                return Math.round((state.mp3Bitrate * 1000 / 8) * dur);
            }
            return Math.round(audioBuffer.sampleRate * audioBuffer.numberOfChannels * 2 * dur);
        }

        function updateEstimate() {
            if (!estimateEl) return;
            if (!audioBuffer || !srcFile) {
                estimateEl.textContent = '加载音频后显示体积预估';
                estimateEl.classList.remove('is-warn', 'is-save');
                return;
            }
            const bytes = estimateBytes();
            const fmt = state.format === 'mp3' ? `MP3 ${state.mp3Bitrate} kbps` : 'WAV 16-bit';
            let text = `预估约 ${ImageUtils.formatFileSize(bytes)} · ${fmt}`;
            const ratio = srcSize > 0 ? 1 - bytes / srcSize : 0;
            if (ratio >= 0.08) {
                text += ` · 预计减少 ${(ratio * 100).toFixed(0)}%`;
                estimateEl.classList.add('is-save');
                estimateEl.classList.remove('is-warn');
            } else if (ratio <= -0.08) {
                text += ` · 预计增加 ${(-ratio * 100).toFixed(0)}%`;
                estimateEl.classList.add('is-warn');
                estimateEl.classList.remove('is-save');
            } else {
                estimateEl.classList.remove('is-warn', 'is-save');
            }
            estimateEl.textContent = text;
        }

        function setProgress(pct, text) {
            progressWrap?.classList.remove('hidden');
            if (progressBar) progressBar.style.width = `${clamp(pct, 0, 100)}%`;
            if (progressText) progressText.textContent = text || '';
        }

        function hideProgress() {
            progressWrap?.classList.add('hidden');
            if (progressBar) progressBar.style.width = '0%';
        }

        function clearResult() {
            resultBlob = null;
            if (resultUrl) {
                URL.revokeObjectURL(resultUrl);
                resultUrl = '';
            }
            resultAudio?.removeAttribute('src');
            resultAudio?.classList.add('hidden');
            resultEmpty?.classList.remove('hidden');
            if (downloadBtn) downloadBtn.disabled = true;
            if (resultMeta) resultMeta.textContent = '尚未转换';
        }

        function setRunning(on) {
            running = on;
            if (runBtn) runBtn.disabled = on || !audioBuffer;
            if (downloadBtn && !on && !resultBlob) downloadBtn.disabled = true;
        }

        function downloadName() {
            const ext = state.format === 'mp3' ? 'mp3' : 'wav';
            const base = (filenameInput?.value || state.filename || 'audio')
                .replace(/\.(wav|mp3)$/i, '');
            return `${base || 'audio'}.${ext}`;
        }

        // --- bindings ---
        ImageUtils.createDropZone(dropzone, {
            accept: 'audio/*',
            enablePaste: false,
            onFile: async (file) => {
                try {
                    if (status) status.textContent = '解码中…';
                    audioBuffer = await MediaUtils.decodeAudioFile(file);
                    srcFile = file;
                    srcSize = file.size;
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
                    clearResult();
                    hideProgress();
                    if (runBtn) runBtn.disabled = false;
                    updateEstimate();
                    requestAnimationFrame(() => drawWave());
                } catch (e) {
                    if (status) status.textContent = e.message;
                    if (runBtn) runBtn.disabled = true;
                }
            }
        });

        formatRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fmt]');
            if (!btn) return;
            state.format = btn.dataset.fmt === 'mp3' ? 'mp3' : 'wav';
            syncParamUi();
            persist('mediaAcvFormat', state.format);
            updateEstimate();
        });
        bitrateRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-kbps]');
            if (!btn) return;
            state.mp3Bitrate = Number(btn.dataset.kbps) || 192;
            syncParamUi();
            persist('mediaAcvMp3Bitrate', state.mp3Bitrate);
            updateEstimate();
        });
        filenameInput?.addEventListener('change', () => {
            const v = (filenameInput.value || 'audio').trim() || 'audio';
            state.filename = v.replace(/\.(wav|mp3)$/i, '');
            filenameInput.value = state.filename;
            persist('mediaAcvFilename', state.filename);
        });

        window.addEventListener('resize', () => {
            if (audioBuffer && waveWrap?.clientWidth) drawWave();
        });

        runBtn?.addEventListener('click', async () => {
            if (running || !audioBuffer) return;
            setRunning(true);
            clearResult();
            setProgress(0, '转换中…');
            await new Promise((r) => setTimeout(r, 30));

            try {
                if (state.format === 'mp3') {
                    resultBlob = await MediaUtils.audioBufferToMp3BlobAsync(
                        audioBuffer,
                        0,
                        audioBuffer.duration,
                        state.mp3Bitrate,
                        (p) => setProgress(p * 100, `编码 MP3 ${Math.round(p * 100)}%…`)
                    );
                } else {
                    setProgress(40, '编码 WAV…');
                    await new Promise((r) => setTimeout(r, 0));
                    resultBlob = MediaUtils.audioBufferToWavBlob(audioBuffer);
                    setProgress(100, '完成');
                }

                if (resultUrl) URL.revokeObjectURL(resultUrl);
                resultUrl = URL.createObjectURL(resultBlob);
                resultAudio.src = resultUrl;
                resultAudio.classList.remove('hidden');
                resultEmpty?.classList.add('hidden');
                if (downloadBtn) downloadBtn.disabled = false;

                const delta = srcSize > 0 ? 1 - resultBlob.size / srcSize : 0;
                const deltaText = srcSize > 0
                    ? (delta >= 0
                        ? `体积减少 ${(delta * 100).toFixed(1)}%`
                        : `体积增加 ${(-delta * 100).toFixed(1)}%`)
                    : '';
                if (resultMeta) {
                    resultMeta.textContent = [
                        state.format.toUpperCase(),
                        ImageUtils.formatFileSize(resultBlob.size),
                        deltaText
                    ].filter(Boolean).join(' · ');
                }
                setProgress(100, '完成');
                setTimeout(hideProgress, 800);
            } catch (e) {
                clearResult();
                if (resultMeta) resultMeta.textContent = '转换失败: ' + e.message;
                hideProgress();
            } finally {
                setRunning(false);
            }
        });

        downloadBtn?.addEventListener('click', () => {
            if (!resultBlob) return;
            ImageUtils.downloadBlob(resultBlob, downloadName());
        });

        syncParamUi();
        clearResult();
        setRunning(false);

        if (typeof Settings !== 'undefined') {
            Settings.load().then((s) => {
                if (!s) return;
                if (s.mediaAcvFormat === 'wav' || s.mediaAcvFormat === 'mp3') {
                    state.format = s.mediaAcvFormat;
                }
                if ([128, 192, 320].includes(Number(s.mediaAcvMp3Bitrate))) {
                    state.mp3Bitrate = Number(s.mediaAcvMp3Bitrate);
                }
                if (typeof s.mediaAcvFilename === 'string' && s.mediaAcvFilename) {
                    state.filename = s.mediaAcvFilename;
                }
                syncParamUi();
                updateEstimate();
            }).catch(() => {});
        }
    }

    DevKit.MediaTools.convert = { init: initConvert };
})();
