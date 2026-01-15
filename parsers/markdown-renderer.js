// Markdown Renderer with Mermaid Support and GitHub Alert Syntax
// Handles Markdown parsing, Mermaid diagram rendering, and GitHub-style alerts

const MarkdownRenderer = {
    initialized: false,

    // GitHub Alert type definitions
    ALERT_TYPES: {
        NOTE: { icon: 'ℹ️', class: 'alert-note', label: 'Note' },
        TIP: { icon: '💡', class: 'alert-tip', label: 'Tip' },
        IMPORTANT: { icon: '❗', class: 'alert-important', label: 'Important' },
        WARNING: { icon: '⚠️', class: 'alert-warning', label: 'Warning' },
        CAUTION: { icon: '🔴', class: 'alert-caution', label: 'Caution' }
    },

    /**
     * Initialize the renderer with marked and mermaid configurations
     */
    init() {
        if (this.initialized) return;

        // Configure marked for GitHub Flavored Markdown
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: true,
                mangle: false
            });
        }

        // Configure mermaid
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose',
                flowchart: {
                    useMaxWidth: true,
                    htmlLabels: true,
                    curve: 'basis'
                }
            });
        }

        this.initialized = true;
    },

    /**
     * Preprocess GitHub Alert syntax
     * Converts `> [!TYPE]` blocks to special placeholders
     * @param {string} text - The markdown text
     * @returns {string} - Preprocessed text with alert placeholders
     */
    preprocessAlerts(text) {
        const alertRegex = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*(?:\n|$))*)/gim;

        let result = text;
        let match;
        let counter = 0;
        const alertBlocks = [];

        // Reset regex lastIndex
        alertRegex.lastIndex = 0;

        while ((match = alertRegex.exec(text)) !== null) {
            const type = match[1].toUpperCase();
            const content = match[2]
                .split('\n')
                .map(line => line.replace(/^>\s?/, ''))
                .join('\n')
                .trim();

            const placeholder = `<!--ALERT_PLACEHOLDER_${counter}-->`;
            alertBlocks.push({ type, content, placeholder });

            result = result.replace(match[0], placeholder + '\n');
            counter++;
        }

        return { text: result, alertBlocks };
    },

    /**
     * Convert alert placeholders to HTML
     * @param {string} html - The rendered HTML
     * @param {Array} alertBlocks - Array of alert block data
     * @returns {string} - HTML with alert blocks rendered
     */
    postprocessAlerts(html, alertBlocks) {
        let result = html;

        for (const block of alertBlocks) {
            const alertInfo = this.ALERT_TYPES[block.type];
            if (!alertInfo) continue;

            // Render the content as markdown then extract inner HTML
            let contentHtml = block.content;
            if (typeof marked !== 'undefined') {
                contentHtml = marked.parse(block.content);
            }

            const alertHtml = `
                <div class="alert ${alertInfo.class}">
                    <span class="alert-title">${alertInfo.label}</span>
                    ${contentHtml}
                </div>
            `;

            // Replace placeholder (may be wrapped in <p> tags)
            result = result.replace(
                new RegExp(`<p>\\s*${block.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</p>|${block.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'),
                alertHtml
            );
        }

        return result;
    },

    /**
     * Render markdown text to HTML with Mermaid support
     * @param {string} markdownText - The markdown text to render
     * @returns {Promise<string>} - The rendered HTML
     */
    async render(markdownText) {
        if (!markdownText || !markdownText.trim()) {
            return '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
        }

        this.init();

        // Step 1: Preprocess GitHub Alert syntax
        const { text: alertProcessedText, alertBlocks } = this.preprocessAlerts(markdownText);

        // Step 2: Extract mermaid code blocks and replace with unique placeholders
        const mermaidBlocks = [];
        const placeholderPrefix = 'MERMAID_BLOCK_';
        const placeholderSuffix = '_END';

        let processedText = alertProcessedText.replace(
            /```mermaid\s*([\s\S]*?)```/gi,
            (match, code) => {
                const index = mermaidBlocks.length;
                mermaidBlocks.push(code.trim());
                // Use HTML comment-like placeholder to prevent markdown processing
                return `\n\n${placeholderPrefix}${index}${placeholderSuffix}\n\n`;
            }
        );

        // Step 3: Render markdown to HTML
        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(processedText);
        } else {
            // Fallback: basic HTML escaping
            html = this.basicRender(processedText);
        }

        // Step 4: Postprocess GitHub Alert blocks
        html = this.postprocessAlerts(html, alertBlocks);

        // Step 5: Render mermaid diagrams and replace placeholders
        for (let i = 0; i < mermaidBlocks.length; i++) {
            const mermaidCode = mermaidBlocks[i];
            const placeholderText = `${placeholderPrefix}${i}${placeholderSuffix}`;

            try {
                const svg = await this.renderMermaid(mermaidCode, i);
                // Build mermaid container with toolbar (zoom + export buttons)
                const containerHtml = `<div class="mermaid-container" data-chart-index="${i}">
                    <div class="mermaid-toolbar">
                        <button class="mermaid-zoom-btn" data-index="${i}" title="放大查看">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="M21 21l-4.35-4.35"></path>
                                <path d="M11 8v6M8 11h6"></path>
                            </svg>
                            放大
                        </button>
                        <button class="mermaid-export-btn svg-btn" data-format="svg" data-index="${i}" title="导出 SVG">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                            </svg>
                            SVG
                        </button>
                        <button class="mermaid-export-btn png-btn" data-format="png" data-index="${i}" title="导出 PNG">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                            </svg>
                            PNG
                        </button>
                    </div>
                    ${svg}
                </div>`;
                // Replace placeholder wrapped in various HTML tags
                html = html.replace(
                    new RegExp(`<p>\\s*${placeholderText}\\s*</p>|<p>${placeholderText}</p>|${placeholderText}`, 'g'),
                    containerHtml
                );
            } catch (error) {
                const errorHtml = `<div class="mermaid-error">
                    <strong>Mermaid 渲染错误:</strong> ${error.message}
                    <pre>${this.escapeHtml(mermaidCode)}</pre>
                </div>`;
                html = html.replace(
                    new RegExp(`<p>\\s*${placeholderText}\\s*</p>|<p>${placeholderText}</p>|${placeholderText}`, 'g'),
                    errorHtml
                );
            }
        }

        // Step 6: Enhance code blocks with toolbar (format + copy buttons)
        if (typeof CodeBlockEnhancer !== 'undefined') {
            html = CodeBlockEnhancer.processCodeBlocks(html);
        }

        return html;
    },

    /**
     * Render a mermaid diagram to SVG
     * @param {string} code - The mermaid code
     * @param {number} id - Unique identifier for the diagram
     * @returns {Promise<string>} - The SVG string
     */
    async renderMermaid(code, id) {
        if (typeof mermaid === 'undefined') {
            throw new Error('Mermaid library not loaded');
        }

        const uniqueId = `mermaid-diagram-${id}-${Date.now()}`;

        try {
            const { svg } = await mermaid.render(uniqueId, code);
            return svg;
        } catch (error) {
            throw new Error(error.message || 'Failed to render diagram');
        }
    },

    /**
     * Basic markdown rendering fallback
     * @param {string} text - The text to render
     * @returns {string} - Basic HTML
     */
    basicRender(text) {
        let html = this.escapeHtml(text);

        // Basic markdown transformations
        html = html
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Bold
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            // Code inline
            .replace(/`(.*?)`/gim, '<code>$1</code>')
            // Line breaks
            .replace(/\n/gim, '<br>');

        return html;
    },

    /**
     * Escape HTML special characters
     * @param {string} text - The text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.MarkdownRenderer = MarkdownRenderer;
}
