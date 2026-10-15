// Image Tools - QR Code Generate / Scan
// Generation: qrcodejs builds the module matrix; we repaint with margin, rounded
// modules, colors and optional center logo. Scanning uses jsQR with an overlay.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const HISTORY_LIMIT = 10;
    const LOGO_RATIO = 0.2;

    // ==================== Pure helpers ====================

    function escapeWifi(value) {
        return String(value || '').replace(/([\\;,:"])/g, '\\$1');
    }

    /** WIFI:T:WPA;S:ssid;P:pass;H:true;; */
    function buildWifi({ ssid, password, auth, hidden }) {
        const t = auth === 'nopass' ? 'nopass' : (auth === 'WEP' ? 'WEP' : 'WPA');
        const parts = [`WIFI:T:${t}`, `S:${escapeWifi(ssid)}`];
        if (t !== 'nopass') parts.push(`P:${escapeWifi(password || '')}`);
        if (hidden) parts.push('H:true');
        return parts.join(';') + ';;';
    }

    function buildVCard({ name, tel, email, org, url }) {
        const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
        if (name) lines.push(`FN:${name}`);
        if (org) lines.push(`ORG:${org}`);
        if (tel) lines.push(`TEL:${tel}`);
        if (email) lines.push(`EMAIL:${email}`);
        if (url) lines.push(`URL:${url}`);
        lines.push('END:VCARD');
        return lines.join('\n');
    }

    function detectPayloadType(text) {
        const t = String(text || '').trim();
        if (!t) return 'text';
        if (/^WIFI:/i.test(t)) return 'wifi';
        if (/^BEGIN:VCARD/i.test(t)) return 'vcard';
        if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return 'url';
        return 'text';
    }

    function parseWifi(text) {
        const out = { ssid: '', password: '', auth: 'WPA', hidden: false };
        const body = String(text || '').replace(/^WIFI:/i, '').replace(/;;\s*$/, '');
        body.split(';').forEach((part) => {
            const i = part.indexOf(':');
            if (i < 0) return;
            const k = part.slice(0, i).toUpperCase();
            const v = part.slice(i + 1).replace(/\\([\\;,:"])/g, '$1');
            if (k === 'S') out.ssid = v;
            else if (k === 'P') out.password = v;
            else if (k === 'T') out.auth = v === 'nopass' ? 'nopass' : (v === 'WEP' ? 'WEP' : 'WPA');
            else if (k === 'H') out.hidden = /^(true|1)$/i.test(v);
        });
        return out;
    }

    function parseVCard(text) {
        const out = { name: '', tel: '', email: '', org: '', url: '' };
        String(text || '').split(/\r?\n/).forEach((line) => {
            const i = line.indexOf(':');
            if (i < 0) return;
            const key = line.slice(0, i).split(';')[0].toUpperCase();
            const val = line.slice(i + 1).trim();
            if (key === 'FN') out.name = val;
            else if (key === 'TEL') out.tel = val;
            else if (key === 'EMAIL') out.email = val;
            else if (key === 'ORG') out.org = val;
            else if (key === 'URL') out.url = val;
        });
        return out;
    }

    function historyPush(list, entry, limit) {
        const lim = limit || HISTORY_LIMIT;
        const next = [{ text: entry.text, type: entry.type || detectPayloadType(entry.text), ts: entry.ts || Date.now() }]
            .concat((list || []).filter((x) => x && x.text !== entry.text))
            .slice(0, lim);
        return next;
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        const radius = Math.max(0, Math.min(r, w / 2, h / 2));
        if (radius <= 0) {
            ctx.rect(x, y, w, h);
            return;
        }
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    /**
     * Paint modules onto canvas.
     * opts: { size, margin, radiusPct 0..50, fg, bg, logoImage? }
     * modules: boolean[][] (row-major), true = dark.
     */
    function paintQrCanvas(modules, opts, canvas) {
        const count = modules.length;
        const margin = Math.max(0, Number(opts.margin) || 0);
        const n = count + margin * 2;
        const size = Math.max(16, Math.round(opts.size || 300));
        const cell = size / n;
        const radiusPct = Math.max(0, Math.min(50, Number(opts.radiusPct) || 0)) / 100;
        const out = canvas || document.createElement('canvas');
        out.width = size;
        out.height = size;
        const ctx = out.getContext('2d');
        ctx.fillStyle = opts.bg || '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = opts.fg || '#000000';
        const r = cell * radiusPct * 0.5;
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (!modules[row][col]) continue;
                const x = (col + margin) * cell;
                const y = (row + margin) * cell;
                ctx.beginPath();
                roundRectPath(ctx, x, y, cell, cell, r);
                ctx.fill();
            }
        }
        if (opts.logoImage) {
            const logoSize = size * LOGO_RATIO;
            const pad = logoSize * 0.12;
            const box = logoSize + pad * 2;
            const bx = (size - box) / 2;
            const by = (size - box) / 2;
            ctx.fillStyle = opts.bg || '#ffffff';
            ctx.beginPath();
            roundRectPath(ctx, bx, by, box, box, box * 0.15);
            ctx.fill();
            const lx = (size - logoSize) / 2;
            const ly = (size - logoSize) / 2;
            ctx.drawImage(opts.logoImage, lx, ly, logoSize, logoSize);
        }
        return out;
    }

    function modulesToSvg(modules, opts) {
        const count = modules.length;
        const margin = Math.max(0, Number(opts.margin) || 0);
        const n = count + margin * 2;
        const size = Math.max(16, Math.round(opts.size || 300));
        const cell = size / n;
        const radiusPct = Math.max(0, Math.min(50, Number(opts.radiusPct) || 0)) / 100;
        const r = cell * radiusPct * 0.5;
        const fg = opts.fg || '#000000';
        const bg = opts.bg || '#ffffff';
        const parts = [
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">`,
            `<rect width="100%" height="100%" fill="${bg}"/>`
        ];
        for (let row = 0; row < count; row++) {
            for (let col = 0; col < count; col++) {
                if (!modules[row][col]) continue;
                const x = (col + margin) * cell;
                const y = (row + margin) * cell;
                if (r <= 0) {
                    parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fg}"/>`);
                } else {
                    parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${r}" ry="${r}" fill="${fg}"/>`);
                }
            }
        }
        parts.push('</svg>');
        return parts.join('');
    }

    function debounce(fn, wait) {
        let t = 0;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function correctLevel(letter) {
        const map = { L: QRCode.CorrectLevel.L, M: QRCode.CorrectLevel.M, Q: QRCode.CorrectLevel.Q, H: QRCode.CorrectLevel.H };
        return map[letter] || QRCode.CorrectLevel.M;
    }

    /** Build module matrix via qrcodejs private API. */
    function buildModules(text, level) {
        if (!text || typeof QRCode === 'undefined') return null;
        const holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
        document.body.appendChild(holder);
        try {
            const qr = new QRCode(holder, {
                text,
                width: 64,
                height: 64,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: correctLevel(level)
            });
            const core = qr._oQRCode;
            if (!core || !core.modules) return null;
            const n = core.moduleCount;
            const modules = [];
            for (let r = 0; r < n; r++) {
                const row = [];
                for (let c = 0; c < n; c++) row.push(!!core.isDark(r, c));
                modules.push(row);
            }
            return { modules, typeNumber: core.typeNumber, moduleCount: n };
        } finally {
            holder.remove();
        }
    }

    function sanitizeName(name) {
        return String(name || 'qrcode').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'qrcode';
    }

    // ==================== UI ====================

    function initQrcode() {
        const panel = document.getElementById('imgPanelQrcode');
        const textInput = document.getElementById('imgQrText');
        if (!panel || !textInput) return;
        const $ = (id) => document.getElementById(id);

        const tabBtns = panel.querySelectorAll('[data-qrtab]');
        const paneGen = $('imgQrPaneGenerate');
        const paneScan = $('imgQrPaneScan');

        const typeBtns = panel.querySelectorAll('[data-qtype]');
        const formText = $('imgQrFormText');
        const formUrl = $('imgQrFormUrl');
        const formWifi = $('imgQrFormWifi');
        const formVcard = $('imgQrFormVcard');
        const urlInput = $('imgQrUrl');
        const wifiSsid = $('imgQrWifiSsid');
        const wifiPass = $('imgQrWifiPass');
        const wifiHidden = $('imgQrWifiHidden');
        const wauthBtns = panel.querySelectorAll('[data-wauth]');
        const vcName = $('imgQrVcName');
        const vcTel = $('imgQrVcTel');
        const vcEmail = $('imgQrVcEmail');
        const vcOrg = $('imgQrVcOrg');
        const vcUrl = $('imgQrVcUrl');

        const levelBtns = panel.querySelectorAll('[data-level]');
        const levelNote = $('imgQrLevelNote');
        const sizeBtns = panel.querySelectorAll('[data-size]');
        const sizeCustomWrap = $('imgQrSizeCustomWrap');
        const sizeCustom = $('imgQrSizeCustom');
        const fgInput = $('imgQrFg');
        const bgInput = $('imgQrBg');
        const marginInput = $('imgQrMargin');
        const marginValue = $('imgQrMarginValue');
        const radiusInput = $('imgQrRadius');
        const radiusValue = $('imgQrRadiusValue');
        const logoDrop = $('imgQrLogoDrop');
        const logoThumb = $('imgQrLogoThumb');
        const logoName = $('imgQrLogoName');
        const logoClearBtn = $('imgQrLogoClearBtn');
        const filenameInput = $('imgQrFilename');
        const historyEl = $('imgQrHistory');

        const canvas = $('imgQrCanvas');
        const emptyHint = $('imgQrEmptyHint');
        const meta = $('imgQrMeta');
        const downloadBtn = $('imgQrDownloadBtn');
        const svgBtn = $('imgQrSvgBtn');
        const copyBtn = $('imgQrCopyBtn');

        const scanDrop = $('imgQrScanDropzone');
        const scanCanvas = $('imgQrScanCanvas');
        const scanEmpty = $('imgQrScanEmpty');
        const scanStatus = $('imgQrScanStatus');
        const scanResult = $('imgQrScanResult');
        const scanType = $('imgQrScanType');
        const scanCopyBtn = $('imgQrScanCopyBtn');
        const scanOpenBtn = $('imgQrScanOpenBtn');
        const scanFillBtn = $('imgQrScanFillBtn');

        const state = {
            tab: 'generate',
            type: 'text',
            level: 'M',
            size: 300,
            sizeMode: '300',
            fg: '#000000',
            bg: '#ffffff',
            margin: 2,
            radius: 0,
            wifiAuth: 'WPA',
            history: []
        };

        let logoImg = null;
        let logoUrl = '';
        let lastModules = null;
        let lastPayload = '';
        let levelLockedByLogo = false;

        const persist = (key, value) => {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        };

        function setSeg(btns, attr, value) {
            btns.forEach((btn) => {
                const on = String(btn.dataset[attr]) === String(value);
                btn.classList.toggle('active', on);
                if (btn.hasAttribute('role')) btn.setAttribute('aria-checked', String(on));
                if (btn.getAttribute('role') === 'tab') btn.setAttribute('aria-selected', String(on));
            });
        }

        function setTab(tab) {
            state.tab = tab;
            setSeg(tabBtns, 'qrtab', tab);
            paneGen.classList.toggle('hidden', tab !== 'generate');
            paneScan.classList.toggle('hidden', tab !== 'scan');
            persist('imgQrTab', tab);
        }

        function syncTypeForms() {
            setSeg(typeBtns, 'qtype', state.type);
            formText.classList.toggle('hidden', state.type !== 'text');
            formUrl.classList.toggle('hidden', state.type !== 'url');
            formWifi.classList.toggle('hidden', state.type !== 'wifi');
            formVcard.classList.toggle('hidden', state.type !== 'vcard');
        }

        function syncControls() {
            setSeg(levelBtns, 'level', state.level);
            setSeg(sizeBtns, 'size', state.sizeMode);
            sizeCustomWrap.classList.toggle('hidden', state.sizeMode !== 'custom');
            sizeCustom.value = String(state.size);
            fgInput.value = state.fg;
            bgInput.value = state.bg;
            marginInput.value = String(state.margin);
            marginValue.textContent = String(state.margin);
            radiusInput.value = String(state.radius);
            radiusValue.textContent = `${state.radius}%`;
            setSeg(wauthBtns, 'wauth', state.wifiAuth);
            levelNote.classList.toggle('hidden', !logoImg);
            syncTypeForms();
        }

        function currentPayload() {
            if (state.type === 'url') {
                let u = (urlInput.value || '').trim();
                if (u && !/^https?:\/\//i.test(u) && /^www\./i.test(u)) u = 'https://' + u;
                return u;
            }
            if (state.type === 'wifi') {
                return buildWifi({
                    ssid: wifiSsid.value.trim(),
                    password: wifiPass.value,
                    auth: state.wifiAuth,
                    hidden: wifiHidden.checked
                });
            }
            if (state.type === 'vcard') {
                const card = {
                    name: vcName.value.trim(),
                    tel: vcTel.value.trim(),
                    email: vcEmail.value.trim(),
                    org: vcOrg.value.trim(),
                    url: vcUrl.value.trim()
                };
                if (!card.name && !card.tel && !card.email && !card.org && !card.url) return '';
                return buildVCard(card);
            }
            return textInput.value.trim();
        }

        function resolvedSize() {
            if (state.sizeMode === 'custom') {
                return Math.max(64, Math.min(2048, Number(sizeCustom.value) || 300));
            }
            return Number(state.sizeMode) || 300;
        }

        function renderHistory() {
            historyEl.replaceChildren();
            if (!state.history.length) return;
            const title = document.createElement('div');
            title.className = 'cvt-label';
            title.textContent = '最近生成';
            historyEl.append(title);
            const list = document.createElement('div');
            list.className = 'qr-history-list';
            state.history.forEach((item, idx) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'qr-history-item';
                btn.dataset.idx = String(idx);
                const kind = document.createElement('em');
                kind.textContent = ({ text: '文本', url: 'URL', wifi: 'Wi‑Fi', vcard: '名片' })[item.type] || item.type;
                const span = document.createElement('span');
                span.textContent = item.text;
                span.title = item.text;
                btn.append(kind, span);
                list.append(btn);
            });
            historyEl.append(list);
        }

        function saveHistory(text) {
            state.history = historyPush(state.history, { text, type: detectPayloadType(text) });
            persist('imgQrHistory', state.history);
            renderHistory();
        }

        function fillFromPayload(text) {
            const type = detectPayloadType(text);
            state.type = type === 'wifi' ? 'wifi' : (type === 'vcard' ? 'vcard' : (type === 'url' ? 'url' : 'text'));
            syncTypeForms();
            if (state.type === 'url') {
                urlInput.value = text;
            } else if (state.type === 'wifi') {
                const w = parseWifi(text);
                wifiSsid.value = w.ssid;
                wifiPass.value = w.password;
                wifiHidden.checked = w.hidden;
                state.wifiAuth = w.auth;
                setSeg(wauthBtns, 'wauth', state.wifiAuth);
            } else if (state.type === 'vcard') {
                const v = parseVCard(text);
                vcName.value = v.name;
                vcTel.value = v.tel;
                vcEmail.value = v.email;
                vcOrg.value = v.org;
                vcUrl.value = v.url;
            } else {
                textInput.value = text;
            }
            persist('imgQrType', state.type);
            schedule();
        }

        function setExportEnabled(on) {
            downloadBtn.disabled = !on;
            svgBtn.disabled = !on;
            copyBtn.disabled = !on;
        }

        function regenerate() {
            const payload = currentPayload();
            lastPayload = payload;
            lastModules = null;
            if (!payload) {
                canvas.classList.add('hidden');
                emptyHint.classList.remove('hidden');
                meta.textContent = '输入内容后自动生成';
                setExportEnabled(false);
                return;
            }

            let level = state.level;
            if (logoImg && level !== 'H') {
                level = 'H';
                if (!levelLockedByLogo) {
                    state.level = 'H';
                    levelLockedByLogo = true;
                    setSeg(levelBtns, 'level', 'H');
                    persist('imgQrLevel', 'H');
                }
            }
            levelNote.classList.toggle('hidden', !logoImg);

            let built;
            try {
                built = buildModules(payload, level);
            } catch (err) {
                canvas.classList.add('hidden');
                emptyHint.classList.remove('hidden');
                emptyHint.textContent = err.message || '内容过长，请缩短或提高纠错等级';
                meta.textContent = '生成失败';
                setExportEnabled(false);
                return;
            }
            if (!built) {
                emptyHint.textContent = '二维码库不可用';
                setExportEnabled(false);
                return;
            }

            lastModules = built.modules;
            const size = resolvedSize();
            state.size = size;
            paintQrCanvas(built.modules, {
                size,
                margin: state.margin,
                radiusPct: state.radius,
                fg: state.fg,
                bg: state.bg,
                logoImage: logoImg
            }, canvas);
            canvas.classList.remove('hidden');
            emptyHint.classList.add('hidden');
            meta.textContent = `${size}×${size}px · ${built.moduleCount}×${built.moduleCount} 模块 · 版本 ${built.typeNumber} · ${level}`;
            setExportEnabled(true);
            scheduleHistory(payload);
        }

        const schedule = debounce(regenerate, 200);
        // History waits longer so intermediate keystrokes are not stored.
        const scheduleHistory = debounce((payload) => { saveHistory(payload); }, 1200);

        // ---------- Tabs / type ----------

        tabBtns.forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.qrtab)));
        typeBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.type = btn.dataset.qtype;
            persist('imgQrType', state.type);
            syncTypeForms();
            schedule();
        }));

        [textInput, urlInput, wifiSsid, wifiPass, wifiHidden, vcName, vcTel, vcEmail, vcOrg, vcUrl].forEach((el) => {
            el.addEventListener('input', schedule);
            el.addEventListener('change', schedule);
        });
        wauthBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.wifiAuth = btn.dataset.wauth;
            setSeg(wauthBtns, 'wauth', state.wifiAuth);
            schedule();
        }));

        levelBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.level = btn.dataset.level;
            levelLockedByLogo = false;
            persist('imgQrLevel', state.level);
            setSeg(levelBtns, 'level', state.level);
            schedule();
        }));

        sizeBtns.forEach((btn) => btn.addEventListener('click', () => {
            state.sizeMode = btn.dataset.size;
            if (state.sizeMode !== 'custom') state.size = Number(state.sizeMode);
            persist('imgQrSize', state.sizeMode === 'custom' ? state.size : Number(state.sizeMode));
            syncControls();
            schedule();
        }));
        sizeCustom.addEventListener('input', () => {
            state.size = Math.max(64, Math.min(2048, Number(sizeCustom.value) || 300));
            persist('imgQrSize', state.size);
            schedule();
        });

        fgInput.addEventListener('input', () => {
            state.fg = fgInput.value;
            persist('imgQrFg', state.fg);
            schedule();
        });
        bgInput.addEventListener('input', () => {
            state.bg = bgInput.value;
            persist('imgQrBg', state.bg);
            schedule();
        });
        marginInput.addEventListener('input', () => {
            state.margin = Number(marginInput.value);
            marginValue.textContent = String(state.margin);
            persist('imgQrMargin', state.margin);
            schedule();
        });
        radiusInput.addEventListener('input', () => {
            state.radius = Number(radiusInput.value);
            radiusValue.textContent = `${state.radius}%`;
            persist('imgQrRadius', state.radius);
            schedule();
        });

        ImageUtils.createDropZone(logoDrop, {
            enablePaste: false,
            onFile: async (file) => {
                const url = URL.createObjectURL(file);
                try {
                    const img = await new Promise((resolve, reject) => {
                        const image = new Image();
                        image.onload = () => resolve(image);
                        image.onerror = () => reject(new Error('Logo 加载失败'));
                        image.src = url;
                    });
                    if (logoUrl) URL.revokeObjectURL(logoUrl);
                    logoUrl = url;
                    logoImg = img;
                    logoThumb.src = url;
                    logoThumb.classList.remove('hidden');
                    logoName.textContent = `${file.name}（${img.naturalWidth}×${img.naturalHeight}）`;
                    logoClearBtn.classList.remove('hidden');
                    if (state.level !== 'H') {
                        state.level = 'H';
                        levelLockedByLogo = true;
                        persist('imgQrLevel', 'H');
                        setSeg(levelBtns, 'level', 'H');
                    }
                    levelNote.classList.remove('hidden');
                    schedule();
                } catch (err) {
                    URL.revokeObjectURL(url);
                    logoName.textContent = err.message || 'Logo 加载失败';
                }
            }
        });
        logoClearBtn.addEventListener('click', () => {
            if (logoUrl) URL.revokeObjectURL(logoUrl);
            logoUrl = '';
            logoImg = null;
            logoThumb.classList.add('hidden');
            logoThumb.removeAttribute('src');
            logoName.textContent = '点击 / 拖拽小图（建议正方形透明 PNG）';
            logoClearBtn.classList.add('hidden');
            levelNote.classList.add('hidden');
            levelLockedByLogo = false;
            schedule();
        });

        historyEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.qr-history-item');
            if (!btn) return;
            const item = state.history[Number(btn.dataset.idx)];
            if (item) fillFromPayload(item.text);
        });

        function fileStem() {
            return sanitizeName(filenameInput.value);
        }

        downloadBtn.addEventListener('click', async () => {
            if (!canvas.width) return;
            if (lastPayload) saveHistory(lastPayload);
            await ImageUtils.downloadCanvas(canvas, `${fileStem()}.png`, 'image/png');
        });

        svgBtn.addEventListener('click', () => {
            if (!lastModules) return;
            if (lastPayload) saveHistory(lastPayload);
            const svg = modulesToSvg(lastModules, {
                size: resolvedSize(),
                margin: state.margin,
                radiusPct: state.radius,
                fg: state.fg,
                bg: state.bg
            });
            // Logo is painted on canvas only; SVG exports modules + colors/radius/margin.
            ImageUtils.downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${fileStem()}.svg`);
        });

        copyBtn.addEventListener('click', async () => {
            if (!canvas.width) return;
            if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
                copyBtn.textContent = '不支持';
                setTimeout(() => { copyBtn.textContent = '复制图片'; }, 1200);
                return;
            }
            try {
                if (lastPayload) saveHistory(lastPayload);
                const blob = await ImageUtils.canvasToBlob(canvas, 'image/png');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                copyBtn.textContent = '已复制';
                setTimeout(() => { copyBtn.textContent = '复制图片'; }, 1200);
            } catch (_) {
                copyBtn.textContent = '复制失败';
                setTimeout(() => { copyBtn.textContent = '复制图片'; }, 1200);
            }
        });

        // ---------- Scan ----------

        function setScanActions(text) {
            const has = !!text;
            scanCopyBtn.disabled = !has;
            scanFillBtn.disabled = !has;
            const type = detectPayloadType(text);
            scanType.textContent = has
                ? ({ text: '文本', url: 'URL', wifi: 'Wi‑Fi 配置', vcard: '名片 vCard' })[type]
                : '';
            const isUrl = type === 'url';
            scanOpenBtn.classList.toggle('hidden', !isUrl);
            scanOpenBtn.disabled = !isUrl;
        }

        function showScanCanvas(sourceCanvas, location) {
            scanCanvas.width = sourceCanvas.width;
            scanCanvas.height = sourceCanvas.height;
            const ctx = scanCanvas.getContext('2d');
            ctx.drawImage(sourceCanvas, 0, 0);
            if (location) {
                const pts = [
                    location.topLeftCorner,
                    location.topRightCorner,
                    location.bottomRightCorner,
                    location.bottomLeftCorner
                ];
                ctx.strokeStyle = '#1F6FEB';
                ctx.lineWidth = Math.max(2, Math.round(Math.min(scanCanvas.width, scanCanvas.height) * 0.008));
                ctx.beginPath();
                pts.forEach((p, i) => {
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
                ctx.stroke();
            }
            scanCanvas.classList.remove('hidden');
            scanEmpty.classList.add('hidden');
            // Collapse the dropzone to a "更换图片" strip instead of hiding it blank.
            scanDrop.classList.add('has-file');
        }

        ImageUtils.createDropZone(scanDrop, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                scanStatus.textContent = '识别中…';
                try {
                    const { img } = await ImageUtils.loadImageFile(file);
                    const maxSide = 1600;
                    const long = Math.max(img.naturalWidth, img.naturalHeight);
                    const scale = long > maxSide ? maxSide / long : 1;
                    const w = Math.max(1, Math.round(img.naturalWidth * scale));
                    const h = Math.max(1, Math.round(img.naturalHeight * scale));
                    const tmp = document.createElement('canvas');
                    tmp.width = w;
                    tmp.height = h;
                    const tctx = tmp.getContext('2d');
                    tctx.drawImage(img, 0, 0, w, h);
                    const imageData = tctx.getImageData(0, 0, w, h);
                    const decoded = typeof jsQR === 'function'
                        ? jsQR(imageData.data, imageData.width, imageData.height)
                        : null;
                    if (decoded && decoded.data) {
                        showScanCanvas(tmp, decoded.location);
                        scanResult.value = decoded.data;
                        scanStatus.textContent = '识别成功';
                        setScanActions(decoded.data);
                    } else {
                        showScanCanvas(tmp, null);
                        scanResult.value = '';
                        scanStatus.textContent = '未识别到二维码，请尝试更清晰的图片';
                        setScanActions('');
                    }
                    tmp.width = tmp.height = 0;
                } catch (e) {
                    scanResult.value = '';
                    scanStatus.textContent = '识别失败：' + e.message;
                    setScanActions('');
                }
            }
        });

        scanCopyBtn.addEventListener('click', () => ImageUtils.copyText(scanResult.value, scanCopyBtn));
        scanOpenBtn.addEventListener('click', () => {
            let u = scanResult.value.trim();
            if (!u) return;
            if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
            window.open(u, '_blank', 'noopener,noreferrer');
        });
        scanFillBtn.addEventListener('click', () => {
            const text = scanResult.value.trim();
            if (!text) return;
            setTab('generate');
            fillFromPayload(text);
        });

        // ---------- Init ----------

        setExportEnabled(false);
        setScanActions('');
        syncControls();
        setTab('generate');
        renderHistory();

        const savedPromise = typeof Settings !== 'undefined' ? Settings.load().catch(() => ({})) : Promise.resolve({});
        savedPromise.then((saved) => {
            if (!saved) return;
            if (saved.imgQrTab === 'scan' || saved.imgQrTab === 'generate') setTab(saved.imgQrTab);
            if (saved.imgQrType) state.type = saved.imgQrType;
            if (saved.imgQrLevel) state.level = saved.imgQrLevel;
            if (Number.isFinite(saved.imgQrSize)) {
                const s = saved.imgQrSize;
                if ([200, 300, 400, 512].includes(s)) {
                    state.sizeMode = String(s);
                    state.size = s;
                } else {
                    state.sizeMode = 'custom';
                    state.size = s;
                }
            }
            if (saved.imgQrFg) state.fg = saved.imgQrFg;
            if (saved.imgQrBg) state.bg = saved.imgQrBg;
            if (Number.isFinite(saved.imgQrMargin)) state.margin = saved.imgQrMargin;
            if (Number.isFinite(saved.imgQrRadius)) state.radius = saved.imgQrRadius;
            if (Array.isArray(saved.imgQrHistory)) state.history = saved.imgQrHistory.slice(0, HISTORY_LIMIT);
            syncControls();
            renderHistory();
            schedule();
        });
    }

    DevKit.ImageQr = {
        buildWifi,
        buildVCard,
        detectPayloadType,
        parseWifi,
        parseVCard,
        historyPush,
        paintQrCanvas,
        modulesToSvg,
        escapeWifi
    };
    DevKit.ImageTools.qrcode = { init: initQrcode };
})();
