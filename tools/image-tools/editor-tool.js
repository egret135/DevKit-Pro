// Image Tools - Crop / Resize / Watermark Editor
// A single working <canvas> holds the current pixel state. Crop and resize replace it;
// watermarks are baked into it. "重置为原图" reloads the original image to start over.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const POSITION_OPTIONS = ['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'];

    function resizeCanvas(source, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function cropCanvas(source, x, y, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function cloneCanvas(source) {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext('2d').drawImage(source, 0, 0);
        return canvas;
    }

    function anchorToXY(position, containerW, containerH, boxW, boxH, margin) {
        let x, y;
        if (position.includes('left')) x = margin;
        else if (position.includes('right')) x = containerW - boxW - margin;
        else x = (containerW - boxW) / 2;

        if (position.startsWith('top')) y = margin;
        else if (position.startsWith('bottom')) y = containerH - boxH - margin;
        else y = (containerH - boxH) / 2;

        return { x, y };
    }

    function initEditor() {
        const dropzone = document.getElementById('imgEditorDropzone');
        if (!dropzone) return;
        const toolbar = document.getElementById('imgEditorToolbar');
        const controls = document.getElementById('imgEditorControls');
        const canvasWrap = document.getElementById('imgEditorCanvasWrap');
        const canvas = document.getElementById('imgEditorCanvas');
        const ctx = canvas.getContext('2d');
        const meta = document.getElementById('imgEditorMeta');
        const changeBtn = document.getElementById('imgEditorChangeBtn');
        const resetBtn = document.getElementById('imgEditorResetBtn');

        const cropOverlay = document.getElementById('imgEditorCropOverlay');
        const cropStartBtn = document.getElementById('imgEditorCropStartBtn');
        const cropApplyBtn = document.getElementById('imgEditorCropApplyBtn');
        const cropCancelBtn = document.getElementById('imgEditorCropCancelBtn');
        const cropXInput = document.getElementById('imgEditorCropX');
        const cropYInput = document.getElementById('imgEditorCropY');
        const cropWInput = document.getElementById('imgEditorCropW');
        const cropHInput = document.getElementById('imgEditorCropH');

        const resizeWInput = document.getElementById('imgEditorResizeW');
        const resizeHInput = document.getElementById('imgEditorResizeH');
        const resizeLock = document.getElementById('imgEditorResizeLock');
        const resizeApplyBtn = document.getElementById('imgEditorResizeApplyBtn');

        const wmText = document.getElementById('imgEditorWmText');
        const wmFontSize = document.getElementById('imgEditorWmFontSize');
        const wmColor = document.getElementById('imgEditorWmColor');
        const wmMode = document.getElementById('imgEditorWmMode');
        const wmAngle = document.getElementById('imgEditorWmAngle');
        const wmGap = document.getElementById('imgEditorWmGap');
        const wmTileOpts = document.getElementById('imgEditorWmTileOpts');
        const wmSingleOpts = document.getElementById('imgEditorWmSingleOpts');
        const wmPosition = document.getElementById('imgEditorWmPosition');
        const wmOpacity = document.getElementById('imgEditorWmOpacity');
        const wmOpacityValue = document.getElementById('imgEditorWmOpacityValue');
        const wmTextApplyBtn = document.getElementById('imgEditorWmTextApplyBtn');

        const wmImageDropzone = document.getElementById('imgEditorWmImageDropzone');
        const wmImagePosition = document.getElementById('imgEditorWmImagePosition');
        const wmImageScale = document.getElementById('imgEditorWmImageScale');
        const wmImageScaleValue = document.getElementById('imgEditorWmImageScaleValue');
        const wmImageOpacity = document.getElementById('imgEditorWmImageOpacity');
        const wmImageOpacityValue = document.getElementById('imgEditorWmImageOpacityValue');
        const wmImageApplyBtn = document.getElementById('imgEditorWmImageApplyBtn');

        const exportFormat = document.getElementById('imgEditorExportFormat');
        const exportQuality = document.getElementById('imgEditorExportQuality');
        const exportQualityValue = document.getElementById('imgEditorExportQualityValue');
        const downloadBtn = document.getElementById('imgEditorDownloadBtn');

        let originalCanvas = null;
        let watermarkImg = null;
        let cropRect = null;
        let cropDrag = null;
        // Snapshot of the canvas taken right before the last text watermark, so
        // re-applying replaces the previous watermark instead of stacking on it.
        // Any other operation (crop/resize/image watermark/reset) bakes the
        // watermark in and invalidates this snapshot.
        let textWmBase = null;
        // Same idea for the image watermark, which additionally stays "live"
        // after being applied: it can be dragged around on the canvas until
        // another operation bakes it in.
        let imgWmBase = null;
        let imgWmPos = null; // top-left corner in canvas pixel coords
        let imgWmDrag = null;

        function updateMeta() {
            meta.textContent = `${canvas.width} × ${canvas.height}px`;
        }

        function setWorkingCanvas(sourceCanvas) {
            canvas.width = sourceCanvas.width;
            canvas.height = sourceCanvas.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(sourceCanvas, 0, 0);
            updateMeta();
            resizeWInput.value = canvas.width;
            resizeHInput.value = canvas.height;
            textWmBase = null;
            imgWmBase = null;
            imgWmPos = null;
            cancelCrop();
        }

        function loadImage(file) {
            return ImageUtils.loadImageFile(file).then(({ img }) => {
                originalCanvas = ImageUtils.drawToCanvas(img);
                // The dropzone is only useful before the first image; after that
                // the canvas takes its place and the toolbar's 更换图片 button
                // reopens the file picker.
                dropzone.classList.add('hidden');
                canvasWrap.classList.remove('hidden');
                toolbar.classList.remove('hidden');
                controls.classList.remove('is-disabled');
                setWorkingCanvas(originalCanvas);
            });
        }

        const dropzoneControl = ImageUtils.createDropZone(dropzone, {
            onFile: (file) => { loadImage(file); }
        });

        changeBtn.addEventListener('click', () => dropzoneControl.open());

        resetBtn.addEventListener('click', () => {
            if (originalCanvas) setWorkingCanvas(originalCanvas);
        });

        // ---------------- Crop ----------------
        function displayScale() {
            return canvas.getBoundingClientRect().width / canvas.width;
        }

        function syncOverlayFromRect() {
            if (!cropRect) return;
            const scale = displayScale();
            cropOverlay.style.left = `${cropRect.x * scale}px`;
            cropOverlay.style.top = `${cropRect.y * scale}px`;
            cropOverlay.style.width = `${cropRect.w * scale}px`;
            cropOverlay.style.height = `${cropRect.h * scale}px`;
            cropXInput.value = Math.round(cropRect.x);
            cropYInput.value = Math.round(cropRect.y);
            cropWInput.value = Math.round(cropRect.w);
            cropHInput.value = Math.round(cropRect.h);
        }

        function syncRectFromInputs() {
            if (!cropRect) return;
            cropRect.x = clamp(Number(cropXInput.value) || 0, 0, canvas.width - 1);
            cropRect.y = clamp(Number(cropYInput.value) || 0, 0, canvas.height - 1);
            cropRect.w = clamp(Number(cropWInput.value) || 1, 1, canvas.width - cropRect.x);
            cropRect.h = clamp(Number(cropHInput.value) || 1, 1, canvas.height - cropRect.y);
            syncOverlayFromRect();
        }

        function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

        cropStartBtn.addEventListener('click', () => {
            cropRect = { x: canvas.width * 0.1, y: canvas.height * 0.1, w: canvas.width * 0.8, h: canvas.height * 0.8 };
            cropOverlay.classList.remove('hidden');
            cropApplyBtn.disabled = false;
            cropCancelBtn.disabled = false;
            [cropXInput, cropYInput, cropWInput, cropHInput].forEach((el) => { el.disabled = false; });
            syncOverlayFromRect();
        });

        function cancelCrop() {
            cropRect = null;
            cropOverlay.classList.add('hidden');
            cropApplyBtn.disabled = true;
            cropCancelBtn.disabled = true;
        }
        cropCancelBtn.addEventListener('click', cancelCrop);

        [cropXInput, cropYInput, cropWInput, cropHInput].forEach((el) => {
            el.addEventListener('input', syncRectFromInputs);
        });

        cropApplyBtn.addEventListener('click', () => {
            if (!cropRect) return;
            const cropped = cropCanvas(canvas, cropRect.x, cropRect.y, cropRect.w, cropRect.h);
            setWorkingCanvas(cropped);
        });

        // Drag to move / resize crop rectangle
        cropOverlay.addEventListener('mousedown', (e) => {
            if (!cropRect) return;
            const handle = e.target.closest('.img-editor-crop-handle');
            e.preventDefault();
            e.stopPropagation();
            cropDrag = {
                handle: handle ? handle.dataset.handle : 'move',
                startX: e.clientX,
                startY: e.clientY,
                rect: { ...cropRect },
                scale: displayScale()
            };
        });

        document.addEventListener('mousemove', (e) => {
            if (!cropDrag || !cropRect) return;
            const dx = (e.clientX - cropDrag.startX) / cropDrag.scale;
            const dy = (e.clientY - cropDrag.startY) / cropDrag.scale;
            const r = cropDrag.rect;

            if (cropDrag.handle === 'move') {
                cropRect.x = clamp(r.x + dx, 0, canvas.width - r.w);
                cropRect.y = clamp(r.y + dy, 0, canvas.height - r.h);
            } else {
                let { x, y, w, h } = r;
                if (cropDrag.handle.includes('n')) { y = r.y + dy; h = r.h - dy; }
                if (cropDrag.handle.includes('s')) { h = r.h + dy; }
                if (cropDrag.handle.includes('w')) { x = r.x + dx; w = r.w - dx; }
                if (cropDrag.handle.includes('e')) { w = r.w + dx; }
                if (w < 10) { w = 10; x = cropRect.x; }
                if (h < 10) { h = 10; y = cropRect.y; }
                cropRect.x = clamp(x, 0, canvas.width - 10);
                cropRect.y = clamp(y, 0, canvas.height - 10);
                cropRect.w = clamp(w, 10, canvas.width - cropRect.x);
                cropRect.h = clamp(h, 10, canvas.height - cropRect.y);
            }
            syncOverlayFromRect();
        });

        document.addEventListener('mouseup', () => { cropDrag = null; });

        // ---------------- Resize ----------------
        resizeWInput.addEventListener('input', () => {
            if (resizeLock.checked && canvas.width) {
                const w = Number(resizeWInput.value) || 1;
                resizeHInput.value = Math.round(w * (canvas.height / canvas.width));
            }
        });
        resizeHInput.addEventListener('input', () => {
            if (resizeLock.checked && canvas.height) {
                const h = Number(resizeHInput.value) || 1;
                resizeWInput.value = Math.round(h * (canvas.width / canvas.height));
            }
        });

        resizeApplyBtn.addEventListener('click', () => {
            const w = Math.max(1, Number(resizeWInput.value) || canvas.width);
            const h = Math.max(1, Number(resizeHInput.value) || canvas.height);
            const resized = resizeCanvas(canvas, w, h);
            setWorkingCanvas(resized);
        });

        // ---------------- Text Watermark ----------------
        wmOpacity.addEventListener('input', () => {
            wmOpacityValue.textContent = `${Math.round(wmOpacity.value * 100)}%`;
        });

        wmMode.addEventListener('change', () => {
            const tiled = wmMode.value === 'tile';
            wmTileOpts.classList.toggle('hidden', !tiled);
            wmSingleOpts.classList.toggle('hidden', tiled);
        });

        // Feishu-style watermark: the text repeats across the whole image in a
        // rotated, staggered (brick-like) grid at low opacity.
        function applyTiledTextWatermark(text, fontSize) {
            const angle = (Number(wmAngle.value) || 0) * Math.PI / 180;
            const gapMult = Number(wmGap.value) || 2;
            ctx.save();
            ctx.globalAlpha = Number(wmOpacity.value);
            ctx.fillStyle = wmColor.value;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const textW = ctx.measureText(text).width;
            const gapX = textW + fontSize * gapMult * 2;
            const gapY = fontSize * gapMult * 2.5;
            // Rotate around the center; iterate over the diagonal-sized square
            // so the rotated grid still covers every corner of the canvas.
            const half = Math.sqrt(canvas.width ** 2 + canvas.height ** 2) / 2;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(angle);
            let row = 0;
            for (let y = -half; y <= half; y += gapY, row++) {
                const offsetX = row % 2 ? gapX / 2 : 0;
                for (let x = -half; x <= half; x += gapX) {
                    ctx.fillText(text, x + offsetX, y);
                }
            }
            ctx.restore();
        }

        function applySingleTextWatermark(text, fontSize) {
            ctx.save();
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = wmColor.value;
            ctx.globalAlpha = Number(wmOpacity.value);
            ctx.textBaseline = 'alphabetic';
            const textW = ctx.measureText(text).width;
            const margin = Math.max(12, fontSize * 0.4);
            const { x, y } = anchorToXY(wmPosition.value, canvas.width, canvas.height, textW, fontSize, margin);
            ctx.fillText(text, x, y + fontSize * 0.8);
            ctx.restore();
        }

        wmTextApplyBtn.addEventListener('click', () => {
            const text = wmText.value.trim();
            if (!text) return;
            // Applying a text watermark bakes any live image watermark in.
            imgWmBase = null;
            imgWmPos = null;
            if (textWmBase) {
                // Re-applying: wipe the previous text watermark first.
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(textWmBase, 0, 0);
            } else {
                textWmBase = cloneCanvas(canvas);
            }
            const fontSize = Math.max(8, Number(wmFontSize.value) || 32);
            if (wmMode.value === 'tile') applyTiledTextWatermark(text, fontSize);
            else applySingleTextWatermark(text, fontSize);
        });

        // ---------------- Image Watermark ----------------
        function imgWmSize() {
            const scale = Number(wmImageScale.value);
            const w = canvas.width * scale;
            const h = w * (watermarkImg.naturalHeight / watermarkImg.naturalWidth);
            return { w, h };
        }

        // Redraws base + watermark from scratch, so moving the watermark or
        // tweaking its sliders replaces the previous render instead of stacking.
        function renderImageWm() {
            if (!imgWmBase || !imgWmPos || !watermarkImg) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgWmBase, 0, 0);
            const { w, h } = imgWmSize();
            ctx.save();
            ctx.globalAlpha = Number(wmImageOpacity.value);
            ctx.drawImage(watermarkImg, imgWmPos.x, imgWmPos.y, w, h);
            ctx.restore();
        }

        wmImageScale.addEventListener('input', () => {
            wmImageScaleValue.textContent = `${Math.round(wmImageScale.value * 100)}%`;
            renderImageWm();
        });
        wmImageOpacity.addEventListener('input', () => {
            wmImageOpacityValue.textContent = `${Math.round(wmImageOpacity.value * 100)}%`;
            renderImageWm();
        });

        ImageUtils.createDropZone(wmImageDropzone, {
            onFile: async (file) => {
                const { img } = await ImageUtils.loadImageFile(file);
                watermarkImg = img;
                wmImageApplyBtn.disabled = false;
            }
        });

        wmImageApplyBtn.addEventListener('click', () => {
            if (!watermarkImg) return;
            // Applying an image watermark bakes any replaceable text watermark in.
            textWmBase = null;
            if (!imgWmBase) imgWmBase = cloneCanvas(canvas);
            const { w, h } = imgWmSize();
            const margin = Math.max(12, canvas.width * 0.02);
            imgWmPos = anchorToXY(wmImagePosition.value, canvas.width, canvas.height, w, h, margin);
            renderImageWm();
        });

        wmImagePosition.addEventListener('change', () => {
            if (!imgWmBase || !imgWmPos) return;
            const { w, h } = imgWmSize();
            const margin = Math.max(12, canvas.width * 0.02);
            imgWmPos = anchorToXY(wmImagePosition.value, canvas.width, canvas.height, w, h, margin);
            renderImageWm();
        });

        // Drag the live watermark directly on the canvas.
        function canvasPoint(e) {
            const rect = canvas.getBoundingClientRect();
            const scale = displayScale();
            return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
        }

        function overImageWm(point) {
            if (!imgWmBase || !imgWmPos || !watermarkImg) return false;
            const { w, h } = imgWmSize();
            return point.x >= imgWmPos.x && point.x <= imgWmPos.x + w
                && point.y >= imgWmPos.y && point.y <= imgWmPos.y + h;
        }

        canvas.addEventListener('mousedown', (e) => {
            const point = canvasPoint(e);
            if (!overImageWm(point)) return;
            e.preventDefault();
            imgWmDrag = {
                startX: e.clientX,
                startY: e.clientY,
                origX: imgWmPos.x,
                origY: imgWmPos.y,
                scale: displayScale()
            };
        });

        canvas.addEventListener('mousemove', (e) => {
            if (imgWmDrag) return;
            canvas.style.cursor = overImageWm(canvasPoint(e)) ? 'move' : '';
        });

        document.addEventListener('mousemove', (e) => {
            if (!imgWmDrag || !imgWmPos) return;
            const dx = (e.clientX - imgWmDrag.startX) / imgWmDrag.scale;
            const dy = (e.clientY - imgWmDrag.startY) / imgWmDrag.scale;
            const { w, h } = imgWmSize();
            imgWmPos.x = clamp(imgWmDrag.origX + dx, Math.min(0, canvas.width - w), Math.max(0, canvas.width - w));
            imgWmPos.y = clamp(imgWmDrag.origY + dy, Math.min(0, canvas.height - h), Math.max(0, canvas.height - h));
            renderImageWm();
        });

        document.addEventListener('mouseup', () => { imgWmDrag = null; });

        // ---------------- Export ----------------
        exportQuality.addEventListener('input', () => {
            exportQualityValue.textContent = `${Math.round(exportQuality.value * 100)}%`;
        });

        downloadBtn.addEventListener('click', async () => {
            const mime = exportFormat.value;
            const quality = Number(exportQuality.value);
            const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
            await ImageUtils.downloadCanvas(canvas, ImageUtils.generateFilename('edited', ext), mime, quality);
        });
    }

    DevKit.ImageTools.editor = { init: initEditor };
})();
