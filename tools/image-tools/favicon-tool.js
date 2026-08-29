// Image Tools - Favicon Generator
// Resizes a source image to the standard favicon sizes, offers per-size PNG
// downloads plus a combined multi-size .ico (via utils/ico-encoder.js) and a
// ready-to-paste <link>/manifest snippet.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    const FAVICON_SIZES = [16, 32, 48, 64, 128, 180, 192, 512];
    const MAX_ICO_SIZE = 256;

    function initFavicon() {
        const dropzone = document.getElementById('imgFaviconDropzone');
        if (!dropzone) return;
        const hint = document.getElementById('imgFaviconHint');
        const icoBtn = document.getElementById('imgFaviconIcoBtn');
        const status = document.getElementById('imgFaviconStatus');
        const grid = document.getElementById('imgFaviconGrid');
        const snippet = document.getElementById('imgFaviconSnippet');
        const copySnippetBtn = document.getElementById('imgFaviconCopySnippetBtn');

        let sizesData = []; // { size, blob }

        function buildCell(size, blob) {
            const cell = document.createElement('div');
            cell.className = 'img-favicon-cell';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(blob);
            img.alt = `${size}x${size}`;

            const label = document.createElement('span');
            label.className = 'img-favicon-cell-label';
            label.textContent = `${size}×${size}`;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tool-btn-action tech-btn';
            btn.textContent = '下载';
            btn.addEventListener('click', () => {
                ImageUtils.downloadBlob(blob, `favicon-${size}x${size}.png`);
            });

            cell.append(img, label, btn);
            return cell;
        }

        function buildSnippet() {
            const manifest = {
                icons: [
                    { src: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' }
                ]
            };
            return [
                '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
                '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
                '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180x180.png">',
                '<link rel="icon" href="/favicon.ico">',
                '<link rel="manifest" href="/site.webmanifest">',
                '',
                '<!-- site.webmanifest -->',
                JSON.stringify(manifest, null, 2)
            ].join('\n');
        }

        ImageUtils.createDropZone(dropzone, {
            onFile: async (file) => {
                if (!file.type || !file.type.startsWith('image/')) return;
                status.classList.remove('hidden');
                status.textContent = '生成中...';
                icoBtn.disabled = true;
                try {
                    const { img } = await ImageUtils.loadImageFile(file);
                    hint.classList.add('hidden');
                    grid.innerHTML = '';
                    sizesData = [];
                    for (const size of FAVICON_SIZES) {
                        const canvas = ImageUtils.drawToCanvas(img, size, size);
                        const blob = await ImageUtils.canvasToBlob(canvas, 'image/png');
                        sizesData.push({ size, blob });
                        grid.appendChild(buildCell(size, blob));
                    }
                    status.textContent = `已生成 ${FAVICON_SIZES.length} 个尺寸`;
                    snippet.value = buildSnippet();
                    icoBtn.disabled = false;
                } catch (e) {
                    status.textContent = '生成失败：' + e.message;
                }
            }
        });

        icoBtn.addEventListener('click', async () => {
            if (!sizesData.length) return;
            const icoEntries = sizesData.filter(d => d.size <= MAX_ICO_SIZE);
            try {
                const icoBlob = await IcoEncoder.encode(icoEntries);
                ImageUtils.downloadBlob(icoBlob, 'favicon.ico');
            } catch (e) {
                status.classList.remove('hidden');
                status.textContent = '生成 .ico 失败：' + e.message;
            }
        });

        copySnippetBtn.addEventListener('click', () => ImageUtils.copyText(snippet.value, copySnippetBtn));
    }

    DevKit.ImageTools.favicon = { init: initFavicon };
})();
