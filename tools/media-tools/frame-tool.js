// Media Tools - Video Frame Capture
// Load a video into a player, step frame-by-frame (1/30s), and grab the
// current frame to a PNG via canvas.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const FRAME_STEP = 1 / 30;

    function initFrame() {
        const dropzone = document.getElementById('mediaFrameDropzone');
        if (!dropzone) return;
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');
        const work = document.getElementById('mediaFrameWork');
        const video = document.getElementById('mediaFrameVideo');
        const prevBtn = document.getElementById('mediaFramePrevBtn');
        const nextBtn = document.getElementById('mediaFrameNextBtn');
        const timeEl = document.getElementById('mediaFrameTime');
        const captureBtn = document.getElementById('mediaFrameCaptureBtn');
        const downloadBtn = document.getElementById('mediaFrameDownloadBtn');
        const resultImg = document.getElementById('mediaFrameResult');

        let videoUrl = '';
        let capturedBlob = null;
        let capturedUrl = '';

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
                    resultImg.classList.add('hidden');
                    downloadBtn.disabled = true;
                    capturedBlob = null;
                };
                video.onerror = () => {
                    hintSub.textContent = '视频加载失败，浏览器可能不支持该格式';
                };
            }
        });

        function syncTime() {
            timeEl.textContent = MediaUtils.formatDuration(video.currentTime, true);
        }
        video.addEventListener('timeupdate', syncTime);
        video.addEventListener('seeked', syncTime);

        function step(direction) {
            if (!video.duration) return;
            video.pause();
            const next = video.currentTime + direction * FRAME_STEP;
            video.currentTime = Math.max(0, Math.min(video.duration, next));
        }
        prevBtn.addEventListener('click', () => step(-1));
        nextBtn.addEventListener('click', () => step(1));

        captureBtn.addEventListener('click', async () => {
            if (!video.videoWidth) return;
            video.pause();
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            try {
                capturedBlob = await ImageUtils.canvasToBlob(canvas, 'image/png');
                if (capturedUrl) URL.revokeObjectURL(capturedUrl);
                capturedUrl = URL.createObjectURL(capturedBlob);
                resultImg.src = capturedUrl;
                resultImg.classList.remove('hidden');
                downloadBtn.disabled = false;
            } catch (e) {
                timeEl.textContent = '截帧失败: ' + e.message;
            }
        });

        downloadBtn.addEventListener('click', () => {
            if (!capturedBlob) return;
            const stamp = MediaUtils.formatDuration(video.currentTime, true).replace(/[:.]/g, '-');
            ImageUtils.downloadBlob(capturedBlob, ImageUtils.generateFilename(`frame-${stamp}`, 'png'));
        });

        resultImg.addEventListener('click', () => {
            if (capturedUrl && window.ImageLightbox) ImageLightbox.openImage(capturedUrl, '截帧结果');
        });
    }

    DevKit.MediaTools.frame = { init: initFrame };
})();
