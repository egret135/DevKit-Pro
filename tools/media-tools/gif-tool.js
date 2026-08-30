// Media Tools - Video to GIF
// Seeks through the chosen time range frame by frame, samples each frame to a
// canvas, and encodes the stack with gif.js (worker-based, vendored locally).

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const MAX_FRAMES = 300; // 30s @ 10fps - guards against runaway encodes

    function seekTo(video, time) {
        return new Promise((resolve) => {
            video.addEventListener('seeked', resolve, { once: true });
            video.currentTime = time;
        });
    }

    function initGif() {
        const dropzone = document.getElementById('mediaGifDropzone');
        if (!dropzone) return;
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');
        const work = document.getElementById('mediaGifWork');
        const video = document.getElementById('mediaGifVideo');
        const startInput = document.getElementById('mediaGifStart');
        const endInput = document.getElementById('mediaGifEnd');
        const fpsSelect = document.getElementById('mediaGifFps');
        const widthSelect = document.getElementById('mediaGifWidth');
        const runBtn = document.getElementById('mediaGifRunBtn');
        const status = document.getElementById('mediaGifStatus');
        const resultImg = document.getElementById('mediaGifResult');
        const meta = document.getElementById('mediaGifMeta');
        const downloadBtn = document.getElementById('mediaGifDownloadBtn');

        let videoUrl = '';
        let gifBlob = null;
        let gifUrl = '';
        let running = false;

        ImageUtils.createDropZone(dropzone, {
            accept: 'video/*',
            enablePaste: false,
            onFile: (file) => {
                if (!file.type || !file.type.startsWith('video/')) return;
                if (videoUrl) URL.revokeObjectURL(videoUrl);
                videoUrl = URL.createObjectURL(file);
                video.src = videoUrl;
                video.onloadedmetadata = () => {
                    work.classList.remove('hidden');
                    hintSub.textContent = `已加载: ${file.name} · ${MediaUtils.formatDuration(video.duration)} · 可再次点击更换视频`;
                    startInput.value = '0';
                    endInput.value = Math.min(video.duration, 5).toFixed(1);
                    resultImg.classList.add('hidden');
                    meta.classList.add('hidden');
                    downloadBtn.classList.add('hidden');
                    gifBlob = null;
                    status.textContent = '';
                };
                video.onerror = () => {
                    hintSub.textContent = '视频加载失败，浏览器可能不支持该格式';
                };
            }
        });

        runBtn.addEventListener('click', async () => {
            if (running || !video.duration) return;
            const fps = Number(fpsSelect.value);
            const start = Math.max(0, Number(startInput.value) || 0);
            const end = Math.min(video.duration, Number(endInput.value) || video.duration);
            if (end <= start) {
                status.textContent = '终点必须大于起点';
                return;
            }
            const frameCount = Math.min(MAX_FRAMES, Math.ceil((end - start) * fps));
            const outWidth = Number(widthSelect.value);
            const outHeight = Math.round(outWidth * (video.videoHeight / video.videoWidth) / 2) * 2;

            running = true;
            runBtn.disabled = true;
            video.pause();
            resultImg.classList.add('hidden');
            meta.classList.add('hidden');
            downloadBtn.classList.add('hidden');

            const canvas = document.createElement('canvas');
            canvas.width = outWidth;
            canvas.height = outHeight;
            const ctx = canvas.getContext('2d');

            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: outWidth,
                height: outHeight,
                workerScript: 'lib/gif.worker.js'
            });

            try {
                for (let i = 0; i < frameCount; i++) {
                    await seekTo(video, start + i / fps);
                    ctx.drawImage(video, 0, 0, outWidth, outHeight);
                    gif.addFrame(ctx, { copy: true, delay: Math.round(1000 / fps) });
                    status.textContent = `采样中 ${i + 1}/${frameCount} 帧…`;
                }

                status.textContent = '编码中…';
                gifBlob = await new Promise((resolve, reject) => {
                    gif.on('finished', resolve);
                    gif.on('abort', () => reject(new Error('编码被中止')));
                    gif.on('progress', (p) => {
                        status.textContent = `编码中 ${Math.round(p * 100)}%…`;
                    });
                    gif.render();
                });

                if (gifUrl) URL.revokeObjectURL(gifUrl);
                gifUrl = URL.createObjectURL(gifBlob);
                resultImg.src = gifUrl;
                resultImg.classList.remove('hidden');
                meta.textContent = `${outWidth} × ${outHeight} · ${frameCount} 帧 @ ${fps}fps · ${ImageUtils.formatFileSize(gifBlob.size)}`;
                meta.classList.remove('hidden');
                downloadBtn.classList.remove('hidden');
                status.textContent = '完成';
            } catch (e) {
                status.textContent = '生成失败: ' + e.message;
            } finally {
                running = false;
                runBtn.disabled = false;
            }
        });

        downloadBtn.addEventListener('click', () => {
            if (!gifBlob) return;
            ImageUtils.downloadBlob(gifBlob, ImageUtils.generateFilename('video', 'gif'));
        });

        resultImg.addEventListener('click', () => {
            if (gifUrl && window.ImageLightbox) ImageLightbox.openImage(gifUrl, 'GIF 预览');
        });
    }

    DevKit.MediaTools.gif = { init: initGif };
})();
