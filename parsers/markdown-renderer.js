// Markdown Renderer with Mermaid Support and GitHub Alert Syntax
// Handles Markdown parsing, Mermaid diagram rendering, and GitHub-style alerts

const MarkdownRenderer = {
    initialized: false,
    curve: 'basis', // 'basis' (smooth) | 'orthogonal' (right-angle)
    chartCurveOverrides: Object.create(null),

    // GitHub Alert type definitions
    ALERT_TYPES: {
        NOTE: { icon: 'ℹ️', class: 'alert-note', label: 'Note' },
        TIP: { icon: '💡', class: 'alert-tip', label: 'Tip' },
        IMPORTANT: { icon: '❗', class: 'alert-important', label: 'Important' },
        WARNING: { icon: '⚠️', class: 'alert-warning', label: 'Warning' },
        CAUTION: { icon: '🔴', class: 'alert-caution', label: 'Caution' }
    },

    CURVE_OPTIONS: {
        basis: { value: 'basis', label: '曲线', next: 'orthogonal', nextLabel: '直角' },
        orthogonal: { value: 'orthogonal', label: '直角', next: 'basis', nextLabel: '曲线' }
    },

    /**
     * Initialize the renderer with marked and mermaid configurations
     * @param {{ curve?: string }} [options]
     */
    init(options) {
        if (options && options.curve) {
            this.curve = this.normalizeCurve(options.curve);
        }

        // Configure marked for GitHub Flavored Markdown
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: true,
                mangle: false
            });
        }

        this.applyMermaidConfig();
        this.initialized = true;
    },

    normalizeCurve(curve) {
        // Migrate old prefs: linear/step* now mean the rewritten orthogonal mode.
        if (
            curve === 'orthogonal' ||
            curve === 'linear' ||
            curve === 'stepAfter' ||
            curve === 'step' ||
            curve === 'stepBefore'
        ) {
            return 'orthogonal';
        }
        return 'basis';
    },

    isOrthogonalCurve(curve) {
        return this.normalizeCurve(curve) === 'orthogonal';
    },

    getMermaidCurve() {
        // stepAfter produces axis-aligned segments without rewriting SVG points.
        return this.isOrthogonalCurve(this.curve) ? 'stepAfter' : 'basis';
    },

    /**
     * Apply / refresh mermaid flowchart curve setting.
     * @param {string} [curve]
     */
    applyMermaidConfig(curve) {
        if (curve) {
            this.curve = this.normalizeCurve(curve);
        }

        if (typeof mermaid === 'undefined') return;

        const orthogonal = this.isOrthogonalCurve(this.curve);

        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            flowchart: {
                useMaxWidth: false,
                htmlLabels: true,
                curve: this.getMermaidCurve(),
                // Wider gaps in orthogonal mode reduce shared/stacked edge segments
                nodeSpacing: orthogonal ? 72 : 50,
                rankSpacing: orthogonal ? 90 : 50,
                padding: orthogonal ? 24 : 15,
                wrappingWidth: 200
            }
        });
    },

    getCurveMeta(curve) {
        const key = this.normalizeCurve(curve);
        return this.CURVE_OPTIONS[key];
    },

    getChartKey(code, index) {
        return `${index}:${code}`;
    },

    getChartCurve(code, index, fallbackCurve) {
        return this.chartCurveOverrides[this.getChartKey(code, index)] ||
            this.normalizeCurve(fallbackCurve || this.curve);
    },

    setChartCurveOverride(code, index, curve) {
        this.chartCurveOverrides[this.getChartKey(code, index)] = this.normalizeCurve(curve);
    },

    buildCurveToggleButton(index, curve) {
        const meta = this.getCurveMeta(curve);
        // Icon reflects the *next* style (what clicking will switch to)
        const icon = meta.next === 'orthogonal'
            ? '<path d="M4 6h8v12h8" stroke-linecap="round" stroke-linejoin="round"/>'
            : '<path d="M4 18c4-12 12 0 16-12" stroke-linecap="round"/>';
        return `<button class="mermaid-curve-btn" data-index="${index}" data-curve="${meta.value}" title="切换为${meta.nextLabel}" aria-label="切换连线样式为${meta.nextLabel}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${icon}
                            </svg>
                            ${meta.nextLabel}
                        </button>`;
    },

    /**
     * Clean SVG artifacts that can visually break right-angle edges.
     * This deliberately does not modify path coordinates.
     * @param {string} svg
     * @returns {string}
     */
    cleanOrthogonalSvg(svg) {
        if (!svg || typeof DOMParser === 'undefined') return svg;

        try {
            const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
            if (doc.querySelector('parsererror')) return svg;

            doc.querySelectorAll('.edgeLabel').forEach((label) => {
                const text = (label.textContent || '').replace(/\u00a0/g, '').trim();
                if (!text) {
                    label.remove();
                }
            });

            doc.querySelectorAll('.labelBkg, .edgeLabel rect').forEach((bg) => {
                const label = bg.closest('.edgeLabel');
                const text = label ? (label.textContent || '').replace(/\u00a0/g, '').trim() : '';
                if (!label || !text) {
                    bg.remove();
                }
            });

            doc.querySelectorAll('.edgePath path, .edgePaths path').forEach((path) => {
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('stroke-linecap', 'round');
            });

            return new XMLSerializer().serializeToString(doc.documentElement);
        } catch (e) {
            return svg;
        }
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
     * Find character ranges of fenced code blocks and inline code spans,
     * so math delimiters inside code (e.g. shell `$VAR`) are left untouched.
     * @param {string} text
     * @returns {[number, number][]}
     */
    getProtectedRanges(text) {
        const ranges = [];
        const fenceRegex = /(```|~~~)[\s\S]*?\1/g;
        let match;

        while ((match = fenceRegex.exec(text)) !== null) {
            ranges.push([match.index, match.index + match[0].length]);
        }

        const inlineCodeRegex = /`[^`\n]+`/g;
        while ((match = inlineCodeRegex.exec(text)) !== null) {
            ranges.push([match.index, match.index + match[0].length]);
        }

        return ranges;
    },

    isInProtectedRange(index, ranges) {
        return ranges.some(([start, end]) => index >= start && index < end);
    },

    /**
     * Preprocess math syntax: $$...$$ (display) and $...$ (inline).
     * Extracted before marked.parse() so LaTeX chars (\, _, {, }) survive untouched,
     * then rendered with KaTeX and reinserted as placeholders.
     * @param {string} text
     * @returns {{ text: string, mathBlocks: Array }}
     */
    preprocessMath(text) {
        const mathBlocks = [];
        if (typeof katex === 'undefined') {
            return { text, mathBlocks };
        }

        const protectedRanges = this.getProtectedRanges(text);
        let counter = 0;

        // Block math ($$...$$) is tried first so it isn't split into two inline matches.
        const mathRegex = /\$\$([\s\S]+?)\$\$|\$(?!\s)((?:\\\$|[^\n$])+?)(?<!\s)\$/g;

        const result = text.replace(mathRegex, (match, blockExpr, inlineExpr, offset) => {
            if (this.isInProtectedRange(offset, protectedRanges)) return match;

            const isDisplay = blockExpr !== undefined;
            const expr = (isDisplay ? blockExpr : inlineExpr).trim();
            if (!expr) return match;

            const placeholder = `MATH_BLOCK_${counter}_END`;
            mathBlocks.push({ expr, display: isDisplay, placeholder });
            counter++;

            return isDisplay ? `\n\n${placeholder}\n\n` : placeholder;
        });

        return { text: result, mathBlocks };
    },

    /**
     * Render collected math placeholders with KaTeX and splice them back into the HTML.
     * @param {string} html
     * @param {Array} mathBlocks
     * @returns {string}
     */
    postprocessMath(html, mathBlocks) {
        if (!mathBlocks.length || typeof katex === 'undefined') return html;

        let result = html;

        for (const block of mathBlocks) {
            let rendered;
            try {
                rendered = katex.renderToString(block.expr, {
                    throwOnError: false,
                    displayMode: block.display,
                    strict: 'ignore'
                });
            } catch (error) {
                const source = block.display ? `$$${block.expr}$$` : `$${block.expr}$`;
                rendered = `<span class="markdown-math-error" title="${this.escapeHtml(error.message || '公式渲染失败')}">${this.escapeHtml(source)}</span>`;
            }

            const wrapped = block.display
                ? `<div class="markdown-math-block">${rendered}</div>`
                : `<span class="markdown-math-inline">${rendered}</span>`;

            const escaped = block.placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(
                new RegExp(`<p>\\s*${escaped}\\s*</p>|${escaped}`, 'g'),
                wrapped
            );
        }

        return result;
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
     * @param {{ curve?: string }} [options]
     * @returns {Promise<string>} - The rendered HTML
     */
    async render(markdownText, options) {
        if (!markdownText || !markdownText.trim()) {
            return '<p class="placeholder">输入 Markdown 文本开始预览...</p>';
        }

        if (options && options.curve) {
            this.init(options);
        } else if (!this.initialized) {
            this.init();
        } else {
            this.applyMermaidConfig();
        }

        // Step 1: Preprocess GitHub Alert syntax
        const { text: alertProcessedText, alertBlocks } = this.preprocessAlerts(markdownText);

        // Step 1b: Preprocess math syntax ($$...$$ / $...$) so marked doesn't mangle LaTeX
        const { text: mathProcessedText, mathBlocks } = this.preprocessMath(alertProcessedText);

        // Step 2: Extract mermaid code blocks and replace with unique placeholders
        const mermaidBlocks = [];
        const placeholderPrefix = 'MERMAID_BLOCK_';
        const placeholderSuffix = '_END';

        let processedText = mathProcessedText.replace(
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
        const defaultCurve = this.curve;
        for (let i = 0; i < mermaidBlocks.length; i++) {
            const mermaidCode = mermaidBlocks[i];
            const placeholderText = `${placeholderPrefix}${i}${placeholderSuffix}`;

            try {
                const chartCurve = this.getChartCurve(mermaidCode, i, defaultCurve);
                this.applyMermaidConfig(chartCurve);
                const svg = await this.renderMermaid(mermaidCode, i);
                const encodedSource = encodeURIComponent(mermaidCode);
                const curveToggle = this.buildCurveToggleButton(i, chartCurve);
                // Build mermaid container with toolbar (zoom + export + curve toggle)
                const containerHtml = `<div class="mermaid-container" data-chart-index="${i}" data-curve="${chartCurve}" data-mermaid-source="${encodedSource}">
                    <div class="mermaid-toolbar">
                        <button class="mermaid-zoom-btn" data-index="${i}" title="放大查看">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="M21 21l-4.35-4.35"></path>
                                <path d="M11 8v6M8 11h6"></path>
                            </svg>
                            放大
                        </button>
                        ${curveToggle}
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
        this.applyMermaidConfig(defaultCurve);

        // Step 5b: Render math placeholders with KaTeX
        html = this.postprocessMath(html, mathBlocks);

        // Step 6: Wrap tables in scrollable container
        html = html.replace(/<table>/g, '<div class="table-wrapper"><table>');
        html = html.replace(/<\/table>/g, '</table></div>');

        // Step 7: Enhance code blocks with toolbar (format + copy buttons)
        if (typeof CodeBlockEnhancer !== 'undefined') {
            html = CodeBlockEnhancer.processCodeBlocks(html);
        }

        // Step 8: Ensure headings have unique ids for TOC anchors
        html = this.ensureHeadingIds(html);

        return html;
    },

    /**
     * Re-render a single mermaid container with a new curve style.
     * @param {HTMLElement} container
     * @param {string} curve
     * @returns {Promise<void>}
     */
    async rerenderContainer(container, curve) {
        if (!container) throw new Error('图表容器不存在');

        const encoded = container.getAttribute('data-mermaid-source');
        if (!encoded) throw new Error('未找到图表源码');

        let code;
        try {
            code = decodeURIComponent(encoded);
        } catch (e) {
            throw new Error('图表源码解析失败');
        }

        const index = parseInt(container.getAttribute('data-chart-index') || '0', 10);
        const previousCurve = this.curve;
        const nextCurve = this.normalizeCurve(curve);
        let svg;
        try {
            this.applyMermaidConfig(nextCurve);
            svg = await this.renderMermaid(code, index);
        } finally {
            this.applyMermaidConfig(previousCurve);
        }
        this.setChartCurveOverride(code, index, nextCurve);

        const oldSvg = container.querySelector('svg[id^="mermaid-"]') ||
            container.querySelector(':scope > svg');
        if (oldSvg) {
            oldSvg.outerHTML = svg;
        } else {
            container.insertAdjacentHTML('beforeend', svg);
        }

        container.setAttribute('data-curve', nextCurve);

        const curveBtn = container.querySelector('.mermaid-curve-btn');
        if (curveBtn) {
            const meta = this.getCurveMeta(nextCurve);
            const iconPath = meta.next === 'orthogonal'
                ? '<path d="M4 6h8v12h8" stroke-linecap="round" stroke-linejoin="round"/>'
                : '<path d="M4 18c4-12 12 0 16-12" stroke-linecap="round"/>';
            curveBtn.setAttribute('data-curve', meta.value);
            curveBtn.setAttribute('title', `切换为${meta.nextLabel}`);
            curveBtn.setAttribute('aria-label', `切换连线样式为${meta.nextLabel}`);
            curveBtn.innerHTML =
                `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${iconPath}</svg> ${meta.nextLabel}`;
        }
    },

    /**
     * Assign unique id attributes to h1–h6 for TOC navigation.
     * @param {string} html - Rendered HTML
     * @returns {string}
     */
    ensureHeadingIds(html) {
        if (!html || typeof document === 'undefined') return html;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const headings = wrapper.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (!headings.length) return html;

        const used = Object.create(null);

        headings.forEach((heading) => {
            const existing = heading.getAttribute('id');
            if (existing) {
                used[existing] = (used[existing] || 0) + 1;
                return;
            }

            const base = this.slugifyHeading(heading.textContent || '');
            let id = base;
            if (used[id]) {
                used[id] += 1;
                id = `${base}-${used[id]}`;
            } else {
                used[id] = 1;
            }
            heading.setAttribute('id', id);
        });

        return wrapper.innerHTML;
    },

    /**
     * Build a URL-safe slug from heading text.
     * @param {string} text
     * @returns {string}
     */
    slugifyHeading(text) {
        const slug = String(text)
            .trim()
            .toLowerCase()
            .replace(/[\s\u3000]+/g, '-')
            .replace(/[^\w\u4e00-\u9fff-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        return slug || 'heading';
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
            if (this.isOrthogonalCurve(this.curve)) {
                return this.cleanOrthogonalSvg(svg);
            }
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
