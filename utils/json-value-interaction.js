// JSON Value Interaction - hover, click-to-copy, double-click-to-edit primitives

const JsonValueInteraction = (function () {
    'use strict';

    const stateStore = new WeakMap();

    function skipWs(str, pos) {
        while (pos.v < str.length && /\s/.test(str[pos.v])) {
            pos.v++;
        }
    }

    function indexToPos(str, index) {
        const lines = str.slice(0, index).split('\n');
        return {
            line: lines.length - 1,
            ch: lines[lines.length - 1].length
        };
    }

    function primitiveType(value) {
        if (value === null) return 'null';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        return 'string';
    }

    function collect(value, formatted) {
        const primitives = [];
        const pos = { v: 0 };

        try {
            walk(value, formatted, pos, [], primitives);
        } catch (e) {
            console.warn('JsonValueInteraction.collect failed:', e.message);
        }

        return primitives;
    }

    function walk(value, formatted, pos, path, primitives) {
        skipWs(formatted, pos);

        if (Array.isArray(value)) {
            if (formatted[pos.v] !== '[') return;
            pos.v++;
            skipWs(formatted, pos);

            if (value.length === 0) {
                if (formatted[pos.v] === ']') pos.v++;
                return;
            }

            for (let i = 0; i < value.length; i++) {
                walk(value[i], formatted, pos, path.concat(i), primitives);
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
                walk(value[keys[i]], formatted, pos, path.concat(keys[i]), primitives);
                skipWs(formatted, pos);
                if (i < keys.length - 1 && formatted[pos.v] === ',') {
                    pos.v++;
                }
            }

            skipWs(formatted, pos);
            if (formatted[pos.v] === '}') pos.v++;
            return;
        }

        const start = pos.v;
        skipJsonPrimitive(formatted, pos);
        if (pos.v <= start) return;

        primitives.push({
            path: path.slice(),
            from: indexToPos(formatted, start),
            to: indexToPos(formatted, pos.v),
            value,
            type: primitiveType(value)
        });
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

    function setAtPath(root, path, newValue) {
        if (!path.length) return root;
        let cur = root;
        for (let i = 0; i < path.length - 1; i++) {
            cur = cur[path[i]];
        }
        cur[path[path.length - 1]] = newValue;
        return root;
    }

    function posInRange(pos, from, to) {
        return CodeMirror.cmpPos(pos, from) >= 0 && CodeMirror.cmpPos(pos, to) <= 0;
    }

    function findPrimitiveAt(primitives, pos) {
        return primitives.find((item) => posInRange(pos, item.from, item.to)) || null;
    }

    function formatCopyText(item) {
        if (item.type === 'string') return String(item.value);
        if (item.type === 'null') return 'null';
        return String(item.value);
    }

    function formatEditText(item) {
        if (item.type === 'string') return String(item.value);
        if (item.type === 'null') return 'null';
        return String(item.value);
    }

    function parseEditText(text, type) {
        const trimmed = text.trim();

        switch (type) {
            case 'string':
                return text;
            case 'number': {
                if (!trimmed) return undefined;
                const num = Number(trimmed);
                if (Number.isNaN(num)) return undefined;
                return num;
            }
            case 'boolean':
                if (trimmed === 'true') return true;
                if (trimmed === 'false') return false;
                return undefined;
            case 'null':
                if (trimmed === 'null') return null;
                return undefined;
            default:
                return undefined;
        }
    }

    function init(editor, callbacks) {
        if (!editor || typeof CodeMirror === 'undefined') return;

        const wrapper = editor.getWrapperElement();
        wrapper.classList.add('json-value-interactive');

        const state = {
            primitives: [],
            hoverMark: null,
            clickTimer: null,
            editEl: null,
            callbacks: callbacks || {}
        };
        stateStore.set(editor, state);

        wrapper.addEventListener('mousemove', (event) => {
            if (state.editEl) return;
            const pos = editor.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
            const item = findPrimitiveAt(state.primitives, pos);
            setHover(editor, state, item);
        });

        wrapper.addEventListener('mouseleave', () => {
            setHover(editor, state, null);
        });

        wrapper.addEventListener('click', (event) => {
            if (state.editEl) return;
            const pos = editor.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
            const item = findPrimitiveAt(state.primitives, pos);
            if (!item) return;

            event.preventDefault();
            clearTimeout(state.clickTimer);
            state.clickTimer = setTimeout(() => {
                copyPrimitive(editor, state, item);
            }, 220);
        });

        wrapper.addEventListener('dblclick', (event) => {
            const pos = editor.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
            const item = findPrimitiveAt(state.primitives, pos);
            if (!item) return;

            event.preventDefault();
            clearTimeout(state.clickTimer);
            openEditor(editor, state, item);
        });
    }

    function setHover(editor, state, item) {
        if (state.hoverMark) {
            state.hoverMark.clear();
            state.hoverMark = null;
        }

        if (!item) {
            return;
        }

        state.hoverMark = editor.markText(item.from, item.to, {
            className: 'json-value-hover'
        });
    }

    function showCopyFeedback(editor, item) {
        const flashMark = editor.markText(item.from, item.to, {
            className: 'json-value-copied'
        });

        const toast = document.getElementById('jsonFormatCopyToast');
        if (toast) {
            toast.textContent = '已复制';
            toast.classList.remove('fade-out');
            toast.classList.add('visible');
            clearTimeout(toast._hideTimer);
            toast._hideTimer = setTimeout(() => {
                toast.classList.add('fade-out');
                toast.classList.remove('visible');
            }, 900);
        }

        setTimeout(() => flashMark.clear(), 800);
    }

    function copyPrimitive(editor, state, item) {
        const text = formatCopyText(item);
        navigator.clipboard.writeText(text).then(() => {
            showCopyFeedback(editor, item);
            if (typeof state.callbacks.onCopy === 'function') {
                state.callbacks.onCopy(item, text);
            }
        }).catch(() => {
            if (typeof state.callbacks.onCopyError === 'function') {
                state.callbacks.onCopyError(item, text);
            }
        });
    }

    function closeEditor(state) {
        if (state.editEl) {
            state.editEl.remove();
            state.editEl = null;
        }
    }

    function openEditor(editor, state, item) {
        closeEditor(state);

        const wrap = editor.getWrapperElement();
        const coords = editor.charCoords(item.from, 'local');
        const endCoords = editor.charCoords(item.to, 'local');

        const box = document.createElement('div');
        box.className = 'json-value-edit-box';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'json-value-inline-input';
        input.value = formatEditText(item);
        input.style.minWidth = `${Math.max(96, endCoords.right - coords.left + 12)}px`;

        box.appendChild(input);
        box.style.left = `${coords.left}px`;
        box.style.top = `${coords.top}px`;
        wrap.appendChild(box);
        state.editEl = box;

        input.focus();
        input.select();

        let committed = false;
        const commit = () => {
            if (committed) return;
            committed = true;

            const parsed = parseEditText(input.value, item.type);
            closeEditor(state);

            if (parsed === undefined) {
                if (typeof state.callbacks.onEditError === 'function') {
                    state.callbacks.onEditError(item);
                }
                return;
            }

            if (Object.is(parsed, item.value)) return;

            if (typeof state.callbacks.onValueChange === 'function') {
                state.callbacks.onValueChange(item.path.slice(), parsed, item);
            }
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commit();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                committed = true;
                closeEditor(state);
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(commit, 80);
        });
    }

    function refreshEditor(editor, formattedText) {
        const state = stateStore.get(editor);
        if (!state) return;

        closeEditor(state);
        setHover(editor, state, null);

        if (!formattedText || !formattedText.trim()) {
            state.primitives = [];
            return;
        }

        if (typeof JsonUtils === 'undefined') {
            state.primitives = [];
            return;
        }

        const parsed = JsonUtils.parse(formattedText);
        if (!parsed.ok) {
            state.primitives = [];
            return;
        }

        state.primitives = collect(parsed.value, formattedText);
    }

    return {
        collect,
        setAtPath,
        init,
        refreshEditor
    };
})();
