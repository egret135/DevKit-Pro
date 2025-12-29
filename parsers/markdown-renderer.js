// Markdown Renderer with Mermaid Support
// Handles Markdown parsing and Mermaid diagram rendering

const MarkdownRenderer = {
    initialized: false,

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
     * Render markdown text to HTML with Mermaid support
     * @param {string} markdownText - The markdown text to render
     * @returns {Promise<string>} - The rendered HTML
     */
    async render(markdownText) {
        if (!markdownText || !markdownText.trim()) {
            return '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
        }

        this.init();

        // Extract mermaid code blocks and replace with unique placeholders
        const mermaidBlocks = [];
        const placeholderPrefix = 'MERMAID_BLOCK_';
        const placeholderSuffix = '_END';

        let processedText = markdownText.replace(
            /```mermaid\s*([\s\S]*?)```/gi,
            (match, code) => {
                const index = mermaidBlocks.length;
                mermaidBlocks.push(code.trim());
                // Use HTML comment-like placeholder to prevent markdown processing
                return `\n\n${placeholderPrefix}${index}${placeholderSuffix}\n\n`;
            }
        );

        // Render markdown to HTML
        let html = '';
        if (typeof marked !== 'undefined') {
            html = marked.parse(processedText);
        } else {
            // Fallback: basic HTML escaping
            html = this.basicRender(processedText);
        }

        // Render mermaid diagrams and replace placeholders
        for (let i = 0; i < mermaidBlocks.length; i++) {
            const mermaidCode = mermaidBlocks[i];
            const placeholderText = `${placeholderPrefix}${i}${placeholderSuffix}`;

            try {
                const svg = await this.renderMermaid(mermaidCode, i);
                // Build mermaid container with export buttons
                const containerHtml = `<div class="mermaid-container" data-chart-index="${i}">
                    <div class="mermaid-export-buttons">
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
