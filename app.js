// Main Popup Script
// Orchestrates all functionality and UI interactions

(function () {
    'use strict';

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
        modeToolbox: document.getElementById('modeToolbox'),
        converterWorkspace: document.getElementById('converterWorkspace'),
        diffWorkspace: document.getElementById('diffWorkspace'),
        markdownWorkspace: document.getElementById('markdownWorkspace'),
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

    // State
    let currentSettings = null;
    let lastParsedData = null;
    let lastGeneratedCode = '';
    let currentMode = 'converter'; // 'converter', 'diff', 'markdown', or 'toolbox'
    let lastRenderedHtml = '';
    let currentTool = 'timestamp';

    // Initialize
    async function init() {
        // Load settings
        currentSettings = await Settings.load();
        updateSettingsUI();

        // Initialize Editors
        const inputEditor = editorManager.initFromTextArea('inputArea', 'sql', {
            placeholder: "粘贴你的 DDL 或 JSON...",
            theme: currentSettings.editorTheme
        });
        const outputEditor = editorManager.initFromTextArea('outputArea', 'go', {
            readOnly: true,
            theme: currentSettings.editorTheme
        });

        const diffTargetEditor = editorManager.initFromTextArea('diffTargetInput', 'sql', {
            placeholder: "粘贴线上环境的 DDL (基准)...",
            theme: currentSettings.editorTheme
        });
        const diffSourceEditor = editorManager.initFromTextArea('diffSourceInput', 'sql', {
            placeholder: "粘贴新开发的 DDL (变更后)...",
            theme: currentSettings.editorTheme
        });
        const diffOutputEditor = editorManager.initFromTextArea('diffOutputArea', 'sql', {
            readOnly: true,
            theme: currentSettings.editorTheme
        });

        const markdownEditor = editorManager.initFromTextArea('markdownInput', 'markdown', {
            placeholder: "输入 Markdown 文本...",
            theme: currentSettings.editorTheme
        });

        // Initial Font
        if (currentSettings.editorFont) {
            editorManager.setFont(currentSettings.editorFont);
        }

        // Load History - DISABLED: 不再加载历史记录，刷新后展示空白
        // const savedInput = historyManager.load('inputArea', '');
        // if (savedInput) {
        //     editorManager.setValue('inputArea', savedInput);
        //     handleInputChange(); // Trigger detection
        // }

        // const savedDiffTarget = historyManager.load('diffTargetInput', '');
        // if (savedDiffTarget) editorManager.setValue('diffTargetInput', savedDiffTarget);

        // const savedDiffSource = historyManager.load('diffSourceInput', '');
        // if (savedDiffSource) editorManager.setValue('diffSourceInput', savedDiffSource);

        // const savedMarkdown = historyManager.load('markdownInput', '');
        // if (savedMarkdown) {
        //     editorManager.setValue('markdownInput', savedMarkdown);
        //     handleMarkdownChange();
        // }

        // Debounced auto-format (if 'always' mode)
        const debouncedAutoFormat = debounce(() => {
            if (currentSettings.autoFormat === 'always') {
                autoFormatInput();
            }
        }, 1500);

        // Attach Editor Listeners
        inputEditor.on('change', () => {
            handleInputChange();
            // historyManager.save('inputArea', inputEditor.getValue()); // DISABLED
            // Trigger debounced auto-format
            debouncedAutoFormat();
        });

        // Auto-format on paste (if enabled)
        inputEditor.on('paste', () => {
            if (currentSettings.autoFormat === 'paste' || currentSettings.autoFormat === 'always') {
                setTimeout(() => autoFormatInput(), 50);
            }
        });

        // Debounce history save for others - DISABLED
        // const saveDiffTarget = historyManager.debounce((val) => historyManager.save('diffTargetInput', val), 1000);
        diffTargetEditor.on('change', () => {
            handleDiffChange();
            // saveDiffTarget(diffTargetEditor.getValue()); // DISABLED
        });

        // const saveDiffSource = historyManager.debounce((val) => historyManager.save('diffSourceInput', val), 1000);
        diffSourceEditor.on('change', () => {
            handleDiffChange();
            // saveDiffSource(diffSourceEditor.getValue()); // DISABLED
        });

        // const saveMarkdown = historyManager.debounce((val) => historyManager.save('markdownInput', val), 1000);
        markdownEditor.on('change', () => {
            handleMarkdownChange();
            // saveMarkdown(markdownEditor.getValue()); // DISABLED
        });


        // Attach DOM event listeners
        elements.convertBtn.addEventListener('click', handleConvert);
        elements.copyBtn.addEventListener('click', handleCopy);
        elements.exportBtn.addEventListener('click', handleExport);
        elements.clearBtn.addEventListener('click', handleClear);
        elements.settingsBtn.addEventListener('click', () => showModal(true));
        elements.closeModal.addEventListener('click', () => showModal(false));
        elements.saveSettings.addEventListener('click', handleSaveSettings);
        // elements.inputArea.addEventListener('input', handleInputChange); // Removed, using editor event
        elements.dbType.addEventListener('change', handleDbTypeChange);
        elements.inlineNestedStructs.addEventListener('change', handleInlineNestedChange);

        // Output format switcher
        elements.outputFormatGo.addEventListener('change', handleOutputFormatChange);
        elements.outputFormatProto.addEventListener('change', handleOutputFormatChange);
        if (elements.outputFormatJSON) elements.outputFormatJSON.addEventListener('change', handleOutputFormatChange);
        if (elements.outputFormatYAML) elements.outputFormatYAML.addEventListener('change', handleOutputFormatChange);
        if (elements.outputFormatTOML) elements.outputFormatTOML.addEventListener('change', handleOutputFormatChange);
        elements.protoNestedMode.addEventListener('change', handleProtoNestedModeChange);

        // Attach event listeners - Diff
        elements.modeConverter.addEventListener('click', () => switchMode('converter'));
        elements.modeDiff.addEventListener('click', () => switchMode('diff'));
        // elements.diffTargetInput.addEventListener('input', handleDiffChange); // Removed
        // elements.diffSourceInput.addEventListener('input', handleDiffChange); // Removed
        elements.copyDiffBtn.addEventListener('click', handleCopyDiff);
        elements.clearDiffBtn.addEventListener('click', handleClearDiff);

        // Attach event listeners - Markdown
        elements.modeMarkdown.addEventListener('click', () => switchMode('markdown'));
        // elements.markdownInput.addEventListener('input', handleMarkdownChange); // Removed
        elements.clearMarkdownBtn.addEventListener('click', handleClearMarkdown);
        elements.copyMarkdownHtmlBtn.addEventListener('click', handleCopyMarkdownHtml);

        // Event delegation for Mermaid export buttons
        elements.markdownPreview.addEventListener('click', handleChartExport);

        // Markdown export dropdown
        elements.exportMarkdownBtn.addEventListener('click', toggleExportDropdown);
        elements.exportMarkdownDropdown.addEventListener('click', handleMarkdownExport);
        document.addEventListener('click', closeExportDropdown);

        // Markdown fullscreen preview toggle
        if (elements.toggleFullscreenBtn) {
            elements.toggleFullscreenBtn.addEventListener('click', toggleMarkdownFullscreen);
        }
        // ESC key to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && elements.markdownWorkspace.classList.contains('fullscreen-preview')) {
                elements.markdownWorkspace.classList.remove('fullscreen-preview');
                setStatus('退出全屏', 'ready');
            }
        });

        // Attach event listeners - Toolbox
        elements.modeToolbox.addEventListener('click', () => switchMode('toolbox'));
        // Note: Toolbox tool-specific event handlers are now in tools/toolbox.js

        // Appearance Settings Listeners (Immediate Preview)
        elements.editorTheme.addEventListener('change', () => {
            editorManager.setTheme(elements.editorTheme.value);
        });
        elements.editorFont.addEventListener('change', () => {
            editorManager.setFont(elements.editorFont.value);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        setStatus('就绪', 'ready');
    }

    // Debounce function
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

    // Debounced handlers
    const debouncedConvert = debounce(() => handleConvert(), 500);
    const debouncedDiff = debounce(() => handleDiff(), 500);

    // Switch Mode
    function switchMode(mode) {
        currentMode = mode;

        // Reset all mode buttons and workspaces
        elements.modeConverter.classList.remove('active');
        elements.modeDiff.classList.remove('active');
        elements.modeMarkdown.classList.remove('active');
        if (elements.modeToolbox) elements.modeToolbox.classList.remove('active');
        elements.converterWorkspace.classList.add('hidden');
        elements.diffWorkspace.classList.add('hidden');
        elements.markdownWorkspace.classList.add('hidden');
        if (elements.toolboxWorkspace) elements.toolboxWorkspace.classList.add('hidden');

        if (mode === 'converter') {
            elements.modeConverter.classList.add('active');
            elements.converterWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'visible';
            setStatus('转换模式', 'ready');
        } else if (mode === 'diff') {
            elements.modeDiff.classList.add('active');
            elements.diffWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            setStatus('DDL 对比模式', 'ready');
        } else if (mode === 'markdown') {
            elements.modeMarkdown.classList.add('active');
            elements.markdownWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            setStatus('Markdown 预览模式', 'ready');
        } else if (mode === 'toolbox') {
            elements.modeToolbox.classList.add('active');
            elements.toolboxWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden';
            setStatus('开发者工具箱', 'ready');
            // Trigger initial tool processing
            handleToolboxInput();
        }
    }

    // Handle Diff Logic
    function handleDiff() {
        const targetDDL = editorManager.getValue('diffTargetInput');
        const sourceDDL = editorManager.getValue('diffSourceInput');

        if (!targetDDL.trim() && !sourceDDL.trim()) {
            editorManager.setValue('diffOutputArea', '-- 在左侧分别输入新旧 DDL\n-- 将自动生成 ALTER 语句');
            return;
        }

        setStatus('正在生成 Diff...', 'processing');

        try {
            // Check if diffEngine exists (loaded via script tag)
            if (typeof diffEngine === 'undefined') {
                throw new Error('Diff Engine 未加载');
            }

            const statements = diffEngine.generateDiff(targetDDL, sourceDDL);
            editorManager.setValue('diffOutputArea', statements.join('\n'));
            setStatus('Diff 生成成功', 'success');
        } catch (e) {
            editorManager.setValue('diffOutputArea', `-- 错误: ${e.message}`);
            setStatus('Diff 生成失败', 'error');
        }
    }

    function handleDiffChange() {
        debouncedDiff();
    }

    function handleCopyDiff() {
        const text = editorManager.getValue('diffOutputArea');
        if (!text || text.startsWith('--')) {
            setStatus('没有可复制的 SQL', 'error');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            setStatus('SQL 已复制', 'success');
            elements.copyDiffBtn.classList.add('copied');
            setTimeout(() => elements.copyDiffBtn.classList.remove('copied'), 600);
        });
    }

    function handleClearDiff() {
        editorManager.setValue('diffTargetInput', '');
        editorManager.setValue('diffSourceInput', '');
        editorManager.setValue('diffOutputArea', '-- 在左侧分别输入新旧 DDL\n-- 将自动生成 ALTER 语句');
        // historyManager.save('diffTargetInput', ''); // DISABLED
        // historyManager.save('diffSourceInput', ''); // DISABLED
        setStatus('Diff 已清空', 'ready');
    }

    // ==================== Markdown Mode ====================

    // Debounced markdown render
    const debouncedMarkdownRender = debounce(() => handleMarkdownRender(), 300);

    function handleMarkdownChange() {
        debouncedMarkdownRender();
    }

    async function handleMarkdownRender() {
        const input = editorManager.getValue('markdownInput');

        if (!input.trim()) {
            elements.markdownPreview.innerHTML = '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
            lastRenderedHtml = '';
            return;
        }

        setStatus('正在渲染...', 'processing');

        try {
            if (typeof MarkdownRenderer !== 'undefined') {
                const html = await MarkdownRenderer.render(input);
                elements.markdownPreview.innerHTML = html;
                lastRenderedHtml = html;

                // Initialize code block enhancer (format + copy buttons)
                if (typeof CodeBlockEnhancer !== 'undefined') {
                    CodeBlockEnhancer.init(elements.markdownPreview, { autoFormat: true });
                }

                // Apply syntax highlighting with Prism.js
                if (typeof Prism !== 'undefined') {
                    Prism.highlightAllUnder(elements.markdownPreview);
                }

                setStatus('渲染完成', 'success');
            } else {
                throw new Error('Markdown 渲染器未加载');
            }
        } catch (error) {
            elements.markdownPreview.innerHTML = `<p class="placeholder" style="color: var(--color-error);">渲染错误: ${error.message}</p>`;
            setStatus('渲染失败', 'error');
        }
    }

    function handleClearMarkdown() {
        editorManager.setValue('markdownInput', '');
        // historyManager.save('markdownInput', ''); // DISABLED
        elements.markdownPreview.innerHTML = '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
        lastRenderedHtml = '';
        setStatus('Markdown 已清除', 'ready');
    }

    // Toggle fullscreen preview mode (only for Markdown workspace)
    function toggleMarkdownFullscreen() {
        const isFullscreen = elements.markdownWorkspace.classList.toggle('fullscreen-preview');
        setStatus(isFullscreen ? '全屏预览 (按 Esc 退出)' : '正常视图', 'ready');
    }

    async function handleCopyMarkdownHtml() {
        if (!lastRenderedHtml) {
            setStatus('没有可复制的内容', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(lastRenderedHtml);
            setStatus('HTML 已复制到剪贴板', 'success');
            elements.copyMarkdownHtmlBtn.classList.add('copied');
            setTimeout(() => elements.copyMarkdownHtmlBtn.classList.remove('copied'), 600);
        } catch (error) {
            setStatus('复制失败', 'error');
        }
    }

    // Toggle export dropdown
    function toggleExportDropdown(event) {
        event.stopPropagation();
        elements.exportMarkdownDropdown.classList.toggle('open');
    }

    // Close export dropdown when clicking outside
    function closeExportDropdown(event) {
        if (!elements.exportMarkdownDropdown.contains(event.target)) {
            elements.exportMarkdownDropdown.classList.remove('open');
        }
    }

    // Handle markdown export (PNG/JPG/SVG)
    async function handleMarkdownExport(event) {
        const item = event.target.closest('.dropdown-item');
        if (!item) return;

        const format = item.dataset.format;
        elements.exportMarkdownDropdown.classList.remove('open');

        // Check if preview has actual content (not just placeholder)
        const previewContent = elements.markdownPreview.innerHTML;
        const hasContent = previewContent &&
            !previewContent.includes('class="placeholder"') &&
            elements.markdownPreview.childNodes.length > 0;

        if (!hasContent) {
            setStatus('没有可导出的内容', 'error');
            return;
        }

        if (typeof MarkdownExporter === 'undefined') {
            setStatus('导出模块未加载', 'error');
            return;
        }

        try {
            setStatus(`正在导出 ${format.toUpperCase()}...`, 'processing');

            if (format === 'png') {
                await MarkdownExporter.exportAsPNG(elements.markdownPreview);
            } else if (format === 'jpg') {
                await MarkdownExporter.exportAsJPG(elements.markdownPreview);
            } else if (format === 'svg') {
                await MarkdownExporter.exportAsSVG(elements.markdownPreview);
            }

            setStatus(`${format.toUpperCase()} 导出成功`, 'success');
        } catch (error) {
            setStatus(`导出失败: ${error.message}`, 'error');
        }
    }
    // Handle chart export and zoom button clicks (event delegation)
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

        // Handle export button click
        const btn = event.target.closest('.mermaid-export-btn');
        if (!btn) return;

        const format = btn.dataset.format;
        const index = parseInt(btn.dataset.index, 10);
        const container = btn.closest('.mermaid-container');

        if (!container) {
            setStatus('未找到图表容器', 'error');
            return;
        }

        // 选择 Mermaid 图表 SVG，排除按钮内的图标 SVG
        const svgElement = container.querySelector('svg[id^="mermaid-"]') ||
            container.querySelector(':scope > svg');
        if (!svgElement) {
            setStatus('未找到 SVG 元素', 'error');
            return;
        }

        // Check if ChartExporter is loaded
        if (typeof ChartExporter === 'undefined') {
            setStatus('导出模块未加载', 'error');
            return;
        }

        const filename = ChartExporter.generateFilename(index);

        try {
            if (format === 'svg') {
                setStatus('正在导出 SVG...', 'processing');
                ChartExporter.exportAsSVG(svgElement, filename);
                setStatus('SVG 导出成功', 'success');
            } else if (format === 'png') {
                setStatus('正在导出 PNG...', 'processing');
                await ChartExporter.exportAsPNG(svgElement, filename);
                setStatus('PNG 导出成功', 'success');
            }
        } catch (error) {
            setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    // Handle input change (auto-detect type and auto-convert)
    function handleInputChange() {
        const input = editorManager.getValue('inputArea');
        updateLineCount(input);

        if (input.trim().length === 0) {
            elements.inputType.textContent = '未检测';
            elements.inputType.classList.remove('detected');
            return;
        }

        // Auto-detect if set to auto
        if (elements.dbType.value === 'auto') {
            const detectedType = detectInputType(input);
            updateInputTypeBadge(detectedType);

            // Show/hide config format options based on input type
            updateConfigFormatVisibility(detectedType);
        }

        // Trigger auto-conversion
        debouncedConvert();
    }

    // Show/hide config format output options based on input type
    function updateConfigFormatVisibility(inputType) {
        const isConfigFormat = ['json', 'yaml', 'toml', 'xml'].includes(inputType);

        elements.configFormatLabels.forEach(label => {
            if (isConfigFormat) {
                label.classList.remove('hidden');
            } else {
                label.classList.add('hidden');
            }
        });
    }

    // Auto-format input content
    let isFormatting = false; // Flag to prevent infinite loop

    function autoFormatInput() {
        if (currentSettings.autoFormat === 'never') return;
        if (isFormatting) return; // Prevent recursive formatting

        const input = editorManager.getValue('inputArea');
        if (!input || input.trim().length < 10) return;

        // Detect type
        let inputType = elements.dbType.value;
        if (inputType === 'auto') {
            inputType = detectInputType(input);
        }

        // Only format JSON and SQL types
        if (!['json', 'mysql', 'postgresql', 'sqlite'].includes(inputType)) {
            return;
        }

        try {
            const indent = currentSettings.formatIndent === 'tab' ? 'tab' : (currentSettings.formatIndent || 4);
            const formatted = AutoFormatter.format(input, inputType, {
                indent: indent === 'tab' ? 1 : indent,
                useTabs: indent === 'tab'
            });

            // Compare normalized versions (remove all whitespace)
            const normalizeForCompare = (s) => s.replace(/\s+/g, '');
            const inputNormalized = normalizeForCompare(input);
            const formattedNormalized = normalizeForCompare(formatted);

            // Only update if the data is the same but formatting differs
            if (formatted && inputNormalized === formattedNormalized && formatted !== input) {
                isFormatting = true; // Set flag before updating

                // Get cursor position before formatting
                const editor = editorManager.editors.get('inputArea');
                const cursor = editor ? editor.getCursor() : null;

                editorManager.setValue('inputArea', formatted);

                // Try to restore cursor position
                if (editor && cursor) {
                    try {
                        editor.setCursor(cursor);
                    } catch (e) {
                        // Cursor position may be invalid after formatting
                    }
                }

                setStatus('已自动格式化', 'success');

                // Reset flag after a short delay
                setTimeout(() => { isFormatting = false; }, 100);
            }
        } catch (e) {
            console.warn('Auto-format error:', e.message);
        }
    }

    // Handle database type change
    function handleDbTypeChange() {
        handleInputChange();
    }


    // Handle inline nested struct change
    function handleInlineNestedChange() {
        // Save immediately when checkbox changes
        currentSettings.inlineNestedStructs = elements.inlineNestedStructs.checked;
        Settings.save(currentSettings);
        // Re-convert if data exists
        if (lastParsedData) {
            handleConvert();
        }
    }

    // Handle output format change
    function handleOutputFormatChange() {
        const isProtoFormat = elements.outputFormatProto.checked;

        // Toggle visibility of format-specific options
        if (isProtoFormat) {
            elements.goStructOptions.classList.add('hidden');
            elements.protoNestedMode.classList.remove('hidden');
            editorManager.setMode('outputArea', 'proto');
        } else {
            elements.goStructOptions.classList.remove('hidden');
            elements.protoNestedMode.classList.add('hidden');
            editorManager.setMode('outputArea', 'go');
        }

        // Re-convert if data exists
        if (lastParsedData) {
            handleConvert();
        }
    }

    // Handle Protocol Buffer nested mode change
    function handleProtoNestedModeChange() {
        if (lastParsedData) {
            handleConvert();
        }
    }

    // Update input type badge
    function updateInputTypeBadge(type) {
        const typeLabels = {
            'mysql': 'MySQL',
            'postgresql': 'PostgreSQL',
            'sqlite': 'SQLite',
            'json': 'JSON',
            'yaml': 'YAML',
            'toml': 'TOML',
            'xml': 'XML',
            'unknown': '未知'
        };

        elements.inputType.textContent = typeLabels[type] || '未知';

        if (type !== 'unknown') {
            elements.inputType.classList.add('detected');
        } else {
            elements.inputType.classList.remove('detected');
        }

        // Update input editor syntax highlighting
        const modeMap = {
            'mysql': 'sql',
            'postgresql': 'sql',
            'sqlite': 'sql',
            'json': 'json',
            'yaml': 'yaml',
            'toml': 'toml',
            'xml': 'xml'
        };

        const mode = modeMap[type] || 'sql';
        editorManager.setMode('inputArea', mode);
    }

    // Handle convert button click
    async function handleConvert() {
        const input = editorManager.getValue('inputArea').trim();

        if (!input) {
            setStatus('请输入 DDL 或 JSON', 'error');
            return;
        }

        setStatus('正在转换...', 'processing');

        try {
            // Determine input type
            let inputType = elements.dbType.value;
            if (inputType === 'auto') {
                inputType = detectInputType(input);
            }

            // Parse based on type
            let parsedData;
            let configData = null; // For config format conversions

            switch (inputType) {
                case 'mysql':
                    parsedData = parseMySQLDDL(input);
                    break;
                case 'postgresql':
                    parsedData = parsePostgreSQLDDL(input);
                    break;
                case 'sqlite':
                    parsedData = parseSQLiteDDL(input);
                    break;
                case 'json':
                    const structName = currentSettings.structName || 'Response';
                    parsedData = parseJSON(input, structName);
                    // Also store raw data for config conversions
                    try {
                        configData = JSON.parse(input);
                    } catch (e) { }
                    break;
                case 'yaml':
                    if (typeof parseYAML !== 'undefined') {
                        const yamlResult = parseYAML(input);
                        if (yamlResult.error) throw new Error(yamlResult.error);
                        configData = yamlResult.data;
                        // Create parsedData for Go struct
                        parsedData = parseJSON(JSON.stringify(configData), currentSettings.structName || 'Config');
                    } else {
                        throw new Error('YAML parser not loaded');
                    }
                    break;
                case 'toml':
                    if (typeof parseTOML !== 'undefined') {
                        const tomlResult = parseTOML(input);
                        if (tomlResult.error) throw new Error(tomlResult.error);
                        configData = tomlResult.data;
                        parsedData = parseJSON(JSON.stringify(configData), currentSettings.structName || 'Config');
                    } else {
                        throw new Error('TOML parser not loaded');
                    }
                    break;
                case 'xml':
                    if (typeof parseXML !== 'undefined') {
                        const xmlResult = parseXML(input);
                        if (xmlResult.error) throw new Error(xmlResult.error);
                        configData = xmlResult.data;
                        parsedData = parseJSON(JSON.stringify(configData), currentSettings.structName || 'Config');
                    } else {
                        throw new Error('XML parser not loaded');
                    }
                    break;
                default:
                    throw new Error('无法识别输入类型');
            }

            // Check for parsing errors
            if (parsedData && parsedData.error) {
                throw new Error(parsedData.error);
            }

            // Store parsed data
            lastParsedData = parsedData;

            // Determine output format
            let outputFormat = 'go';
            if (elements.outputFormatProto.checked) outputFormat = 'proto';
            else if (elements.outputFormatJSON && elements.outputFormatJSON.checked) outputFormat = 'json';
            else if (elements.outputFormatYAML && elements.outputFormatYAML.checked) outputFormat = 'yaml';
            else if (elements.outputFormatTOML && elements.outputFormatTOML.checked) outputFormat = 'toml';

            let generatedCode;
            const indent = currentSettings.formatIndent === 'tab' ? 2 : (currentSettings.formatIndent || 4);

            if (outputFormat === 'proto') {
                // Generate Protocol Buffer message
                if (!['json', 'yaml', 'toml', 'xml'].includes(inputType)) {
                    throw new Error('Protocol Buffer 仅支持 JSON/YAML/TOML/XML 输入');
                }

                const dataForProto = configData || (parsedData ? parsedData.data : null);
                if (!dataForProto) throw new Error('无法解析输入数据');

                const protoOptions = {
                    messageName: currentSettings.structName || 'Message',
                    nestedMode: elements.protoNestedMode.value,
                    packageName: currentSettings.packageName || 'model',
                    syntax: 'proto3',
                    numericIntType: 'int32',
                    numericFloatType: 'float'
                };

                // Parse JSON for Protocol Buffer (adds field numbers)
                const protoParsedData = parseJSONForProtobuf(JSON.stringify(dataForProto), protoOptions.messageName);
                if (protoParsedData.error) {
                    throw new Error(protoParsedData.error);
                }

                generatedCode = generateProtoMessage(protoParsedData, protoOptions);
                editorManager.setMode('outputArea', 'proto');

            } else if (['json', 'yaml', 'toml'].includes(outputFormat)) {
                // Config format conversion
                const dataToConvert = configData || (inputType === 'json' ? JSON.parse(input) : null);
                if (!dataToConvert) {
                    throw new Error('无法获取数据进行转换');
                }

                switch (outputFormat) {
                    case 'json':
                        generatedCode = ConfigGenerator.generateJSON(dataToConvert, { indent });
                        editorManager.setMode('outputArea', 'json');
                        break;
                    case 'yaml':
                        generatedCode = ConfigGenerator.generateYAML(dataToConvert, { indent });
                        editorManager.setMode('outputArea', 'yaml');
                        break;
                    case 'toml':
                        generatedCode = ConfigGenerator.generateTOML(dataToConvert, { indent });
                        editorManager.setMode('outputArea', 'toml');
                        break;
                }

            } else {
                // Generate Go struct (existing logic)
                const options = {
                    structName: currentSettings.structName || undefined, // Use undefined to trigger auto-generation
                    packageName: currentSettings.packageName,
                    generateTableName: currentSettings.generateTableName,
                    inlineNestedStructs: elements.inlineNestedStructs.checked,  // Read directly from UI
                    inputType: inputType  // Pass input type to control tag generation
                };
                generatedCode = generateGoStruct(parsedData, options);
                editorManager.setMode('outputArea', 'go');
            }

            lastGeneratedCode = generatedCode;

            // Display output
            editorManager.setValue('outputArea', generatedCode);

            setStatus('转换成功！', 'success');

        } catch (error) {
            setStatus(`转换失败: ${error.message}`, 'error');
            editorManager.setValue('outputArea', `// 错误: ${error.message}`);
        }
    }

    // Handle copy button click
    async function handleCopy() {
        if (!lastGeneratedCode) {
            setStatus('没有可复制的内容', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(lastGeneratedCode);
            setStatus('已复制到剪贴板！', 'success');

            // Add animation
            elements.copyBtn.classList.add('copied');
            setTimeout(() => {
                elements.copyBtn.classList.remove('copied');
            }, 600);

        } catch (error) {
            setStatus('复制失败', 'error');
        }
    }

    // Handle export button click
    async function handleExport() {
        if (!lastGeneratedCode || !lastParsedData) {
            setStatus('没有可导出的内容', 'error');
            return;
        }

        try {
            const isProtoFormat = elements.outputFormatProto.checked;

            if (isProtoFormat) {
                // Export as .proto file
                const messageName = currentSettings.structName || 'Message';
                const packageName = currentSettings.packageName || 'model';
                const filename = `${messageName.toLowerCase()}.proto`;

                const blob = new Blob([lastGeneratedCode], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);

                // Use Chrome downloads API if available (extension context)
                if (chrome && chrome.downloads) {
                    chrome.downloads.download({
                        url: url,
                        filename: filename,
                        saveAs: true
                    });
                } else {
                    // Fallback to regular download
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                }

                setStatus('Proto 文件导出成功！', 'success');

            } else {
                // Export as Go file (existing logic)
                const structName = currentSettings.structName ||
                    lastParsedData.structName ||
                    snakeToCamel(lastParsedData.tableName);

                // Determine required imports
                const imports = getRequiredImports(lastParsedData.fields);

                Exporter.exportAsGoFile(
                    lastGeneratedCode,
                    structName,
                    currentSettings.packageName,
                    imports
                );

                setStatus('导出成功！', 'success');
            }

        } catch (error) {
            setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    // Handle clear button click
    function handleClear() {
        editorManager.setValue('inputArea', '');
        // historyManager.save('inputArea', ''); // DISABLED
        editorManager.setValue('outputArea', '// 在左侧输入 DDL 或 JSON，点击"转换"按钮生成 Go struct');
        lastParsedData = null;
        lastGeneratedCode = '';
        elements.inputType.textContent = '未检测';
        elements.inputType.classList.remove('detected');
        updateLineCount('');
        setStatus('已清除', 'ready');
    }

    // Handle settings save
    async function handleSaveSettings() {
        currentSettings.structName = elements.structNameInput.value;
        currentSettings.packageName = elements.packageNameInput.value;
        currentSettings.generateTableName = elements.generateTableName.checked;

        // Appearance
        currentSettings.editorTheme = elements.editorTheme.value;
        currentSettings.editorFont = elements.editorFont.value;

        // Formatting
        currentSettings.autoFormat = elements.autoFormat.value;
        currentSettings.formatIndent = elements.formatIndent.value === 'tab' ? 'tab' : parseInt(elements.formatIndent.value);

        // inlineNestedStructs is handled separately in the header

        await Settings.save(currentSettings);

        // Apply settings
        editorManager.setTheme(currentSettings.editorTheme);
        editorManager.setFont(currentSettings.editorFont);

        setStatus('设置已保存', 'success');
        showModal(false);
    }

    // Update settings UI
    function updateSettingsUI() {
        elements.structNameInput.value = currentSettings.structName || '';
        elements.packageNameInput.value = currentSettings.packageName || 'model';
        elements.generateTableName.checked = currentSettings.generateTableName !== false;
        // Set inline nested struct checkbox in header
        elements.inlineNestedStructs.checked = currentSettings.inlineNestedStructs !== false;

        // Appearance
        elements.editorTheme.value = currentSettings.editorTheme || 'dracula';
        elements.editorFont.value = currentSettings.editorFont || "'JetBrains Mono', monospace";

        // Formatting
        elements.autoFormat.value = currentSettings.autoFormat || 'always';
        elements.formatIndent.value = currentSettings.formatIndent === 'tab' ? 'tab' : (currentSettings.formatIndent || 4).toString();
    }
    // Show/hide modal
    function showModal(show) {
        if (show) {
            elements.settingsModal.classList.remove('hidden');
        } else {
            elements.settingsModal.classList.add('hidden');
        }
    }

    // Set status message
    function setStatus(message, type = 'ready') {
        elements.statusMessage.textContent = message;
        elements.statusMessage.className = 'status';

        if (type === 'success') {
            elements.statusMessage.classList.add('success');
        } else if (type === 'error') {
            elements.statusMessage.classList.add('error');
        }
    }

    // Update line count
    function updateLineCount(text) {
        const lines = text ? text.split('\n').length : 0;
        elements.lineCount.textContent = `${lines} 行`;
    }

    // ==================== Toolbox Handlers ====================

    // Handle tool selection
    function handleToolSelect(e) {
        const btn = e.target.closest('.tool-btn');
        if (!btn) return;

        const tool = btn.dataset.tool;
        if (!tool) return;

        // Update active state
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentTool = tool;

        // Update output title
        const toolNames = {
            timestamp: '时间戳转换',
            base64: 'Base64 编解码',
            url: 'URL 编解码',
            jwt: 'JWT 解析',
            hash: '哈希计算',
            uuid: 'ID 生成器'
        };
        if (elements.toolboxOutputTitle) {
            elements.toolboxOutputTitle.textContent = toolNames[tool] || '结果';
        }

        // Process with new tool
        handleToolboxInput();
    }

    // Handle toolbox input
    async function handleToolboxInput() {
        const input = elements.toolboxInput ? elements.toolboxInput.value : '';

        try {
            const results = await Toolbox.process(currentTool, input);
            const html = Toolbox.renderResults(results);
            if (elements.toolboxOutput) {
                elements.toolboxOutput.innerHTML = html;
            }
        } catch (error) {
            if (elements.toolboxOutput) {
                elements.toolboxOutput.innerHTML = `<div class="result-section">
                    <div class="result-label">错误</div>
                    <div class="result-value error">${error.message}</div>
                </div>`;
            }
        }
    }

    // Handle clear toolbox
    function handleClearToolbox() {
        if (elements.toolboxInput) {
            elements.toolboxInput.value = '';
        }
        if (elements.toolboxOutput) {
            elements.toolboxOutput.innerHTML = '<p class="placeholder">选择工具并输入内容...</p>';
        }
        setStatus('已清除', 'ready');
    }

    // Handle copy toolbox result
    function handleCopyToolbox() {
        if (!elements.toolboxOutput) return;

        // Get all result values
        const values = Array.from(elements.toolboxOutput.querySelectorAll('.result-value'))
            .map(el => el.textContent)
            .join('\n\n');

        if (!values) {
            setStatus('没有可复制的内容', 'error');
            return;
        }

        // Copy to clipboard
        navigator.clipboard.writeText(values).then(() => {
            setStatus('已复制到剪贴板', 'success');
            elements.copyToolboxBtn.classList.add('copied');
            setTimeout(() => elements.copyToolboxBtn.classList.remove('copied'), 600);
        }).catch(() => {
            setStatus('复制失败', 'error');
        });
    }

    // Handle clicks in toolbox output (for copy buttons)
    function handleToolboxOutputClick(e) {
        const copyBtn = e.target.closest('.copy-btn');
        if (!copyBtn) return;

        const value = copyBtn.dataset.value;
        if (!value) return;

        navigator.clipboard.writeText(value).then(() => {
            copyBtn.textContent = '已复制';
            setTimeout(() => copyBtn.textContent = '复制', 1000);
        });
    }

    // Handle keyboard shortcuts
    function handleKeyboard(e) {
        // Cmd/Ctrl + Enter: Convert
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleConvert();
        }

        // Cmd/Ctrl + K: Clear
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            handleClear();
        }

        // Escape: Close modal
        if (e.key === 'Escape') {
            showModal(false);
        }
    }

    // Utility: snake_case to PascalCase  
    function snakeToCamel(str) {
        if (!str) return '';

        // Split by underscores and capitalize first letter of each word
        return str
            .split('_')
            .map(word => {
                if (!word) return '';
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join('');
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', init);

})();
