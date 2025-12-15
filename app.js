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

        // Diff Elements
        diffTargetInput: document.getElementById('diffTargetInput'),
        diffSourceInput: document.getElementById('diffSourceInput'),
        diffOutputArea: document.getElementById('diffOutputArea'),
        copyDiffBtn: document.getElementById('copyDiffBtn'),
        clearDiffBtn: document.getElementById('clearDiffBtn'),

        // Mode Switcher
        modeConverter: document.getElementById('modeConverter'),
        modeDiff: document.getElementById('modeDiff'),
        converterWorkspace: document.getElementById('converterWorkspace'),
        diffWorkspace: document.getElementById('diffWorkspace'),
    };

    // State
    let currentSettings = null;
    let lastParsedData = null;
    let lastGeneratedCode = '';
    let currentMode = 'converter'; // 'converter' or 'diff'

    // Initialize
    async function init() {
        // Load settings
        currentSettings = await Settings.load();
        updateSettingsUI();

        // Attach event listeners - Converter
        elements.convertBtn.addEventListener('click', handleConvert);
        elements.copyBtn.addEventListener('click', handleCopy);
        elements.exportBtn.addEventListener('click', handleExport);
        elements.clearBtn.addEventListener('click', handleClear);
        elements.settingsBtn.addEventListener('click', () => showModal(true));
        elements.closeModal.addEventListener('click', () => showModal(false));
        elements.saveSettings.addEventListener('click', handleSaveSettings);
        elements.inputArea.addEventListener('input', handleInputChange);
        elements.dbType.addEventListener('change', handleDbTypeChange);
        elements.inlineNestedStructs.addEventListener('change', handleInlineNestedChange);

        // Attach event listeners - Diff
        elements.modeConverter.addEventListener('click', () => switchMode('converter'));
        elements.modeDiff.addEventListener('click', () => switchMode('diff'));
        elements.diffTargetInput.addEventListener('input', handleDiffChange);
        elements.diffSourceInput.addEventListener('input', handleDiffChange);
        elements.copyDiffBtn.addEventListener('click', handleCopyDiff);
        elements.clearDiffBtn.addEventListener('click', handleClearDiff);

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

        if (mode === 'converter') {
            elements.modeConverter.classList.add('active');
            elements.modeDiff.classList.remove('active');
            elements.converterWorkspace.classList.remove('hidden');
            elements.diffWorkspace.classList.add('hidden');
            elements.converterOptions.style.visibility = 'visible'; // Show converter options
            setStatus('转换模式', 'ready');
        } else {
            elements.modeConverter.classList.remove('active');
            elements.modeDiff.classList.add('active');
            elements.converterWorkspace.classList.add('hidden');
            elements.diffWorkspace.classList.remove('hidden');
            elements.converterOptions.style.visibility = 'hidden'; // Hide converter-specific options
            setStatus('DDL 对比模式', 'ready');
        }
    }

    // Handle Diff Logic
    function handleDiff() {
        const targetDDL = elements.diffTargetInput.value;
        const sourceDDL = elements.diffSourceInput.value;

        if (!targetDDL.trim() && !sourceDDL.trim()) {
            elements.diffOutputArea.textContent = '-- 在左侧分别输入新旧 DDL\n-- 将自动生成 ALTER 语句';
            return;
        }

        setStatus('正在生成 Diff...', 'processing');

        try {
            // Check if diffEngine exists (loaded via script tag)
            if (typeof diffEngine === 'undefined') {
                throw new Error('Diff Engine 未加载');
            }

            const statements = diffEngine.generateDiff(targetDDL, sourceDDL);
            elements.diffOutputArea.textContent = statements.join('\n');
            setStatus('Diff 生成成功', 'success');
        } catch (e) {
            elements.diffOutputArea.textContent = `-- 错误: ${e.message}`;
            setStatus('Diff 生成失败', 'error');
        }
    }

    function handleDiffChange() {
        debouncedDiff();
    }

    function handleCopyDiff() {
        const text = elements.diffOutputArea.textContent;
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
        elements.diffTargetInput.value = '';
        elements.diffSourceInput.value = '';
        elements.diffOutputArea.textContent = '-- 在左侧分别输入新旧 DDL\n-- 将自动生成 ALTER 语句';
        setStatus('Diff 已清空', 'ready');
    }

    // Handle input change (auto-detect type and auto-convert)
    function handleInputChange() {
        const input = elements.inputArea.value;
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
        }

        // Trigger auto-conversion
        debouncedConvert();
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
    }

    // Update input type badge
    function updateInputTypeBadge(type) {
        const typeLabels = {
            'mysql': 'MySQL',
            'postgresql': 'PostgreSQL',
            'sqlite': 'SQLite',
            'json': 'JSON',
            'unknown': '未知'
        };

        elements.inputType.textContent = typeLabels[type] || '未知';

        if (type !== 'unknown') {
            elements.inputType.classList.add('detected');
        } else {
            elements.inputType.classList.remove('detected');
        }
    }

    // Handle convert button click
    async function handleConvert() {
        const input = elements.inputArea.value.trim();

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
                    break;
                default:
                    throw new Error('无法识别输入类型');
            }

            // Check for parsing errors
            if (parsedData.error) {
                throw new Error(parsedData.error);
            }

            // Store parsed data
            lastParsedData = parsedData;

            // Generate Go struct
            const options = {
                structName: currentSettings.structName || undefined, // Use undefined to trigger auto-generation
                packageName: currentSettings.packageName,
                generateTableName: currentSettings.generateTableName,
                inlineNestedStructs: elements.inlineNestedStructs.checked,  // Read directly from UI
                inputType: inputType  // Pass input type to control tag generation
            };

            const goCode = generateGoStruct(parsedData, options);
            lastGeneratedCode = goCode;

            // Display output
            elements.outputArea.textContent = goCode;

            setStatus('转换成功！', 'success');

        } catch (error) {
            setStatus(`转换失败: ${error.message}`, 'error');
            elements.outputArea.textContent = `// 错误: ${error.message}`;
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

        } catch (error) {
            setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    // Handle clear button click
    function handleClear() {
        elements.inputArea.value = '';
        elements.outputArea.textContent = '// 在左侧输入 DDL 或 JSON，点击"转换"按钮生成 Go struct';
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
        // inlineNestedStructs is handled separately in the header

        await Settings.save(currentSettings);

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
