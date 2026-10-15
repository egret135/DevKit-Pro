// Image Tools - EXIF Viewer / Cleaner
// Parses tags with lib/exif.min.js. Prefer binary strip for JPEG/PNG/WebP so
 // pixels stay untouched; fall back to canvas re-encode. Orientation can be
// applied on preview and on stripped output so removing EXIF does not flip the image.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const MAX_FILES = 30;
    const MAX_FILE_BYTES = 30 * 1024 * 1024;
    const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|avif)$/i;

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
        LensMake: '镜头厂商',
        GPSLatitude: 'GPS 纬度',
        GPSLongitude: 'GPS 经度',
        GPSAltitude: 'GPS 海拔',
        GPSImgDirection: 'GPS 方向',
        ImageDescription: '图片描述',
        Artist: '作者',
        Copyright: '版权',
        UserComment: '用户注释'
    };

    const SKIP_TAGS = new Set(['thumbnail', 'MakerNote']);

    const CAPTURE_TAGS = new Set([
        'Make', 'Model', 'Software', 'DateTimeOriginal', 'DateTimeDigitized', 'DateTime',
        'ExposureTime', 'FNumber', 'ISOSpeedRatings', 'Flash', 'WhiteBalance',
        'ExposureProgram', 'MeteringMode', 'Orientation', 'PixelXDimension', 'PixelYDimension',
        'ExposureBias', 'ExposureBiasValue', 'BrightnessValue', 'SceneCaptureType', 'SceneType',
        'LightSource', 'SensingMethod', 'DigitalZoomRatio', 'Contrast', 'Saturation', 'Sharpness'
    ]);
    const LENS_TAGS = new Set([
        'LensModel', 'LensMake', 'FocalLength', 'FocalLengthIn35mmFilm', 'MaxApertureValue', 'LensSpecification'
    ]);
    const GPS_TAGS = new Set([
        'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 'GPSLatitudeRef', 'GPSLongitudeRef',
        'GPSAltitudeRef', 'GPSImgDirection', 'GPSImgDirectionRef', 'GPSTimeStamp', 'GPSDateStamp',
        'GPSSpeed', 'GPSSpeedRef', 'GPSDestBearing', 'GPSProcessingMethod', 'GPSMapDatum'
    ]);
    const RIGHTS_TAGS = new Set(['Artist', 'Copyright', 'ImageDescription', 'UserComment', 'XPAuthor', 'XPComment', 'XPTitle']);
    const PRIVACY_TAGS = new Set([
        ...GPS_TAGS, 'Artist', 'Copyright', 'UserComment', 'XPAuthor', 'XPComment', 'OwnerName'
    ]);

    const GROUP_LABELS = {
        capture: '拍摄',
        lens: '镜头',
        gps: 'GPS',
        rights: '版权',
        other: '其他'
    };

    // ==================== Pure helpers ====================

    function isRational(v) {
        return v instanceof Number && 'numerator' in v && 'denominator' in v;
    }

    function formatValue(tag, value) {
        if (value === undefined || value === null) return '';
        if (isRational(value)) {
            if (tag === 'ExposureTime') {
                const n = Number(value);
                if (n > 0 && n < 1 && value.denominator) {
                    return `1/${Math.round(value.denominator / value.numerator)} s`;
                }
                return `${n} s`;
            }
            if (tag === 'FNumber') return `f/${Number(value).toFixed(1)}`;
            if (tag === 'FocalLength') return `${Number(value).toFixed(1)} mm`;
            if (tag === 'GPSAltitude') return `${Number(value).toFixed(1)} m`;
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
        if (![d, m, s].every(Number.isFinite)) return null;
        let decimal = d + m / 60 + s / 3600;
        if (ref === 'S' || ref === 'W') decimal = -decimal;
        return decimal;
    }

    function groupForTag(tag) {
        if (GPS_TAGS.has(tag) || tag.startsWith('GPS')) return 'gps';
        if (LENS_TAGS.has(tag)) return 'lens';
        if (RIGHTS_TAGS.has(tag)) return 'rights';
        if (CAPTURE_TAGS.has(tag)) return 'capture';
        return 'other';
    }

    function isPrivacyTag(tag) {
        return PRIVACY_TAGS.has(tag) || tag.startsWith('GPS');
    }

    /** Output size after EXIF Orientation 1–8 (swaps width/height for 5–8). */
    function orientationSize(width, height, orientation) {
        const o = Number(orientation) || 1;
        return (o >= 5 && o <= 8)
            ? { width: height, height: width }
            : { width, height };
    }

    /**
     * Draw `source` onto a new canvas with EXIF Orientation applied.
     * Orientation values follow the TIFF/EXIF 1–8 mapping.
     */
    function applyOrientation(source, orientation) {
        const o = Number(orientation) || 1;
        const width = source.naturalWidth || source.width;
        const height = source.naturalHeight || source.height;
        const size = orientationSize(width, height, o);
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        switch (o) {
            case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
            case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
            case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
            case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
            case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
            case 7: ctx.transform(0, -1, -1, 0, height, width); break;
            case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
            default: break;
        }
        ctx.drawImage(source, 0, 0);
        return canvas;
    }

    function concatBytes(parts) {
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let o = 0;
        parts.forEach((p) => { out.set(p, o); o += p.length; });
        return out;
    }

    function buildOverview(tags, fileMeta) {
        const camera = [tags.Make, tags.Model].filter(Boolean).map(String).join(' ').trim();
        const lens = tags.LensModel ? String(tags.LensModel) : '';
        const taken = tags.DateTimeOriginal || tags.DateTimeDigitized || tags.DateTime || '';
        const parts = [];
        if (tags.FNumber != null) parts.push(formatValue('FNumber', tags.FNumber));
        if (tags.ExposureTime != null) parts.push(formatValue('ExposureTime', tags.ExposureTime));
        if (tags.ISOSpeedRatings != null) parts.push(`ISO ${tags.ISOSpeedRatings}`);
        const exposure = parts.join(' · ');
        const lat = dmsToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
        const lon = dmsToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);
        const gps = (lat != null && lon != null) ? { lat, lon } : null;
        const pixels = (fileMeta && fileMeta.width && fileMeta.height)
            ? `${fileMeta.width} × ${fileMeta.height}`
            : '';
        return {
            camera: camera || '',
            lens,
            taken: taken ? String(taken) : '',
            exposure,
            pixels,
            gps,
            orientation: Number(tags.Orientation) || 1,
            tagCount: 0
        };
    }

    function normalizeExif(tags, fileMeta) {
        const safeTags = tags && typeof tags === 'object' ? tags : {};
        const overview = buildOverview(safeTags, fileMeta || {});
        const rows = [];
        const seen = new Set();

        if (overview.gps) {
            rows.push({
                key: 'GPSCoordinates',
                label: 'GPS 坐标',
                value: `${overview.gps.lat.toFixed(6)}, ${overview.gps.lon.toFixed(6)}`,
                group: 'gps',
                privacy: true,
                mapUrl: `https://www.openstreetmap.org/?mlat=${overview.gps.lat}&mlon=${overview.gps.lon}#map=15/${overview.gps.lat}/${overview.gps.lon}`
            });
            seen.add('GPSLatitude');
            seen.add('GPSLongitude');
            seen.add('GPSLatitudeRef');
            seen.add('GPSLongitudeRef');
        }

        const priority = Object.keys(FRIENDLY_LABELS).filter((k) => k in safeTags && !seen.has(k));
        const others = Object.keys(safeTags).filter((k) => !FRIENDLY_LABELS[k] && !seen.has(k) && !SKIP_TAGS.has(k));

        [...priority, ...others].forEach((key) => {
            if (SKIP_TAGS.has(key)) return;
            const formatted = formatValue(key, safeTags[key]);
            if (!formatted) return;
            rows.push({
                key,
                label: FRIENDLY_LABELS[key] || key,
                value: formatted,
                group: groupForTag(key),
                privacy: isPrivacyTag(key)
            });
        });

        overview.tagCount = rows.length;
        overview.hasPrivacy = rows.some((r) => r.privacy);
        return { tags: safeTags, rows, overview };
    }

    function rowsToJson(rows) {
        const obj = {};
        rows.forEach((r) => { obj[r.key] = r.value; });
        return JSON.stringify(obj, null, 2);
    }

    function csvEscape(s) {
        const t = String(s ?? '');
        return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    }

    function rowsToCsv(rows) {
        const lines = ['标签,键,值,分组'];
        rows.forEach((r) => {
            lines.push([r.label, r.key, r.value, GROUP_LABELS[r.group] || r.group].map(csvEscape).join(','));
        });
        return lines.join('\n');
    }

    function rowsToMarkdown(rows) {
        const lines = ['| 标签 | 值 | 分组 |', '| --- | --- | --- |'];
        rows.forEach((r) => {
            const lab = String(r.label).replace(/\|/g, '\\|');
            const val = String(r.value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
            lines.push(`| ${lab} | ${val} | ${GROUP_LABELS[r.group] || r.group} |`);
        });
        return lines.join('\n');
    }

    // ==================== Binary metadata strip ====================

    function u16be(view, offset) { return view.getUint16(offset, false); }
    function u32be(view, offset) { return view.getUint32(offset, false); }
    function u32le(view, offset) { return view.getUint32(offset, true); }

    /** Remove JPEG APP1 (Exif/XMP) and other common metadata APP segments. Keeps APP0 (JFIF). */
    function stripJpegMetadata(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) throw new Error('不是有效的 JPEG');
        const parts = [new Uint8Array([0xFF, 0xD8])];
        let i = 2;
        while (i < u8.length) {
            if (u8[i] !== 0xFF) {
                parts.push(u8.subarray(i));
                break;
            }
            while (i < u8.length && u8[i] === 0xFF) i++;
            if (i >= u8.length) break;
            const marker = u8[i++];
            if (marker === 0xD9) { parts.push(new Uint8Array([0xFF, 0xD9])); break; }
            if (marker === 0xDA) {
                parts.push(new Uint8Array([0xFF, 0xDA]));
                parts.push(u8.subarray(i));
                break;
            }
            if (marker >= 0xD0 && marker <= 0xD7) {
                parts.push(new Uint8Array([0xFF, marker]));
                continue;
            }
            if (marker === 0x01) {
                parts.push(new Uint8Array([0xFF, marker]));
                continue;
            }
            if (i + 1 >= u8.length) throw new Error('JPEG 段损坏');
            const len = (u8[i] << 8) | u8[i + 1];
            if (len < 2 || i + len > u8.length) throw new Error('JPEG 段长度无效');
            // Strip APP1–APP15 (keep APP0 / JFIF). Also strip COM (0xFE).
            const strip = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE;
            if (!strip) {
                const seg = new Uint8Array(2 + len);
                seg[0] = 0xFF;
                seg[1] = marker;
                seg.set(u8.subarray(i, i + len), 2);
                parts.push(seg);
            }
            i += len;
        }
        return concatBytes(parts);
    }

    const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    const PNG_STRIP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME', 'dSIG']);

    function stripPngMetadata(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (u8.length < 8 || !PNG_SIG.every((b, i) => u8[i] === b)) throw new Error('不是有效的 PNG');
        const parts = [u8.subarray(0, 8)];
        let i = 8;
        while (i + 8 <= u8.length) {
            const view = new DataView(u8.buffer, u8.byteOffset + i, 8);
            const len = view.getUint32(0, false);
            const type = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]);
            const total = 12 + len;
            if (i + total > u8.length) throw new Error('PNG 块损坏');
            if (!PNG_STRIP.has(type)) parts.push(u8.subarray(i, i + total));
            i += total;
            if (type === 'IEND') break;
        }
        return concatBytes(parts);
    }

    /** Remove WebP EXIF / XMP chunks from a RIFF container. */
    function stripWebpMetadata(bytes) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (u8.length < 12) throw new Error('不是有效的 WebP');
        const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        if (u32le(view, 0) !== 0x46464952 || u32le(view, 8) !== 0x50424557) {
            throw new Error('不是有效的 WebP');
        }
        const chunks = [];
        let i = 12;
        while (i + 8 <= u8.length) {
            const fourcc = String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);
            const size = u32le(view, i + 4);
            const payload = 8 + size + (size & 1);
            if (i + payload > u8.length) throw new Error('WebP 块损坏');
            if (fourcc !== 'EXIF' && fourcc !== 'XMP ') {
                chunks.push(u8.subarray(i, i + payload));
            }
            i += payload;
        }
        const bodyLen = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(12 + bodyLen);
        out.set(u8.subarray(0, 8), 0);
        out[8] = 0x57; out[9] = 0x45; out[10] = 0x42; out[11] = 0x50;
        new DataView(out.buffer).setUint32(4, 4 + bodyLen, true);
        let o = 12;
        chunks.forEach((c) => { out.set(c, o); o += c.length; });
        return out;
    }

    function detectStripKind(bytes, mime) {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (u8.length >= 3 && u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpeg';
        if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50) return 'png';
        if (u8.length >= 12) {
            const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
            if (u32le(view, 0) === 0x46464952 && u32le(view, 8) === 0x50424557) return 'webp';
        }
        const m = (mime || '').toLowerCase();
        if (m === 'image/jpeg') return 'jpeg';
        if (m === 'image/png') return 'png';
        if (m === 'image/webp') return 'webp';
        return null;
    }

    function stripMetadataBytes(bytes, mime) {
        const kind = detectStripKind(bytes, mime);
        if (kind === 'jpeg') return { bytes: stripJpegMetadata(bytes), mime: 'image/jpeg', ext: 'jpg', kind };
        if (kind === 'png') return { bytes: stripPngMetadata(bytes), mime: 'image/png', ext: 'png', kind };
        if (kind === 'webp') return { bytes: stripWebpMetadata(bytes), mime: 'image/webp', ext: 'webp', kind };
        return null;
    }

    function fileStem(name) {
        return (name || 'image').replace(/\.[^.]+$/, '') || 'image';
    }

    function sanitizeName(name) {
        return String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'image';
    }

    function getExifTags(img) {
        return new Promise((resolve) => {
            if (typeof EXIF === 'undefined') {
                resolve({});
                return;
            }
            EXIF.getData(img, function () {
                resolve(EXIF.getAllTags(this) || {});
            });
        });
    }

    function loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
    }

    function debounce(fn, wait) {
        let t = 0;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // ==================== UI ====================

    function initExif() {
        const panel = document.getElementById('imgPanelExif');
        const dropzone = document.getElementById('imgExifDropzone');
        if (!panel || !dropzone) return;
        const $ = (id) => document.getElementById(id);

        const notice = $('imgExifNotice');
        const fileList = $('imgExifFileList');
        const clearBtn = $('imgExifClearBtn');
        const hint = $('imgExifHint');
        const preview = $('imgExifPreview');
        const emptyPreview = $('imgExifEmptyPreview');
        const chips = $('imgExifChips');
        const orientFix = $('imgExifOrientFix');
        const reencodeFields = $('imgExifReencodeFields');
        const losslessNote = $('imgExifLosslessNote');
        const qualityField = $('imgExifQualityField');
        const qualityInput = $('imgExifQuality');
        const qualityValue = $('imgExifQualityValue');
        const bgField = $('imgExifBgField');
        const bgInput = $('imgExifBg');
        const stripResult = $('imgExifStripResult');
        const status = $('imgExifStatus');
        const stripBtn = $('imgExifStripBtn');
        const zipBtn = $('imgExifZipBtn');
        const cancelBtn = $('imgExifCancelBtn');
        const overviewEl = $('imgExifOverview');
        const metaSub = $('imgExifMetaSub');
        const searchInput = $('imgExifSearch');
        const groupBtns = panel.querySelectorAll('[data-group]');
        const emptyHint = $('imgExifEmptyHint');
        const table = $('imgExifTable');
        const tableBody = $('imgExifTableBody');
        const copyJsonBtn = $('imgExifCopyJsonBtn');
        const exportCsvBtn = $('imgExifExportCsvBtn');
        const exportMdBtn = $('imgExifExportMdBtn');
        const smodeBtns = panel.querySelectorAll('[data-smode]');
        const efmtBtns = panel.querySelectorAll('[data-efmt]');

        const state = {
            stripMode: 'lossless',
            format: 'image/jpeg',
            quality: 95,
            bg: '#ffffff',
            orientFix: true,
            group: 'all',
            query: ''
        };

        let entries = [];
        let nextId = 1;
        let currentId = 0;
        let busy = false;
        let cancelled = false;
        let previewUrl = '';

        const persist = (key, value) => {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        };

        function setSeg(btns, attr, value) {
            btns.forEach((btn) => {
                const on = btn.dataset[attr] === value;
                btn.classList.toggle('active', on);
                if (btn.hasAttribute('role')) btn.setAttribute('aria-checked', String(on));
            });
        }

        function getEntry(id) {
            return entries.find((e) => e.id === id) || null;
        }

        function current() {
            return getEntry(currentId);
        }

        function syncStripControls() {
            setSeg(smodeBtns, 'smode', state.stripMode);
            reencodeFields.classList.toggle('hidden', state.stripMode !== 'reencode');
            losslessNote.classList.toggle('hidden', state.stripMode !== 'lossless');
            setSeg(efmtBtns, 'efmt', state.format);
            qualityInput.value = String(state.quality);
            qualityValue.textContent = `${state.quality}%`;
            const needsQ = state.format !== 'image/png';
            qualityField.classList.toggle('hidden', !needsQ);
            bgField.classList.toggle('hidden', state.format !== 'image/jpeg');
            bgInput.value = state.bg;
            orientFix.checked = state.orientFix;
        }

        function showNotice(text) {
            notice.classList.toggle('hidden', !text);
            notice.textContent = text || '';
        }

        function setBusy(on) {
            busy = on;
            panel.classList.toggle('is-busy', on);
            stripBtn.disabled = on || !current();
            zipBtn.disabled = on || entries.length < 2;
            cancelBtn.classList.toggle('hidden', !on);
            clearBtn.disabled = on;
            searchInput.disabled = on || !current()?.model;
        }

        function renderOverview(model) {
            overviewEl.replaceChildren();
            if (!model) return;
            const o = model.overview;
            const items = [
                ['相机', o.camera || '—'],
                ['镜头', o.lens || '—'],
                ['拍摄时间', o.taken || '—'],
                ['曝光', o.exposure || '—'],
                ['尺寸', o.pixels || '—']
            ];
            items.forEach(([lab, val]) => {
                const card = document.createElement('div');
                card.className = 'exif-ov-item';
                const k = document.createElement('span');
                k.className = 'exif-ov-label';
                k.textContent = lab;
                const v = document.createElement('span');
                v.className = 'exif-ov-value';
                v.textContent = val;
                v.title = val;
                card.append(k, v);
                overviewEl.append(card);
            });
            if (o.gps) {
                const card = document.createElement('div');
                card.className = 'exif-ov-item is-privacy';
                const k = document.createElement('span');
                k.className = 'exif-ov-label';
                k.textContent = 'GPS';
                const v = document.createElement('a');
                v.className = 'exif-ov-value exif-map-link';
                v.href = `https://www.openstreetmap.org/?mlat=${o.gps.lat}&mlon=${o.gps.lon}#map=15/${o.gps.lat}/${o.gps.lon}`;
                v.target = '_blank';
                v.rel = 'noopener noreferrer';
                v.textContent = `${o.gps.lat.toFixed(5)}, ${o.gps.lon.toFixed(5)} · 地图`;
                card.append(k, v);
                overviewEl.append(card);
            }
        }

        function filteredRows(model) {
            if (!model) return [];
            const q = state.query.trim().toLowerCase();
            return model.rows.filter((r) => {
                if (state.group !== 'all' && r.group !== state.group) return false;
                if (!q) return true;
                return r.label.toLowerCase().includes(q)
                    || r.key.toLowerCase().includes(q)
                    || r.value.toLowerCase().includes(q);
            });
        }

        function renderTable(model) {
            tableBody.replaceChildren();
            if (!model) {
                table.classList.add('hidden');
                emptyHint.classList.remove('hidden');
                emptyHint.textContent = '上传图片后显示 EXIF 信息';
                metaSub.textContent = '上传后显示 EXIF';
                return;
            }
            const rows = filteredRows(model);
            metaSub.textContent = model.rows.length
                ? `共 ${model.rows.length} 项${model.overview.hasPrivacy ? ' · 含隐私字段' : ''}${state.query || state.group !== 'all' ? ` · 显示 ${rows.length}` : ''}`
                : '未找到 EXIF 元数据';

            if (!model.rows.length) {
                table.classList.add('hidden');
                emptyHint.classList.remove('hidden');
                emptyHint.textContent = '未在该图片中找到 EXIF 元数据（可能已被清除，或非相机直出 JPEG）';
                return;
            }
            if (!rows.length) {
                table.classList.add('hidden');
                emptyHint.classList.remove('hidden');
                emptyHint.textContent = '没有匹配的字段';
                return;
            }

            emptyHint.classList.add('hidden');
            table.classList.remove('hidden');

            let lastGroup = '';
            rows.forEach((r) => {
                if (r.group !== lastGroup) {
                    lastGroup = r.group;
                    const hr = document.createElement('tr');
                    hr.className = 'exif-group-row';
                    const td = document.createElement('td');
                    td.colSpan = 3;
                    td.textContent = GROUP_LABELS[r.group] || r.group;
                    hr.append(td);
                    tableBody.append(hr);
                }
                const tr = document.createElement('tr');
                tr.className = `exif-row${r.privacy ? ' is-privacy' : ''}`;
                const lab = document.createElement('td');
                lab.className = 'exif-label';
                lab.textContent = r.label;
                lab.title = r.key;
                const val = document.createElement('td');
                val.className = 'exif-value';
                if (r.mapUrl) {
                    const a = document.createElement('a');
                    a.href = r.mapUrl;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.className = 'exif-map-link';
                    a.textContent = r.value;
                    val.append(a);
                } else {
                    val.textContent = r.value;
                }
                const act = document.createElement('td');
                act.className = 'exif-actions';
                const copy = document.createElement('button');
                copy.type = 'button';
                copy.className = 'b64-mini-btn';
                copy.textContent = '复制';
                copy.dataset.copy = r.value;
                act.append(copy);
                tr.append(lab, val, act);
                tableBody.append(tr);
            });
        }

        function renderChips(entry) {
            chips.replaceChildren();
            if (!entry) return;
            const add = (text, cls) => {
                const el = document.createElement('span');
                el.className = `b64-chip${cls ? ` ${cls}` : ''}`;
                el.textContent = text;
                chips.append(el);
            };
            add(`${entry.width} × ${entry.height}`);
            add(ImageUtils.formatFileSize(entry.size));
            if (entry.mime) add((entry.mime.split('/')[1] || entry.mime).toUpperCase());
            if (entry.model?.overview?.orientation && entry.model.overview.orientation !== 1) {
                add(`Orientation ${entry.model.overview.orientation}`, 'is-warn');
            }
            if (entry.model?.overview?.hasPrivacy) add('含隐私', 'is-warn');
            if (entry.stripSize != null) {
                const delta = entry.stripSize - entry.size;
                add(`${ImageUtils.formatFileSize(entry.size)} → ${ImageUtils.formatFileSize(entry.stripSize)}`, delta <= 0 ? 'is-success' : 'is-warn');
            }
        }

        function previewSource(entry, orient) {
            const img = entry.img;
            if (!img) return entry.thumbUrl;
            const needOrient = state.orientFix && orient > 1;
            // Cap preview long side so Orientation redraw stays cheap on big photos.
            const maxSide = 1600;
            const sw = img.naturalWidth;
            const sh = img.naturalHeight;
            const long = Math.max(sw, sh);
            const scale = long > maxSide ? maxSide / long : 1;
            if (!needOrient && scale === 1) return entry.thumbUrl;
            let source = img;
            let release = null;
            if (scale < 1) {
                const small = document.createElement('canvas');
                small.width = Math.max(1, Math.round(sw * scale));
                small.height = Math.max(1, Math.round(sh * scale));
                small.getContext('2d').drawImage(img, 0, 0, small.width, small.height);
                source = small;
                release = small;
            }
            const canvas = needOrient ? applyOrientation(source, orient) : source;
            if (release && canvas !== release) { release.width = 0; release.height = 0; }
            const url = canvas.toDataURL('image/jpeg', 0.85);
            if (canvas !== img) { canvas.width = 0; canvas.height = 0; }
            return url;
        }

        async function updatePreview(entry) {
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }
            previewUrl = '';
            if (!entry) {
                preview.classList.add('hidden');
                preview.removeAttribute('src');
                emptyPreview.classList.remove('hidden');
                return;
            }
            emptyPreview.classList.add('hidden');
            const orient = entry.model?.overview?.orientation || 1;
            const src = previewSource(entry, orient);
            if (src !== entry.thumbUrl) previewUrl = src;
            preview.src = src;
            preview.classList.remove('hidden');
        }

        function renderList() {
            fileList.replaceChildren();
            const multi = entries.length > 1;
            fileList.classList.toggle('hidden', !multi);
            panel.classList.toggle('has-files', entries.length > 0);
            clearBtn.classList.toggle('hidden', entries.length === 0);
            zipBtn.classList.toggle('hidden', !multi);
            hint.textContent = entries.length
                ? `${entries.length} 张`
                : '最多 30 张，单张 ≤ 30MB';

            if (!multi) return;
            entries.forEach((entry) => {
                const li = document.createElement('li');
                li.className = `b64-file${entry.id === currentId ? ' active' : ''}`;
                li.dataset.id = String(entry.id);
                li.tabIndex = 0;
                const thumb = document.createElement('img');
                thumb.className = 'b64-file-thumb';
                thumb.src = entry.thumbUrl;
                thumb.alt = '';
                const info = document.createElement('div');
                info.className = 'b64-file-info';
                const name = document.createElement('span');
                name.className = 'b64-file-name';
                name.textContent = entry.name;
                name.title = entry.name;
                const sub = document.createElement('span');
                sub.className = 'b64-file-sub';
                sub.textContent = ImageUtils.formatFileSize(entry.size);
                if (entry.error) {
                    sub.append(' · ', Object.assign(document.createElement('span'), {
                        className: 'cvt-file-error',
                        textContent: entry.error
                    }));
                } else if (entry.stripSize != null) {
                    sub.append(` · 已清除 ${ImageUtils.formatFileSize(entry.stripSize)}`);
                } else if (entry.model) {
                    sub.append(` · ${entry.model.rows.length} 项`);
                }
                info.append(name, sub);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'b64-file-remove';
                remove.dataset.action = 'remove';
                remove.setAttribute('aria-label', `移除 ${entry.name}`);
                remove.textContent = '×';
                remove.disabled = busy;
                li.append(thumb, info, remove);
                fileList.append(li);
            });
        }

        function setExportEnabled(on) {
            copyJsonBtn.disabled = !on;
            exportCsvBtn.disabled = !on;
            exportMdBtn.disabled = !on;
            searchInput.disabled = !on;
            stripBtn.disabled = busy || !current();
        }

        async function selectEntry(id) {
            currentId = id;
            const entry = current();
            renderList();
            renderOverview(entry?.model || null);
            renderTable(entry?.model || null);
            renderChips(entry);
            await updatePreview(entry);
            setExportEnabled(!!(entry && entry.model && entry.model.rows.length));
            stripResult.classList.add('hidden');
            status.textContent = entry?.error || '';
            if (entry?.stripSize != null) {
                stripResult.classList.remove('hidden');
                stripResult.textContent = `上次清除：${ImageUtils.formatFileSize(entry.size)} → ${ImageUtils.formatFileSize(entry.stripSize)}`;
            }
        }

        function retireEntry(entry) {
            if (entry.thumbUrl) URL.revokeObjectURL(entry.thumbUrl);
            entry.img = null;
            entry.model = null;
            entry.file = null;
        }

        async function analyzeEntry(entry) {
            const img = await loadImageFromUrl(entry.thumbUrl);
            entry.img = img;
            entry.width = img.naturalWidth;
            entry.height = img.naturalHeight;
            const tags = await getExifTags(img);
            entry.model = normalizeExif(tags, {
                width: entry.width,
                height: entry.height,
                size: entry.size,
                name: entry.name,
                mime: entry.mime
            });
        }

        function isAcceptedFile(file) {
            return (file.type && file.type.startsWith('image/')) || IMAGE_EXT_RE.test(file.name || '');
        }

        async function addFiles(files) {
            if (busy) return;
            const skipped = [];
            const added = [];
            for (const file of files) {
                if (!isAcceptedFile(file)) { skipped.push(`${file.name}（不是图片）`); continue; }
                if (file.size > MAX_FILE_BYTES) { skipped.push(`${file.name}（超过 30MB）`); continue; }
                if (entries.length >= MAX_FILES) { skipped.push(`${file.name}（超过 ${MAX_FILES} 张上限）`); continue; }
                const entry = {
                    id: nextId++,
                    file,
                    name: file.name || 'image',
                    size: file.size,
                    mime: (file.type || '').toLowerCase(),
                    thumbUrl: URL.createObjectURL(file),
                    width: 0,
                    height: 0,
                    img: null,
                    model: null,
                    stripSize: null,
                    error: ''
                };
                entries.push(entry);
                added.push(entry);
            }
            showNotice(skipped.length ? `已跳过：${skipped.join('、')}` : '');
            if (!added.length) {
                renderList();
                return;
            }
            status.textContent = '正在读取…';
            for (const entry of added) {
                try {
                    await analyzeEntry(entry);
                } catch (err) {
                    entry.error = err.message || '读取失败';
                }
            }
            status.textContent = '';
            await selectEntry(added[added.length - 1].id);
            renderList();
        }

        async function clearAll() {
            if (busy) return;
            entries.forEach(retireEntry);
            entries = [];
            currentId = 0;
            showNotice('');
            if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
            await selectEntry(0);
            renderList();
            stripResult.classList.add('hidden');
        }

        /** Produce a cleaned Blob for one entry. */
        async function stripEntry(entry) {
            const orient = entry.model?.overview?.orientation || 1;
            const needOrient = state.orientFix && orient > 1;

            // Lossless binary strip only when we do not need to bake orientation into pixels.
            if (state.stripMode === 'lossless' && !needOrient) {
                const buf = new Uint8Array(await entry.file.arrayBuffer());
                const stripped = stripMetadataBytes(buf, entry.mime);
                if (stripped) {
                    return {
                        blob: new Blob([stripped.bytes], { type: stripped.mime }),
                        ext: stripped.ext,
                        mode: 'lossless'
                    };
                }
            }

            // Re-encode path (also used when orientation must be baked in).
            let source = entry.img;
            if (!source) source = await loadImageFromUrl(entry.thumbUrl);
            let canvas;
            if (needOrient) canvas = applyOrientation(source, orient);
            else canvas = ImageUtils.drawToCanvas(source);

            let format = state.stripMode === 'reencode' ? state.format : 'image/jpeg';
            if (state.stripMode === 'lossless') {
                // Binary strip unsupported or orientation bake: pick format from source mime.
                if ((entry.mime || '').includes('png')) format = 'image/png';
                else if ((entry.mime || '').includes('webp')) format = 'image/webp';
                else format = 'image/jpeg';
            }

            let draw = canvas;
            if (format === 'image/jpeg') {
                const filled = document.createElement('canvas');
                filled.width = canvas.width;
                filled.height = canvas.height;
                const ctx = filled.getContext('2d');
                ctx.fillStyle = state.bg || '#ffffff';
                ctx.fillRect(0, 0, filled.width, filled.height);
                ctx.drawImage(canvas, 0, 0);
                if (canvas !== filled) { /* keep */ }
                draw = filled;
                if (canvas !== draw) { canvas.width = 0; canvas.height = 0; }
            }

            const quality = format === 'image/png' ? undefined : state.quality / 100;
            const blob = await ImageUtils.encodeCanvas(draw, format, quality);
            draw.width = 0;
            draw.height = 0;
            const ext = format === 'image/png' ? 'png' : (format === 'image/webp' ? 'webp' : 'jpg');
            return { blob, ext, mode: state.stripMode === 'lossless' ? 'reencode-fallback' : 'reencode' };
        }

        stripBtn.addEventListener('click', async () => {
            const entry = current();
            if (!entry || busy) return;
            setBusy(true);
            status.textContent = '正在清除…';
            try {
                const { blob, ext } = await stripEntry(entry);
                entry.stripSize = blob.size;
                ImageUtils.downloadBlob(blob, `${sanitizeName(fileStem(entry.name))}-cleaned.${ext}`);
                stripResult.classList.remove('hidden');
                const delta = blob.size - entry.size;
                stripResult.textContent = `${ImageUtils.formatFileSize(entry.size)} → ${ImageUtils.formatFileSize(blob.size)}（${delta <= 0 ? '' : '+'}${ImageUtils.formatFileSize(Math.abs(delta))}${delta <= 0 ? ' 更小' : ' 更大'}）`;
                status.textContent = '已下载不含元数据的副本';
                renderChips(entry);
                renderList();
            } catch (err) {
                status.textContent = err.message || '清除失败';
            } finally {
                setBusy(false);
            }
        });

        zipBtn.addEventListener('click', async () => {
            if (busy || entries.length < 2) return;
            setBusy(true);
            cancelled = false;
            const results = [];
            let done = 0;
            try {
                for (const entry of entries) {
                    if (cancelled) break;
                    status.textContent = `清除中 ${done + 1} / ${entries.length}`;
                    try {
                        const { blob, ext } = await stripEntry(entry);
                        entry.stripSize = blob.size;
                        entry.error = '';
                        results.push({
                            name: `${sanitizeName(fileStem(entry.name))}-cleaned.${ext}`,
                            blob
                        });
                    } catch (err) {
                        entry.error = err.message || '失败';
                    }
                    done++;
                    renderList();
                    await new Promise((r) => setTimeout(r, 0));
                }
                if (cancelled) {
                    status.textContent = `已取消，完成 ${results.length} 张`;
                } else if (results.length === 0) {
                    status.textContent = '没有成功处理的图片';
                } else if (results.length === 1) {
                    ImageUtils.downloadBlob(results[0].blob, results[0].name);
                    status.textContent = '已下载 1 张';
                } else {
                    status.textContent = '正在打包 ZIP…';
                    const zip = await ZipWriter.build(results);
                    ImageUtils.downloadBlob(zip, ImageUtils.generateFilename('exif-cleaned', 'zip'));
                    status.textContent = `已打包 ${results.length} 张 · ${ImageUtils.formatFileSize(zip.size)}`;
                }
                const entry = current();
                if (entry) {
                    renderChips(entry);
                    if (entry.stripSize != null) {
                        stripResult.classList.remove('hidden');
                        stripResult.textContent = `上次清除：${ImageUtils.formatFileSize(entry.size)} → ${ImageUtils.formatFileSize(entry.stripSize)}`;
                    }
                }
            } finally {
                setBusy(false);
            }
        });

        cancelBtn.addEventListener('click', () => { cancelled = true; });

        ImageUtils.createDropZone(dropzone, {
            multiple: true,
            onFiles: (files) => { addFiles(files); }
        });

        clearBtn.addEventListener('click', () => { clearAll(); });

        fileList.addEventListener('click', (e) => {
            const remove = e.target.closest('[data-action="remove"]');
            if (remove) {
                if (busy) return;
                const id = Number(remove.closest('.b64-file').dataset.id);
                const entry = getEntry(id);
                if (entry) retireEntry(entry);
                entries = entries.filter((x) => x.id !== id);
                if (currentId === id) {
                    selectEntry(entries[0]?.id || 0);
                } else {
                    renderList();
                }
                return;
            }
            const li = e.target.closest('.b64-file');
            if (li) selectEntry(Number(li.dataset.id));
        });

        tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-copy]');
            if (!btn) return;
            ImageUtils.copyText(btn.dataset.copy, btn);
        });

        preview.addEventListener('click', () => {
            if (!preview.src || !window.ImageLightbox) return;
            ImageLightbox.openImage(preview.src, current()?.name || '预览');
        });

        smodeBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.stripMode = btn.dataset.smode;
            persist('imgExifStripMode', state.stripMode);
            syncStripControls();
        }));
        efmtBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.format = btn.dataset.efmt;
            persist('imgExifExportFormat', state.format);
            syncStripControls();
        }));
        qualityInput.addEventListener('input', () => {
            state.quality = Number(qualityInput.value);
            qualityValue.textContent = `${state.quality}%`;
            persist('imgExifExportQuality', state.quality);
        });
        bgInput.addEventListener('input', () => {
            state.bg = bgInput.value;
            persist('imgExifExportBg', state.bg);
        });
        orientFix.addEventListener('change', () => {
            state.orientFix = orientFix.checked;
            persist('imgExifOrientFix', state.orientFix);
            updatePreview(current());
        });

        groupBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.group = btn.dataset.group;
            setSeg(groupBtns, 'group', state.group);
            renderTable(current()?.model || null);
        }));

        const onSearch = debounce(() => {
            state.query = searchInput.value || '';
            renderTable(current()?.model || null);
        }, 150);
        searchInput.addEventListener('input', onSearch);

        function downloadText(text, filename, mime) {
            ImageUtils.downloadBlob(new Blob([text], { type: mime }), filename);
        }

        copyJsonBtn.addEventListener('click', () => {
            const rows = filteredRows(current()?.model);
            if (!rows.length) return;
            ImageUtils.copyText(rowsToJson(rows), copyJsonBtn);
        });
        exportCsvBtn.addEventListener('click', () => {
            const entry = current();
            const rows = filteredRows(entry?.model);
            if (!rows.length) return;
            downloadText(rowsToCsv(rows), `${sanitizeName(fileStem(entry.name))}-exif.csv`, 'text/csv;charset=utf-8');
        });
        exportMdBtn.addEventListener('click', () => {
            const entry = current();
            const rows = filteredRows(entry?.model);
            if (!rows.length) return;
            downloadText(rowsToMarkdown(rows), `${sanitizeName(fileStem(entry.name))}-exif.md`, 'text/markdown;charset=utf-8');
        });

        syncStripControls();
        setExportEnabled(false);

        const savedPromise = typeof Settings !== 'undefined' ? Settings.load().catch(() => ({})) : Promise.resolve({});
        savedPromise.then((saved) => {
            if (!saved) return;
            if (typeof saved.imgExifOrientFix === 'boolean') state.orientFix = saved.imgExifOrientFix;
            if (saved.imgExifStripMode === 'lossless' || saved.imgExifStripMode === 'reencode') {
                state.stripMode = saved.imgExifStripMode;
            }
            if (saved.imgExifExportFormat) state.format = saved.imgExifExportFormat;
            if (Number.isFinite(saved.imgExifExportQuality)) state.quality = saved.imgExifExportQuality;
            if (saved.imgExifExportBg) state.bg = saved.imgExifExportBg;
            syncStripControls();
        });
    }

    DevKit.ImageExif = {
        formatValue,
        dmsToDecimal,
        groupForTag,
        isPrivacyTag,
        orientationSize,
        applyOrientation,
        buildOverview,
        normalizeExif,
        rowsToJson,
        rowsToCsv,
        rowsToMarkdown,
        stripJpegMetadata,
        stripPngMetadata,
        stripWebpMetadata,
        stripMetadataBytes,
        detectStripKind
    };
    DevKit.ImageTools.exif = { init: initExif };
})();
