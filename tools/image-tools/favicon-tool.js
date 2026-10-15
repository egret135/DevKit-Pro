// Image Tools - Favicon Generator
// Layout A: source + options | preview + size grid + exports.
// Packs, fit/pad/bg, maskable Android, ICO / ZIP / manifest, configurable HTML snippet.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const MAX_ICO_SIZE = 256;
    const MASKABLE_SAFE = 0.8;

    const PACKS = {
        standard: { sizes: [16, 32, 48], maskable: [] },
        apple: { sizes: [180], maskable: [] },
        android: { sizes: [192, 512], maskable: [192, 512] },
        all: { sizes: [16, 32, 48, 64, 128, 180, 192, 512], maskable: [] }
    };

    function clamp(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    function joinPath(prefix, name) {
        const p = String(prefix || '/').trim() || '/';
        if (/^https?:\/\//i.test(p)) {
            return p.replace(/\/?$/, '/') + name.replace(/^\//, '');
        }
        const base = p.endsWith('/') ? p : p + '/';
        return (base.startsWith('/') ? base : '/' + base) + name.replace(/^\//, '');
    }

    function fileNameFor(size, maskable) {
        if (size === 180) return 'apple-touch-icon-180x180.png';
        if (maskable && (size === 192 || size === 512)) {
            return `android-chrome-${size}x${size}.png`;
        }
        return `favicon-${size}x${size}.png`;
    }

    /**
     * Draw source into a square canvas with fit / pad / background / optional maskable safe zone.
     * @returns {HTMLCanvasElement}
     */
    function drawFavicon(img, size, opts) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const transparent = !!opts.transparent;
        const bg = opts.bg || '#ffffff';
        if (!transparent) {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, size, size);
        } else {
            ctx.clearRect(0, 0, size, size);
        }

        const padPct = clamp(Number(opts.pad) || 0, 0, 40) / 100;
        const maskable = !!opts.maskable;
        // Maskable icons reserve ~80% safe zone; combine with user pad inside that zone.
        const outer = maskable ? MASKABLE_SAFE : 1;
        const inner = 1 - padPct;
        const box = size * outer * inner;
        const boxX = (size - box) / 2;
        const boxY = (size - box) / 2;

        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return canvas;

        const fit = opts.fit === 'cover' ? 'cover' : 'contain';
        const scale = fit === 'cover'
            ? Math.max(box / iw, box / ih)
            : Math.min(box / iw, box / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = boxX + (box - dw) / 2;
        const dy = boxY + (box - dh) / 2;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (fit === 'cover') {
            ctx.save();
            ctx.beginPath();
            ctx.rect(boxX, boxY, box, box);
            ctx.clip();
            ctx.drawImage(img, dx, dy, dw, dh);
            ctx.restore();
        } else {
            ctx.drawImage(img, dx, dy, dw, dh);
        }
        return canvas;
    }

    function resolveSizes(packIds) {
        const sizeSet = new Set();
        const maskableSet = new Set();
        (packIds || []).forEach((id) => {
            const pack = PACKS[id];
            if (!pack) return;
            pack.sizes.forEach((s) => sizeSet.add(s));
            pack.maskable.forEach((s) => maskableSet.add(s));
        });
        if (!sizeSet.size) {
            PACKS.standard.sizes.forEach((s) => sizeSet.add(s));
        }
        const sizes = [...sizeSet].sort((a, b) => a - b);
        return { sizes, maskableSet };
    }

    function initFavicon() {
        const dropzone = document.getElementById('imgFaviconDropzone');
        if (!dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('imgFaviconStatus');
        const grid = $('imgFaviconGrid');
        const snippet = $('imgFaviconSnippet');
        const copySnippetBtn = $('imgFaviconCopySnippetBtn');
        const icoBtn = $('imgFaviconIcoBtn');
        const zipBtn = $('imgFavZipBtn');
        const manifestBtn = $('imgFavManifestBtn');
        const padInput = $('imgFavPad');
        const padValue = $('imgFavPadValue');
        const bgTransparent = $('imgFavBgTransparent');
        const bgInput = $('imgFavBg');
        const prefixInput = $('imgFavPrefix');
        const optApple = $('imgFavOptApple');
        const optManifest = $('imgFavOptManifest');
        const optTheme = $('imgFavOptTheme');
        const themeColor = $('imgFavThemeColor');
        const packRoot = $('imgFavPacks');
        const previewEmpty = $('imgFavPreviewEmpty');
        const tabIcon = $('imgFavTabIcon');
        const maskCircle = $('imgFavMaskCircle');
        const maskSquircle = $('imgFavMaskSquircle');
        const maskSquare = $('imgFavMaskSquare');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            packs: Array.isArray(defaults.imgFavPacks) ? [...defaults.imgFavPacks] : ['standard'],
            fit: defaults.imgFavFit || 'contain',
            pad: Number.isFinite(defaults.imgFavPad) ? defaults.imgFavPad : 0,
            bg: defaults.imgFavBg || '#ffffff',
            transparent: defaults.imgFavBgTransparent !== false,
            prefix: defaults.imgFavPrefix != null ? defaults.imgFavPrefix : '/',
            optApple: defaults.imgFavOptApple !== false,
            optManifest: defaults.imgFavOptManifest !== false,
            optTheme: defaults.imgFavOptTheme !== false,
            themeColor: defaults.imgFavThemeColor || '#1F6FEB',
            sourceImg: null,
            sizesData: [], // { size, blob, url, maskable, name }
            previewUrl: null,
            genToken: 0
        };

        let debounceTimer = null;

        function persist(key, value) {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        }

        function setExportEnabled(on) {
            icoBtn.disabled = !on;
            zipBtn.disabled = !on;
            manifestBtn.disabled = !on;
            copySnippetBtn.disabled = !on;
        }

        function revokeAll() {
            state.sizesData.forEach((d) => {
                if (d.url) URL.revokeObjectURL(d.url);
            });
            state.sizesData = [];
            if (state.previewUrl) {
                URL.revokeObjectURL(state.previewUrl);
                state.previewUrl = null;
            }
        }

        function syncPackUi() {
            if (!packRoot) return;
            packRoot.querySelectorAll('[data-pack]').forEach((btn) => {
                const on = state.packs.includes(btn.dataset.pack);
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        }

        function syncFitUi() {
            dropzone.closest('.fav-settings-card')
                ?.querySelectorAll('[data-fit]').forEach((btn) => {
                    const on = btn.dataset.fit === state.fit;
                    btn.classList.toggle('active', on);
                    btn.setAttribute('aria-checked', on ? 'true' : 'false');
                });
        }

        function syncFormFromState() {
            syncPackUi();
            syncFitUi();
            if (padInput) padInput.value = String(state.pad);
            if (padValue) padValue.textContent = `${state.pad}%`;
            if (bgTransparent) bgTransparent.checked = state.transparent;
            if (bgInput) {
                bgInput.value = state.bg;
                bgInput.disabled = state.transparent;
            }
            if (prefixInput) prefixInput.value = state.prefix;
            if (optApple) optApple.checked = state.optApple;
            if (optManifest) optManifest.checked = state.optManifest;
            if (optTheme) optTheme.checked = state.optTheme;
            if (themeColor) {
                themeColor.value = state.themeColor;
                themeColor.disabled = !state.optTheme;
            }
        }

        function buildManifestJson() {
            const icons = state.sizesData
                .filter((d) => d.size === 192 || d.size === 512)
                .map((d) => ({
                    src: joinPath(state.prefix, d.name),
                    sizes: `${d.size}x${d.size}`,
                    type: 'image/png',
                    purpose: d.maskable ? 'maskable' : 'any'
                }));
            if (!icons.length) {
                // Fallback: largest two or whatever we have
                const sorted = [...state.sizesData].sort((a, b) => b.size - a.size);
                sorted.slice(0, 2).forEach((d) => {
                    icons.push({
                        src: joinPath(state.prefix, d.name),
                        sizes: `${d.size}x${d.size}`,
                        type: 'image/png',
                        purpose: d.maskable ? 'maskable' : 'any'
                    });
                });
            }
            return {
                name: 'App',
                short_name: 'App',
                icons,
                theme_color: state.themeColor,
                background_color: state.transparent ? '#ffffff' : state.bg,
                display: 'standalone'
            };
        }

        function buildSnippet() {
            const lines = [];
            const bySize = new Map(state.sizesData.map((d) => [d.size, d]));
            const addIcon = (size) => {
                const d = bySize.get(size);
                if (!d) return;
                lines.push(
                    `<link rel="icon" type="image/png" sizes="${size}x${size}" href="${joinPath(state.prefix, d.name)}">`
                );
            };
            addIcon(16);
            addIcon(32);
            if (bySize.has(48)) addIcon(48);

            if (state.optApple && bySize.has(180)) {
                const d = bySize.get(180);
                lines.push(
                    `<link rel="apple-touch-icon" sizes="180x180" href="${joinPath(state.prefix, d.name)}">`
                );
            }

            lines.push(`<link rel="icon" href="${joinPath(state.prefix, 'favicon.ico')}">`);

            if (state.optTheme) {
                lines.push(`<meta name="theme-color" content="${state.themeColor}">`);
            }

            if (state.optManifest) {
                lines.push(`<link rel="manifest" href="${joinPath(state.prefix, 'site.webmanifest')}">`);
                lines.push('');
                lines.push('<!-- site.webmanifest -->');
                lines.push(JSON.stringify(buildManifestJson(), null, 2));
            }
            return lines.join('\n');
        }

        function updateSnippetOnly() {
            if (!state.sizesData.length) {
                snippet.value = '';
                return;
            }
            snippet.value = buildSnippet();
        }

        function updatePreview(preferredBlob) {
            const blob = preferredBlob
                || (state.sizesData.find((d) => d.size === 180)
                    || state.sizesData.find((d) => d.size === 192)
                    || state.sizesData[state.sizesData.length - 1]
                    || {}).blob;
            if (!blob) {
                if (previewEmpty) previewEmpty.classList.remove('hidden');
                [tabIcon, maskCircle, maskSquircle, maskSquare].forEach((el) => {
                    if (el) {
                        el.removeAttribute('src');
                        el.classList.add('hidden');
                    }
                });
                return;
            }
            if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
            state.previewUrl = URL.createObjectURL(blob);
            if (previewEmpty) previewEmpty.classList.add('hidden');
            [tabIcon, maskCircle, maskSquircle, maskSquare].forEach((el) => {
                if (el) {
                    el.src = state.previewUrl;
                    el.classList.remove('hidden');
                }
            });
        }

        function buildCell(entry) {
            const cell = document.createElement('div');
            cell.className = 'img-favicon-cell';

            const img = document.createElement('img');
            img.src = entry.url;
            img.alt = `${entry.size}x${entry.size}`;

            const label = document.createElement('span');
            label.className = 'img-favicon-cell-label';
            label.textContent = entry.maskable
                ? `${entry.size}×${entry.size} · maskable`
                : `${entry.size}×${entry.size}`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tool-btn-action tech-btn';
            btn.textContent = '下载';
            btn.addEventListener('click', () => {
                ImageUtils.downloadBlob(entry.blob, entry.name);
            });

            cell.append(img, label, btn);
            return cell;
        }

        async function regenerate() {
            if (!state.sourceImg) return;
            const token = ++state.genToken;
            status.textContent = '生成中…';
            setExportEnabled(false);

            const { sizes, maskableSet } = resolveSizes(state.packs);
            const optsBase = {
                fit: state.fit,
                pad: state.pad,
                bg: state.bg,
                transparent: state.transparent
            };

            try {
                const next = [];
                for (const size of sizes) {
                    const maskable = maskableSet.has(size);
                    const canvas = drawFavicon(state.sourceImg, size, { ...optsBase, maskable });
                    const blob = await ImageUtils.canvasToBlob(canvas, 'image/png');
                    if (token !== state.genToken) return;
                    const name = fileNameFor(size, maskable);
                    const url = URL.createObjectURL(blob);
                    next.push({ size, blob, url, maskable, name });
                }
                if (token !== state.genToken) {
                    next.forEach((d) => URL.revokeObjectURL(d.url));
                    return;
                }

                revokeAll();
                state.sizesData = next;
                grid.innerHTML = '';
                next.forEach((entry) => grid.appendChild(buildCell(entry)));
                updatePreview();
                updateSnippetOnly();
                setExportEnabled(true);
                dropzone.classList.add('has-file');
                status.textContent = `已生成 ${next.length} 个尺寸`;
            } catch (e) {
                if (token !== state.genToken) return;
                status.textContent = '生成失败：' + e.message;
                setExportEnabled(false);
            }
        }

        function scheduleRegen() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                regenerate();
            }, 180);
        }

        async function loadSettings() {
            if (typeof Settings === 'undefined') return;
            try {
                const s = await Settings.load();
                if (Array.isArray(s.imgFavPacks) && s.imgFavPacks.length) {
                    state.packs = s.imgFavPacks.filter((p) => PACKS[p]);
                    if (!state.packs.length) state.packs = ['standard'];
                }
                if (s.imgFavFit === 'cover' || s.imgFavFit === 'contain') state.fit = s.imgFavFit;
                if (Number.isFinite(s.imgFavPad)) state.pad = clamp(s.imgFavPad, 0, 40);
                if (typeof s.imgFavBg === 'string') state.bg = s.imgFavBg;
                if (typeof s.imgFavBgTransparent === 'boolean') state.transparent = s.imgFavBgTransparent;
                if (typeof s.imgFavPrefix === 'string') state.prefix = s.imgFavPrefix;
                if (typeof s.imgFavOptApple === 'boolean') state.optApple = s.imgFavOptApple;
                if (typeof s.imgFavOptManifest === 'boolean') state.optManifest = s.imgFavOptManifest;
                if (typeof s.imgFavOptTheme === 'boolean') state.optTheme = s.imgFavOptTheme;
                if (typeof s.imgFavThemeColor === 'string') state.themeColor = s.imgFavThemeColor;
            } catch (_) { /* ignore */ }
        }

        // --- UI bindings ---
        packRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-pack]');
            if (!btn) return;
            const id = btn.dataset.pack;
            if (!PACKS[id]) return;
            const set = new Set(state.packs);
            if (set.has(id)) {
                if (set.size === 1) return; // keep at least one
                set.delete(id);
            } else {
                set.add(id);
            }
            state.packs = [...set];
            syncPackUi();
            persist('imgFavPacks', state.packs);
            scheduleRegen();
        });

        dropzone.closest('.fav-settings-card')
            ?.querySelectorAll('[data-fit]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    state.fit = btn.dataset.fit === 'cover' ? 'cover' : 'contain';
                    syncFitUi();
                    persist('imgFavFit', state.fit);
                    scheduleRegen();
                });
            });

        padInput?.addEventListener('input', () => {
            state.pad = clamp(Number(padInput.value) || 0, 0, 40);
            if (padValue) padValue.textContent = `${state.pad}%`;
            persist('imgFavPad', state.pad);
            scheduleRegen();
        });

        bgTransparent?.addEventListener('change', () => {
            state.transparent = bgTransparent.checked;
            if (bgInput) bgInput.disabled = state.transparent;
            persist('imgFavBgTransparent', state.transparent);
            scheduleRegen();
        });

        bgInput?.addEventListener('input', () => {
            state.bg = bgInput.value;
            persist('imgFavBg', state.bg);
            scheduleRegen();
        });

        prefixInput?.addEventListener('input', () => {
            state.prefix = prefixInput.value;
            persist('imgFavPrefix', state.prefix);
            updateSnippetOnly();
        });

        optApple?.addEventListener('change', () => {
            state.optApple = optApple.checked;
            persist('imgFavOptApple', state.optApple);
            updateSnippetOnly();
        });
        optManifest?.addEventListener('change', () => {
            state.optManifest = optManifest.checked;
            persist('imgFavOptManifest', state.optManifest);
            updateSnippetOnly();
        });
        optTheme?.addEventListener('change', () => {
            state.optTheme = optTheme.checked;
            if (themeColor) themeColor.disabled = !state.optTheme;
            persist('imgFavOptTheme', state.optTheme);
            updateSnippetOnly();
        });
        themeColor?.addEventListener('input', () => {
            state.themeColor = themeColor.value;
            persist('imgFavThemeColor', state.themeColor);
            updateSnippetOnly();
        });

        ImageUtils.createDropZone(dropzone, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                status.textContent = '加载中…';
                try {
                    const { img } = await ImageUtils.loadImageFile(file);
                    state.sourceImg = img;
                    dropzone.classList.add('has-file');
                    await regenerate();
                } catch (e) {
                    status.textContent = '加载失败：' + e.message;
                    setExportEnabled(false);
                }
            }
        });

        icoBtn.addEventListener('click', async () => {
            if (!state.sizesData.length) return;
            const icoEntries = state.sizesData.filter((d) => d.size <= MAX_ICO_SIZE);
            if (!icoEntries.length) {
                status.textContent = '没有 ≤256px 的尺寸可用于 .ico';
                return;
            }
            try {
                const icoBlob = await IcoEncoder.encode(icoEntries);
                ImageUtils.downloadBlob(icoBlob, 'favicon.ico');
            } catch (e) {
                status.textContent = '生成 .ico 失败：' + e.message;
            }
        });

        zipBtn.addEventListener('click', async () => {
            if (!state.sizesData.length) return;
            try {
                const entries = state.sizesData.map((d) => ({ name: d.name, blob: d.blob }));
                const icoEntries = state.sizesData.filter((d) => d.size <= MAX_ICO_SIZE);
                if (icoEntries.length && typeof IcoEncoder !== 'undefined') {
                    entries.push({ name: 'favicon.ico', blob: await IcoEncoder.encode(icoEntries) });
                }
                const manifestBlob = new Blob(
                    [JSON.stringify(buildManifestJson(), null, 2)],
                    { type: 'application/manifest+json' }
                );
                entries.push({ name: 'site.webmanifest', blob: manifestBlob });
                const zip = await ZipWriter.build(entries);
                ImageUtils.downloadBlob(zip, 'favicon-pack.zip');
            } catch (e) {
                status.textContent = '打包 ZIP 失败：' + e.message;
            }
        });

        manifestBtn.addEventListener('click', () => {
            if (!state.sizesData.length) return;
            const blob = new Blob(
                [JSON.stringify(buildManifestJson(), null, 2)],
                { type: 'application/manifest+json' }
            );
            ImageUtils.downloadBlob(blob, 'site.webmanifest');
        });

        copySnippetBtn.addEventListener('click', () => {
            if (!snippet.value) return;
            ImageUtils.copyText(snippet.value, copySnippetBtn);
        });

        setExportEnabled(false);
        loadSettings().then(() => {
            syncFormFromState();
        });
    }

    DevKit.ImageTools.favicon = { init: initFavicon, drawFavicon, resolveSizes, PACKS };
})();
