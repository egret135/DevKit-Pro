// JSON Array Hints - show element counts for arrays in formatted JSON

const JsonArrayHints = (function () {
    'use strict';

    const bookmarkStore = new WeakMap();

    function skipWs(str, pos) {
        while (pos.v < str.length && /\s/.test(str[pos.v])) {
            pos.v++;
        }
    }

    function lineAt(str, index) {
        return str.slice(0, index).split('\n').length - 1;
    }

    function colAt(str, index) {
        const lastNl = str.lastIndexOf('\n', index - 1);
        return index - lastNl - 1;
    }

    function collect(value, formatted) {
        const hints = [];
        const pos = { v: 0 };

        try {
            walk(value, formatted, pos, hints);
        } catch (e) {
            console.warn('JsonArrayHints.collect failed:', e.message);
        }

        return hints;
    }

    function walk(value, formatted, pos, hints) {
        skipWs(formatted, pos);

        if (Array.isArray(value)) {
            if (formatted[pos.v] !== '[') return;

            hints.push({
                line: lineAt(formatted, pos.v),
                ch: colAt(formatted, pos.v) + 1,
                count: value.length
            });

            pos.v++;
            skipWs(formatted, pos);

            if (value.length === 0) {
                if (formatted[pos.v] === ']') pos.v++;
                return;
            }

            for (let i = 0; i < value.length; i++) {
                walk(value[i], formatted, pos, hints);
                skipWs(formatted, pos);
                if (i < value.length - 1 && formatted[pos.v] === ',') {
                    pos.v++;
                    skipWs(formatted, pos);
                }
            }

            if (formatted[pos.v] === ']') pos.v++;
            return;
        }

        if (value !== null && typeof value === 'object') {
            if (formatted[pos.v] !== '{') return;
            pos.v++;
            skipWs(formatted, pos);

            const keys = Object.keys(value);
            if (keys.length === 0) {
                if (formatted[pos.v] === '}') pos.v++;
                return;
            }

            for (let i = 0; i < keys.length; i++) {
                skipWs(formatted, pos);
                skipJsonString(formatted, pos);
                skipWs(formatted, pos);
                if (formatted[pos.v] === ':') pos.v++;
                skipWs(formatted, pos);
                walk(value[keys[i]], formatted, pos, hints);
                skipWs(formatted, pos);
                if (i < keys.length - 1 && formatted[pos.v] === ',') {
                    pos.v++;
                }
            }

            skipWs(formatted, pos);
            if (formatted[pos.v] === '}') pos.v++;
            return;
        }

        skipJsonPrimitive(formatted, pos);
    }

    function skipJsonString(str, pos) {
        if (str[pos.v] !== '"') return;
        pos.v++;
        while (pos.v < str.length) {
            if (str[pos.v] === '\\') {
                pos.v += 2;
                continue;
            }
            if (str[pos.v] === '"') {
                pos.v++;
                return;
            }
            pos.v++;
        }
    }

    function skipJsonPrimitive(str, pos) {
        if (str[pos.v] === '"') {
            skipJsonString(str, pos);
            return;
        }

        if (str.slice(pos.v, pos.v + 4) === 'true') {
            pos.v += 4;
            return;
        }
        if (str.slice(pos.v, pos.v + 5) === 'false') {
            pos.v += 5;
            return;
        }
        if (str.slice(pos.v, pos.v + 4) === 'null') {
            pos.v += 4;
            return;
        }

        while (pos.v < str.length && /[-+0-9.eE]/.test(str[pos.v])) {
            pos.v++;
        }
    }

    function formatCount(count) {
        return `${count} 项`;
    }

    function clear(editor) {
        const marks = bookmarkStore.get(editor);
        if (!marks) return;
        marks.forEach((mark) => mark.clear());
        bookmarkStore.delete(editor);
    }

    function apply(editor, hints) {
        clear(editor);
        if (!editor || !hints || hints.length === 0) return;

        const marks = [];
        hints.forEach(({ line, ch, count }) => {
            if (line >= editor.lineCount()) return;

            const widget = document.createElement('span');
            widget.className = 'json-array-count-hint';
            widget.textContent = formatCount(count);
            widget.setAttribute('aria-label', `数组包含 ${count} 个元素`);
            widget.setAttribute('contenteditable', 'false');

            const mark = editor.setBookmark({ line, ch }, {
                widget,
                insertLeft: true
            });
            if (mark) marks.push(mark);
        });

        bookmarkStore.set(editor, marks);
    }

    function refreshEditor(editor, formattedText) {
        if (!editor) return;

        if (!formattedText || !formattedText.trim()) {
            clear(editor);
            return;
        }

        if (typeof JsonUtils === 'undefined') return;

        const profile = JsonUtils.getDocumentProfile(formattedText);
        if (profile.disableHints) {
            clear(editor);
            return;
        }

        const parsed = JsonUtils.parse(formattedText);
        if (!parsed.ok) {
            clear(editor);
            return;
        }

        const hints = collect(parsed.value, formattedText);
        const maxHints = JsonUtils.THRESHOLDS.MAX_ARRAY_HINTS;
        apply(editor, hints.length > maxHints ? hints.slice(0, maxHints) : hints);
    }

    function createFoldWidget(cm) {
        return function (from, to) {
            const text = cm.getRange(from, to).trim();
            const span = document.createElement('span');
            span.className = 'CodeMirror-foldmarker json-array-fold-marker';

            if (text.startsWith('[')) {
                try {
                    const count = JSON.parse(text).length;
                    span.textContent = `[ … ${formatCount(count)} ]`;
                    return span;
                } catch (_) {
                    // fall through
                }
            }

            span.textContent = '\u2194';
            return span;
        };
    }

    return {
        collect,
        apply,
        clear,
        refreshEditor,
        createFoldWidget
    };
})();
