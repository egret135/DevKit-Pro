// Media Toolbox - "音视频工具" mode core tab controller
// Mirrors tools/image-toolbox.js: left nav + filter, scoped to
// .media-tab / .media-tool-panel so it never collides with image tools.
//
// Each per-tool file (tools/media-tools/*.js) registers itself into
// DevKit.MediaTools[key] = { init() {...} } at parse time. This controller's
// init() calls every registered tool's init() exactly once.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    let currentTool = 'record';

    function init() {
        const tabs = document.querySelectorAll('.media-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTool(tab.dataset.tool));
        });

        initFilter();

        Object.keys(DevKit.MediaTools).forEach(key => {
            const tool = DevKit.MediaTools[key];
            if (tool && typeof tool.init === 'function' && !tool._initialized) {
                tool.init();
                tool._initialized = true;
            }
        });
    }

    function initFilter() {
        const input = document.getElementById('mediaToolFilter');
        if (!input) return;
        input.addEventListener('input', () => {
            const q = (input.value || '').trim().toLowerCase();
            document.querySelectorAll('#mediaWorkspace .media-group').forEach((group) => {
                let visible = 0;
                group.querySelectorAll('.media-tab').forEach((tab) => {
                    const hay = `${tab.textContent || ''} ${tab.dataset.keywords || ''} ${tab.dataset.tool || ''}`.toLowerCase();
                    const match = !q || hay.includes(q);
                    tab.classList.toggle('is-filtered-out', !match);
                    if (match) visible += 1;
                });
                group.classList.toggle('is-filtered-out', visible === 0);
            });
        });
    }

    function switchTool(tool) {
        const prev = currentTool;
        if (prev && prev !== tool) {
            const prevTool = DevKit.MediaTools[prev];
            if (prevTool && typeof prevTool.deactivate === 'function') {
                try { prevTool.deactivate(); } catch (_) { /* ignore */ }
            }
        }
        currentTool = tool;

        document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.media-tab[data-tool="${tool}"]`)?.classList.add('active');

        document.querySelectorAll('.media-tool-panel').forEach(p => p.classList.remove('active'));
        const panelId = 'mediaPanel' + tool.charAt(0).toUpperCase() + tool.slice(1);
        document.getElementById(panelId)?.classList.add('active');
    }

    DevKit.MediaToolboxController = { init, switchTool };
})();
