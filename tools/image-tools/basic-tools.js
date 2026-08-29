// Image Tools - Basic Tools
// Four self-contained sub-tools that need no external library:
// Base64 codec, format conversion, compression, and placeholder generation.
// All rely on utils/image-utils.js (ImageUtils) for shared dropzone/canvas/download helpers.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    function extFromMime(mime) {
        const map = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp' };
        return map[mime] || 'png';
    }

    // Shown in before/after preview cards until a real image is available,
    // so the browser never renders its broken-image icon.
    const PREVIEW_PLACEHOLDER = 'assets/preview-placeholder.png';

    // ==================== Base64 Codec ====================

    function initBase64() {
        const dropzone = document.getElementById('imgBase64Dropzone');
        if (!dropzone) return;
        const hint = document.getElementById('imgBase64Hint');
        const preview = document.getElementById('imgBase64Preview');
        const meta = document.getElementById('imgBase64Meta');
        const output = document.getElementById('imgBase64Output');
        const copyDataUrlBtn = document.getElementById('imgBase64CopyDataUrlBtn');
        const copyRawBtn = document.getElementById('imgBase64CopyRawBtn');
        const downloadBtn = document.getElementById('imgBase64DownloadBtn');
        const input = document.getElementById('imgBase64Input');
        const decodeBtn = document.getElementById('imgBase64DecodeBtn');
        const decodedDownloadBtn = document.getElementById('imgBase64DecodedDownloadBtn');
        const decodedPreview = document.getElementById('imgBase64DecodedPreview');
        const decodeStatus = document.getElementById('imgBase64DecodeStatus');

        let currentFile = null;
        let currentDataUrl = '';
        let decodedDataUrl = '';

        ImageUtils.createDropZone(dropzone, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                try {
                    const { dataUrl, width, height } = await ImageUtils.loadImageFile(file);
                    currentFile = file;
                    currentDataUrl = dataUrl;
                    hint.classList.add('hidden');
                    preview.src = dataUrl;
                    preview.classList.remove('hidden');
                    output.value = dataUrl;
                    meta.textContent = `${width} × ${height} · ${file.type} · ${ImageUtils.formatFileSize(file.size)}`;
                    meta.classList.remove('hidden');
                } catch (e) {
                    meta.textContent = e.message;
                    meta.classList.remove('hidden');
                }
            }
        });

        copyDataUrlBtn.addEventListener('click', () => ImageUtils.copyText(currentDataUrl, copyDataUrlBtn));
        copyRawBtn.addEventListener('click', () => {
            const raw = currentDataUrl.includes(',') ? currentDataUrl.split(',')[1] : currentDataUrl;
            ImageUtils.copyText(raw, copyRawBtn);
        });
        downloadBtn.addEventListener('click', () => {
            if (!currentDataUrl) return;
            const blob = ImageUtils.dataURLToBlob(currentDataUrl);
            ImageUtils.downloadBlob(blob, ImageUtils.generateFilename('image', extFromMime(blob.type)));
        });

        decodeBtn.addEventListener('click', async () => {
            const raw = input.value.trim();
            decodeStatus.classList.remove('hidden');
            if (!raw) {
                decodeStatus.textContent = '请输入 Base64 或 Data URI';
                return;
            }
            const dataUrl = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw.replace(/\s+/g, '')}`;
            try {
                const { width, height } = await ImageUtils.loadImageFile(dataUrl);
                decodedDataUrl = dataUrl;
                decodedPreview.src = dataUrl;
                decodedPreview.classList.remove('hidden');
                decodedDownloadBtn.classList.remove('hidden');
                decodeStatus.textContent = `解码成功 · ${width} × ${height}`;
            } catch (e) {
                decodedDataUrl = '';
                decodeStatus.textContent = '解码失败：' + e.message;
                decodedPreview.classList.add('hidden');
                decodedDownloadBtn.classList.add('hidden');
            }
        });

        decodedDownloadBtn.addEventListener('click', () => {
            if (!decodedDataUrl) return;
            const blob = ImageUtils.dataURLToBlob(decodedDataUrl);
            ImageUtils.downloadBlob(blob, ImageUtils.generateFilename('decoded', extFromMime(blob.type)));
        });

        decodedPreview.addEventListener('click', () => {
            if (decodedDataUrl && window.ImageLightbox) ImageLightbox.openImage(decodedDataUrl, '解码预览');
        });
    }

    // ==================== Format Conversion ====================

    function initConvert() {
        const dropzone = document.getElementById('imgConvertDropzone');
        if (!dropzone) return;
        const hint = document.getElementById('imgConvertHint');
        const dropzonePreview = document.getElementById('imgConvertPreview');
        const formatSelect = document.getElementById('imgConvertFormat');
        const qualityInput = document.getElementById('imgConvertQuality');
        const qualityValue = document.getElementById('imgConvertQualityValue');
        const convertBtn = document.getElementById('imgConvertBtn');
        const downloadBtn = document.getElementById('imgConvertDownloadBtn');
        const beforeImg = document.getElementById('imgConvertBeforeImg');
        const beforeSize = document.getElementById('imgConvertBeforeSize');
        const afterImg = document.getElementById('imgConvertAfterImg');
        const afterSize = document.getElementById('imgConvertAfterSize');

        let loaded = null; // { img, width, height, file, dataUrl }
        let convertedBlob = null;

        ImageUtils.createDropZone(dropzone, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                try {
                    loaded = await ImageUtils.loadImageFile(file);
                    hint.classList.add('hidden');
                    dropzonePreview.src = loaded.dataUrl;
                    dropzonePreview.classList.remove('hidden');
                    beforeImg.src = loaded.dataUrl;
                    beforeSize.textContent = `${loaded.width} × ${loaded.height} · ${ImageUtils.formatFileSize(file.size)}`;
                    afterImg.src = PREVIEW_PLACEHOLDER;
                    afterSize.textContent = '-';
                    convertedBlob = null;
                    convertBtn.disabled = false;
                    downloadBtn.disabled = true;
                } catch (e) {
                    beforeSize.textContent = e.message;
                }
            }
        });

        qualityInput.addEventListener('input', () => {
            qualityValue.textContent = `${qualityInput.value}%`;
        });

        convertBtn.addEventListener('click', async () => {
            if (!loaded) return;
            const format = formatSelect.value;
            const quality = Number(qualityInput.value) / 100;
            const canvas = ImageUtils.drawToCanvas(loaded.img);
            try {
                convertedBlob = await ImageUtils.encodeCanvas(canvas, format, quality);
                const url = URL.createObjectURL(convertedBlob);
                afterImg.src = url;
                afterSize.textContent = `${loaded.width} × ${loaded.height} · ${ImageUtils.formatFileSize(convertedBlob.size)}`;
                downloadBtn.disabled = false;
            } catch (e) {
                afterSize.textContent = '转换失败：' + e.message;
            }
        });

        downloadBtn.addEventListener('click', () => {
            if (!convertedBlob) return;
            ImageUtils.downloadBlob(convertedBlob, ImageUtils.generateFilename('converted', extFromMime(convertedBlob.type)));
        });

        afterImg.addEventListener('click', () => {
            if (convertedBlob && window.ImageLightbox) ImageLightbox.openImage(afterImg.src, '转换结果');
        });
    }

    // ==================== Compression ====================

    function initCompress() {
        const dropzone = document.getElementById('imgCompressDropzone');
        if (!dropzone) return;
        const hint = document.getElementById('imgCompressHint');
        const dropzonePreview = document.getElementById('imgCompressPreview');
        const formatSelect = document.getElementById('imgCompressFormat');
        const qualityInput = document.getElementById('imgCompressQuality');
        const qualityValue = document.getElementById('imgCompressQualityValue');
        const downloadBtn = document.getElementById('imgCompressDownloadBtn');
        const beforeImg = document.getElementById('imgCompressBeforeImg');
        const beforeSize = document.getElementById('imgCompressBeforeSize');
        const afterImg = document.getElementById('imgCompressAfterImg');
        const afterSize = document.getElementById('imgCompressAfterSize');
        const ratio = document.getElementById('imgCompressRatio');

        let loaded = null;
        let compressedBlob = null;

        const recompress = debounce(async () => {
            if (!loaded) return;
            const format = formatSelect.value;
            const quality = Number(qualityInput.value) / 100;
            const canvas = ImageUtils.drawToCanvas(loaded.img);
            try {
                compressedBlob = await ImageUtils.encodeCanvas(canvas, format, quality);
                const url = URL.createObjectURL(compressedBlob);
                afterImg.src = url;
                afterSize.textContent = `${loaded.width} × ${loaded.height} · ${ImageUtils.formatFileSize(compressedBlob.size)}`;
                downloadBtn.disabled = false;

                const originalSize = loaded.file ? loaded.file.size : 0;
                if (originalSize > 0) {
                    const saved = 1 - compressedBlob.size / originalSize;
                    ratio.classList.remove('hidden');
                    ratio.textContent = saved >= 0
                        ? `体积减少 ${(saved * 100).toFixed(1)}%`
                        : `体积增加 ${(-saved * 100).toFixed(1)}%`;
                }
            } catch (e) {
                afterSize.textContent = '压缩失败：' + e.message;
            }
        }, 150);

        ImageUtils.createDropZone(dropzone, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                try {
                    loaded = await ImageUtils.loadImageFile(file);
                    hint.classList.add('hidden');
                    dropzonePreview.src = loaded.dataUrl;
                    dropzonePreview.classList.remove('hidden');
                    beforeImg.src = loaded.dataUrl;
                    beforeSize.textContent = `${loaded.width} × ${loaded.height} · ${ImageUtils.formatFileSize(file.size)}`;
                    ratio.classList.add('hidden');
                    recompress();
                } catch (e) {
                    beforeSize.textContent = e.message;
                }
            }
        });

        formatSelect.addEventListener('change', recompress);
        qualityInput.addEventListener('input', () => {
            qualityValue.textContent = `${qualityInput.value}%`;
            recompress();
        });

        downloadBtn.addEventListener('click', () => {
            if (!compressedBlob) return;
            ImageUtils.downloadBlob(compressedBlob, ImageUtils.generateFilename('compressed', extFromMime(compressedBlob.type)));
        });

        afterImg.addEventListener('click', () => {
            if (compressedBlob && window.ImageLightbox) ImageLightbox.openImage(afterImg.src, '压缩结果');
        });
    }

    // ==================== Placeholder Generator ====================

    function initPlaceholder() {
        const canvas = document.getElementById('imgPlaceholderCanvas');
        if (!canvas) return;
        const widthInput = document.getElementById('imgPlaceholderWidth');
        const heightInput = document.getElementById('imgPlaceholderHeight');
        const bgInput = document.getElementById('imgPlaceholderBg');
        const fgInput = document.getElementById('imgPlaceholderFg');
        const textInput = document.getElementById('imgPlaceholderText');
        const downloadBtn = document.getElementById('imgPlaceholderDownloadBtn');
        const ctx = canvas.getContext('2d');

        function clampSize(value) {
            const n = Math.round(Number(value));
            if (!Number.isFinite(n) || n <= 0) return 1;
            return Math.min(n, 4096);
        }

        function draw() {
            const width = clampSize(widthInput.value || 1);
            const height = clampSize(heightInput.value || 1);
            canvas.width = width;
            canvas.height = height;

            ctx.fillStyle = bgInput.value;
            ctx.fillRect(0, 0, width, height);

            const label = textInput.value.trim() || `${width} × ${height}`;
            ctx.fillStyle = fgInput.value;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const fontSize = Math.max(12, Math.min(width, height) / 8);
            ctx.font = `600 ${fontSize}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
            ctx.fillText(label, width / 2, height / 2, width * 0.9);
        }

        [widthInput, heightInput, bgInput, fgInput, textInput].forEach(el => {
            el.addEventListener('input', draw);
        });

        downloadBtn.addEventListener('click', async () => {
            const width = clampSize(widthInput.value || 1);
            const height = clampSize(heightInput.value || 1);
            await ImageUtils.downloadCanvas(canvas, ImageUtils.generateFilename(`placeholder-${width}x${height}`, 'png'), 'image/png');
        });

        draw();
    }

    DevKit.ImageTools.base64 = { init: initBase64 };
    DevKit.ImageTools.convert = { init: initConvert };
    DevKit.ImageTools.compress = { init: initCompress };
    DevKit.ImageTools.placeholder = { init: initPlaceholder };
})();
