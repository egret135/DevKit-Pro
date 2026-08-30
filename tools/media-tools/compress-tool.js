// Media Tools - Video Compress / Transcode
// WebCodecs pipeline without any container demuxing: the source video plays
// (muted, offscreen) and every presented frame is sampled to a canvas at the
// target resolution, encoded with VideoEncoder (H.264), while the audio track
// is decoded via decodeAudioData and re-encoded with AudioEncoder (AAC).
// mp4-muxer (vendored) packages both streams into an MP4.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const KEYFRAME_INTERVAL_US = 2e6; // keyframe every 2 seconds
    const AUDIO_BITRATE = 128000;

    function even(n) {
        return Math.max(2, 2 * Math.round(n / 2));
    }

    function targetDims(srcW, srcH, resLimit) {
        if (!resLimit || srcH <= resLimit) return { width: even(srcW), height: even(srcH) };
        const scale = resLimit / srcH;
        return { width: even(srcW * scale), height: even(resLimit) };
    }

    function initCompress() {
        const dropzone = document.getElementById('mediaCompDropzone');
        if (!dropzone) return;
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');
        const work = document.getElementById('mediaCompWork');
        const previewVideo = document.getElementById('mediaCompVideo');
        const srcMeta = document.getElementById('mediaCompSrcMeta');
        const resSelect = document.getElementById('mediaCompRes');
        const bitrateSelect = document.getElementById('mediaCompBitrate');
        const keepAudioCheck = document.getElementById('mediaCompKeepAudio');
        const runBtn = document.getElementById('mediaCompRunBtn');
        const status = document.getElementById('mediaCompStatus');
        const progressWrap = document.getElementById('mediaCompProgress');
        const progressBar = document.getElementById('mediaCompProgressBar');
        const resultVideo = document.getElementById('mediaCompResultVideo');
        const resultMeta = document.getElementById('mediaCompResultMeta');
        const downloadBtn = document.getElementById('mediaCompDownloadBtn');

        let srcFile = null;
        let srcUrl = '';
        let resultBlob = null;
        let resultUrl = '';
        let running = false;

        ImageUtils.createDropZone(dropzone, {
            accept: 'video/*',
            enablePaste: false,
            onFile: (file) => {
                if (!file.type || !file.type.startsWith('video/')) return;
                srcFile = file;
                if (srcUrl) URL.revokeObjectURL(srcUrl);
                srcUrl = URL.createObjectURL(file);
                previewVideo.src = srcUrl;
                previewVideo.onloadedmetadata = () => {
                    work.classList.remove('hidden');
                    hintSub.textContent = `已加载: ${file.name} · 可再次点击更换视频`;
                    srcMeta.textContent = [
                        `${previewVideo.videoWidth} × ${previewVideo.videoHeight}`,
                        MediaUtils.formatDuration(previewVideo.duration),
                        ImageUtils.formatFileSize(file.size)
                    ].join(' · ');
                    resultVideo.classList.add('hidden');
                    resultMeta.classList.add('hidden');
                    downloadBtn.classList.add('hidden');
                    status.textContent = '';
                };
                previewVideo.onerror = () => {
                    hintSub.textContent = '视频加载失败，浏览器可能不支持该格式';
                };
            }
        });

        async function run() {
            if (running || !srcFile || !previewVideo.videoWidth) return;
            if (typeof VideoEncoder === 'undefined') {
                status.textContent = '当前浏览器不支持 WebCodecs';
                return;
            }

            running = true;
            runBtn.disabled = true;
            resultVideo.classList.add('hidden');
            resultMeta.classList.add('hidden');
            downloadBtn.classList.add('hidden');
            progressWrap.classList.remove('hidden');
            progressBar.style.width = '0%';

            // Offscreen playback element so the visible player stays usable.
            const video = document.createElement('video');
            video.src = srcUrl;
            video.muted = true;
            video.playsInline = true;

            try {
                await new Promise((resolve, reject) => {
                    video.onloadedmetadata = resolve;
                    video.onerror = () => reject(new Error('视频加载失败'));
                });

                const { width, height } = targetDims(
                    video.videoWidth, video.videoHeight, Number(resSelect.value)
                );
                const bitrate = Number(bitrateSelect.value);
                const videoConfig = {
                    codec: 'avc1.640033', // H.264 High 5.1 (covers up to 4K@30)
                    width,
                    height,
                    bitrate,
                    framerate: 30
                };
                const support = await VideoEncoder.isConfigSupported(videoConfig);
                if (!support.supported) throw new Error('当前环境不支持所选编码配置');

                const wantAudio = keepAudioCheck.checked;
                status.textContent = wantAudio ? '编码音频…' : '准备编码…';

                // Probe audio first so the muxer can be created with the right
                // track layout (mp4-muxer requires tracks declared up front).
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
                    } catch (e) {
                        audioProbe = null; // silent video, or undecodable audio
                    }
                }

                const { Muxer, ArrayBufferTarget } = Mp4Muxer;
                const muxer = new Muxer({
                    target: new ArrayBufferTarget(),
                    video: { codec: 'avc', width, height },
                    audio: audioProbe
                        ? { codec: 'aac', numberOfChannels: audioProbe.channels, sampleRate: audioProbe.sampleRate }
                        : undefined,
                    fastStart: 'in-memory'
                });

                // ---- Audio ----
                if (audioProbe) {
                    const audioEncoder = new AudioEncoder({
                        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                        error: (e) => { status.textContent = '音频编码错误: ' + e.message; }
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
                    }
                    await audioEncoder.flush();
                    audioEncoder.close();
                    audioBufferForMux = null;
                }

                // ---- Video (seek-based frame sampling) ----
                // Seek through the video at a fixed fps and sample each frame
                // to the target-size canvas. This works on a detached <video>
                // (requestVideoFrameCallback does not fire reliably for
                // elements that are never rendered) and runs as fast as the
                // decoder allows instead of at playback speed.
                let encoderError = null;
                const videoEncoder = new VideoEncoder({
                    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                    error: (e) => { encoderError = e; }
                });
                videoEncoder.configure(videoConfig);

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Make sure the first frame is actually decoded before sampling.
                if (video.readyState < 2) {
                    await new Promise((resolve, reject) => {
                        video.onloadeddata = resolve;
                        video.onerror = () => reject(new Error('视频解码失败'));
                    });
                }

                const fps = 30;
                const frameDurationUs = Math.round(1e6 / fps);
                const frameCount = Math.max(1, Math.ceil(video.duration * fps));
                let lastKeyTs = -Infinity;
                status.textContent = '编码视频…';

                for (let i = 0; i < frameCount; i++) {
                    if (encoderError) throw encoderError;

                    const t = Math.min(i / fps, Math.max(0, video.duration - 0.001));
                    if (Math.abs(video.currentTime - t) > 1e-4) {
                        await new Promise((resolve, reject) => {
                            video.onseeked = resolve;
                            video.onerror = () => reject(new Error('视频解码失败'));
                            video.currentTime = t;
                        });
                    }

                    ctx.drawImage(video, 0, 0, width, height);
                    const ts = i * frameDurationUs;
                    const frame = new VideoFrame(canvas, { timestamp: ts, duration: frameDurationUs });
                    const keyFrame = ts - lastKeyTs >= KEYFRAME_INTERVAL_US;
                    if (keyFrame) lastKeyTs = ts;
                    videoEncoder.encode(frame, { keyFrame });
                    frame.close();

                    progressBar.style.width = `${Math.min(100, ((i + 1) / frameCount) * 100)}%`;
                    status.textContent = `编码视频 ${i + 1}/${frameCount} 帧…`;

                    // Backpressure: don't let the encode queue grow unbounded.
                    if (videoEncoder.encodeQueueSize > 4) {
                        await new Promise(r => videoEncoder.addEventListener('dequeue', r, { once: true }));
                    }
                }
                if (encoderError) throw encoderError;

                status.textContent = '完成编码，封装 MP4…';
                await videoEncoder.flush();
                videoEncoder.close();
                muxer.finalize();

                resultBlob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
                if (resultUrl) URL.revokeObjectURL(resultUrl);
                resultUrl = URL.createObjectURL(resultBlob);
                resultVideo.src = resultUrl;
                resultVideo.classList.remove('hidden');

                const saved = 1 - resultBlob.size / srcFile.size;
                resultMeta.textContent = [
                    `${width} × ${height}`,
                    ImageUtils.formatFileSize(resultBlob.size),
                    saved >= 0
                        ? `体积减少 ${(saved * 100).toFixed(1)}%`
                        : `体积增加 ${(-saved * 100).toFixed(1)}%`
                ].join(' · ');
                resultMeta.classList.remove('hidden');
                downloadBtn.classList.remove('hidden');
                progressBar.style.width = '100%';
                status.textContent = '完成';
            } catch (e) {
                status.textContent = '压缩失败: ' + e.message;
            } finally {
                video.pause();
                video.removeAttribute('src');
                running = false;
                runBtn.disabled = false;
            }
        }

        runBtn.addEventListener('click', run);

        downloadBtn.addEventListener('click', () => {
            if (!resultBlob) return;
            ImageUtils.downloadBlob(resultBlob, ImageUtils.generateFilename('compressed', 'mp4'));
        });
    }

    DevKit.MediaTools.compress = { init: initCompress };
})();
