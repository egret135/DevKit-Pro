// Image Tools - Pixel-level Image Diff
// Draws both images onto same-size canvases (B resized to A's dimensions), then uses
// lib/pixelmatch.min.js to compute a highlighted diff overlay plus mismatch stats.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    function initDiff() {
        const dropzoneA = document.getElementById('imgDiffDropzoneA');
        if (!dropzoneA) return;
        const dropzoneB = document.getElementById('imgDiffDropzoneB');
        const hintA = document.getElementById('imgDiffHintA');
        const hintB = document.getElementById('imgDiffHintB');
        const previewA = document.getElementById('imgDiffPreviewA');
        const previewB = document.getElementById('imgDiffPreviewB');
        const threshold = document.getElementById('imgDiffThreshold');
        const thresholdValue = document.getElementById('imgDiffThresholdValue');
        const includeAA = document.getElementById('imgDiffIncludeAA');
        const runBtn = document.getElementById('imgDiffRunBtn');
        const status = document.getElementById('imgDiffStatus');
        const resultGrid = document.getElementById('imgDiffResultGrid');
        const diffCanvas = document.getElementById('imgDiffCanvas');
        const resultSize = document.getElementById('imgDiffResultSize');
        const downloadBtn = document.getElementById('imgDiffDownloadBtn');

        let imgA = null;
        let imgB = null;

        function showStatus(text) {
            status.textContent = text;
            status.classList.toggle('hidden', !text);
        }

        function checkReady() {
            runBtn.disabled = !(imgA && imgB);
        }

        ImageUtils.createDropZone(dropzoneA, {
            onFile: async (file) => {
                const { img, dataUrl } = await ImageUtils.loadImageFile(file);
                imgA = img;
                hintA.classList.add('hidden');
                previewA.src = dataUrl;
                previewA.classList.remove('hidden');
                checkReady();
            }
        });

        ImageUtils.createDropZone(dropzoneB, {
            onFile: async (file) => {
                const { img, dataUrl } = await ImageUtils.loadImageFile(file);
                imgB = img;
                hintB.classList.add('hidden');
                previewB.src = dataUrl;
                previewB.classList.remove('hidden');
                checkReady();
            }
        });

        threshold.addEventListener('input', () => {
            thresholdValue.textContent = Number(threshold.value).toFixed(2);
        });

        runBtn.addEventListener('click', () => {
            if (!imgA || !imgB) return;
            showStatus('对比中...');
            resultGrid.style.display = 'none';

            try {
                const width = imgA.naturalWidth;
                const height = imgA.naturalHeight;

                const canvasA = ImageUtils.drawToCanvas(imgA, width, height);
                const canvasB = ImageUtils.drawToCanvas(imgB, width, height);
                const ctxA = canvasA.getContext('2d');
                const ctxB = canvasB.getContext('2d');
                const dataA = ctxA.getImageData(0, 0, width, height);
                const dataB = ctxB.getImageData(0, 0, width, height);

                diffCanvas.width = width;
                diffCanvas.height = height;
                const diffCtx = diffCanvas.getContext('2d');
                const diffImageData = diffCtx.createImageData(width, height);

                const mismatch = pixelmatch(dataA.data, dataB.data, diffImageData.data, width, height, {
                    threshold: Number(threshold.value),
                    includeAA: includeAA.checked
                });

                diffCtx.putImageData(diffImageData, 0, 0);

                const totalPixels = width * height;
                const pct = totalPixels ? (mismatch / totalPixels * 100) : 0;
                resultSize.textContent = `${width}×${height}px · 不匹配像素 ${mismatch.toLocaleString()} / ${totalPixels.toLocaleString()} (${pct.toFixed(3)}%)`;
                resultGrid.style.display = 'grid';
                showStatus(mismatch === 0 ? '两张图片完全一致（B 已按 A 尺寸缩放对比）' : '对比完成（B 已按 A 尺寸缩放对比）');
            } catch (e) {
                showStatus('对比失败：' + e.message);
            }
        });

        downloadBtn.addEventListener('click', async () => {
            if (!diffCanvas.width) return;
            await ImageUtils.downloadCanvas(diffCanvas, ImageUtils.generateFilename('diff', 'png'), 'image/png');
        });
    }

    DevKit.ImageTools.diff = { init: initDiff };
})();
