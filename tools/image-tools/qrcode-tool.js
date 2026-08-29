// Image Tools - QR Code Generate / Scan
// Generation uses lib/qrcode.min.js (davidshimjs/qrcodejs) rendering to a canvas.
// Scanning uses lib/jsQR.min.js (cozmo/jsQR) decoding raw pixel data from canvas.getImageData().

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

    function initQrcode() {
        const textInput = document.getElementById('imgQrText');
        if (!textInput) return;
        const levelSelect = document.getElementById('imgQrLevel');
        const sizeSelect = document.getElementById('imgQrSize');
        const downloadBtn = document.getElementById('imgQrDownloadBtn');
        const canvasHolder = document.getElementById('imgQrCanvasHolder');
        const emptyHint = document.getElementById('imgQrEmptyHint');

        const scanDropzone = document.getElementById('imgQrScanDropzone');
        const scanHint = document.getElementById('imgQrScanHint');
        const scanPreview = document.getElementById('imgQrScanPreview');
        const scanResult = document.getElementById('imgQrScanResult');
        const scanCopyBtn = document.getElementById('imgQrScanCopyBtn');
        const scanStatus = document.getElementById('imgQrScanStatus');

        let qr = null;

        function correctLevel(letter) {
            const map = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
            return map[letter] || QRCode.CorrectLevel.M;
        }

        const regenerate = debounce(() => {
            const text = textInput.value.trim();
            canvasHolder.innerHTML = '';
            if (!text) {
                emptyHint.classList.remove('hidden');
                downloadBtn.disabled = true;
                return;
            }
            emptyHint.classList.add('hidden');
            const size = Number(sizeSelect.value) || 300;
            qr = new QRCode(canvasHolder, {
                text,
                width: size,
                height: size,
                correctLevel: correctLevel(levelSelect.value)
            });
            downloadBtn.disabled = false;
        }, 200);

        textInput.addEventListener('input', regenerate);
        levelSelect.addEventListener('change', regenerate);
        sizeSelect.addEventListener('change', regenerate);
        downloadBtn.disabled = true;

        downloadBtn.addEventListener('click', async () => {
            const canvas = canvasHolder.querySelector('canvas');
            if (!canvas) return;
            await ImageUtils.downloadCanvas(canvas, ImageUtils.generateFilename('qrcode', 'png'), 'image/png');
        });

        ImageUtils.createDropZone(scanDropzone, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                scanStatus.classList.remove('hidden');
                scanStatus.textContent = '识别中...';
                try {
                    const { img, dataUrl } = await ImageUtils.loadImageFile(file);
                    scanHint.classList.add('hidden');
                    scanPreview.src = dataUrl;
                    scanPreview.classList.remove('hidden');

                    const canvas = ImageUtils.drawToCanvas(img);
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const decoded = jsQR(imageData.data, imageData.width, imageData.height);
                    if (decoded && decoded.data) {
                        scanResult.value = decoded.data;
                        scanStatus.textContent = '识别成功';
                    } else {
                        scanResult.value = '';
                        scanStatus.textContent = '未识别到二维码，请尝试更清晰的图片';
                    }
                } catch (e) {
                    scanResult.value = '';
                    scanStatus.textContent = '识别失败：' + e.message;
                }
            }
        });

        scanCopyBtn.addEventListener('click', () => ImageUtils.copyText(scanResult.value, scanCopyBtn));
    }

    DevKit.ImageTools.qrcode = { init: initQrcode };
})();
