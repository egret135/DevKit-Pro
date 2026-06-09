// DevKit Pro - Main App Orchestrator
// Handles shared state, mode switching, settings, and controller lifecycle

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

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

        // Diff Elements
        diffTargetInput: document.getElementById('diffTargetInput'),
        diffSourceInput: document.getElementById('diffSourceInput'),
        diffOutputArea: document.getElementById('diffOutputArea'),
        copyDiffBtn: document.getElementById('copyDiffBtn'),
        clearDiffBtn: document.getElementById('clearDiffBtn'),

        // Mode Switcher
        modeConverter: document.getElementById('modeConverter'),
        modeDiff: document.getElementById('modeDiff'),
        modeMarkdown: document.getElementById('modeMarkdown'),
        modeJson: document.getElementById('modeJson'),
        modeToolbox: document.getElementById('modeToolbox'),
        converterWorkspace: document.getElementById('converterWorkspace'),
        diffWorkspace: document.getElementById('diffWorkspace'),
        markdownWorkspace: document.getElementById('markdownWorkspace'),
        jsonWorkspace: document.getElementById('jsonWorkspace'),
        toolboxWorkspace: document.getElementById('toolboxWorkspace'),

        // Markdown Elements
        markdownInput: document.getElementById('markdownInput'),
        markdownPreview: document.getElementById('markdownPreview'),
        clearMarkdownBtn: document.getElementById('clearMarkdownBtn'),
        copyMarkdownHtmlBtn: document.getElementById('copyMarkdownHtmlBtn'),
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

    function showModal(show) {
        if (show) {
            elements.settingsModal.classList.remove('hidden');
        } else {
            elements.settingsModal.classList.add('hidden');
        }
    }

    // ==================== Controller Context ====================

    function buildContext() {
        return {
            elements,
            getSettings: () => currentSettings,
            setSettings: (s) => { currentSettings = s; },
            setStatus,
            debounce,
            snakeToCamel,
            refreshEditorsIn,
            switchMode
        };
    }

    // ==================== Mode Switching ====================

    async function switchMode(mode) {
        currentMode = mode;
        currentSettings.lastMode = mode;
        await Settings.save(currentSettings);

        elements.modeConverter.classList.remove('active');
        elements.modeDiff.classList.remove('active');
        elements.modeMarkdown.classList.remove('active');
        if (elements.modeJson) elements.modeJson.classList.remove('active');
        if (elements.modeToolbox) elements.modeToolbox.classList.remove('active');
        elements.converterWorkspace.classList.add('hidden');
        elements.diffWorkspace.classList.add('hidden');
        elements.markdownWorkspace.classList.add('hidden');
        if (elements.jsonWorkspace) elements.jsonWorkspace.classList.add('hidden');
        if (elements.toolboxWorkspace) elements.toolboxWorkspace.classList.add('hidden');

        if (mode === 'converter') {
            elements.modeConverter.classList.add('active');
            elements.converterWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'visible';
            refreshEditorsIn('inputArea', 'outputArea');
            setStatus('转换模式', 'ready');
        } else if (mode === 'diff') {
            elements.modeDiff.classList.add('active');
            elements.diffWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            refreshEditorsIn('diffTargetInput', 'diffSourceInput', 'diffOutputArea');
            setStatus('DDL 对比模式', 'ready');
        } else if (mode === 'markdown') {
            elements.modeMarkdown.classList.add('active');
            elements.markdownWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            refreshEditorsIn('markdownInput');
            setStatus('Markdown 预览模式', 'ready');
        } else if (mode === 'json') {
            elements.modeJson.classList.add('active');
            elements.jsonWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            refreshEditorsIn('jsonFormatInput', 'jsonFormatOutput', 'jsonCompareA', 'jsonCompareB');
            setStatus('JSON 工具', 'ready');
        } else if (mode === 'toolbox') {
            elements.modeToolbox.classList.add('active');
            elements.toolboxWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            setStatus('开发者工具箱', 'ready');
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

        setStatus('设置已保存', 'success');
        showModal(false);
    }

    function updateSettingsUI() {
        elements.structNameInput.value = currentSettings.structName || '';
        elements.packageNameInput.value = currentSettings.packageName || 'model';
        elements.generateTableName.checked = currentSettings.generateTableName !== false;
        elements.inlineNestedStructs.checked = currentSettings.inlineNestedStructs !== false;

        elements.editorTheme.value = currentSettings.editorTheme || 'dracula';
        elements.editorFont.value = currentSettings.editorFont || "'JetBrains Mono', monospace";

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

    function initFileDrop() {
        const app = document.querySelector('.app');

        app.addEventListener('dragover', (e) => {
            e.preventDefault();
            app.classList.add('file-dragging');
        });

        app.addEventListener('dragleave', (e) => {
            if (!app.contains(e.relatedTarget)) {
                app.classList.remove('file-dragging');
            }
        });

        app.addEventListener('drop', (e) => {
            e.preventDefault();
            app.classList.remove('file-dragging');

            const file = e.dataTransfer.files[0];
            if (!file) return;

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

        // Initialize editors
        editorManager.initFromTextArea('inputArea', 'sql', {
            placeholder: "粘贴你的 DDL 或 JSON...",
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('outputArea', 'go', {
            readOnly: true,
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('diffTargetInput', 'sql', {
            placeholder: "粘贴线上环境的 DDL (基准)...",
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('diffSourceInput', 'sql', {
            placeholder: "粘贴新开发的 DDL (变更后)...",
            theme: currentSettings.editorTheme
        });
        editorManager.initFromTextArea('diffOutputArea', 'sql', {
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
        if (DevKit.DiffController) DevKit.DiffController.init(ctx);
        if (DevKit.MarkdownController) DevKit.MarkdownController.init(ctx);
        if (DevKit.JsonController) DevKit.JsonController.init(ctx);
        if (DevKit.ToolboxController) DevKit.ToolboxController.init();

        // Shared event listeners
        elements.settingsBtn.addEventListener('click', () => showModal(true));
        elements.closeModal.addEventListener('click', () => showModal(false));
        elements.saveSettings.addEventListener('click', handleSaveSettings);

        // Mode switcher
        elements.modeConverter.addEventListener('click', () => switchMode('converter'));
        elements.modeDiff.addEventListener('click', () => switchMode('diff'));
        elements.modeMarkdown.addEventListener('click', () => switchMode('markdown'));
        elements.modeJson.addEventListener('click', () => switchMode('json'));
        elements.modeToolbox.addEventListener('click', () => switchMode('toolbox'));

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

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        // Restore last used mode
        const lastMode = currentSettings.lastMode || 'converter';
        if (lastMode !== 'converter') {
            await switchMode(lastMode);
        } else {
            setStatus('就绪', 'ready');
        }
    }

    // Export to namespace
    DevKit.App = { init, setStatus, switchMode };

    // Start
    document.addEventListener('DOMContentLoaded', init);

})();
