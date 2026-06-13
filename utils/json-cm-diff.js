// CodeMirror inline diff — line highlights, gutter, linked scroll

const JsonCmDiff = (function () {
    'use strict';

    const editorState = new WeakMap();
    const LINE_CLASS = {
        del: 'json-cm-line-del',
        add: 'json-cm-line-add',
        mod: 'json-cm-line-mod'
    };

    function getState(editor) {
        if (!editorState.has(editor)) {
            editorState.set(editor, { lines: [], classByLine: {} });
        }
        return editorState.get(editor);
    }

    function getLineHeight(editor) {
        if (!editor) return 20;
        return editor.defaultTextHeight?.() || 20;
    }

    function clearEditor(editor) {
        if (!editor) return;
        const state = getState(editor);
        state.lines.forEach((line) => {
            const cls = state.classByLine[line];
            if (cls) editor.removeLineClass(line, 'background', cls);
        });
        state.lines = [];
        state.classByLine = {};
    }

    function applyLineStatus(editor, status) {
        if (!editor) return;
        clearEditor(editor);

        const state = getState(editor);
        const limit = Math.min(status.length, editor.lineCount());

        for (let i = 0; i < limit; i++) {
            const cls = LINE_CLASS[status[i]];
            if (!cls) continue;
            editor.addLineClass(i, 'background', cls);
            state.lines.push(i);
            state.classByLine[i] = cls;
        }
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

    function linkScrollPair(editorA, editorB, gutterAId, gutterBId) {
        if (!editorA || !editorB) return () => {};

        const gutterA = document.getElementById(gutterAId);
        const gutterB = document.getElementById(gutterBId);
        let syncing = false;

        const syncFrom = (source, target, sourceGutter, targetGutter) => {
            source.on('scroll', () => {
                if (syncing) return;
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

        return () => {
            source.off?.('scroll');
        };
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
        renderGutter,
        clearEditor,
        clearGutter,
        scrollEditorToLine,
        linkScrollPair,
        findLineForPath,
        getLineHeight
    };
})();

if (typeof window !== 'undefined') {
    window.JsonCmDiff = JsonCmDiff;
}
