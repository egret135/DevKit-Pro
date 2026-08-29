// Image Toolbox - "图片工具" mode core tab controller
// Structurally mirrors tools/toolbox.js's init()/switchTool(), but scoped to
// .img-tab / .img-tool-panel (distinct class names) so it never collides with
// the existing Toolbox's global .toolbox-tab / .tool-panel selectors.
//
// Each per-tool file (tools/image-tools/*.js) registers itself into
// DevKit.ImageTools[key] = { init() {...} } at parse time. This controller's
// init() calls every registered tool's init() exactly once, after all the
// per-tool scripts (loaded earlier in index.html) have executed.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.ImageTools = DevKit.ImageTools || {};

    let currentTool = 'base64';

    function init() {
        const tabs = document.querySelectorAll('.img-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTool(tab.dataset.tool));
        });

        Object.keys(DevKit.ImageTools).forEach(key => {
            const tool = DevKit.ImageTools[key];
            if (tool && typeof tool.init === 'function' && !tool._initialized) {
                tool.init();
                tool._initialized = true;
            }
        });
    }

    function switchTool(tool) {
        currentTool = tool;

        document.querySelectorAll('.img-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.img-tab[data-tool="${tool}"]`)?.classList.add('active');

        document.querySelectorAll('.img-tool-panel').forEach(p => p.classList.remove('active'));
        const panelId = 'imgPanel' + tool.charAt(0).toUpperCase() + tool.slice(1);
        document.getElementById(panelId)?.classList.add('active');
    }

    DevKit.ImageToolboxController = { init, switchTool };
})();
