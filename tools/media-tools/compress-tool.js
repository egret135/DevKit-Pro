// Media Tools - Video Compress / Transcode (Layout A)
// WebCodecs pipeline: seek-sample frames to canvas, VideoEncoder (H.264),
// optional AudioEncoder (AAC), mux with vendored mp4-muxer.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const KEYFRAME_INTERVAL_US = 2e6;
    const AUDIO_BITRATE = 128000;
    const BITRATE_MAP = {
        high: 8000000,
        mid: 4000000,
        low: 2000000,
        min: 1000000
    };

    function even(n) {
        return Math.max(2, 2 * Math.round(n / 2));
    }

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function targetDims(srcW, srcH, resLimit) {
        if (!resLimit || srcH <= resLimit) return { width: even(srcW), height: even(srcH) };
        const scale = resLimit / srcH;
        return { width: even(srcW * scale), height: even(resLimit) };
    }

    function initCompress() {
        const panel = document.getElementById('mediaPanelCompress');
        const dropzone = document.getElementById('mediaCompDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('mediaCompStatus');
        const work = $('mediaCompWork');
        const previewVideo = $('mediaCompVideo');
        const srcMeta = $('mediaCompSrcMeta');
        const resRoot = $('mediaCompRes');
        const bitrateRoot = $('mediaCompBitrate');
        const fpsRoot = $('mediaCompFps');
        const audioRoot = $('mediaCompKeepAudio');
        const filenameInput = $('mediaCompFilename');
        const estimateEl = $('mediaCompEstimate');
        const progressWrap = $('mediaCompProgressWrap');
        const progressBar = $('mediaCompProgressBar');
        const progressText = $('mediaCompProgressText');
        const runBtn = $('mediaCompRunBtn');
        const cancelBtn = $('mediaCompCancelBtn');
        const downloadBtn = $('mediaCompDownloadBtn');
        const resultVideo = $('mediaCompResultVideo');
        const resultEmpty = $('mediaCompResultEmpty');
        const resultMeta = $('mediaCompResultMeta');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            res: String(defaults.mediaMcpRes ?? '0'),
            bitrate: defaults.mediaMcpBitrate || 'mid',
            fps: Number(defaults.mediaMcpFps) || 30,
            keepAudio: defaults.mediaMcpKeepAudio !== false,
            filename: defaults.mediaMcpFilename || 'compressed'
        };

        let srcFile = null;
        let srcUrl = '';
        let fileName = '';
        let resultBlob = null;
        let resultUrl = '';
        let running = false;
        let cancelRequested = false;
        let knownDuration = 0;
        let probingDuration = false;
        let activeVideoEncoder = null;

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
            setChipGroup(resRoot, 'res', state.res);
            setChipGroup(bitrateRoot, 'br', state.bitrate);
            setChipGroup(fpsRoot, 'fps', state.fps);
            setChipGroup(audioRoot, 'audio', state.keepAudio ? '1' : '0');
            if (filenameInput && document.activeElement !== filenameInput) {
                filenameInput.value = state.filename;
            }
        }

        function readNativeDuration() {
            const d = previewVideo.duration;
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

        function resolveDuration() {
            const already = mediaDuration();
            if (already > 0) return Promise.resolve(already);
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
                    previewVideo.removeEventListener('timeupdate', onProbe);
                    previewVideo.removeEventListener('durationchange', onProbe);
                    previewVideo.removeEventListener('seeked', onProbeSeeked);
                    if (dur > 0) knownDuration = dur;
                    const goZero = () => {
                        previewVideo.removeEventListener('seeked', goZero);
                        resolve(mediaDuration());
                    };
                    previewVideo.addEventListener('seeked', goZero, { once: true });
                    try {
                        previewVideo.currentTime = 0;
                    } catch (_) {
                        resolve(mediaDuration());
                    }
                };

                const onProbe = () => {
                    const d = readNativeDuration();
                    if (d > 0) finish(d);
                };
                const onProbeSeeked = () => onProbe();

                previewVideo.addEventListener('timeupdate', onProbe);
                previewVideo.addEventListener('durationchange', onProbe);
                previewVideo.addEventListener('seeked', onProbeSeeked);
                try {
                    previewVideo.currentTime = 1e101;
                } catch (_) {
                    finish(readNativeDuration());
                    return;
                }
                setTimeout(() => finish(readNativeDuration()), 2500);
            });
        }

        function videoBitrate() {
            return BITRATE_MAP[state.bitrate] || BITRATE_MAP.mid;
        }

        function outDims() {
            const vw = previewVideo.videoWidth || 0;
            const vh = previewVideo.videoHeight || 0;
            if (!vw || !vh) return { width: 0, height: 0 };
            return targetDims(vw, vh, Number(state.res) || 0);
        }

        function updateEstimate() {
            if (!estimateEl) return;
            const dur = mediaDuration();
            if (!dur || !srcFile) {
                estimateEl.textContent = '加载视频后显示体积预估';
                estimateEl.classList.remove('is-warn', 'is-save');
                return;
            }
            const { width, height } = outDims();
            const vBit = videoBitrate();
            const aBit = state.keepAudio ? AUDIO_BITRATE : 0;
            const estBytes = Math.round(((vBit + aBit) / 8) * dur);
            const dim = width && height ? `${width}×${height}` : '—';
            const mbps = (vBit / 1e6).toFixed(vBit >= 1e6 ? 0 : 1);
            let text = `预估约 ${ImageUtils.formatFileSize(estBytes)} · ${dim} · ${mbps} Mbps · ${state.fps} fps`;
            const ratio = 1 - estBytes / srcFile.size;
            if (ratio >= 0.05) {
                text += ` · 预计减少 ${(ratio * 100).toFixed(0)}%`;
                estimateEl.classList.add('is-save');
                estimateEl.classList.remove('is-warn');
            } else if (ratio <= -0.05) {
                text += ` · 预计增加 ${(-ratio * 100).toFixed(0)}%`;
                estimateEl.classList.add('is-warn');
                estimateEl.classList.remove('is-save');
            } else {
                estimateEl.classList.remove('is-warn', 'is-save');
            }
            estimateEl.textContent = text;
        }

        function paintSrcMeta() {
            if (!srcMeta || !srcFile) return;
            const dur = mediaDuration();
            const dim = previewVideo.videoWidth
                ? `${previewVideo.videoWidth}×${previewVideo.videoHeight}`
                : '—';
            const durText = dur ? MediaUtils.formatDuration(dur) : '时长未知';
            srcMeta.textContent = `${dim} · ${durText} · ${ImageUtils.formatFileSize(srcFile.size)}`;
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
            resultVideo?.removeAttribute('src');
            resultVideo?.classList.add('hidden');
            resultEmpty?.classList.remove('hidden');
            if (downloadBtn) downloadBtn.disabled = true;
            if (resultMeta) resultMeta.textContent = '尚未压缩';
        }

        function setRunning(on) {
            running = on;
            if (runBtn) {
                runBtn.disabled = on || !srcFile || !previewVideo.videoWidth;
                runBtn.classList.toggle('hidden', on);
            }
            if (cancelBtn) {
                cancelBtn.classList.toggle('hidden', !on);
                cancelBtn.disabled = !on;
            }
            if (downloadBtn && !on && !resultBlob) downloadBtn.disabled = true;
        }

        function downloadName() {
            const base = (filenameInput?.value || state.filename || 'compressed').replace(/\.mp4$/i, '');
            return `${base || 'compressed'}.mp4`;
        }

        // --- bindings ---
        ImageUtils.createDropZone(dropzone, {
            accept: 'video/*',
            enablePaste: false,
            onFile: (file) => {
                if (!file.type || !file.type.startsWith('video/')) return;
                srcFile = file;
                fileName = file.name || 'video';
                if (srcUrl) URL.revokeObjectURL(srcUrl);
                srcUrl = URL.createObjectURL(file);
                previewVideo.src = srcUrl;
                knownDuration = 0;
                clearResult();
                hideProgress();
                if (status) status.textContent = '加载中…';

                const onReady = async () => {
                    work?.classList.remove('hidden');
                    dropzone.classList.add('has-file');
                    const dur = await resolveDuration();
                    const dim = previewVideo.videoWidth
                        ? ` · ${previewVideo.videoWidth}×${previewVideo.videoHeight}`
                        : '';
                    const durText = dur ? MediaUtils.formatDuration(dur) : '时长未知';
                    if (status) status.textContent = `${fileName} · ${durText}${dim}`;
                    paintSrcMeta();
                    updateEstimate();
                    if (runBtn) runBtn.disabled = !previewVideo.videoWidth;
                };
                previewVideo.onloadedmetadata = onReady;
                previewVideo.onerror = () => {
                    if (status) status.textContent = '视频加载失败，浏览器可能不支持该格式';
                    if (runBtn) runBtn.disabled = true;
                };
            }
        });

        resRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-res]');
            if (!btn) return;
            state.res = String(btn.dataset.res);
            syncParamUi();
            persist('mediaMcpRes', state.res);
            updateEstimate();
        });
        bitrateRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-br]');
            if (!btn) return;
            state.bitrate = btn.dataset.br;
            syncParamUi();
            persist('mediaMcpBitrate', state.bitrate);
            updateEstimate();
        });
        fpsRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fps]');
            if (!btn) return;
            state.fps = Number(btn.dataset.fps) || 30;
            syncParamUi();
            persist('mediaMcpFps', state.fps);
            updateEstimate();
        });
        audioRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-audio]');
            if (!btn) return;
            state.keepAudio = btn.dataset.audio === '1';
            syncParamUi();
            persist('mediaMcpKeepAudio', state.keepAudio);
            updateEstimate();
        });
        filenameInput?.addEventListener('change', () => {
            const v = (filenameInput.value || 'compressed').trim() || 'compressed';
            state.filename = v.replace(/\.mp4$/i, '');
            filenameInput.value = state.filename;
            persist('mediaMcpFilename', state.filename);
        });

        cancelBtn?.addEventListener('click', () => {
            if (!running) return;
            cancelRequested = true;
            if (progressText) progressText.textContent = '正在取消…';
            try {
                activeVideoEncoder?.close();
            } catch (_) { /* ignore */ }
        });

        async function run() {
            if (running || !srcFile || !previewVideo.videoWidth) return;
            if (typeof VideoEncoder === 'undefined') {
                if (resultMeta) resultMeta.textContent = '当前浏览器不支持 WebCodecs';
                return;
            }

            cancelRequested = false;
            setRunning(true);
            clearResult();
            setProgress(0, '准备编码…');

            const video = document.createElement('video');
            video.src = srcUrl;
            video.muted = true;
            video.playsInline = true;

            try {
                await new Promise((resolve, reject) => {
                    video.onloadedmetadata = resolve;
                    video.onerror = () => reject(new Error('视频加载失败'));
                });

                let dur = Number.isFinite(video.duration) && video.duration > 0
                    ? video.duration
                    : mediaDuration();
                if (!dur || !Number.isFinite(dur)) {
                    // Fallback probe on the workhorse element.
                    try {
                        video.currentTime = 1e101;
                        await new Promise((r) => setTimeout(r, 400));
                        if (Number.isFinite(video.duration) && video.duration > 0) {
                            dur = video.duration;
                            knownDuration = dur;
                        }
                        video.currentTime = 0;
                        await new Promise((r) => {
                            video.onseeked = r;
                            setTimeout(r, 300);
                        });
                    } catch (_) { /* ignore */ }
                }
                if (!dur || !Number.isFinite(dur)) throw new Error('无法读取视频时长');

                const { width, height } = targetDims(
                    video.videoWidth, video.videoHeight, Number(state.res) || 0
                );
                const bitrate = videoBitrate();
                const fps = state.fps || 30;
                const videoConfig = {
                    codec: 'avc1.640033',
                    width,
                    height,
                    bitrate,
                    framerate: fps
                };
                const support = await VideoEncoder.isConfigSupported(videoConfig);
                if (!support.supported) throw new Error('当前环境不支持所选编码配置');
                if (cancelRequested) throw new Error('已取消');

                const wantAudio = state.keepAudio;
                setProgress(2, wantAudio ? '编码音频…' : '准备编码…');

                let audioProbe = null;
                let audioBufferForMux = null;
                if (wantAudio) {
                    try {
                        audioBufferForMux = await MediaUtils.decodeAudioFile(srcFile);
                        if (audioBufferForMux && audioBufferForMux.length) {
                            audioProbe = {
                                channels: Math.min(2, audioBufferForMux.numberOfChannels),
                                sampleRate: audioBufferForMux.sampleRate
                            };
                        }
                    } catch (_) {
                        audioProbe = null;
                    }
                }
                if (cancelRequested) throw new Error('已取消');

                const { Muxer, ArrayBufferTarget } = Mp4Muxer;
                const muxer = new Muxer({
                    target: new ArrayBufferTarget(),
                    video: { codec: 'avc', width, height },
                    audio: audioProbe
                        ? {
                            codec: 'aac',
                            numberOfChannels: audioProbe.channels,
                            sampleRate: audioProbe.sampleRate
                        }
                        : undefined,
                    fastStart: 'in-memory'
                });

                if (audioProbe) {
                    const audioEncoder = new AudioEncoder({
                        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                        error: (e) => {
                            if (progressText) progressText.textContent = '音频编码错误: ' + e.message;
                        }
                    });
                    audioEncoder.configure({
                        codec: 'mp4a.40.2',
                        sampleRate: audioProbe.sampleRate,
                        numberOfChannels: audioProbe.channels,
                        bitrate: AUDIO_BITRATE
                    });
                    const channelData = [];
                    for (let ch = 0; ch < audioProbe.channels; ch++) {
                        channelData.push(audioBufferForMux.getChannelData(ch));
                    }
                    const chunkFrames = audioProbe.sampleRate;
                    for (let offset = 0; offset < audioBufferForMux.length; offset += chunkFrames) {
                        if (cancelRequested) {
                            try { audioEncoder.close(); } catch (_) { /* ignore */ }
                            throw new Error('已取消');
                        }
                        const frames = Math.min(chunkFrames, audioBufferForMux.length - offset);
                        const data = new Float32Array(frames * audioProbe.channels);
                        for (let ch = 0; ch < audioProbe.channels; ch++) {
                            data.set(channelData[ch].subarray(offset, offset + frames), ch * frames);
                        }
                        const audioData = new AudioData({
                            format: 'f32-planar',
                            sampleRate: audioProbe.sampleRate,
                            numberOfFrames: frames,
                            numberOfChannels: audioProbe.channels,
                            timestamp: Math.round((offset / audioProbe.sampleRate) * 1e6),
                            data
                        });
                        audioEncoder.encode(audioData);
                        audioData.close();
                        const aPct = (offset / audioBufferForMux.length) * 12;
                        setProgress(2 + aPct, '编码音频…');
                    }
                    await audioEncoder.flush();
                    audioEncoder.close();
                    audioBufferForMux = null;
                }

                if (cancelRequested) throw new Error('已取消');

                let encoderError = null;
                const videoEncoder = new VideoEncoder({
                    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                    error: (e) => { encoderError = e; }
                });
                videoEncoder.configure(videoConfig);
                activeVideoEncoder = videoEncoder;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                if (video.readyState < 2) {
                    await new Promise((resolve, reject) => {
                        video.onloadeddata = resolve;
                        video.onerror = () => reject(new Error('视频解码失败'));
                    });
                }

                const frameDurationUs = Math.round(1e6 / fps);
                const frameCount = Math.max(1, Math.ceil(dur * fps));
                let lastKeyTs = -Infinity;
                setProgress(15, `编码视频 0/${frameCount} 帧…`);

                for (let i = 0; i < frameCount; i++) {
                    if (cancelRequested) throw new Error('已取消');
                    if (encoderError) throw encoderError;

                    const t = Math.min(i / fps, Math.max(0, dur - 0.001));
                    if (Math.abs(video.currentTime - t) > 1e-4) {
                        await new Promise((resolve, reject) => {
                            video.onseeked = resolve;
                            video.onerror = () => reject(new Error('视频解码失败'));
                            video.currentTime = t;
                        });
                    }
                    if (cancelRequested) throw new Error('已取消');

                    ctx.drawImage(video, 0, 0, width, height);
                    const ts = i * frameDurationUs;
                    const frame = new VideoFrame(canvas, { timestamp: ts, duration: frameDurationUs });
                    const keyFrame = ts - lastKeyTs >= KEYFRAME_INTERVAL_US;
                    if (keyFrame) lastKeyTs = ts;
                    try {
                        videoEncoder.encode(frame, { keyFrame });
                    } finally {
                        frame.close();
                    }

                    const pct = 15 + ((i + 1) / frameCount) * 80;
                    setProgress(pct, `编码视频 ${i + 1}/${frameCount} 帧…`);

                    if (videoEncoder.encodeQueueSize > 4) {
                        await new Promise((r) => videoEncoder.addEventListener('dequeue', r, { once: true }));
                    }
                }
                if (encoderError) throw encoderError;
                if (cancelRequested) throw new Error('已取消');

                setProgress(96, '完成编码，封装 MP4…');
                await videoEncoder.flush();
                videoEncoder.close();
                activeVideoEncoder = null;
                muxer.finalize();

                resultBlob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
                if (resultUrl) URL.revokeObjectURL(resultUrl);
                resultUrl = URL.createObjectURL(resultBlob);
                resultVideo.src = resultUrl;
                resultVideo.classList.remove('hidden');
                resultEmpty?.classList.add('hidden');
                if (downloadBtn) downloadBtn.disabled = false;

                const saved = 1 - resultBlob.size / srcFile.size;
                if (resultMeta) {
                    resultMeta.textContent = [
                        `${width}×${height}`,
                        ImageUtils.formatFileSize(resultBlob.size),
                        saved >= 0
                            ? `体积减少 ${(saved * 100).toFixed(1)}%`
                            : `体积增加 ${(-saved * 100).toFixed(1)}%`
                    ].join(' · ');
                }
                setProgress(100, '完成');
                setTimeout(hideProgress, 800);
            } catch (e) {
                clearResult();
                if (resultMeta) {
                    resultMeta.textContent = (cancelRequested || e.message === '已取消')
                        ? '已取消'
                        : ('压缩失败: ' + e.message);
                }
                hideProgress();
            } finally {
                activeVideoEncoder = null;
                video.pause();
                video.removeAttribute('src');
                setRunning(false);
            }
        }

        runBtn?.addEventListener('click', () => { run(); });

        downloadBtn?.addEventListener('click', () => {
            if (!resultBlob) return;
            ImageUtils.downloadBlob(resultBlob, downloadName());
        });

        previewVideo.addEventListener('durationchange', () => {
            const d = readNativeDuration();
            if (d > 0) {
                knownDuration = d;
                paintSrcMeta();
                updateEstimate();
            }
        });

        syncParamUi();
        clearResult();
        setRunning(false);

        if (typeof Settings !== 'undefined') {
            Settings.load().then((s) => {
                if (!s) return;
                if (s.mediaMcpRes != null && ['0', '1080', '720', '480'].includes(String(s.mediaMcpRes))) {
                    state.res = String(s.mediaMcpRes);
                }
                if (s.mediaMcpBitrate && BITRATE_MAP[s.mediaMcpBitrate]) {
                    state.bitrate = s.mediaMcpBitrate;
                }
                if ([24, 30].includes(Number(s.mediaMcpFps))) {
                    state.fps = Number(s.mediaMcpFps);
                }
                if (typeof s.mediaMcpKeepAudio === 'boolean') {
                    state.keepAudio = s.mediaMcpKeepAudio;
                }
                if (typeof s.mediaMcpFilename === 'string' && s.mediaMcpFilename) {
                    state.filename = s.mediaMcpFilename;
                }
                syncParamUi();
                updateEstimate();
            }).catch(() => {});
        }
    }

    DevKit.MediaTools.compress = { init: initCompress };
})();
