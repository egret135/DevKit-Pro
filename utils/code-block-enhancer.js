// Code Block Enhancer for Markdown Preview
// Adds toolbar (format + copy buttons) to code blocks
// Only affects Markdown preview panel - standalone module

const CodeBlockEnhancer = (function () {
    'use strict';

    // SVG icons
    const ICONS = {
        format: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 7h16M4 12h10M4 17h12"/>
        </svg>`,
        copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="8" y="8" width="13" height="13" rx="2"/>
            <path d="M5 16V5a2 2 0 0 1 2-2h11"/>
        </svg>`,
        check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
        </svg>`
    };

    /**
     * Process HTML and enhance code blocks
     * @param {string} html - The rendered HTML
     * @returns {string} - HTML with enhanced code blocks
     */
    function processCodeBlocks(html) {
        // Create a temporary container to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Find all pre > code blocks
        const codeBlocks = temp.querySelectorAll('pre > code');

        codeBlocks.forEach((codeElement, index) => {
            const pre = codeElement.parentElement;

            // Extract language from class (e.g., language-javascript)
            const classMatch = codeElement.className.match(/language-(\w+)/);
            const language = classMatch ? classMatch[1] : '';
            const normalizedLang = typeof MarkdownCodeFormatter !== 'undefined'
                ? MarkdownCodeFormatter.normalizeLanguage(language)
                : language;

            // Check if formatting is supported
            const canFormat = typeof MarkdownCodeFormatter !== 'undefined' &&
                MarkdownCodeFormatter.isSupported(language);

            // Create wrapper container
            const container = document.createElement('div');
            container.className = 'code-block-container';
            container.setAttribute('data-language', normalizedLang || 'text');
            container.setAttribute('data-index', index);

            // Create toolbar
            const toolbar = document.createElement('div');
            toolbar.className = 'code-block-toolbar';

            // Left side - buttons
            const leftButtons = document.createElement('div');
            leftButtons.className = 'code-toolbar-left';

            // Format button (only if supported)
            if (canFormat) {
                const formatBtn = document.createElement('button');
                formatBtn.className = 'code-toolbar-btn format-btn';
                formatBtn.innerHTML = `${ICONS.format}<span>格式化</span>`;
                formatBtn.title = '格式化代码';
                formatBtn.setAttribute('data-index', index);
                leftButtons.appendChild(formatBtn);
            }

            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-toolbar-btn copy-btn';
            copyBtn.innerHTML = `${ICONS.copy}<span>复制</span>`;
            copyBtn.title = '复制代码';
            copyBtn.setAttribute('data-index', index);
            leftButtons.appendChild(copyBtn);

            toolbar.appendChild(leftButtons);

            // Right side - language label
            if (normalizedLang) {
                const langLabel = document.createElement('span');
                langLabel.className = 'code-language-label';
                langLabel.textContent = normalizedLang;
                toolbar.appendChild(langLabel);
            }

            // Wrap pre element
            pre.parentNode.insertBefore(container, pre);
            container.appendChild(toolbar);
            container.appendChild(pre);
        });

        return temp.innerHTML;
    }

    /**
     * Attach event listeners to enhanced code blocks
     * @param {HTMLElement} container - The markdown preview container
     */
    function attachEventListeners(container) {
        // Format button click
        container.addEventListener('click', async (e) => {
            const formatBtn = e.target.closest('.format-btn');
            if (formatBtn) {
                e.preventDefault();
                e.stopPropagation();
                await handleFormat(formatBtn, container);
                return;
            }

            const copyBtn = e.target.closest('.copy-btn');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                handleCopy(copyBtn, container);
                return;
            }
        });
    }

    /**
     * Handle format button click
     */
    async function handleFormat(button, container) {
        const index = button.getAttribute('data-index');
        const codeContainer = container.querySelector(`.code-block-container[data-index="${index}"]`);
        if (!codeContainer) return;

        const language = codeContainer.getAttribute('data-language');
        const codeElement = codeContainer.querySelector('code');
        if (!codeElement) return;

        // Get original code text
        const originalCode = codeElement.textContent;

        // Disable button during formatting
        button.disabled = true;
        button.classList.add('loading');

        try {
            if (typeof MarkdownCodeFormatter !== 'undefined') {
                const formatted = await MarkdownCodeFormatter.format(originalCode, language);

                if (formatted !== originalCode) {
                    // Update code content
                    codeElement.textContent = formatted;

                    // Show success feedback
                    showButtonFeedback(button, '已格式化', 'success');
                } else {
                    showButtonFeedback(button, '无需格式化', 'info');
                }
            }
        } catch (error) {
            console.error('Format error:', error);
            showButtonFeedback(button, '格式化失败', 'error');
        } finally {
            button.disabled = false;
            button.classList.remove('loading');
        }
    }

    /**
     * Handle copy button click
     */
    function handleCopy(button, container) {
        const index = button.getAttribute('data-index');
        const codeContainer = container.querySelector(`.code-block-container[data-index="${index}"]`);
        if (!codeContainer) return;

        const codeElement = codeContainer.querySelector('code');
        if (!codeElement) return;

        const code = codeElement.textContent;

        navigator.clipboard.writeText(code).then(() => {
            // Show success feedback
            const originalContent = button.innerHTML;
            button.innerHTML = `${ICONS.check}<span>已复制</span>`;
            button.classList.add('copied');

            setTimeout(() => {
                button.innerHTML = originalContent;
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            showButtonFeedback(button, '复制失败', 'error');
        });
    }

    /**
     * Show temporary feedback on button
     */
    function showButtonFeedback(button, message, type) {
        const originalContent = button.innerHTML;
        const originalTitle = button.title;

        button.innerHTML = `<span>${message}</span>`;
        button.classList.add(`feedback-${type}`);

        setTimeout(() => {
            button.innerHTML = originalContent;
            button.title = originalTitle;
            button.classList.remove(`feedback-${type}`);
        }, 2000);
    }

    /**
     * Auto-format all code blocks on initial render
     * Only auto-formats languages with reliable formatters (JSON, SQL, YAML, XML, JS/TS/HTML/CSS)
     * Skips Go, Python, C, etc. to preserve original indentation
     * @param {HTMLElement} container - The markdown preview container
     */
    async function autoFormatAll(container) {
        // Languages safe to auto-format (have reliable formatters)
        const autoFormatLanguages = [
            'json', 'sql', 'mysql', 'postgresql', 'sqlite',
            'yaml', 'yml', 'xml',
            'javascript', 'js', 'typescript', 'ts',
            'html', 'css', 'scss', 'less',
            'php'
        ];

        const codeContainers = container.querySelectorAll('.code-block-container');

        for (const codeContainer of codeContainers) {
            const language = codeContainer.getAttribute('data-language');
            const codeElement = codeContainer.querySelector('code');

            if (!codeElement) continue;
            if (typeof MarkdownCodeFormatter === 'undefined') continue;

            // Only auto-format languages with reliable formatters
            const normalizedLang = MarkdownCodeFormatter.normalizeLanguage(language);
            if (!autoFormatLanguages.includes(language) && !autoFormatLanguages.includes(normalizedLang)) {
                continue;
            }

            try {
                const originalCode = codeElement.textContent;
                const formatted = await MarkdownCodeFormatter.format(originalCode, language);

                if (formatted !== originalCode) {
                    codeElement.textContent = formatted;
                }
            } catch (error) {
                console.warn(`Auto-format failed for ${language}:`, error.message);
            }
        }
    }

    /**
     * Initialize code block enhancement for a container
     * @param {HTMLElement} container - The markdown preview container
     * @param {Object} options - Options
     */
    async function init(container, options = {}) {
        const { autoFormat = true } = options;

        // Attach event listeners
        attachEventListeners(container);

        // Auto-format if enabled
        if (autoFormat) {
            await autoFormatAll(container);
        }
    }

    // Public API
    return {
        processCodeBlocks,
        attachEventListeners,
        autoFormatAll,
        init
    };
})();

// Export for use
if (typeof window !== 'undefined') {
    window.CodeBlockEnhancer = CodeBlockEnhancer;
}
