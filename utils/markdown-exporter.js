// Markdown Content Exporter
// Exports rendered markdown content as PNG, JPG, or SVG images using html2canvas

const MarkdownExporter = {
    /**
     * Show loading overlay
     */
    showLoading() {
        let overlay = document.getElementById('exportLoadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'exportLoadingOverlay';
            overlay.className = 'export-loading-overlay';
            overlay.innerHTML = `
                <div class="export-loading-content">
                    <div class="export-spinner"></div>
                    <span>导出中...</span>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.classList.add('visible');
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('exportLoadingOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
        }
    },

    /**
     * Download blob as file
     * @param {Blob} blob - The blob to download
     * @param {string} filename - The filename
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Generate filename with timestamp
     * @param {string} extension - File extension
     * @returns {string}
     */
    generateFilename(extension) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
        return `markdown-export-${timestamp}.${extension}`;
    },

    /**
     * Create a clone of the element for export with fixed dimensions
     * @param {HTMLElement} previewElement - The markdown preview element
     * @returns {Promise<{wrapper: HTMLElement, width: number, height: number}>}
     */
    async prepareForExport(previewElement) {
        // Calculate the actual content bounds by measuring all child elements
        let maxBottom = 0;
        let maxRight = 0;
        const previewRect = previewElement.getBoundingClientRect();

        // Iterate through all descendants to find the true content bounds
        const allElements = previewElement.querySelectorAll('*');
        allElements.forEach(el => {
            const rect = el.getBoundingClientRect();
            const bottom = rect.bottom - previewRect.top;
            const right = rect.right - previewRect.left;
            if (bottom > maxBottom) maxBottom = bottom;
            if (right > maxRight) maxRight = right;
        });

        // Add padding for visual comfort (matches the container padding)
        const paddingX = 40;
        const paddingY = 30;

        // Calculate final dimensions
        // Use the larger of: measured content bounds or scrollWidth/Height
        const contentWidth = Math.max(maxRight, previewElement.scrollWidth) + paddingX * 2;
        const contentHeight = Math.max(maxBottom, previewElement.scrollHeight) + paddingY * 2;

        // Create a wrapper div that will contain the clone
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: ${contentWidth}px;
            height: ${contentHeight}px;
            background: #FFFFFF;
            overflow: visible;
            z-index: -1;
            padding: ${paddingY}px ${paddingX}px;
        `;

        // Clone the preview element
        const clone = previewElement.cloneNode(true);
        clone.style.cssText = `
            width: 100%;
            height: auto;
            overflow: visible;
            background: transparent;
            padding: 0;
            margin: 0;
        `;

        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);

        // Wait for layout and any images to load
        await new Promise(resolve => setTimeout(resolve, 200));

        // Re-measure the wrapper to get accurate final dimensions
        const wrapperRect = wrapper.getBoundingClientRect();
        const finalWidth = Math.max(contentWidth, wrapper.scrollWidth);
        const finalHeight = Math.max(contentHeight, wrapper.scrollHeight);

        // Update wrapper dimensions if needed
        wrapper.style.width = `${finalWidth}px`;
        wrapper.style.height = `${finalHeight}px`;

        return { wrapper, width: finalWidth, height: finalHeight };
    },

    /**
     * Export markdown preview as PNG using html2canvas
     * @param {HTMLElement} previewElement - The markdown preview element
     */
    async exportAsPNG(previewElement) {
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas library not loaded');
        }

        this.showLoading();

        try {
            const { wrapper, width, height } = await this.prepareForExport(previewElement);

            const canvas = await html2canvas(wrapper, {
                width: width,
                height: height,
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#FFFFFF',
                logging: false,
                onclone: (clonedDoc) => {
                    // Ensure Mermaid SVGs are visible
                    const svgs = clonedDoc.querySelectorAll('svg');
                    svgs.forEach(svg => {
                        svg.style.maxWidth = 'none';
                        svg.style.overflow = 'visible';
                    });
                }
            });

            // Cleanup
            document.body.removeChild(wrapper);

            canvas.toBlob((blob) => {
                if (blob) {
                    this.downloadBlob(blob, this.generateFilename('png'));
                    this.hideLoading();
                } else {
                    this.hideLoading();
                    throw new Error('Failed to create PNG');
                }
            }, 'image/png', 1.0);

        } catch (error) {
            this.hideLoading();
            throw error;
        }
    },

    /**
     * Export markdown preview as JPG using html2canvas
     * @param {HTMLElement} previewElement - The markdown preview element
     */
    async exportAsJPG(previewElement) {
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas library not loaded');
        }

        this.showLoading();

        try {
            const { wrapper, width, height } = await this.prepareForExport(previewElement);

            const canvas = await html2canvas(wrapper, {
                width: width,
                height: height,
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#FFFFFF',
                logging: false
            });

            // Cleanup
            document.body.removeChild(wrapper);

            canvas.toBlob((blob) => {
                if (blob) {
                    this.downloadBlob(blob, this.generateFilename('jpg'));
                    this.hideLoading();
                } else {
                    this.hideLoading();
                    throw new Error('Failed to create JPG');
                }
            }, 'image/jpeg', 0.92);

        } catch (error) {
            this.hideLoading();
            throw error;
        }
    },

    /**
     * Export markdown preview as SVG
     * Note: SVG export captures the HTML as foreignObject which may have limitations
     * @param {HTMLElement} previewElement - The markdown preview element
     */
    async exportAsSVG(previewElement) {
        this.showLoading();

        try {
            // For SVG, we take a screenshot approach using canvas then convert
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            const { wrapper, width, height } = await this.prepareForExport(previewElement);

            const canvas = await html2canvas(wrapper, {
                width: width,
                height: height,
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#FFFFFF',
                logging: false
            });

            // Cleanup
            document.body.removeChild(wrapper);

            // Convert canvas to SVG with embedded image
            const dataUrl = canvas.toDataURL('image/png', 1.0);
            const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width * 2} ${height * 2}">
    <image width="${width * 2}" height="${height * 2}" xlink:href="${dataUrl}"/>
</svg>`;

            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            this.downloadBlob(blob, this.generateFilename('svg'));
            this.hideLoading();

        } catch (error) {
            this.hideLoading();
            throw error;
        }
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.MarkdownExporter = MarkdownExporter;
}
