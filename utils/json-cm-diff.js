// CodeMirror inline diff — line highlights, gutter, word marks, linked scroll (shared by JSON and Code Diff)

const CmDiff = (function () {
    'use strict';

    const editorState = new WeakMap();
    const LINE_CLASS = {
        del: 'json-cm-line-del',
        add: 'json-cm-line-add',
        mod: 'json-cm-line-mod'
    };
    const GUTTER_CLASS = {
        del: 'json-cm-gutter-del',
        add: 'json-cm-gutter-add',
        mod: 'json-cm-gutter-mod'
    };
    const WORD_CLASS = {
        del: 'cm-diff-word-del',
        add: 'cm-diff-word-add'
    };
    const FLASH_CLASS = 'cm-diff-flash';

    function getState(editor) {
        if (!editorState.has(editor)) {
            editorState.set(editor, { lines: [], classByLine: {}, marks: [], flash: null });
        }
        return editorState.get(editor);
    }

    function getLineHeight(editor) {
        if (!editor) return 20;
        return editor.defaultTextHeight?.() || 20;
    }

    function clearWordMarks(editor) {
        if (!editor) return;
        const state = getState(editor);
        state.marks.forEach((m) => m.clear());
        state.marks = [];
    }

    function clearFlash(editor) {
        if (!editor) return;
        const state = getState(editor);
        if (state.flash) {
            clearTimeout(state.flash.timer);
            editor.removeLineClass(state.flash.handle, 'background', FLASH_CLASS);
            state.flash = null;
        }
    }

    function clearEditor(editor) {
        if (!editor) return;
        const state = getState(editor);
        editor.operation(() => {
            state.lines.forEach((line) => {
                const kind = state.classByLine[line];
                if (!kind) return;
                editor.removeLineClass(line, 'background', LINE_CLASS[kind]);
                editor.removeLineClass(line, 'gutter', GUTTER_CLASS[kind]);
            });
            clearWordMarks(editor);
            clearFlash(editor);
        });
        state.lines = [];
        state.classByLine = {};
    }

    function applyLineStatus(editor, status) {
        if (!editor) return;
        clearEditor(editor);

        const state = getState(editor);
        const limit = Math.min(status.length, editor.lineCount());

        editor.operation(() => {
            for (let i = 0; i < limit; i++) {
                const kind = status[i];
                if (!LINE_CLASS[kind]) continue;
                editor.addLineClass(i, 'background', LINE_CLASS[kind]);
                editor.addLineClass(i, 'gutter', GUTTER_CLASS[kind]);
                state.lines.push(i);
                state.classByLine[i] = kind;
            }
        });
    }

    // wordsByLine[i] is a token list ({ text, type: 'eq'|'del'|'add' }) or null.
    function applyWordMarks(editor, wordsByLine) {
        if (!editor || !wordsByLine) return;
        clearWordMarks(editor);

        const state = getState(editor);
        const limit = Math.min(wordsByLine.length, editor.lineCount());

        editor.operation(() => {
            for (let line = 0; line < limit; line++) {
                const tokens = wordsByLine[line];
                if (!tokens) continue;
                let ch = 0;
                tokens.forEach((t) => {
                    const len = t.text.length;
                    if (WORD_CLASS[t.type] && t.text.trim()) {
                        state.marks.push(editor.markText(
                            { line, ch },
                            { line, ch: ch + len },
                            { className: WORD_CLASS[t.type] }
                        ));
                    }
                    ch += len;
                });
            }
        });
    }

    function flashLine(editor, line, duration = 800) {
        if (!editor || line < 0 || line >= editor.lineCount()) return;
        clearFlash(editor);
        const handle = editor.addLineClass(line, 'background', FLASH_CLASS);
        const state = getState(editor);
        state.flash = {
            handle,
            timer: setTimeout(() => {
                editor.removeLineClass(handle, 'background', FLASH_CLASS);
                state.flash = null;
            }, duration)
        };
    }

    function renderGutter(gutterId, lineCount, status, lineHeight) {
        const gutter = document.getElementById(gutterId);
        if (!gutter) return;

        const height = lineHeight || 20;
        const html = [];
        for (let i = 0; i < lineCount; i++) {
            const state = status[i] || 'equal';
            const cls = state !== 'equal' ? ` ${state}` : '';
            html.push(
                `<div class="cdiff-gutter-line${cls}" style="height:${height}px;line-height:${height}px">${i + 1}</div>`
            );
        }
        gutter.innerHTML = html.join('');
    }

    function clearGutter(gutterId) {
        const gutter = document.getElementById(gutterId);
        if (gutter) gutter.innerHTML = '';
    }

    function scrollEditorToLine(editor, line) {
        if (!editor || line < 0) return;
        const safeLine = Math.min(line, Math.max(0, editor.lineCount() - 1));
        const scroller = editor.getScrollerElement();
        const lineTop = editor.charCoords({ line: safeLine, ch: 0 }, 'local').top;
        const scrollInfo = editor.getScrollInfo();
        editor.scrollTo(scrollInfo.left, Math.max(0, lineTop - scroller.clientHeight / 3));
    }

    // options.isEnabled: optional () => boolean gate for toggleable sync.
    function linkScrollPair(editorA, editorB, gutterAId, gutterBId, options = {}) {
        if (!editorA || !editorB) return;

        const gutterA = gutterAId ? document.getElementById(gutterAId) : null;
        const gutterB = gutterBId ? document.getElementById(gutterBId) : null;
        const isEnabled = typeof options.isEnabled === 'function' ? options.isEnabled : () => true;
        let syncing = false;

        const syncFrom = (source, target, sourceGutter, targetGutter) => {
            source.on('scroll', () => {
                if (syncing || !isEnabled()) return;
                syncing = true;
                const info = source.getScrollInfo();
                target.scrollTo(info.left, info.top);
                if (sourceGutter) sourceGutter.scrollTop = info.top;
                if (targetGutter) targetGutter.scrollTop = info.top;
                syncing = false;
            });
        };

        syncFrom(editorA, editorB, gutterA, gutterB);
        syncFrom(editorB, editorA, gutterB, gutterA);
    }

    function findLineForPath(editor, path) {
        if (!editor || !path) return 0;

        const segments = path
            .replace(/^\$\.?/, '')
            .split(/\.|\[|\]/)
            .filter(Boolean);

        if (!segments.length) return 0;

        const lastKey = segments[segments.length - 1];
        const isIndex = /^\d+$/.test(lastKey);

        for (let i = 0; i < editor.lineCount(); i++) {
            const line = editor.getLine(i);
            if (isIndex) {
                if (line.trim() === '{' || line.trim() === '[') continue;
            } else if (line.includes(`"${lastKey}"`)) {
                return i;
            }
        }

        for (let i = 0; i < editor.lineCount(); i++) {
            const line = editor.getLine(i);
            if (line.includes(lastKey)) return i;
        }

        return 0;
    }

    return {
        applyLineStatus,
        applyWordMarks,
        flashLine,
        renderGutter,
        clearEditor,
        clearGutter,
        scrollEditorToLine,
        linkScrollPair,
        findLineForPath,
        getLineHeight
    };
})();

const JsonCmDiff = CmDiff;

if (typeof window !== 'undefined') {
    window.CmDiff = CmDiff;
    window.JsonCmDiff = CmDiff;
}
