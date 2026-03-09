/**
 * DiffController - Handles DDL diff comparison functionality
 */
(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    let ctx = null;
    let debouncedDiff = null;

    function init(appCtx) {
        ctx = appCtx;
        const el = ctx.elements;

        debouncedDiff = ctx.debounce(() => handleDiff(), 500);

        // Editor listeners
        const diffTargetEditor = editorManager.get('diffTargetInput');
        const diffSourceEditor = editorManager.get('diffSourceInput');

        if (diffTargetEditor) {
            diffTargetEditor.on('change', () => debouncedDiff());
        }
        if (diffSourceEditor) {
            diffSourceEditor.on('change', () => debouncedDiff());
        }

        // Button listeners
        el.copyDiffBtn.addEventListener('click', handleCopyDiff);
        el.clearDiffBtn.addEventListener('click', handleClearDiff);
    }

    function handleDiff() {
        const targetDDL = editorManager.getValue('diffTargetInput');
        const sourceDDL = editorManager.getValue('diffSourceInput');

        if (!targetDDL.trim() && !sourceDDL.trim()) {
            editorManager.setValue('diffOutputArea', '-- 在左侧分别输入新旧 DDL\n-- 将自动生成 ALTER 语句');
            return;
        }

        ctx.setStatus('正在生成 Diff...', 'processing');

        try {
            if (typeof diffEngine === 'undefined') {
                throw new Error('Diff Engine 未加载');
            }

            const statements = diffEngine.generateDiff(targetDDL, sourceDDL);
            editorManager.setValue('diffOutputArea', statements.join('\n'));
            ctx.setStatus('Diff 生成成功', 'success');
        } catch (e) {
            editorManager.setValue('diffOutputArea', `-- 错误: ${e.message}`);
            ctx.setStatus('Diff 生成失败', 'error');
        }
    }

    function handleCopyDiff() {
        const text = editorManager.getValue('diffOutputArea');
        if (!text || text.startsWith('--')) {
            ctx.setStatus('没有可复制的 SQL', 'error');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            ctx.setStatus('SQL 已复制', 'success');
            ctx.elements.copyDiffBtn.classList.add('copied');
            setTimeout(() => ctx.elements.copyDiffBtn.classList.remove('copied'), 600);
        }).catch(() => {
            ctx.setStatus('复制失败', 'error');
        });
    }

    function handleClearDiff() {
        editorManager.setValue('diffTargetInput', '');
        editorManager.setValue('diffSourceInput', '');
        editorManager.setValue('diffOutputArea', '-- 在左侧分别输入新旧 DDL\n-- 将自动生成 ALTER 语句');
        ctx.setStatus('Diff 已清空', 'ready');
    }

    DevKit.DiffController = { init };
})();
