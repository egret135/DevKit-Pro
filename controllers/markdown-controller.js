/**
 * MarkdownController - Handles Markdown preview and export functionality
 */
(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    const STORAGE_KEY = 'devkit_pro_markdownInput';

    let ctx = null;
    let lastRenderedHtml = '';
    let debouncedRender = null;
    let debouncedSave = null;
    let pendingSaveValue = null;
    let currentView = 'split';
    let syncScrollFrame = 0;
    let fullscreenIdleTimer = 0;

    const FULLSCREEN_IDLE_MS = 2200;

    const VIEWS = ['edit', 'split', 'preview'];
    const WORDS_PER_MINUTE = 300;

    function init(appCtx) {
        ctx = appCtx;
        const el = ctx.elements;

        debouncedRender = ctx.debounce(() => handleRender(), 300);
        debouncedSave = ctx.debounce((val) => {
            flushSave(val);
        }, 1000);

        // Editor listener
        const markdownEditor = editorManager.get('markdownInput');
        if (markdownEditor) {
            markdownEditor.on('change', () => {
                const val = editorManager.getValue('markdownInput');
                pendingSaveValue = val;
                debouncedRender();
                debouncedSave(val);
            });
            markdownEditor.on('scroll', () => scheduleSyncScroll(markdownEditor));
        }

        initViewControls();

        // Flush pending save before page unload
        window.addEventListener('beforeunload', () => {
            if (pendingSaveValue !== null) {
                flushSave(pendingSaveValue);
            }
        });

        // Floating TOC (outside #markdownPreview so exports omit it)
        if (typeof MarkdownToc !== 'undefined') {
            const previewContainer = el.markdownPreview.closest('.markdown-preview-container');
            MarkdownToc.mount(previewContainer, el.markdownWorkspace);
            syncTocLayout();
        }

        // Restore saved content
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                editorManager.setValue('markdownInput', saved);
                debouncedRender();
            }
        } catch (e) {}

        // Button listeners
        el.clearMarkdownBtn.addEventListener('click', handleClear);
        el.copyMarkdownHtmlBtn.addEventListener('click', handleCopyHtml);
        if (el.exportMarkdownPdfBtn) {
            el.exportMarkdownPdfBtn.addEventListener('click', handleExportPdf);
        }

        // Mermaid chart export/zoom delegation
        el.markdownPreview.addEventListener('click', handleChartExport);

        // Export dropdown
        el.exportMarkdownBtn.addEventListener('click', toggleExportDropdown);
        el.exportMarkdownDropdown.addEventListener('click', handleExport);
        document.addEventListener('click', closeExportDropdown);

        // Fullscreen toggle
        if (el.toggleFullscreenBtn) {
            el.toggleFullscreenBtn.addEventListener('click', toggleFullscreen);
        }

        // Native fullscreen exits (Esc, F11, browser UI) arrive here
        document.addEventListener('fullscreenchange', () => {
            const native = document.fullscreenElement === el.markdownWorkspace;
            if (native !== el.markdownWorkspace.classList.contains('fullscreen-preview')) {
                setFullscreenState(native);
            }
        });

        // Esc for the class-only fallback (browser consumes Esc in native fullscreen)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.fullscreenElement &&
                el.markdownWorkspace.classList.contains('fullscreen-preview')) {
                setFullscreenState(false);
            }
        });

        el.markdownWorkspace.addEventListener('mousemove', wakeFullscreenChrome);
        el.markdownWorkspace.addEventListener('keydown', wakeFullscreenChrome);
    }

    function initViewControls() {
        const workspace = ctx.elements.markdownWorkspace;
        workspace.querySelectorAll('.md-view-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                setView(btn.dataset.view);
                persistSetting('markdownView', currentView);
            });
        });

        const syncChip = document.getElementById('markdownSyncScroll');
        syncChip?.addEventListener('click', () => {
            const on = !syncChip.classList.contains('is-on');
            setSyncChip(on);
            persistSetting('markdownSyncScroll', on);
            if (on) scheduleSyncScroll(editorManager.get('markdownInput'));
        });

        const settings = ctx.getSettings ? ctx.getSettings() : null;
        setView(settings?.markdownView);
        setSyncChip(settings?.markdownSyncScroll !== false);
    }

    // The app keeps its own settings snapshot and saves it wholesale; keep both in step.
    function persistSetting(key, value) {
        const snapshot = ctx.getSettings ? ctx.getSettings() : null;
        if (snapshot) snapshot[key] = value;
        if (typeof Settings !== 'undefined') Settings.set(key, value);
    }

    function setView(view) {
        currentView = VIEWS.includes(view) ? view : 'split';
        const workspace = ctx.elements.markdownWorkspace;
        workspace.dataset.view = currentView;
        workspace.querySelectorAll('.md-view-btn').forEach((btn) => {
            const active = btn.dataset.view === currentView;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        if (currentView !== 'preview') ctx.refreshEditorsIn('markdownInput');
        syncTocLayout();
    }

    function setSyncChip(on) {
        const chip = document.getElementById('markdownSyncScroll');
        if (!chip) return;
        chip.classList.toggle('is-on', !!on);
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    function scheduleSyncScroll(editor) {
        if (!editor || syncScrollFrame) return;
        syncScrollFrame = requestAnimationFrame(() => {
            syncScrollFrame = 0;
            const workspace = ctx.elements.markdownWorkspace;
            if (currentView !== 'split' || workspace.classList.contains('fullscreen-preview')) return;
            if (!document.getElementById('markdownSyncScroll')?.classList.contains('is-on')) return;

            const container = ctx.elements.markdownPreview.closest('.markdown-preview-container');
            if (!container) return;
            const info = editor.getScrollInfo();
            const editorRange = info.height - info.clientHeight;
            const ratio = editorRange > 0 ? info.top / editorRange : 0;
            container.scrollTop = ratio * (container.scrollHeight - container.clientHeight);
        });
    }

    function updateStats(input) {
        const statsEl = document.getElementById('markdownStats');
        if (!statsEl) return;
        if (!input || !input.trim()) {
            statsEl.textContent = '';
            return;
        }
        const cjk = (input.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
        const words = (input.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
        const total = cjk + words;
        const lines = editorManager.get('markdownInput')?.lineCount() || input.split('\n').length;
        const minutes = Math.max(1, Math.round(total / WORDS_PER_MINUTE));
        statsEl.textContent = `${total.toLocaleString()} 字 · ${lines.toLocaleString()} 行 · 约 ${minutes} 分钟阅读`;
    }

    // Preview-only view uses the same left sidebar TOC as fullscreen.
    function syncTocLayout() {
        if (typeof MarkdownToc === 'undefined' || !ctx) return;
        const workspace = ctx.elements.markdownWorkspace;
        const wide = workspace.classList.contains('fullscreen-preview') || currentView === 'preview';
        MarkdownToc.setFullscreen(wide);
    }

    function flushSave(val) {
        try {
            localStorage.setItem(STORAGE_KEY, val);
            pendingSaveValue = null;
        } catch (e) {}
    }

    async function handleRender() {
        const input = editorManager.getValue('markdownInput');
        updateStats(input);

        if (!input.trim()) {
            ctx.elements.markdownPreview.innerHTML = '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
            lastRenderedHtml = '';
            if (typeof MarkdownToc !== 'undefined') MarkdownToc.clear();
            return;
        }

        ctx.setStatus('正在渲染...', 'processing');

        try {
            if (typeof MarkdownRenderer !== 'undefined') {
                // Mermaid diagrams default to curved lines. Per-chart toggles are isolated
                // in MarkdownRenderer and should not change the global render default.
                const html = await MarkdownRenderer.render(input, { curve: 'basis' });
                ctx.elements.markdownPreview.innerHTML = html;
                lastRenderedHtml = html;

                if (typeof CodeBlockEnhancer !== 'undefined') {
                    CodeBlockEnhancer.init(ctx.elements.markdownPreview, { autoFormat: true });
                }

                if (typeof Prism !== 'undefined') {
                    Prism.highlightAllUnder(ctx.elements.markdownPreview);
                }

                if (typeof MarkdownToc !== 'undefined') {
                    MarkdownToc.update(ctx.elements.markdownPreview);
                }

                ctx.setStatus('渲染完成', 'success');
            } else {
                throw new Error('Markdown 渲染器未加载');
            }
        } catch (error) {
            ctx.elements.markdownPreview.innerHTML = `<p class="placeholder" style="color: var(--color-error);">渲染错误: ${error.message}</p>`;
            if (typeof MarkdownToc !== 'undefined') MarkdownToc.clear();
            ctx.setStatus('渲染失败', 'error');
        }
    }

    function handleClear() {
        editorManager.setValue('markdownInput', '');
        updateStats('');
        ctx.elements.markdownPreview.innerHTML = '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
        lastRenderedHtml = '';
        if (typeof MarkdownToc !== 'undefined') MarkdownToc.clear();
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
        ctx.setStatus('Markdown 已清除', 'ready');
    }

    function toggleFullscreen() {
        const workspace = ctx.elements.markdownWorkspace;
        if (document.fullscreenElement === workspace) {
            document.exitFullscreen().catch(() => setFullscreenState(false));
            return;
        }
        if (workspace.classList.contains('fullscreen-preview')) {
            setFullscreenState(false);
            return;
        }
        if (workspace.requestFullscreen) {
            workspace.requestFullscreen()
                .then(() => setFullscreenState(true))
                .catch(() => setFullscreenState(true));
        } else {
            setFullscreenState(true);
        }
    }

    function setFullscreenState(on) {
        const workspace = ctx.elements.markdownWorkspace;
        workspace.classList.toggle('fullscreen-preview', on);

        const btn = ctx.elements.toggleFullscreenBtn;
        if (btn) {
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.title = on ? '退出沉浸阅读 (Esc)' : '沉浸阅读 (Esc 退出)';
            const label = btn.querySelector('.md-fs-label');
            if (label) label.textContent = on ? '退出' : '全屏';
        }

        if (on) {
            syncTocLayout();
            wakeFullscreenChrome();
        } else {
            clearTimeout(fullscreenIdleTimer);
            workspace.classList.remove('is-idle');
            setView(currentView);
        }
        ctx.setStatus(on ? '沉浸阅读 (按 Esc 退出)' : '正常视图', 'ready');
    }

    function wakeFullscreenChrome() {
        const workspace = ctx.elements.markdownWorkspace;
        if (!workspace.classList.contains('fullscreen-preview')) return;
        workspace.classList.remove('is-idle');
        clearTimeout(fullscreenIdleTimer);
        fullscreenIdleTimer = setTimeout(() => workspace.classList.add('is-idle'), FULLSCREEN_IDLE_MS);
    }

    async function handleCopyHtml() {
        if (!lastRenderedHtml) {
            ctx.setStatus('没有可复制的内容', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(lastRenderedHtml);
            ctx.setStatus('HTML 已复制到剪贴板', 'success');
            if (ctx.showToast) ctx.showToast('已复制 HTML');
            ctx.elements.copyMarkdownHtmlBtn.classList.add('copied');
            setTimeout(() => ctx.elements.copyMarkdownHtmlBtn.classList.remove('copied'), 600);
        } catch (error) {
            ctx.setStatus('复制失败', 'error');
        }
    }

    function toggleExportDropdown(event) {
        event.stopPropagation();
        ctx.elements.exportMarkdownDropdown.classList.toggle('open');
    }

    function closeExportDropdown(event) {
        if (!ctx.elements.exportMarkdownDropdown.contains(event.target)) {
            ctx.elements.exportMarkdownDropdown.classList.remove('open');
        }
    }

    async function handleExport(event) {
        const item = event.target.closest('.dropdown-item');
        if (!item) return;

        const format = item.dataset.format;
        ctx.elements.exportMarkdownDropdown.classList.remove('open');

        const previewContent = ctx.elements.markdownPreview.innerHTML;
        const hasContent = previewContent &&
            !previewContent.includes('class="placeholder"') &&
            ctx.elements.markdownPreview.childNodes.length > 0;

        if (!hasContent) {
            ctx.setStatus('没有可导出的内容', 'error');
            return;
        }

        if (typeof MarkdownExporter === 'undefined') {
            ctx.setStatus('导出模块未加载', 'error');
            return;
        }

        try {
            ctx.setStatus(`正在导出 ${format.toUpperCase()}...`, 'processing');

            if (format === 'png') {
                await MarkdownExporter.exportAsPNG(ctx.elements.markdownPreview);
            } else if (format === 'jpg') {
                await MarkdownExporter.exportAsJPG(ctx.elements.markdownPreview);
            } else if (format === 'svg') {
                await MarkdownExporter.exportAsSVG(ctx.elements.markdownPreview);
            }

            ctx.setStatus(`${format.toUpperCase()} 导出成功`, 'success');
        } catch (error) {
            ctx.setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    async function handleExportPdf() {
        const previewContent = ctx.elements.markdownPreview.innerHTML;
        const hasContent = previewContent &&
            !previewContent.includes('class="placeholder"') &&
            ctx.elements.markdownPreview.childNodes.length > 0;

        if (!hasContent) {
            ctx.setStatus('没有可导出的内容', 'error');
            return;
        }

        if (typeof MarkdownExporter === 'undefined') {
            ctx.setStatus('导出模块未加载', 'error');
            return;
        }

        try {
            ctx.setStatus('正在导出 PDF...', 'processing');
            await MarkdownExporter.exportAsPDF(ctx.elements.markdownPreview);
            ctx.setStatus('PDF 导出成功', 'success');
        } catch (error) {
            ctx.setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    async function handleChartExport(event) {
        // Handle zoom button click
        const zoomBtn = event.target.closest('.mermaid-zoom-btn');
        if (zoomBtn) {
            const container = zoomBtn.closest('.mermaid-container');
            if (container && typeof ImageLightbox !== 'undefined') {
                ImageLightbox.openMermaid(container);
            }
            return;
        }

        // Toggle flowchart curve: basis (curve) <-> orthogonal (right-angle)
        const curveBtn = event.target.closest('.mermaid-curve-btn');
        if (curveBtn) {
            await handleCurveToggle(curveBtn);
            return;
        }

        // Handle export button click
        const btn = event.target.closest('.mermaid-export-btn');
        if (!btn) return;

        const format = btn.dataset.format;
        const index = parseInt(btn.dataset.index, 10);
        const container = btn.closest('.mermaid-container');

        if (!container) {
            ctx.setStatus('未找到图表容器', 'error');
            return;
        }

        const svgElement = container.querySelector('svg[id^="mermaid-"]') ||
            container.querySelector(':scope > svg');
        if (!svgElement) {
            ctx.setStatus('未找到 SVG 元素', 'error');
            return;
        }

        if (typeof ChartExporter === 'undefined') {
            ctx.setStatus('导出模块未加载', 'error');
            return;
        }

        const filename = ChartExporter.generateFilename(index);

        try {
            if (format === 'svg') {
                ctx.setStatus('正在导出 SVG...', 'processing');
                ChartExporter.exportAsSVG(svgElement, filename);
                ctx.setStatus('SVG 导出成功', 'success');
            } else if (format === 'png') {
                ctx.setStatus('正在导出 PNG...', 'processing');
                await ChartExporter.exportAsPNG(svgElement, filename);
                ctx.setStatus('PNG 导出成功', 'success');
            }
        } catch (error) {
            ctx.setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    async function handleCurveToggle(curveBtn) {
        if (typeof MarkdownRenderer === 'undefined') {
            ctx.setStatus('Markdown 渲染器未加载', 'error');
            return;
        }

        const currentAttr = curveBtn.getAttribute('data-curve');
        const current = (
            currentAttr === 'orthogonal' ||
            currentAttr === 'linear' ||
            currentAttr === 'stepAfter' ||
            currentAttr === 'step'
        )
            ? 'orthogonal'
            : 'basis';
        const next = current === 'orthogonal' ? 'basis' : 'orthogonal';
        const label = next === 'orthogonal' ? '直角' : '曲线';

        try {
            ctx.setStatus(`正在切换为${label}...`, 'processing');
            const container = curveBtn.closest('.mermaid-container');
            if (!container) {
                throw new Error('未找到图表容器');
            }
            await MarkdownRenderer.rerenderContainer(container, next);

            ctx.setStatus(`已切换为${label}`, 'success');
        } catch (error) {
            ctx.setStatus(`切换失败: ${error.message}`, 'error');
        }
    }

    DevKit.MarkdownController = { init };
})();
