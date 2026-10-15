/**
 * ConverterController - Handles DDL/JSON/Config conversion functionality
 */
(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    const DDL_TYPES = ['mysql', 'postgresql', 'sqlite'];
    const CONFIG_TYPES = ['json', 'yaml', 'toml', 'xml'];
    const CONFIG_FORMATS = ['json', 'yaml', 'toml'];
    const FORMAT_META = {
        go: { title: 'Go Struct', mode: 'go', ext: 'go' },
        proto: { title: 'Protobuf', mode: 'proto', ext: 'proto' },
        ts: { title: 'TypeScript', mode: 'text/typescript', ext: 'ts' },
        json: { title: 'JSON', mode: 'json', ext: 'json' },
        yaml: { title: 'YAML', mode: 'yaml', ext: 'yaml' },
        toml: { title: 'TOML', mode: 'toml', ext: 'toml' }
    };
    const TYPE_LABELS = {
        mysql: 'MySQL', postgresql: 'PostgreSQL', sqlite: 'SQLite',
        json: 'JSON', yaml: 'YAML', toml: 'TOML', xml: 'XML', unknown: '未知'
    };
    const INPUT_MODES = {
        mysql: 'sql', postgresql: 'sql', sqlite: 'sql',
        json: 'json', yaml: 'yaml', toml: 'toml', xml: 'xml'
    };
    // 选项控件 -> 设置键
    const OPTION_BINDINGS = [
        { id: 'cvNullableStyle', key: 'goNullableStyle', kind: 'value', fallback: 'plain' },
        { id: 'cvTagStyle', key: 'goTagStyle', kind: 'value', fallback: 'gorm' },
        { id: 'protoNestedMode', key: 'protoNestedMode', kind: 'value', fallback: 'separate' },
        { id: 'inlineNestedStructs', key: 'inlineNestedStructs', kind: 'check', fallback: true },
        { id: 'cvOmitempty', key: 'goJsonOmitempty', kind: 'check', fallback: false },
        { id: 'cvTableName', key: 'generateTableName', kind: 'check', fallback: true, mirror: 'generateTableName' },
        { id: 'cvGormDetail', key: 'goGormDetail', kind: 'check', fallback: false },
        { id: 'cvWithHeader', key: 'goWithHeader', kind: 'check', fallback: false },
        { id: 'cvProtoOptional', key: 'protoOptional', kind: 'check', fallback: false },
        { id: 'cvProtoDecimal', key: 'protoDecimalString', kind: 'check', fallback: true }
    ];
    const NAME_BINDINGS = [
        { id: 'cvStructName', key: 'structName', mirror: 'structNameInput' },
        { id: 'cvPackageName', key: 'packageName', mirror: 'packageNameInput' }
    ];

    let ctx = null;
    let lastParsedData = null;
    let lastInputType = null;
    let lastGeneratedCode = '';
    let lastFormat = 'go';
    let currentFormat = 'go';
    let isFormatting = false;
    let debouncedConvert = null;
    let debouncedAutoFormat = null;

    function $(id) {
        return document.getElementById(id);
    }

    function init(appCtx) {
        ctx = appCtx;
        const el = ctx.elements;

        debouncedConvert = ctx.debounce(() => handleConvert(), 500);
        debouncedAutoFormat = ctx.debounce(() => {
            if (ctx.getSettings().autoFormat === 'always') autoFormatInput(false);
        }, 1500);

        const inputEditor = editorManager.get('inputArea');
        if (inputEditor) {
            inputEditor.on('change', () => {
                handleInputChange();
                debouncedAutoFormat();
            });
            inputEditor.on('paste', () => {
                const settings = ctx.getSettings();
                if (settings.autoFormat === 'paste' || settings.autoFormat === 'always') {
                    setTimeout(() => autoFormatInput(false), 50);
                }
            });
        }

        el.convertBtn.addEventListener('click', handleConvert);
        el.copyBtn.addEventListener('click', handleCopy);
        el.exportBtn.addEventListener('click', handleExport);
        el.clearBtn.addEventListener('click', handleClear);
        el.dbType.addEventListener('change', handleInputChange);

        document.querySelectorAll('input[name="outputFormat"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) setFormat(radio.value, true);
            });
        });

        bindOptions();
        syncSettings();

        $('cvOptionsToggle').addEventListener('click', () => {
            const open = el.converterOptions.classList.contains('is-collapsed');
            setOptionsOpen(open);
            persistSetting('converterOptionsOpen', open);
        });
        $('cvFormatBtn').addEventListener('click', () => autoFormatInput(true));
        $('cvErrorClose').addEventListener('click', hideError);
        $('cvTableChips').addEventListener('click', (e) => {
            const chip = e.target.closest('.cv-table-chip');
            if (chip) jumpToStruct(chip.dataset.name);
        });

        const settings = ctx.getSettings();
        setOptionsOpen(settings.converterOptionsOpen !== false);
        setFormat(FORMAT_META[settings.converterFormat] ? settings.converterFormat : 'go', false);
        updateInputStats('');
    }

    function persistSetting(key, value) {
        const snapshot = ctx.getSettings ? ctx.getSettings() : null;
        if (snapshot) snapshot[key] = value;
        if (typeof Settings !== 'undefined') Settings.set(key, value);
    }

    function bindOptions() {
        for (const b of OPTION_BINDINGS) {
            const input = $(b.id);
            if (!input) continue;
            input.addEventListener('change', () => {
                const value = b.kind === 'check' ? input.checked : input.value;
                persistSetting(b.key, value);
                if (b.mirror && ctx.elements[b.mirror]) ctx.elements[b.mirror].checked = value;
                reconvert();
            });
        }
        const debouncedNames = ctx.debounce(reconvert, 300);
        for (const b of NAME_BINDINGS) {
            const input = $(b.id);
            if (!input) continue;
            input.addEventListener('input', () => {
                const value = input.value.trim();
                persistSetting(b.key, value);
                if (ctx.elements[b.mirror]) ctx.elements[b.mirror].value = value;
                debouncedNames();
            });
        }
    }

    // 从设置回填选项卡（初始化与设置弹窗保存后调用）
    function syncSettings() {
        const settings = ctx.getSettings();
        for (const b of OPTION_BINDINGS) {
            const input = $(b.id);
            if (!input) continue;
            const value = settings[b.key] === undefined ? b.fallback : settings[b.key];
            if (b.kind === 'check') input.checked = value !== false;
            else input.value = value;
        }
        for (const b of NAME_BINDINGS) {
            const input = $(b.id);
            if (input) input.value = settings[b.key] || '';
        }
        reconvert();
    }

    function reconvert() {
        if (lastParsedData && editorManager.getValue('inputArea').trim()) handleConvert();
    }

    function setOptionsOpen(open) {
        const el = ctx.elements;
        el.converterOptions.classList.toggle('is-collapsed', !open);
        const toggle = $('cvOptionsToggle');
        toggle.classList.toggle('is-on', open);
        toggle.setAttribute('aria-expanded', String(open));
        setTimeout(() => {
            ['inputArea', 'outputArea'].forEach(id => {
                const editor = editorManager.get(id);
                if (editor) editor.refresh();
            });
        }, 0);
    }

    function setFormat(format, fromUser) {
        currentFormat = FORMAT_META[format] ? format : 'go';
        const radio = document.querySelector(`input[name="outputFormat"][value="${currentFormat}"]`);
        if (radio) radio.checked = true;
        ctx.elements.converterWorkspace.dataset.format = currentFormat;
        ctx.elements.outputTitle.textContent = FORMAT_META[currentFormat].title;
        if (fromUser) {
            persistSetting('converterFormat', currentFormat);
            reconvert();
        }
    }

    function resolveInputType(input) {
        const selected = ctx.elements.dbType.value;
        return selected === 'auto' ? detectInputType(input) : selected;
    }

    // 输入类别决定可用格式与可见选项：ddl / json / none
    function updateInputKind(type) {
        const kind = DDL_TYPES.includes(type) ? 'ddl' : (CONFIG_TYPES.includes(type) ? 'json' : 'none');
        ctx.elements.converterWorkspace.dataset.input = kind;
        ctx.elements.configFormatLabels.forEach(label => {
            const disabled = kind === 'ddl';
            label.classList.toggle('is-disabled', disabled);
            const radio = label.querySelector('input');
            if (radio) radio.disabled = disabled;
            label.title = disabled ? '仅 JSON / YAML / TOML / XML 输入可用' : '';
        });
        if (kind === 'ddl' && CONFIG_FORMATS.includes(currentFormat)) setFormat('go', false);
    }

    function handleInputChange() {
        const input = editorManager.getValue('inputArea');
        updateInputStats(input);

        if (input.trim().length === 0) {
            updateInputTypeBadge(null);
            updateInputKind(null);
            hideError();
            return;
        }

        const type = resolveInputType(input);
        updateInputTypeBadge(type);
        updateInputKind(type);
        debouncedConvert();
    }

    function updateInputTypeBadge(type) {
        const badge = ctx.elements.inputType;
        if (!type) {
            badge.textContent = '未检测';
            badge.classList.remove('detected');
            return;
        }
        badge.textContent = TYPE_LABELS[type] || '未知';
        badge.classList.toggle('detected', type !== 'unknown');
        editorManager.setMode('inputArea', INPUT_MODES[type] || 'sql');
    }

    function autoFormatInput(force) {
        const settings = ctx.getSettings();
        if (!force && settings.autoFormat === 'never') return;
        if (isFormatting) return;

        const input = editorManager.getValue('inputArea');
        if (!input || (!force && input.trim().length < 10)) return;

        const inputType = resolveInputType(input);
        if (!['json', 'mysql', 'postgresql', 'sqlite'].includes(inputType)) {
            if (force) ctx.setStatus('仅支持格式化 DDL 与 JSON', 'error');
            return;
        }

        try {
            const indent = settings.formatIndent === 'tab' ? 'tab' : (settings.formatIndent || 4);
            const formatted = AutoFormatter.format(input, inputType, {
                indent: indent === 'tab' ? 1 : indent,
                useTabs: indent === 'tab'
            });

            const normalize = (s) => s.replace(/\s+/g, '');
            if (formatted && normalize(input) === normalize(formatted) && formatted !== input) {
                isFormatting = true;
                const editor = editorManager.editors.get('inputArea');
                const cursor = editor ? editor.getCursor() : null;
                editorManager.setValue('inputArea', formatted);
                if (editor && cursor) {
                    try { editor.setCursor(cursor); } catch (e) { /* cursor out of range */ }
                }
                ctx.setStatus(force ? '已格式化' : '已自动格式化', 'success');
                setTimeout(() => { isFormatting = false; }, 100);
            } else if (force) {
                ctx.setStatus('已是规范格式', 'ready');
            }
        } catch (e) {
            if (force) ctx.setStatus(`格式化失败: ${e.message}`, 'error');
        }
    }

    function parseError(message, line) {
        const err = new Error(message);
        err.line = line || 0;
        return err;
    }

    function parseInput(input, inputType, settings) {
        let parsedData;
        let configData = null;
        const parseConfig = (result, label) => {
            if (result.error) throw parseError(`${label} 解析失败：${result.error}`);
            configData = result.data;
            return parseJSON(JSON.stringify(configData), settings.structName || 'Config');
        };

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
                parsedData = parseJSON(input, settings.structName || 'Response');
                if (!parsedData.error) configData = JSON.parse(input);
                break;
            case 'yaml':
                if (typeof parseYAML === 'undefined') throw parseError('YAML 解析器未加载');
                parsedData = parseConfig(parseYAML(input), 'YAML');
                break;
            case 'toml':
                if (typeof parseTOML === 'undefined') throw parseError('TOML 解析器未加载');
                parsedData = parseConfig(parseTOML(input), 'TOML');
                break;
            case 'xml':
                if (typeof parseXML === 'undefined') throw parseError('XML 解析器未加载');
                parsedData = parseConfig(parseXML(input), 'XML');
                break;
            default:
                throw parseError('无法识别输入类型，可在左上角手动选择');
        }

        if (parsedData && parsedData.error) throw parseError(parsedData.error, parsedData.errorLine);
        return { parsedData, configData };
    }

    function goOptions(settings, inputType) {
        const isDDL = DDL_TYPES.includes(inputType);
        let nullableStyle = settings.goNullableStyle || 'plain';
        if (!isDDL && nullableStyle === 'sqlnull') nullableStyle = 'pointer';
        return {
            structName: settings.structName || '',
            packageName: settings.packageName || 'model',
            generateTableName: settings.generateTableName !== false,
            inlineNestedStructs: ctx.elements.inlineNestedStructs.checked,
            inputType: isDDL ? inputType : 'json',
            nullableStyle,
            omitempty: !!settings.goJsonOmitempty,
            tagStyle: settings.goTagStyle || 'gorm',
            gormDetail: !!settings.goGormDetail,
            withHeader: !!settings.goWithHeader
        };
    }

    function generate(format, parsedData, configData, inputType, settings) {
        const isDDL = DDL_TYPES.includes(inputType);
        const modelInput = isDDL ? inputType : 'json';
        const indent = settings.formatIndent === 'tab' ? 2 : (settings.formatIndent || 4);

        switch (format) {
            case 'proto':
                return generateProtoMessage(parsedData, {
                    messageName: settings.structName || '',
                    nestedMode: settings.protoNestedMode || 'separate',
                    packageName: settings.packageName || 'model',
                    inputType: modelInput,
                    optionalNullable: !!settings.protoOptional,
                    decimal: settings.protoDecimalString !== false ? 'string' : 'double'
                });
            case 'ts':
                return generateTypeScript(parsedData, { inputType: modelInput, structName: settings.structName || '' });
            case 'json':
            case 'yaml':
            case 'toml':
                if (!configData) throw parseError('配置格式互转仅支持 JSON / YAML / TOML / XML 输入');
                if (format === 'json') return ConfigGenerator.generateJSON(configData, { indent });
                if (format === 'yaml') return ConfigGenerator.generateYAML(configData, { indent });
                return ConfigGenerator.generateTOML(configData, { indent });
            default:
                return generateGoStruct(parsedData, goOptions(settings, inputType));
        }
    }

    async function handleConvert() {
        const input = editorManager.getValue('inputArea').trim();
        if (!input) {
            ctx.setStatus('请输入 DDL 或 JSON', 'error');
            return;
        }

        ctx.setStatus('正在转换...', 'processing');
        const settings = ctx.getSettings();
        const format = currentFormat;

        try {
            const inputType = resolveInputType(input);
            const { parsedData, configData } = parseInput(input, inputType, settings);
            const code = generate(format, parsedData, configData, inputType, settings);

            lastParsedData = parsedData;
            lastInputType = inputType;
            lastGeneratedCode = code;
            lastFormat = format;

            editorManager.setMode('outputArea', FORMAT_META[format].mode);
            editorManager.setValue('outputArea', code);
            hideError();
            updateOutputStats(parsedData, code);
            ctx.setStatus('转换成功', 'success');
        } catch (error) {
            showError(error.message, error.line);
            ctx.setStatus(`转换失败: ${error.message}`, 'error');
        }
    }

    function showError(message, line) {
        const text = line && !/第\s*\d+\s*行/.test(message) ? `${message}（第 ${line} 行）` : message;
        $('cvErrorText').textContent = text;
        $('cvError').classList.remove('hidden');
        if (line) {
            const editor = editorManager.get('inputArea');
            if (editor && line <= editor.lineCount()) {
                editor.scrollIntoView({ line: line - 1, ch: 0 }, 60);
                if (typeof CmDiff !== 'undefined' && CmDiff.flashLine) CmDiff.flashLine(editor, line - 1, 1200);
            }
        }
    }

    function hideError() {
        $('cvError').classList.add('hidden');
    }

    function updateInputStats(text) {
        const lines = text ? text.split('\n').length : 0;
        ctx.elements.lineCount.textContent = `${lines} 行`;
        $('cvInputStats').textContent = text ? `${lines} 行 · ${text.length} 字符` : '';
    }

    function updateOutputStats(parsedData, code) {
        const structs = (parsedData.tables || []).concat(parsedData.nestedStructs || []);
        const fieldCount = structs.reduce((sum, s) => sum + (s.fields ? s.fields.length : 0), 0);
        $('cvOutputStats').textContent = structs.length
            ? `${structs.length} 个结构 · ${fieldCount} 个字段`
            : '';
        renderTableChips(code);
    }

    // 输出里出现多个顶层声明时，提供快速跳转
    function renderTableChips(code) {
        const host = $('cvTableChips');
        host.textContent = '';
        if (!CONFIG_FORMATS.includes(lastFormat)) {
            const re = /^(?:type|message|export interface|export type)\s+([A-Za-z_]\w*)/gm;
            const names = [];
            let m;
            while ((m = re.exec(code)) !== null && names.length < 30) names.push(m[1]);
            if (names.length > 1) {
                for (const name of names) {
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'cv-table-chip';
                    chip.dataset.name = name;
                    chip.textContent = name;
                    chip.title = `跳转到 ${name}`;
                    host.appendChild(chip);
                }
            }
        }
    }

    function jumpToStruct(name) {
        const editor = editorManager.get('outputArea');
        if (!editor || !name) return;
        const re = new RegExp(`^(?:type|message|export interface|export type)\\s+${name}\\b`);
        for (let i = 0; i < editor.lineCount(); i++) {
            if (re.test(editor.getLine(i))) {
                const line = i > 0 && /^\s*(\/\/|\/\*\*)/.test(editor.getLine(i - 1)) ? i - 1 : i;
                const top = editor.charCoords({ line, ch: 0 }, 'local').top;
                editor.scrollTo(null, Math.max(0, top - 8));
                if (typeof CmDiff !== 'undefined' && CmDiff.flashLine) CmDiff.flashLine(editor, i, 900);
                return;
            }
        }
    }

    async function handleCopy() {
        if (!lastGeneratedCode) {
            ctx.setStatus('没有可复制的内容', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(lastGeneratedCode);
            ctx.setStatus('已复制到剪贴板', 'success');
            if (ctx.showToast) ctx.showToast('已复制');
            ctx.elements.copyBtn.classList.add('copied');
            setTimeout(() => ctx.elements.copyBtn.classList.remove('copied'), 600);
        } catch (error) {
            ctx.setStatus('复制失败', 'error');
        }
    }

    function exportBaseName(settings) {
        const tables = lastParsedData.tables || [];
        if (tables.length > 1) return 'models';
        return settings.structName ||
            (lastParsedData.rootAlias && lastParsedData.rootAlias.name) ||
            lastParsedData.structName ||
            'model';
    }

    function handleExport() {
        if (!lastGeneratedCode || !lastParsedData) {
            ctx.setStatus('没有可导出的内容', 'error');
            return;
        }
        const settings = ctx.getSettings();
        try {
            const meta = FORMAT_META[lastFormat];
            const filename = `${GoNaming.toSnake(exportBaseName(settings))}.${meta.ext}`;
            const content = lastFormat === 'go'
                ? buildGoFile(lastParsedData, goOptions(settings, lastInputType))
                : lastGeneratedCode;
            Exporter.triggerDownload(content, filename);
            ctx.setStatus(`已导出 ${filename}`, 'success');
        } catch (error) {
            ctx.setStatus(`导出失败: ${error.message}`, 'error');
        }
    }

    function handleClear() {
        editorManager.setValue('inputArea', '');
        editorManager.setValue('outputArea', '');
        lastParsedData = null;
        lastInputType = null;
        lastGeneratedCode = '';
        updateInputTypeBadge(null);
        updateInputKind(null);
        hideError();
        updateInputStats('');
        $('cvOutputStats').textContent = '';
        $('cvTableChips').textContent = '';
        ctx.setStatus('已清除', 'ready');
    }

    DevKit.ConverterController = { init, handleConvert, handleClear, syncSettings };
})();
