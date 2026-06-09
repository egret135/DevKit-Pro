// JSON Utilities - parse, format, minify, sort keys, normalize for compare

const JsonUtils = (function () {
    'use strict';

    function getIndentOptions(indentSetting) {
        if (indentSetting === 'tab') {
            return { useTabs: true, tabWidth: 1 };
        }
        const tabWidth = typeof indentSetting === 'number' ? indentSetting : 4;
        return { useTabs: false, tabWidth };
    }

    function getIndentString(indentSetting) {
        const { useTabs, tabWidth } = getIndentOptions(indentSetting);
        return useTabs ? '\t' : ' '.repeat(tabWidth);
    }

    function parse(text) {
        const raw = text || '';
        const trimmed = raw.trim();
        if (!trimmed) {
            return { ok: true, value: null, error: null, position: null };
        }
        try {
            return { ok: true, value: JSON.parse(trimmed), error: null, position: null };
        } catch (e) {
            return {
                ok: false,
                value: null,
                error: e.message,
                position: estimatePosition(raw, e)
            };
        }
    }

    function estimatePosition(text, error) {
        const match = error.message.match(/position\s+(\d+)/i);
        if (!match) {
            if (/Unexpected end of JSON input/i.test(error.message)) {
                const lines = text.split('\n');
                return { line: lines.length, col: (lines[lines.length - 1] || '').length + 1, index: text.length };
            }
            return null;
        }

        const index = parseInt(match[1], 10);
        let line = 1;
        let col = 1;
        for (let i = 0; i < index && i < text.length; i++) {
            if (text[i] === '\n') {
                line++;
                col = 1;
            } else {
                col++;
            }
        }
        return { line, col, index, char: text[index] || '' };
    }

    function humanizeError(message, text, position) {
        const msg = message || '';
        const char = position?.char || '';
        const rules = [
            {
                test: /Unexpected end of JSON input/i,
                summary: 'JSON 内容不完整',
                hint: '检查是否缺少闭合的 `}`、`]`，或字符串/键名是否缺少结束引号 `"`。'
            },
            {
                test: /Unterminated string/i,
                summary: '字符串未正确闭合',
                hint: '请检查双引号 `"` 是否成对出现，并注意转义字符 `\\`。'
            },
            {
                test: /Expected ':' after property name/i,
                summary: '属性名后缺少冒号',
                hint: '对象中的键名后应使用 `:` 分隔键与值，例如 `"key": "value"`。'
            },
            {
                test: /Expected ',' or '}' after property value/i,
                summary: '属性值后缺少逗号或对象结束符',
                hint: '多个属性之间需要用 `,` 分隔；最后一个属性后不要写多余逗号。'
            },
            {
                test: /Expected ',' or ']' after array element/i,
                summary: '数组元素后缺少逗号或数组结束符',
                hint: '多个数组元素之间需要用 `,` 分隔；最后一个元素后不要写多余逗号。'
            },
            {
                test: /Unexpected token .* in JSON/i,
                summary: '存在无法识别的字符或符号',
                hint: char === "'"
                    ? 'JSON 字符串必须使用双引号 `"`，不能使用单引号 `\'`。'
                    : (char === '`'
                        ? 'JSON 不支持反引号字符串，请改用双引号 `"`。'
                        : '请检查该位置是否多了逗号、注释、或未加引号的文本。')
            },
            {
                test: /Unexpected number/i,
                summary: '数字格式不正确',
                hint: '检查数字前是否缺少逗号、冒号，或存在非法字符。'
            },
            {
                test: /Unexpected string/i,
                summary: '字符串位置不正确',
                hint: '检查该字符串前是否缺少逗号、冒号，或键名是否未加引号。'
            },
            {
                test: /Bad control character in string literal/i,
                summary: '字符串中包含非法控制字符',
                hint: '字符串内不能直接包含未转义的换行或控制字符，请使用 `\\n` 等转义。'
            },
            {
                test: /Bad escaped character/i,
                summary: '转义字符无效',
                hint: '请检查 `\\` 后的转义写法是否正确，例如 `\\n`、`\\t`、`\\"`。'
            }
        ];

        for (const rule of rules) {
            if (rule.test.test(msg)) {
                return { summary: rule.summary, hint: rule.hint };
            }
        }

        return {
            summary: 'JSON 语法不符合规范',
            hint: '请根据下方位置提示，检查括号、引号、逗号与冒号是否匹配。'
        };
    }

    function getErrorContext(text, position) {
        if (!position) return null;

        const lines = text.split('\n');
        const lineIndex = Math.max(0, position.line - 1);
        const lineText = lines[lineIndex] ?? '';
        const colIndex = Math.max(0, position.col - 1);
        const before = lines.slice(Math.max(0, lineIndex - 1), lineIndex);
        const after = lines.slice(lineIndex + 1, lineIndex + 2);

        return {
            line: position.line,
            col: position.col,
            index: position.index,
            char: lineText[colIndex] || position.char || '',
            lineText,
            pointer: `${' '.repeat(colIndex)}^`,
            before,
            after
        };
    }

    function buildErrorReport(text, parseResult) {
        if (parseResult.ok) return null;

        const position = parseResult.position || estimatePosition(text, { message: parseResult.error });
        const human = humanizeError(parseResult.error, text, position);
        const context = getErrorContext(text, position);

        return {
            title: 'JSON 格式错误',
            summary: human.summary,
            hint: human.hint,
            rawError: parseResult.error,
            position,
            context
        };
    }

    function format(value, opts = {}) {
        let parsedValue = value;
        if (typeof value === 'string') {
            const parsed = parse(value);
            if (!parsed.ok) throw new Error(parsed.error);
            parsedValue = parsed.value;
        }
        const space = getIndentString(opts.indent ?? 4);
        return JSON.stringify(parsedValue, null, space);
    }

    function minify(value) {
        let parsedValue = value;
        if (typeof value === 'string') {
            const parsed = parse(value);
            if (!parsed.ok) throw new Error(parsed.error);
            parsedValue = parsed.value;
        }
        return JSON.stringify(parsedValue);
    }

    function sortKeys(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            return value.map(sortKeys);
        }
        const sorted = {};
        Object.keys(value).sort().forEach((key) => {
            sorted[key] = sortKeys(value[key]);
        });
        return sorted;
    }

    function normalizeForCompare(textA, textB, opts = {}) {
        const parsedA = parse(textA);
        const parsedB = parse(textB);

        if (!parsedA.ok) {
            return { ok: false, errorA: parsedA.error, errorB: null, positionA: parsedA.position };
        }
        if (!parsedB.ok) {
            return { ok: false, errorA: null, errorB: parsedB.error, positionB: parsedB.position };
        }

        let valueA = parsedA.value;
        let valueB = parsedB.value;
        if (opts.sortKeys) {
            valueA = sortKeys(valueA);
            valueB = sortKeys(valueB);
        }

        const indent = opts.indent ?? 4;
        return {
            ok: true,
            textA: format(valueA, { indent }),
            textB: format(valueB, { indent }),
            valueA,
            valueB
        };
    }

    return {
        parse,
        format,
        minify,
        sortKeys,
        normalizeForCompare,
        getIndentOptions,
        getIndentString,
        buildErrorReport,
        humanizeError,
        getErrorContext
    };
})();
