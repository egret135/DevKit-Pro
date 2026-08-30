// Media Toolbox - "音视频工具" mode core tab controller
// Mirrors tools/image-toolbox.js but scoped to .media-tab / .media-tool-panel
// so it never collides with the image tools' .img-tab selectors.
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

        Object.keys(DevKit.MediaTools).forEach(key => {
            const tool = DevKit.MediaTools[key];
            if (tool && typeof tool.init === 'function' && !tool._initialized) {
                tool.init();
                tool._initialized = true;
            }
        });
    }

    function switchTool(tool) {
        currentTool = tool;

        document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.media-tab[data-tool="${tool}"]`)?.classList.add('active');

        document.querySelectorAll('.media-tool-panel').forEach(p => p.classList.remove('active'));
        const panelId = 'mediaPanel' + tool.charAt(0).toUpperCase() + tool.slice(1);
        document.getElementById(panelId)?.classList.add('active');
    }

    DevKit.MediaToolboxController = { init, switchTool };
})();
