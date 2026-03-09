/**
 * ConverterController - Handles DDL/JSON/Config conversion functionality
 */
(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    let ctx = null;
    let lastParsedData = null;
    let lastGeneratedCode = '';
    let isFormatting = false;
    let debouncedConvert = null;
    let debouncedAutoFormat = null;

    function init(appCtx) {
        ctx = appCtx;
        const el = ctx.elements;

        debouncedConvert = ctx.debounce(() => handleConvert(), 500);
        debouncedAutoFormat = ctx.debounce(() => {
            if (ctx.getSettings().autoFormat === 'always') {
                autoFormatInput();
            }
        }, 1500);

        // Editor listeners
        const inputEditor = editorManager.get('inputArea');
        if (inputEditor) {
            inputEditor.on('change', () => {
                handleInputChange();
                debouncedAutoFormat();
            });
            inputEditor.on('paste', () => {
                const settings = ctx.getSettings();
                if (settings.autoFormat === 'paste' || settings.autoFormat === 'always') {
                    setTimeout(() => autoFormatInput(), 50);
                }
            });
        }

        // Button listeners
        el.convertBtn.addEventListener('click', handleConvert);
        el.copyBtn.addEventListener('click', handleCopy);
        el.exportBtn.addEventListener('click', handleExport);
        el.clearBtn.addEventListener('click', handleClear);
        el.dbType.addEventListener('change', handleDbTypeChange);
        el.inlineNestedStructs.addEventListener('change', handleInlineNestedChange);

        // Output format switcher
        el.outputFormatGo.addEventListener('change', handleOutputFormatChange);
        el.outputFormatProto.addEventListener('change', handleOutputFormatChange);
        if (el.outputFormatJSON) el.outputFormatJSON.addEventListener('change', handleOutputFormatChange);
        if (el.outputFormatYAML) el.outputFormatYAML.addEventListener('change', handleOutputFormatChange);
        if (el.outputFormatTOML) el.outputFormatTOML.addEventListener('change', handleOutputFormatChange);
        el.protoNestedMode.addEventListener('change', handleProtoNestedModeChange);
    }

    function handleInputChange() {
        const input = editorManager.getValue('inputArea');
        updateLineCount(input);

        if (input.trim().length === 0) {
            ctx.elements.inputType.textContent = '未检测';
            ctx.elements.inputType.classList.remove('detected');
            return;
        }

        if (ctx.elements.dbType.value === 'auto') {
            const detectedType = detectInputType(input);
            updateInputTypeBadge(detectedType);
            updateConfigFormatVisibility(detectedType);
        }

        debouncedConvert();
    }

    function updateConfigFormatVisibility(inputType) {
        const isConfigFormat = ['json', 'yaml', 'toml', 'xml'].includes(inputType);
        ctx.elements.configFormatLabels.forEach(label => {
            if (isConfigFormat) {
                label.classList.remove('hidden');
            } else {
                label.classList.add('hidden');
            }
        });
    }

    function autoFormatInput() {
        const settings = ctx.getSettings();
        if (settings.autoFormat === 'never') return;
        if (isFormatting) return;

        const input = editorManager.getValue('inputArea');
        if (!input || input.trim().length < 10) return;

        let inputType = ctx.elements.dbType.value;
        if (inputType === 'auto') {
            inputType = detectInputType(input);
        }

        if (!['json', 'mysql', 'postgresql', 'sqlite'].includes(inputType)) return;

        try {
            const indent = settings.formatIndent === 'tab' ? 'tab' : (settings.formatIndent || 4);
            const formatted = AutoFormatter.format(input, inputType, {
                indent: indent === 'tab' ? 1 : indent,
                useTabs: indent === 'tab'
            });

            const normalizeForCompare = (s) => s.replace(/\s+/g, '');
            const inputNormalized = normalizeForCompare(input);
            const formattedNormalized = normalizeForCompare(formatted);

            if (formatted && inputNormalized === formattedNormalized && formatted !== input) {
                isFormatting = true;
                const editor = editorManager.editors.get('inputArea');
                const cursor = editor ? editor.getCursor() : null;
                editorManager.setValue('inputArea', formatted);
                if (editor && cursor) {
                    try { editor.setCursor(cursor); } catch (e) {}
                }
                ctx.setStatus('已自动格式化', 'success');
                setTimeout(() => { isFormatting = false; }, 100);
            }
        } catch (e) {
            console.warn('Auto-format error:', e.message);
        }
    }

    function handleDbTypeChange() {
        handleInputChange();
    }

    function handleInlineNestedChange() {
        const settings = ctx.getSettings();
        settings.inlineNestedStructs = ctx.elements.inlineNestedStructs.checked;
        Settings.save(settings);
        if (lastParsedData) handleConvert();
    }

    function handleOutputFormatChange() {
        const isProtoFormat = ctx.elements.outputFormatProto.checked;
        if (isProtoFormat) {
            ctx.elements.goStructOptions.classList.add('hidden');
            ctx.elements.protoNestedMode.classList.remove('hidden');
            editorManager.setMode('outputArea', 'proto');
        } else {
            ctx.elements.goStructOptions.classList.remove('hidden');
            ctx.elements.protoNestedMode.classList.add('hidden');
            editorManager.setMode('outputArea', 'go');
        }
        if (lastParsedData) handleConvert();
    }

    function handleProtoNestedModeChange() {
        if (lastParsedData) handleConvert();
    }

    function updateInputTypeBadge(type) {
        const typeLabels = {
            'mysql': 'MySQL', 'postgresql': 'PostgreSQL', 'sqlite': 'SQLite',
            'json': 'JSON', 'yaml': 'YAML', 'toml': 'TOML', 'xml': 'XML', 'unknown': '未知'
        };
        ctx.elements.inputType.textContent = typeLabels[type] || '未知';
        if (type !== 'unknown') {
            ctx.elements.inputType.classList.add('detected');
        } else {
            ctx.elements.inputType.classList.remove('detected');
        }

        const modeMap = {
            'mysql': 'sql', 'postgresql': 'sql', 'sqlite': 'sql',
            'json': 'json', 'yaml': 'yaml', 'toml': 'toml', 'xml': 'xml'
        };
        editorManager.setMode('inputArea', modeMap[type] || 'sql');
    }

    async function handleConvert() {
        const input = editorManager.getValue('inputArea').trim();
        if (!input) {
            ctx.setStatus('请输入 DDL 或 JSON', 'error');
            return;
        }

        ctx.setStatus('正在转换...', 'processing');
        const settings = ctx.getSettings();
        const el = ctx.elements;

        try {
            let inputType = el.dbType.value;
            if (inputType === 'auto') {
                inputType = detectInputType(input);
            }

            let parsedData;
            let configData = null;

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
                case 'json': {
                    const structName = settings.structName || 'Response';
                    parsedData = parseJSON(input, structName);
                    try { configData = JSON.parse(input); } catch (e) {}
                    break;
                }
                case 'yaml':
                    if (typeof parseYAML !== 'undefined') {
                        const yamlResult = parseYAML(input);
                        if (yamlResult.error) throw new Error(yamlResult.error);
                        configData = yamlResult.data;
                        parsedData = parseJSON(JSON.stringify(configData), settings.structName || 'Config');
                    } else {
                        throw new Error('YAML parser not loaded');
                    }
                    break;
                case 'toml':
                    if (typeof parseTOML !== 'undefined') {
                        const tomlResult = parseTOML(input);
                        if (tomlResult.error) throw new Error(tomlResult.error);
                        configData = tomlResult.data;
                        parsedData = parseJSON(JSON.stringify(configData), settings.structName || 'Config');
                    } else {
                        throw new Error('TOML parser not loaded');
                    }
                    break;
                case 'xml':
                    if (typeof parseXML !== 'undefined') {
                        const xmlResult = parseXML(input);
                        if (xmlResult.error) throw new Error(xmlResult.error);
                        configData = xmlResult.data;
                        parsedData = parseJSON(JSON.stringify(configData), settings.structName || 'Config');
                    } else {
                        throw new Error('XML parser not loaded');
                    }
                    break;
                default:
                    throw new Error('无法识别输入类型');
            }

            if (parsedData && parsedData.error) throw new Error(parsedData.error);

            lastParsedData = parsedData;

            let outputFormat = 'go';
            if (el.outputFormatProto.checked) outputFormat = 'proto';
            else if (el.outputFormatJSON && el.outputFormatJSON.checked) outputFormat = 'json';
            else if (el.outputFormatYAML && el.outputFormatYAML.checked) outputFormat = 'yaml';
            else if (el.outputFormatTOML && el.outputFormatTOML.checked) outputFormat = 'toml';

            let generatedCode;
            const indent = settings.formatIndent === 'tab' ? 2 : (settings.formatIndent || 4);

            if (outputFormat === 'proto') {
                if (!['json', 'yaml', 'toml', 'xml'].includes(inputType)) {
                    throw new Error('Protocol Buffer 仅支持 JSON/YAML/TOML/XML 输入');
                }
                const dataForProto = configData || (parsedData ? parsedData.data : null);
                if (!dataForProto) throw new Error('无法解析输入数据');

                const protoOptions = {
                    messageName: settings.structName || 'Message',
                    nestedMode: el.protoNestedMode.value,
                    packageName: settings.packageName || 'model',
                    syntax: 'proto3',
                    numericIntType: 'int32',
                    numericFloatType: 'float'
                };

                const protoParsedData = parseJSONForProtobuf(JSON.stringify(dataForProto), protoOptions.messageName);
                if (protoParsedData.error) throw new Error(protoParsedData.error);

                generatedCode = generateProtoMessage(protoParsedData, protoOptions);
                editorManager.setMode('outputArea', 'proto');

            } else if (['json', 'yaml', 'toml'].includes(outputFormat)) {
                const dataToConvert = configData || (inputType === 'json' ? JSON.parse(input) : null);
                if (!dataToConvert) throw new Error('无法获取数据进行转换');

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
                const options = {
                    structName: settings.structName || undefined,
                    packageName: settings.packageName,
                    generateTableName: settings.generateTableName,
                    inlineNestedStructs: el.inlineNestedStructs.checked,
                    inputType: inputType
                };
                generatedCode = generateGoStruct(parsedData, options);
                editorManager.setMode('outputArea', 'go');
            }

            lastGeneratedCode = generatedCode;
            editorManager.setValue('outputArea', generatedCode);
            ctx.setStatus('转换成功！', 'success');

        } catch (error) {
            ctx.setStatus(`转换失败: ${error.message}`, 'error');
            editorManager.setValue('outputArea', `// 错误: ${error.message}`);
        }
    }

    async function handleCopy() {
        if (!lastGeneratedCode) {
            ctx.setStatus('没有可复制的内容', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(lastGeneratedCode);
            ctx.setStatus('已复制到剪贴板！', 'success');
            ctx.elements.copyBtn.classList.add('copied');
            setTimeout(() => ctx.elements.copyBtn.classList.remove('copied'), 600);
        } catch (error) {
            ctx.setStatus('复制失败', 'error');
        }
    }

    async function handleExport() {
        if (!lastGeneratedCode || !lastParsedData) {
            ctx.setStatus('没有可导出的内容', 'error');
            return;
        }
        const settings = ctx.getSettings();
        const el = ctx.elements;

        try {
            const isProtoFormat = el.outputFormatProto.checked;

            if (isProtoFormat) {
                const messageName = settings.structName || 'Message';
                const filename = `${messageName.toLowerCase()}.proto`;
                const blob = new Blob([lastGeneratedCode], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);

                if (typeof chrome !== 'undefined' && chrome.downloads) {
                    chrome.downloads.download({ url: url, filename: filename, saveAs: true });
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
                ctx.setStatus('Proto 文件导出成功！', 'success');
            } else {
                const structName = settings.structName ||
                    lastParsedData.structName ||
                    ctx.snakeToCamel(lastParsedData.tableName);

                const imports = getRequiredImports(lastParsedData.fields);
                Exporter.exportAsGoFile(
                    lastGeneratedCode, structName,
                    settings.packageName, imports
                );
                ctx.setStatus('导出成功！', 'success');
            }
        } catch (error) {
            ctx.setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    function handleClear() {
        editorManager.setValue('inputArea', '');
        editorManager.setValue('outputArea', '// 在左侧输入 DDL 或 JSON，点击"转换"按钮生成 Go struct');
        lastParsedData = null;
        lastGeneratedCode = '';
        ctx.elements.inputType.textContent = '未检测';
        ctx.elements.inputType.classList.remove('detected');
        updateLineCount('');
        ctx.setStatus('已清除', 'ready');
    }

    function updateLineCount(text) {
        const lines = text ? text.split('\n').length : 0;
        ctx.elements.lineCount.textContent = `${lines} 行`;
    }

    DevKit.ConverterController = { init, handleConvert, handleClear };
})();
