// Main Popup Script
// Orchestrates all functionality and UI interactions

(function () {
    'use strict';

    // DOM Elements
    const elements = {
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
        inlineNestedStructs: document.getElementById('inlineNestedStructs')
    };

    // State
    let currentSettings = null;
    let lastParsedData = null;
    let lastGeneratedCode = '';

    // Initialize
    async function init() {
        // Load settings
        currentSettings = await Settings.load();
        updateSettingsUI();

        // Attach event listeners
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

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);

        setStatus('就绪', 'ready');
    }

    // Handle input change (auto-detect type)
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
