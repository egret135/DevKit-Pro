// Image Tools - Shared Utilities
// Reusable helpers used by every sub-tool under the "图片工具" (Image Tools) workspace:
// drop-zone wiring, file/image loading, blob/canvas downloads, and size formatting.

const ImageUtils = {
    /**
     * Wire drag-over/drop/click-to-browse/paste-from-clipboard on a container element.
     * @param {HTMLElement} container - Element to attach the dropzone behavior to.
     * @param {Object} options
     * @param {string} [options.accept='image/*'] - Accept filter for the hidden file input.
     * @param {(file: File) => void} options.onFile - Called with the first accepted file.
     * @param {boolean} [options.enablePaste=true] - Also accept images pasted from clipboard while the container (or document) is focused.
     * @returns {{ open: () => void, destroy: () => void }}
     */
    createDropZone(container, options) {
        if (!container || typeof options?.onFile !== 'function') {
            throw new Error('createDropZone requires a container element and an onFile callback');
        }
        const accept = options.accept || 'image/*';
        const enablePaste = options.enablePaste !== false;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.style.display = 'none';
        container.appendChild(input);

        const pickFirstFile = (fileList) => {
            if (!fileList || !fileList.length) return null;
            return fileList[0];
        };

        const onDragOver = (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.add('img-dropzone-active');
        };
        const onDragLeave = (e) => {
            if (!container.contains(e.relatedTarget)) {
                container.classList.remove('img-dropzone-active');
            }
        };
        const onDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.classList.remove('img-dropzone-active');
            const file = pickFirstFile(e.dataTransfer && e.dataTransfer.files);
            if (file) options.onFile(file);
        };
        const onClick = (e) => {
            if (e.target.closest('[data-no-open]')) return;
            input.value = '';
            input.click();
        };
        const onChange = () => {
            const file = pickFirstFile(input.files);
            if (file) options.onFile(file);
        };
        const onPaste = (e) => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) {
                        options.onFile(file);
                        break;
                    }
                }
            }
        };

        container.addEventListener('dragover', onDragOver);
        container.addEventListener('dragleave', onDragLeave);
        container.addEventListener('drop', onDrop);
        container.addEventListener('click', onClick);
        input.addEventListener('change', onChange);
        if (enablePaste) {
            container.addEventListener('paste', onPaste);
            container.setAttribute('tabindex', container.getAttribute('tabindex') || '0');
        }

        return {
            open: () => input.click(),
            destroy: () => {
                container.removeEventListener('dragover', onDragOver);
                container.removeEventListener('dragleave', onDragLeave);
                container.removeEventListener('drop', onDrop);
                container.removeEventListener('click', onClick);
                if (enablePaste) container.removeEventListener('paste', onPaste);
                input.remove();
            }
        };
    },

    /**
     * Read a File as a Data URL.
     * @param {File} file
     * @returns {Promise<string>}
     */
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Read a File as an ArrayBuffer (used by EXIF/ICO-related tools).
     * @param {File} file
     * @returns {Promise<ArrayBuffer>}
     */
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Load an image File (or Data URL string) into an HTMLImageElement.
     * @param {File|string} fileOrDataUrl
     * @returns {Promise<{ img: HTMLImageElement, width: number, height: number, file: (File|null), dataUrl: string }>}
     */
    async loadImageFile(fileOrDataUrl) {
        const isFile = fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob;
        const dataUrl = isFile ? await this.readFileAsDataURL(fileOrDataUrl) : fileOrDataUrl;
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('图片加载失败，请确认文件是有效的图片'));
            image.src = dataUrl;
        });
        return {
            img,
            width: img.naturalWidth,
            height: img.naturalHeight,
            file: isFile ? fileOrDataUrl : null,
            dataUrl
        };
    },

    /**
     * Wrap canvas.toBlob in a Promise.
     * @param {HTMLCanvasElement} canvas
     * @param {string} [type='image/png']
     * @param {number} [quality]
     * @returns {Promise<Blob>}
     */
    canvasToBlob(canvas, type = 'image/png', quality) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('生成图片数据失败'));
            }, type, quality);
        });
    },

    /**
     * Trigger a browser download for a Blob.
     * @param {Blob} blob
     * @param {string} filename
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Encode a canvas to a Blob, honoring the quality parameter for PNG too.
     * canvas.toBlob ignores quality for PNG (always lossless), so lossy PNG is
     * done via UPNG.js color quantization: quality maps to palette size
     * (e.g. 75% -> 192 colors). quality >= 1 or missing keeps lossless output.
     * @param {HTMLCanvasElement} canvas
     * @param {string} [type='image/png']
     * @param {number} [quality] - 0..1
     * @returns {Promise<Blob>}
     */
    async encodeCanvas(canvas, type = 'image/png', quality) {
        const lossyPng = type === 'image/png'
            && typeof quality === 'number' && quality > 0 && quality < 1
            && typeof UPNG !== 'undefined';
        if (lossyPng) {
            const ctx = canvas.getContext('2d');
            const { width, height } = canvas;
            const rgba = ctx.getImageData(0, 0, width, height).data.buffer;
            const colorCount = Math.max(2, Math.min(256, Math.round(quality * 256)));
            const encoded = UPNG.encode([rgba], width, height, colorCount);
            return new Blob([encoded], { type: 'image/png' });
        }
        return this.canvasToBlob(canvas, type, quality);
    },

    /**
     * Encode a canvas and trigger a download in one step.
     * @param {HTMLCanvasElement} canvas
     * @param {string} filename
     * @param {string} [mimeType='image/png']
     * @param {number} [quality]
     */
    async downloadCanvas(canvas, filename, mimeType = 'image/png', quality) {
        const blob = await this.encodeCanvas(canvas, mimeType, quality);
        this.downloadBlob(blob, filename);
        return blob;
    },

    /**
     * Draw an image (optionally resized) onto a fresh canvas.
     * @param {HTMLImageElement} img
     * @param {number} [width]
     * @param {number} [height]
     * @returns {HTMLCanvasElement}
     */
    drawToCanvas(img, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width || img.naturalWidth;
        canvas.height = height || img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas;
    },

    /**
     * Human-readable file size, e.g. 1536 -> "1.5 KB".
     * @param {number} bytes
     * @returns {string}
     */
    formatFileSize(bytes) {
        if (!Number.isFinite(bytes)) return '-';
        if (bytes < 0) bytes = 0;
        if (bytes < 1024) return `${bytes} B`;
        const units = ['KB', 'MB', 'GB', 'TB'];
        let value = bytes / 1024;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
    },

    /**
     * Convert a Data URL to a Blob without going through fetch() (avoids any
     * CSP connect-src concerns inside the MV3 extension context).
     * @param {string} dataUrl
     * @returns {Blob}
     */
    dataURLToBlob(dataUrl) {
        const [header, base64 = ''] = dataUrl.split(',');
        const mimeMatch = header.match(/data:(.*?)(;base64)?$/);
        const mime = (mimeMatch && mimeMatch[1]) || 'application/octet-stream';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    },

    /**
     * Estimate the byte size of a Data URL / Base64 string's decoded payload.
     * @param {string} dataUrlOrBase64
     * @returns {number}
     */
    estimateBase64Size(dataUrlOrBase64) {
        const base64 = dataUrlOrBase64.includes(',') ? dataUrlOrBase64.split(',')[1] : dataUrlOrBase64;
        const padding = (base64.match(/=+$/) || [''])[0].length;
        return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    },

    /**
     * Derive a timestamped filename, e.g. ('image', 'png') -> 'image-20260828-153000.png'.
     * @param {string} prefix
     * @param {string} extension
     * @returns {string}
     */
    generateFilename(prefix, extension) {
        const ts = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '-');
        return `${prefix}-${ts}.${extension}`;
    },

    /**
     * Copy text to clipboard and show a brief "已复制" confirmation on the triggering button.
     * @param {string} text
     * @param {HTMLElement} [btn]
     */
    copyText(text, btn) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (!btn) return;
            const original = btn.textContent;
            btn.textContent = '已复制';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('copied');
            }, 1200);
        });
    }
};

if (typeof window !== 'undefined') {
    window.ImageUtils = ImageUtils;
}
