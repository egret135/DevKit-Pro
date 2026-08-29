// Image Tools - EXIF Viewer / Cleaner
// Reads EXIF metadata via lib/exif.min.js (exif-js). "Strip metadata" re-encodes the
// image through a <canvas>, which only carries pixel data forward and naturally drops EXIF.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const FRIENDLY_LABELS = {
        Make: '相机厂商',
        Model: '相机型号',
        Software: '处理软件',
        DateTimeOriginal: '拍摄时间',
        DateTimeDigitized: '数字化时间',
        DateTime: '修改时间',
        ExposureTime: '曝光时间',
        FNumber: '光圈值',
        ISOSpeedRatings: 'ISO 感光度',
        FocalLength: '焦距',
        FocalLengthIn35mmFilm: '35mm 等效焦距',
        Flash: '闪光灯',
        WhiteBalance: '白平衡',
        ExposureProgram: '曝光模式',
        MeteringMode: '测光模式',
        Orientation: '方向',
        PixelXDimension: '有效宽度',
        PixelYDimension: '有效高度',
        LensModel: '镜头型号',
        GPSLatitude: 'GPS 纬度',
        GPSLongitude: 'GPS 经度',
        GPSAltitude: 'GPS 海拔',
        ImageDescription: '图片描述',
        Artist: '作者',
        Copyright: '版权'
    };

    const SKIP_TAGS = new Set(['thumbnail', 'MakerNote', 'UserComment']);

    function isRational(v) {
        return v instanceof Number && 'numerator' in v && 'denominator' in v;
    }

    function formatValue(tag, value) {
        if (value === undefined || value === null) return '';
        if (isRational(value)) {
            if (tag === 'ExposureTime') {
                return value.denominator ? `1/${Math.round(value.denominator / value.numerator)} s` : `${Number(value)} s`;
            }
            if (tag === 'FNumber') return `f/${Number(value).toFixed(1)}`;
            if (tag === 'FocalLength') return `${Number(value).toFixed(1)} mm`;
            return `${Number(value).toFixed(4)} (${value.numerator}/${value.denominator})`;
        }
        if (Array.isArray(value)) {
            if (value.every((v) => isRational(v))) {
                return value.map((v) => Number(v).toFixed(4)).join(', ');
            }
            return value.join(', ');
        }
        if (typeof value === 'object') {
            try { return JSON.stringify(value); } catch (e) { return String(value); }
        }
        return String(value);
    }

    function dmsToDecimal(dms, ref) {
        if (!Array.isArray(dms) || dms.length < 3) return null;
        const [d, m, s] = dms.map((v) => Number(v));
        let decimal = d + m / 60 + s / 3600;
        if (ref === 'S' || ref === 'W') decimal = -decimal;
        return decimal;
    }

    function buildRows(tags) {
        const rows = [];

        const lat = dmsToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
        const lon = dmsToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);
        if (lat != null && lon != null) {
            rows.push(['GPS 坐标', `${lat.toFixed(6)}, ${lon.toFixed(6)}`]);
        }

        const priorityKeys = Object.keys(FRIENDLY_LABELS).filter((k) => k in tags && !['GPSLatitude', 'GPSLongitude'].includes(k));
        const otherKeys = Object.keys(tags).filter((k) => !priorityKeys.includes(k) && !SKIP_TAGS.has(k)
            && !['GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef'].includes(k));

        priorityKeys.forEach((key) => {
            rows.push([FRIENDLY_LABELS[key] || key, formatValue(key, tags[key])]);
        });
        otherKeys.forEach((key) => {
            const formatted = formatValue(key, tags[key]);
            if (formatted) rows.push([key, formatted]);
        });

        return rows;
    }

    function initExif() {
        const dropzone = document.getElementById('imgExifDropzone');
        if (!dropzone) return;
        const hint = document.getElementById('imgExifHint');
        const preview = document.getElementById('imgExifPreview');
        const meta = document.getElementById('imgExifMeta');
        const stripBtn = document.getElementById('imgExifStripBtn');
        const status = document.getElementById('imgExifStatus');
        const emptyHint = document.getElementById('imgExifEmptyHint');
        const table = document.getElementById('imgExifTable');
        const tableBody = document.getElementById('imgExifTableBody');

        let currentImg = null;
        let currentFile = null;

        function showStatus(text) {
            status.textContent = text;
            status.classList.toggle('hidden', !text);
        }

        ImageUtils.createDropZone(dropzone, {
            onFile: async (file) => {
                showStatus('');
                stripBtn.classList.add('hidden');
                tableBody.innerHTML = '';
                table.classList.add('hidden');
                emptyHint.classList.remove('hidden');
                emptyHint.textContent = '正在读取 EXIF 信息...';

                try {
                    const { img, dataUrl, width, height } = await ImageUtils.loadImageFile(file);
                    currentImg = img;
                    currentFile = file;
                    hint.classList.add('hidden');
                    preview.src = dataUrl;
                    preview.classList.remove('hidden');
                    meta.classList.remove('hidden');
                    meta.textContent = `${file.name || '图片'} · ${width}×${height} · ${ImageUtils.formatFileSize(file.size || 0)}`;
                    stripBtn.classList.remove('hidden');

                    EXIF.getData(img, function () {
                        const tags = EXIF.getAllTags(this);
                        const rows = buildRows(tags);
                        if (!rows.length) {
                            emptyHint.textContent = '未在该图片中找到 EXIF 元数据（可能已被清除，或该图片非相机直出的 JPEG）';
                            emptyHint.classList.remove('hidden');
                            table.classList.add('hidden');
                            return;
                        }
                        emptyHint.classList.add('hidden');
                        tableBody.innerHTML = rows.map(([label, value]) =>
                            `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
                        ).join('');
                        table.classList.remove('hidden');
                    });
                } catch (e) {
                    showStatus('读取失败：' + e.message);
                }
            }
        });

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        stripBtn.addEventListener('click', async () => {
            if (!currentImg) return;
            try {
                const canvas = ImageUtils.drawToCanvas(currentImg);
                const mime = (currentFile && currentFile.type === 'image/png') ? 'image/png' : 'image/jpeg';
                const ext = mime === 'image/png' ? 'png' : 'jpg';
                await ImageUtils.downloadCanvas(canvas, ImageUtils.generateFilename('cleaned', ext), mime, 0.95);
                showStatus('已下载不含元数据的副本');
            } catch (e) {
                showStatus('处理失败：' + e.message);
            }
        });
    }

    DevKit.ImageTools.exif = { init: initExif };
})();
