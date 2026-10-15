// DevKit Pro - Main App Orchestrator
// Handles shared state, mode switching, settings, and controller lifecycle

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    const MODE_META = {
        converter: { title: '结构转换', subtitle: '把 DDL 或 JSON 转成 Go / Protobuf / TypeScript' },
        markdown: { title: 'Markdown', subtitle: 'Markdown、公式与图表，本地渲染与导出' },
        json: { title: 'JSON 工具', subtitle: '格式化、压缩，以及结构对比' },
        timestamp: { title: '时间戳', subtitle: 'Unix 时间戳转换、翻页时钟与多时区' },
        toolbox: { title: '小工具', subtitle: '编解码、哈希、ID 生成与常用文本工具' },
        image: { title: '图片工具', subtitle: '压缩、裁剪、二维码与本地图像处理' },
        media: { title: '音视频工具', subtitle: '剪辑、转码、抽帧与媒体信息' }
    };

    const SAMPLES = {
        converter: `CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  username VARCHAR(100) NOT NULL COMMENT '用户名',
  email VARCHAR(255) DEFAULT NULL COMMENT '邮箱',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) COMMENT='用户表';`,
        markdown: `# DevKit Pro

本地开发者工作台。

$$ E = mc^2 $$

\`\`\`mermaid
flowchart LR
  A[粘贴] --> B[转换]
  B --> C[复制]
\`\`\`
`,
        json: `{
  "name": "DevKit Pro",
  "version": 1,
  "features": ["converter", "markdown", "json"]
}`
    };

    // DOM Elements
    const elements = {
        // Converter Elements
        inputArea: document.getElementById('inputArea'),
        outputArea: document.getElementById('outputArea'),
        dbType: document.getElementById('dbType'),
        convertBtn: document.getElementById('convertBtn'),
        copyBtn: document.getElementById('copyBtn'),
        exportBtn: document.getElementById('exportBtn'),
        clearBtn: document.getElementById('clearBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        inputType: document.getElementById('inputType'),
        statusMessage: document.getElementById('statusMessage'),
        lineCount: document.getElementById('lineCount'),
        settingsModal: document.getElementById('settingsModal'),
        closeModal: document.getElementById('closeModal'),
        saveSettings: document.getElementById('saveSettings'),
        structNameInput: document.getElementById('structNameInput'),
        packageNameInput: document.getElementById('packageNameInput'),
        generateTableName: document.getElementById('generateTableName'),
        inlineNestedStructs: document.getElementById('inlineNestedStructs'),
        converterOptions: document.getElementById('converterOptions'),

        // Output Format Elements
        outputFormatGo: document.getElementById('outputFormatGo'),
        outputFormatProto: document.getElementById('outputFormatProto'),
        outputFormatJSON: document.getElementById('outputFormatJSON'),
        outputFormatYAML: document.getElementById('outputFormatYAML'),
        outputFormatTOML: document.getElementById('outputFormatTOML'),
        outputTitle: document.getElementById('outputTitle'),
        protoNestedMode: document.getElementById('protoNestedMode'),
        goStructOptions: document.getElementById('goStructOptions'),
        configFormatLabels: document.querySelectorAll('.config-format'),

        // Mode Switcher
        modeConverter: document.getElementById('modeConverter'),
        modeMarkdown: document.getElementById('modeMarkdown'),
        modeJson: document.getElementById('modeJson'),
        modeTimestamp: document.getElementById('modeTimestamp'),
        modeToolbox: document.getElementById('modeToolbox'),
        modeImage: document.getElementById('modeImage'),
        modeMedia: document.getElementById('modeMedia'),
        converterWorkspace: document.getElementById('converterWorkspace'),
        markdownWorkspace: document.getElementById('markdownWorkspace'),
        jsonWorkspace: document.getElementById('jsonWorkspace'),
        timestampWorkspace: document.getElementById('timestampWorkspace'),
        toolboxWorkspace: document.getElementById('toolboxWorkspace'),
        imageWorkspace: document.getElementById('imageWorkspace'),
        mediaWorkspace: document.getElementById('mediaWorkspace'),

        // Shell
        appRoot: document.querySelector('.app'),
        appNav: document.getElementById('appNav'),
        navCollapseBtn: document.getElementById('navCollapseBtn'),
        navBrandToggle: document.getElementById('navBrandToggle'),
        modeTitle: document.getElementById('modeTitle'),
        modeSubtitle: document.getElementById('modeSubtitle'),
        appToast: document.getElementById('appToast'),
        onboardingOverlay: document.getElementById('onboardingOverlay'),

        // Markdown Elements
        markdownInput: document.getElementById('markdownInput'),
        markdownPreview: document.getElementById('markdownPreview'),
        clearMarkdownBtn: document.getElementById('clearMarkdownBtn'),
        copyMarkdownHtmlBtn: document.getElementById('copyMarkdownHtmlBtn'),
        exportMarkdownPdfBtn: document.getElementById('exportMarkdownPdfBtn'),
        exportMarkdownDropdown: document.getElementById('exportMarkdownDropdown'),
        exportMarkdownBtn: document.getElementById('exportMarkdownBtn'),
        toggleFullscreenBtn: document.getElementById('toggleFullscreenBtn'),

        // Toolbox Elements
        toolboxInput: document.getElementById('toolboxInput'),
        toolboxOutput: document.getElementById('toolboxOutput'),
        toolboxOutputTitle: document.getElementById('toolboxOutputTitle'),
        clearToolboxBtn: document.getElementById('clearToolboxBtn'),
        copyToolboxBtn: document.getElementById('copyToolboxBtn'),
        toolList: document.querySelector('.tool-list'),

        // Appearance
        editorTheme: document.getElementById('editorTheme'),
        editorFont: document.getElementById('editorFont'),

        // Formatting
        autoFormat: document.getElementById('autoFormat'),
        formatIndent: document.getElementById('formatIndent')
    };

    // Shared State
    let currentSettings = null;
    let currentMode = 'converter';
    let toastTimer = null;
    let onboardingStep = 0;

    // ==================== Shared Utilities ====================

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function snakeToCamel(str) {
        if (!str) return '';
        return str
            .split('_')
            .map(word => {
                if (!word) return '';
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join('');
    }

    function setStatus(message, type = 'ready') {
        elements.statusMessage.textContent = message;
        elements.statusMessage.className = 'status';
        if (type === 'success') {
            elements.statusMessage.classList.add('success');
        } else if (type === 'error') {
            elements.statusMessage.classList.add('error');
        }
    }

    function showToast(message, duration = 1800) {
        const toast = elements.appToast;
        if (!toast || !message) return;
        toast.hidden = false;
        toast.textContent = message;
        requestAnimationFrame(() => toast.classList.add('is-visible'));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.classList.remove('is-visible');
            setTimeout(() => { toast.hidden = true; }, 200);
        }, duration);
    }

    function showModal(show) {
        if (show) {
            elements.settingsModal.classList.remove('hidden');
            elements.settingsModal.classList.add('is-open');
        } else {
            elements.settingsModal.classList.remove('is-open');
            elements.settingsModal.classList.add('hidden');
        }
    }

    function updateModeChrome(mode) {
        const meta = MODE_META[mode] || MODE_META.converter;
        if (elements.modeTitle) elements.modeTitle.textContent = meta.title;
        if (elements.modeSubtitle) elements.modeSubtitle.textContent = meta.subtitle;
    }

    function setNavCollapsed(collapsed) {
        if (!elements.appRoot) return;
        elements.appRoot.classList.toggle('nav-collapsed', !!collapsed);
        [elements.navCollapseBtn, elements.navBrandToggle].forEach(btn => {
            if (!btn) return;
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.title = collapsed ? '展开侧栏' : '折叠侧栏';
        });
    }

    // ==================== Controller Context ====================

    function buildContext() {
        return {
            elements,
            getSettings: () => currentSettings,
            setSettings: (s) => { currentSettings = s; },
            setStatus,
            showToast,
            debounce,
            snakeToCamel,
            refreshEditorsIn,
            switchMode
        };
    }

    // ==================== Empty states ====================

    function syncEmptyState(editorId, emptyEl) {
        if (!emptyEl) return;
        const value = (editorManager.getValue(editorId) || '').trim();
        emptyEl.classList.toggle('is-hidden', value.length > 0);
    }

    function initEmptyStates() {
        const pairs = [
            ['inputArea', document.getElementById('converterEmptyState')],
            ['markdownInput', document.getElementById('markdownEmptyState')],
            ['jsonFormatInput', document.getElementById('jsonEmptyState')]
        ];

        pairs.forEach(([id, el]) => {
            if (!el) return;
            syncEmptyState(id, el);
            const cm = editorManager.get(id);
            if (cm) {
                cm.on('change', () => syncEmptyState(id, el));
            }
        });

        document.querySelectorAll('.empty-state-action').forEach((btn) => {
            btn.addEventListener('click', () => {
                const kind = btn.getAttribute('data-sample');
                const sample = SAMPLES[kind];
                if (!sample) return;
                if (kind === 'converter') {
                    editorManager.setValue('inputArea', sample);
                    syncEmptyState('inputArea', document.getElementById('converterEmptyState'));
                    if (DevKit.ConverterController && DevKit.ConverterController.handleConvert) {
                        DevKit.ConverterController.handleConvert();
                    }
                } else if (kind === 'markdown') {
                    editorManager.setValue('markdownInput', sample);
                    syncEmptyState('markdownInput', document.getElementById('markdownEmptyState'));
                } else if (kind === 'json') {
                    editorManager.setValue('jsonFormatInput', sample);
                    syncEmptyState('jsonFormatInput', document.getElementById('jsonEmptyState'));
                    if (DevKit.JsonController && DevKit.JsonController.handleFormat) {
                        DevKit.JsonController.handleFormat();
                    }
                }
                showToast('已填入示例');
            });
        });
    }

    // ==================== Onboarding ====================

    function renderOnboardingStep() {
        const overlay = elements.onboardingOverlay;
        if (!overlay) return;
        overlay.querySelectorAll('.onboarding-step').forEach((step) => {
            step.classList.toggle('is-active', Number(step.dataset.step) === onboardingStep);
        });
        overlay.querySelectorAll('.onboarding-dots span').forEach((dot, i) => {
            dot.classList.toggle('is-active', i === onboardingStep);
        });
        const nextBtn = document.getElementById('onboardingNext');
        if (nextBtn) nextBtn.textContent = onboardingStep >= 2 ? '开始使用' : '下一步';
    }

    async function finishOnboarding() {
        const overlay = elements.onboardingOverlay;
        if (overlay) {
            overlay.classList.remove('is-open');
            overlay.classList.add('hidden');
        }
        currentSettings.onboardingDone = true;
        await Settings.set('onboardingDone', true);
    }

    function initOnboarding() {
        const overlay = elements.onboardingOverlay;
        if (!overlay || currentSettings.onboardingDone) return;

        onboardingStep = 0;
        overlay.classList.remove('hidden');
        overlay.classList.add('is-open');
        renderOnboardingStep();

        document.getElementById('onboardingSkip')?.addEventListener('click', () => finishOnboarding());
        document.getElementById('onboardingNext')?.addEventListener('click', async () => {
            if (onboardingStep >= 2) {
                await finishOnboarding();
                return;
            }
            onboardingStep += 1;
            renderOnboardingStep();
        });
    }

    // ==================== Mode Switching ====================

    async function switchMode(mode) {
        currentMode = mode;
        currentSettings.lastMode = mode;
        // Use Settings.set (load-modify-save) rather than saving the whole
        // currentSettings snapshot: other panels (e.g. the timestamp tool)
        // persist their own keys independently, and this runs on every
        // tab switch, so a full-object save here would clobber those changes
        // with the stale snapshot captured at app startup.
        await Settings.set('lastMode', mode);

        elements.modeConverter.classList.remove('active');
        elements.modeMarkdown.classList.remove('active');
        if (elements.modeJson) elements.modeJson.classList.remove('active');
        if (elements.modeTimestamp) elements.modeTimestamp.classList.remove('active');
        if (elements.modeToolbox) elements.modeToolbox.classList.remove('active');
        if (elements.modeImage) elements.modeImage.classList.remove('active');
        if (elements.modeMedia) elements.modeMedia.classList.remove('active');
        elements.converterWorkspace.classList.add('hidden');
        elements.markdownWorkspace.classList.add('hidden');
        if (elements.jsonWorkspace) elements.jsonWorkspace.classList.add('hidden');
        if (elements.timestampWorkspace) elements.timestampWorkspace.classList.add('hidden');
        if (elements.toolboxWorkspace) elements.toolboxWorkspace.classList.add('hidden');
        if (elements.imageWorkspace) elements.imageWorkspace.classList.add('hidden');
        if (elements.mediaWorkspace) elements.mediaWorkspace.classList.add('hidden');

        updateModeChrome(mode);

        if (mode === 'converter') {
            elements.modeConverter.classList.add('active');
            elements.converterWorkspace.classList.remove('hidden');
            refreshEditorsIn('inputArea', 'outputArea');
            setStatus('转换模式', 'ready');
        } else if (mode === 'markdown') {
            elements.modeMarkdown.classList.add('active');
            elements.markdownWorkspace.classList.remove('hidden');
            refreshEditorsIn('markdownInput');
            setStatus('Markdown 预览模式', 'ready');
        } else if (mode === 'json') {
            elements.modeJson.classList.add('active');
            elements.jsonWorkspace.classList.remove('hidden');
            refreshEditorsIn('jsonFormatInput', 'jsonFormatOutput', 'jsonCompareA', 'jsonCompareB');
            setStatus('JSON 工具', 'ready');
        } else if (mode === 'timestamp') {
            elements.modeTimestamp.classList.add('active');
            elements.timestampWorkspace.classList.remove('hidden');
            setStatus('时间戳工具', 'ready');
        } else if (mode === 'toolbox') {
            elements.modeToolbox.classList.add('active');
            elements.toolboxWorkspace.classList.remove('hidden');
            DevKit.ToolboxController?.onShown?.();
            setStatus('开发者工具箱', 'ready');
        } else if (mode === 'image') {
            elements.modeImage.classList.add('active');
            elements.imageWorkspace.classList.remove('hidden');
            setStatus('图片工具', 'ready');
        } else if (mode === 'media') {
            elements.modeMedia.classList.add('active');
            elements.mediaWorkspace.classList.remove('hidden');
            setStatus('音视频工具', 'ready');
        }
    }

    function refreshEditorsIn(...ids) {
        setTimeout(() => {
            ids.forEach(id => {
                const editor = editorManager.get(id);
                if (editor) editor.refresh();
            });
        }, 0);
    }

    // ==================== Settings ====================

    async function handleSaveSettings() {
        currentSettings.structName = elements.structNameInput.value;
        currentSettings.packageName = elements.packageNameInput.value;
        currentSettings.generateTableName = elements.generateTableName.checked;
        currentSettings.inlineNestedStructs = elements.inlineNestedStructs.checked;

        currentSettings.editorTheme = elements.editorTheme.value;
        currentSettings.editorFont = elements.editorFont.value;

        currentSettings.autoFormat = elements.autoFormat.value;
        currentSettings.formatIndent = elements.formatIndent.value === 'tab' ? 'tab' : parseInt(elements.formatIndent.value);

        await Settings.save(currentSettings);

        editorManager.setTheme(currentSettings.editorTheme);
        editorManager.setFont(currentSettings.editorFont);
        if (DevKit.ConverterController && DevKit.ConverterController.syncSettings) {
            DevKit.ConverterController.syncSettings();
        }

        setStatus('设置已保存', 'success');
        showToast('设置已保存');
        showModal(false);
    }

    function updateSettingsUI() {
        elements.structNameInput.value = currentSettings.structName || '';
        elements.packageNameInput.value = currentSettings.packageName || 'model';
        elements.generateTableName.checked = currentSettings.generateTableName !== false;
        elements.inlineNestedStructs.checked = currentSettings.inlineNestedStructs !== false;

        elements.editorTheme.value = currentSettings.editorTheme || 'dracula';
        elements.editorFont.value = currentSettings.editorFont || "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

        elements.autoFormat.value = currentSettings.autoFormat || 'always';
        elements.formatIndent.value = currentSettings.formatIndent === 'tab' ? 'tab' : (currentSettings.formatIndent || 4).toString();
    }

    // ==================== Keyboard Shortcuts ====================

    function handleKeyboard(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (DevKit.ConverterController) DevKit.ConverterController.handleConvert();
        }

        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (DevKit.ConverterController) DevKit.ConverterController.handleClear();
        }

        if (e.key === 'Escape') {
            showModal(false);
            if (elements.onboardingOverlay && !elements.onboardingOverlay.classList.contains('hidden')) {
                finishOnboarding();
            }
        }
    }

    // ==================== App Fullscreen ====================

    function initAppFullscreen() {
        const btn = document.getElementById('appFullscreenBtn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.documentElement.requestFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            const isFs = !!document.fullscreenElement;
            const expand = btn.querySelector('.fs-icon-expand');
            const collapse = btn.querySelector('.fs-icon-collapse');
            if (expand) expand.style.display = isFs ? 'none' : '';
            if (collapse) collapse.style.display = isFs ? '' : 'none';
        });
    }

    // ==================== File Drag & Drop ====================

    const FILE_EXT_MODE = {
        '.sql': 'converter',
        '.json': 'json',
        '.yaml': 'converter',
        '.yml': 'converter',
        '.toml': 'converter',
        '.xml': 'converter',
        '.md': 'markdown',
        '.markdown': 'markdown'
    };

    // Image drags are handled by the per-tool dropzones (图片工具), not the
    // global text-file importer, so they shouldn't trigger the app-wide
    // "file-dragging" outline.
    function dragContainsImage(e) {
        const items = e.dataTransfer && e.dataTransfer.items;
        if (!items) return false;
        for (const item of items) {
            if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                return true;
            }
        }
        return false;
    }

    function initFileDrop() {
        const app = document.querySelector('.app');

        app.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (dragContainsImage(e)) {
                app.classList.remove('file-dragging');
                return;
            }
            app.classList.add('file-dragging');
        });

        app.addEventListener('dragleave', (e) => {
            if (!app.contains(e.relatedTarget)) {
                app.classList.remove('file-dragging');
            }
        });

        // Per-tool dropzones call stopPropagation() on drop, which would leave
        // the outline stuck on; capture-phase listeners always run first, so
        // clear it here no matter where the drop (or cancelled drag) lands.
        document.addEventListener('drop', () => app.classList.remove('file-dragging'), true);
        document.addEventListener('dragend', () => app.classList.remove('file-dragging'), true);

        app.addEventListener('drop', (e) => {
            e.preventDefault();
            app.classList.remove('file-dragging');

            const file = e.dataTransfer.files[0];
            if (!file) return;

            // Ignore image drops that landed outside a dropzone; the global
            // importer only handles text formats.
            if (file.type && file.type.startsWith('image/')) return;

            const ext = '.' + file.name.split('.').pop().toLowerCase();
            const targetMode = FILE_EXT_MODE[ext];

            if (!targetMode) {
                setStatus(`不支持的文件类型: ${ext}`, 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const content = event.target.result;

                if (targetMode === 'markdown') {
                    await switchMode('markdown');
                    editorManager.setValue('markdownInput', content);
                } else if (targetMode === 'json') {
                    await switchMode('json');
                    if (DevKit.JsonController) {
                        DevKit.JsonController.loadContent(content, 'format');
                    } else {
                        editorManager.setValue('jsonFormatInput', content);
                    }
                } else {
                    await switchMode('converter');
                    editorManager.setValue('inputArea', content);
                }

                setStatus(`已导入文件: ${file.name}`, 'success');
                showToast(`已导入 ${file.name}`);
            };
            reader.onerror = () => setStatus('文件读取失败', 'error');
            reader.readAsText(file);
        });
    }

    // ==================== Initialization ====================

    async function init() {
        // Load settings
        currentSettings = await Settings.load();
        updateSettingsUI();
        setNavCollapsed(!!currentSettings.navCollapsed);

        // Initialize editors
        editorManager.initFromTextArea('inputArea', 'sql', {
            placeholder: "粘贴你的 DDL 或 JSON...",
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('outputArea', 'go', {
            readOnly: true,
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('markdownInput', 'markdown', {
            placeholder: "输入 Markdown 文本...",
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('jsonFormatInput', 'json', {
            placeholder: '粘贴 JSON 文本...',
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('jsonFormatOutput', 'json', {
            readOnly: true,
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('jsonCompareA', 'json', {
            placeholder: '{"key": "value"}',
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('jsonCompareB', 'json', {
            placeholder: '{"key": "newValue"}',
            theme: currentSettings.editorTheme
        });

        if (currentSettings.editorFont) {
            editorManager.setFont(currentSettings.editorFont);
        }

        // Build shared context
        const ctx = buildContext();

        // Initialize controllers
        if (DevKit.ConverterController) DevKit.ConverterController.init(ctx);
        if (DevKit.MarkdownController) DevKit.MarkdownController.init(ctx);
        if (DevKit.JsonController) DevKit.JsonController.init(ctx);
        if (DevKit.ToolboxController) DevKit.ToolboxController.init();
        if (DevKit.ImageToolboxController) DevKit.ImageToolboxController.init();
        if (DevKit.MediaToolboxController) DevKit.MediaToolboxController.init();

        // Shared event listeners
        elements.settingsBtn.addEventListener('click', () => showModal(true));
        elements.closeModal.addEventListener('click', () => showModal(false));
        elements.settingsModal.querySelector('.modal-overlay')?.addEventListener('click', () => showModal(false));
        elements.saveSettings.addEventListener('click', handleSaveSettings);

        // Mode switcher (sidebar)
        const bindMode = (el, mode) => {
            if (el) el.addEventListener('click', () => switchMode(mode));
        };
        bindMode(elements.modeConverter, 'converter');
        bindMode(elements.modeMarkdown, 'markdown');
        bindMode(elements.modeJson, 'json');
        bindMode(elements.modeTimestamp, 'timestamp');
        bindMode(elements.modeToolbox, 'toolbox');
        bindMode(elements.modeImage, 'image');
        bindMode(elements.modeMedia, 'media');

        const toggleNav = async () => {
            const next = !elements.appRoot.classList.contains('nav-collapsed');
            setNavCollapsed(next);
            currentSettings.navCollapsed = next;
            await Settings.set('navCollapsed', next);
        };
        elements.navCollapseBtn?.addEventListener('click', toggleNav);
        elements.navBrandToggle?.addEventListener('click', toggleNav);

        // Appearance instant preview
        elements.editorTheme.addEventListener('change', () => {
            editorManager.setTheme(elements.editorTheme.value);
        });
        elements.editorFont.addEventListener('change', () => {
            editorManager.setFont(elements.editorFont.value);
        });

        // App fullscreen
        initAppFullscreen();

        // File drag & drop
        initFileDrop();

        // Empty states + onboarding
        initEmptyStates();
        initOnboarding();

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        // Restore last used mode
        const lastMode = currentSettings.lastMode === 'diff'
            ? 'converter'
            : (currentSettings.lastMode || 'converter');
        updateModeChrome(lastMode === 'converter' ? 'converter' : lastMode);
        if (lastMode !== 'converter') {
            await switchMode(lastMode);
        } else {
            setStatus('就绪', 'ready');
        }
    }

    // Export to namespace
    DevKit.App = { init, setStatus, showToast, switchMode };

    // Start
    document.addEventListener('DOMContentLoaded', init);

})();
