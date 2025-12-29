// Chart Exporter Module
// Handles exporting Mermaid diagrams as SVG and PNG

const ChartExporter = {
    /**
     * Export SVG element as an SVG file
     * @param {SVGElement} svgElement - The SVG element to export
     * @param {string} filename - The filename (without extension)
     */
    exportAsSVG(svgElement, filename = 'chart') {
        if (!svgElement) {
            console.error('No SVG element provided');
            return;
        }

        // Clone the SVG to avoid modifying the original
        const clonedSvg = svgElement.cloneNode(true);

        // Ensure the SVG has proper attributes for standalone file
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        // Get the SVG string
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(clonedSvg);

        // Add XML declaration
        svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString;

        // Create blob and download
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        this.downloadBlob(blob, filename + '.svg');
    },

    /**
     * Export SVG element as a PNG file
     * @param {SVGElement} svgElement - The SVG element to export
     * @param {string} filename - The filename (without extension)
     * @param {number} scale - Scale factor for higher resolution (default: 2 for retina)
     */
    async exportAsPNG(svgElement, filename = 'chart', scale = 2) {
        if (!svgElement) {
            console.error('No SVG element provided');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                // Clone the SVG
                const clonedSvg = svgElement.cloneNode(true);
                clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

                // Get SVG dimensions - prefer viewBox, then getBBox, then clientWidth/Height
                let numWidth, numHeight;

                const viewBox = svgElement.getAttribute('viewBox');
                if (viewBox) {
                    // Parse viewBox: "minX minY width height"
                    const parts = viewBox.split(/\s+/).map(parseFloat);
                    if (parts.length >= 4) {
                        numWidth = parts[2];
                        numHeight = parts[3];
                    }
                }

                // Fallback to getBBox or clientWidth/Height if viewBox not available
                if (!numWidth || !numHeight) {
                    const bbox = svgElement.getBBox();
                    numWidth = bbox.width || svgElement.clientWidth || 400;
                    numHeight = bbox.height || svgElement.clientHeight || 300;
                }

                // Set explicit width/height on cloned SVG to ensure correct rendering
                clonedSvg.setAttribute('width', numWidth);
                clonedSvg.setAttribute('height', numHeight);
                clonedSvg.removeAttribute('style'); // Remove max-width style that might interfere

                // Serialize SVG
                const serializer = new XMLSerializer();
                const svgString = serializer.serializeToString(clonedSvg);

                // Use Data URL (base64) instead of Object URL to avoid tainted canvas in file:// protocol
                const base64Svg = btoa(unescape(encodeURIComponent(svgString)));
                const dataUrl = 'data:image/svg+xml;base64,' + base64Svg;

                // Create image
                const img = new Image();

                img.onload = () => {
                    // Create canvas with scaled dimensions
                    const canvas = document.createElement('canvas');
                    canvas.width = numWidth * scale;
                    canvas.height = numHeight * scale;

                    const ctx = canvas.getContext('2d');

                    // Fill with white background (optional, for transparent SVGs)
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Scale and draw
                    ctx.scale(scale, scale);
                    ctx.drawImage(img, 0, 0, numWidth, numHeight);

                    // Convert to PNG and download
                    canvas.toBlob((blob) => {
                        if (blob) {
                            this.downloadBlob(blob, filename + '.png');
                            resolve();
                        } else {
                            reject(new Error('Failed to create PNG blob'));
                        }
                    }, 'image/png', 1.0);
                };

                img.onerror = (error) => {
                    reject(new Error('Failed to load SVG for PNG conversion'));
                };

                img.src = dataUrl;

            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Download a blob as a file
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
     * Generate a filename from the chart index
     * @param {number} index - The chart index
     * @returns {string} - The generated filename
     */
    generateFilename(index) {
        const timestamp = new Date().toISOString().slice(0, 10);
        return `mermaid-chart-${index + 1}-${timestamp}`;
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ChartExporter = ChartExporter;
}
