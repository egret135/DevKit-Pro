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
     * Maximum canvas dimension to avoid browser limits
     * Most browsers limit canvas to around 16384px or 32767px
     * We use a conservative limit considering scale factor of 2
     */
    MAX_CANVAS_DIMENSION: 8000,  // 8000 * 2 (scale) = 16000, within limits

    /**
     * Padding values for export (used in prepareForExport and chunked exports)
     */
    EXPORT_PADDING_X: 40,
    EXPORT_PADDING_Y: 30,

    /**
     * Create a clone of the element for export with fixed dimensions
     * @param {HTMLElement} previewElement - The markdown preview element
     * @returns {Promise<{wrapper: HTMLElement, width: number, height: number}>}
     */
    async prepareForExport(previewElement) {
        // Check if we're in fullscreen mode (check parent workspace)
        const markdownWorkspace = document.getElementById('markdownWorkspace');
        const isFullscreen = markdownWorkspace && markdownWorkspace.classList.contains('fullscreen-preview');

        // Determine export width based on fullscreen state
        // Normal mode: 860px max-width, Fullscreen mode: 1450px max-width
        const exportMaxWidth = isFullscreen ? 1450 : 860;

        // Add padding for visual comfort (matches the container padding)
        const paddingX = this.EXPORT_PADDING_X;
        const paddingY = this.EXPORT_PADDING_Y;

        // === FIX: Accurate height measurement ===
        // Step 1: Temporarily expand the parent container to measure true content height
        const parentContainer = previewElement.parentElement;
        const originalParentStyles = {
            overflow: parentContainer.style.overflow,
            height: parentContainer.style.height,
            maxHeight: parentContainer.style.maxHeight
        };

        // Temporarily remove scroll constraints
        parentContainer.style.overflow = 'visible';
        parentContainer.style.height = 'auto';
        parentContainer.style.maxHeight = 'none';

        // Force reflow
        void previewElement.offsetHeight;

        // Step 2: Create a temporary offscreen container to measure the true height
        const measureContainer = document.createElement('div');
        measureContainer.style.cssText = `
            position: absolute;
            left: -9999px;
            top: 0;
            width: ${exportMaxWidth}px;
            height: auto;
            overflow: visible;
            visibility: hidden;
        `;

        const measureClone = previewElement.cloneNode(true);
        measureClone.style.cssText = `
            width: ${exportMaxWidth}px;
            max-width: ${exportMaxWidth}px;
            height: auto;
            overflow: visible;
            margin: 0;
            padding: 0;
        `;

        measureContainer.appendChild(measureClone);
        document.body.appendChild(measureContainer);

        // Wait for layout
        await new Promise(resolve => setTimeout(resolve, 100));

        // Measure true content height from the offscreen clone
        const measuredHeight = measureClone.scrollHeight;
        const measuredOffsetHeight = measureClone.offsetHeight;

        // Also measure by iterating through children
        let maxChildBottom = 0;
        const allChildren = measureClone.querySelectorAll('*');
        allChildren.forEach(el => {
            const bottom = el.offsetTop + el.offsetHeight;
            if (bottom > maxChildBottom) maxChildBottom = bottom;
        });

        // Use the maximum of all measurements for safety
        const trueContentHeight = Math.max(measuredHeight, measuredOffsetHeight, maxChildBottom);

        // Remove measure container
        document.body.removeChild(measureContainer);

        // Restore parent container styles
        parentContainer.style.overflow = originalParentStyles.overflow;
        parentContainer.style.height = originalParentStyles.height;
        parentContainer.style.maxHeight = originalParentStyles.maxHeight;

        // Calculate initial dimensions with padding
        const contentWidth = exportMaxWidth + paddingX * 2;
        // Initial height estimate (will be re-measured after SVG conversion)
        const initialHeightEstimate = trueContentHeight + paddingY * 2;

        console.log('[prepareForExport] Initial height measurement:', {
            measuredHeight,
            measuredOffsetHeight,
            maxChildBottom,
            trueContentHeight,
            initialHeightEstimate
        });

        // Create a wrapper div that will contain the clone
        // IMPORTANT: Use auto height initially to allow content to expand naturally
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed;
            left: -9999px;
            top: 0;
            width: ${contentWidth}px;
            height: auto;
            min-height: ${initialHeightEstimate}px;
            background: #FFFFFF;
            overflow: visible;
            z-index: -1;
            padding: ${paddingY}px ${paddingX}px;
            box-sizing: border-box;
        `;

        // Clone the preview element
        const clone = previewElement.cloneNode(true);

        // Use setProperty with 'important' priority to override CSS max-width
        // This is more reliable than injecting style tags for html2canvas
        clone.style.setProperty('width', `${exportMaxWidth}px`, 'important');
        clone.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
        clone.style.setProperty('height', 'auto', 'important');
        clone.style.setProperty('min-height', 'auto', 'important');
        clone.style.setProperty('max-height', 'none', 'important');
        clone.style.setProperty('overflow', 'visible', 'important');
        clone.style.setProperty('background', 'transparent');
        clone.style.setProperty('padding', '0');
        clone.style.setProperty('margin', '0');
        clone.style.setProperty('box-sizing', 'border-box');
        clone.style.setProperty('display', 'block', 'important');

        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);

        // Wait for initial layout
        await new Promise(resolve => setTimeout(resolve, 100));

        // Handle SVG conversion to ensure visibility in html2canvas
        // IMPORTANT: Do this BEFORE final height measurement
        await this.convertSvgsToImages(wrapper);

        // Wait for SVG conversion to complete and layout to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));

        // === FINAL HEIGHT MEASUREMENT (after SVG conversion) ===
        // Measure the clone's actual rendered height
        const cloneScrollHeight = clone.scrollHeight;
        const cloneOffsetHeight = clone.offsetHeight;

        // Also measure by iterating through all children of the clone
        let maxCloneChildBottom = 0;
        const cloneChildren = clone.querySelectorAll('*');
        cloneChildren.forEach(el => {
            const bottom = el.offsetTop + el.offsetHeight;
            if (bottom > maxCloneChildBottom) maxCloneChildBottom = bottom;
        });

        // Use the maximum of all measurements
        const actualCloneHeight = Math.max(cloneScrollHeight, cloneOffsetHeight, maxCloneChildBottom);

        // Add padding and safety margin
        const SAFETY_MARGIN = 5; // Small safety margin to prevent edge-case truncation
        const finalWidth = contentWidth;
        const finalHeight = actualCloneHeight + paddingY * 2 + SAFETY_MARGIN;

        console.log('[prepareForExport] Final height measurement (after SVG conversion):', {
            cloneScrollHeight,
            cloneOffsetHeight,
            maxCloneChildBottom,
            actualCloneHeight,
            finalHeight
        });

        // Update wrapper to use fixed final dimensions for html2canvas
        wrapper.style.height = `${finalHeight}px`;
        wrapper.style.minHeight = `${finalHeight}px`;

        // Final wait for layout to settle
        await new Promise(resolve => setTimeout(resolve, 50));

        console.log('[prepareForExport] Fullscreen:', isFullscreen, 'Export width:', exportMaxWidth, 'Final dimensions:', finalWidth, 'x', finalHeight);

        return {
            wrapper: wrapper,
            width: finalWidth,
            height: finalHeight,
            isFullscreen: isFullscreen,
            exportMaxWidth: exportMaxWidth
        };
    },

    /**
     * Converts inline SVGs to PNG Images
     * This fixes html2canvas issues with complex SVGs (like Mermaid)
     * by rendering SVG to Canvas first, then converting to PNG data URI
     * @param {HTMLElement} container
     */
    async convertSvgsToImages(container) {
        const svgs = container.querySelectorAll('svg');
        if (svgs.length === 0) return;

        console.log('[SVG转换] 找到', svgs.length, '个SVG');

        const tasks = Array.from(svgs).map(async (svg, index) => {
            try {
                // Get dimensions first
                let width = 0;
                let height = 0;

                // Try viewBox first
                const viewBox = svg.getAttribute('viewBox');
                if (viewBox) {
                    const parts = viewBox.split(/[\s,]+/);
                    if (parts.length >= 4) {
                        width = parseFloat(parts[2]) || 0;
                        height = parseFloat(parts[3]) || 0;
                    }
                }

                // Try width/height attributes
                if (!width) width = parseFloat(svg.getAttribute('width')) || 0;
                if (!height) height = parseFloat(svg.getAttribute('height')) || 0;

                // Try scrollWidth/Height
                if (!width) width = svg.scrollWidth || 0;
                if (!height) height = svg.scrollHeight || 0;

                // Try computed style
                if (!width || !height) {
                    const computed = window.getComputedStyle(svg);
                    if (!width) width = parseFloat(computed.width) || 0;
                    if (!height) height = parseFloat(computed.height) || 0;
                }

                // Last resort
                if (!width || !height) {
                    const rect = svg.getBoundingClientRect();
                    if (!width) width = rect.width || 300;
                    if (!height) height = rect.height || 150;
                }

                width = Math.max(width, 50);
                height = Math.max(height, 50);

                // Serialize SVG to data URI
                const xml = new XMLSerializer().serializeToString(svg);
                const svg64 = btoa(unescape(encodeURIComponent(xml)));
                const svgDataUri = 'data:image/svg+xml;base64,' + svg64;

                // Load SVG into temporary image
                const tempImg = new Image();
                tempImg.width = width;
                tempImg.height = height;

                const loadPromise = new Promise((resolve, reject) => {
                    tempImg.onload = resolve;
                    tempImg.onerror = reject;
                });
                tempImg.src = svgDataUri;

                try {
                    await loadPromise;
                } catch (e) {
                    console.warn('[SVG转换] SVG', index, '加载失败');
                    return;
                }

                // Create canvas and draw SVG
                const canvas = document.createElement('canvas');
                const scale = 2; // Higher resolution
                canvas.width = width * scale;
                canvas.height = height * scale;

                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'transparent';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);

                // Convert canvas to PNG data URI
                const pngDataUri = canvas.toDataURL('image/png', 1.0);

                // Create final PNG image element
                const pngImg = new Image();
                pngImg.src = pngDataUri;
                pngImg.width = width;
                pngImg.height = height;
                pngImg.style.width = width + 'px';
                pngImg.style.height = height + 'px';
                pngImg.style.display = 'inline-block';

                // Wait for PNG image to load
                await new Promise((resolve) => {
                    pngImg.onload = resolve;
                    pngImg.onerror = resolve;
                });

                if (svg.parentNode) {
                    svg.parentNode.replaceChild(pngImg, svg);
                }
            } catch (e) {
                console.error('[SVG转换] 错误:', e);
            }
        });

        await Promise.all(tasks);
        console.log('[SVG转换] 完成，已转换', svgs.length, '个SVG为PNG');
    },

    /**
     * Export markdown preview as PNG using html2canvas
     * Supports chunked export for content exceeding browser canvas limits
     * @param {HTMLElement} previewElement - The markdown preview element
     */
    async exportAsPNG(previewElement) {
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas library not loaded');
        }

        this.showLoading();
        console.log('[DEBUG exportAsPNG] Starting export...');

        let wrapper = null;
        try {
            const prepareResult = await this.prepareForExport(previewElement);
            wrapper = prepareResult.wrapper;
            const { width, height, isFullscreen, exportMaxWidth } = prepareResult;

            console.log('[DEBUG exportAsPNG] Content dimensions - width:', width, 'height:', height, 'fullscreen:', isFullscreen);

            // Calculate if we need chunked export
            const maxDimension = this.MAX_CANVAS_DIMENSION;
            const needsChunking = height > maxDimension;

            if (needsChunking) {
                console.log('[DEBUG exportAsPNG] Content exceeds limit, using chunked export');
                await this.exportPNGChunked(wrapper, width, height, maxDimension, isFullscreen, exportMaxWidth);
            } else {
                await this.exportPNGSingle(wrapper, width, height, isFullscreen, exportMaxWidth);
            }

            // Cleanup wrapper
            if (wrapper && wrapper.parentNode) {
                document.body.removeChild(wrapper);
                wrapper = null;
            }

            this.hideLoading();
            console.log('[DEBUG exportAsPNG] Export completed successfully');

        } catch (error) {
            if (wrapper && wrapper.parentNode) {
                document.body.removeChild(wrapper);
            }
            this.hideLoading();
            console.error('PNG export failed:', error);
            throw error;
        }
    },

    /**
     * Export a single PNG (when content fits within limits)
     */
    async exportPNGSingle(wrapper, width, height, isFullscreen, exportMaxWidth) {
        const canvas = await html2canvas(wrapper, {
            width: width,
            height: height,
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#FFFFFF',
            logging: false,
            onclone: (clonedDoc) => {
                // Remove toolbars
                const toolbars = clonedDoc.querySelectorAll('.mermaid-toolbar, .mermaid-export-buttons, .code-block-toolbar');
                toolbars.forEach(tb => tb.remove());

                // Force fullscreen width on markdown-preview elements
                if (isFullscreen && exportMaxWidth) {
                    const previews = clonedDoc.querySelectorAll('.markdown-preview');
                    previews.forEach(preview => {
                        preview.style.setProperty('width', `${exportMaxWidth}px`, 'important');
                        preview.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
                    });
                }
            }
        });

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create PNG blob'));
                }
            }, 'image/png', 1.0);
        });

        this.downloadBlob(blob, this.generateFilename('png'));
    },

    /**
     * Export multiple PNG chunks when content is too large
     */
    async exportPNGChunked(wrapper, totalWidth, totalHeight, chunkHeight, isFullscreen, exportMaxWidth) {
        const numChunks = Math.ceil(totalHeight / chunkHeight);
        console.log('[DEBUG exportPNGChunked] Splitting into', numChunks, 'chunks');

        const clone = wrapper.firstElementChild;
        if (!clone) {
            throw new Error('No content element found in wrapper');
        }

        const baseFilename = this.generateFilename('png').replace('.png', '');

        for (let i = 0; i < numChunks; i++) {
            const yOffset = i * chunkHeight;
            const currentChunkHeight = Math.min(chunkHeight, totalHeight - yOffset);

            console.log('[DEBUG exportPNGChunked] Processing chunk', i + 1, '/', numChunks);

            // Create a temporary container for this chunk with proper padding
            const paddingX = this.EXPORT_PADDING_X;
            const paddingY = this.EXPORT_PADDING_Y;

            const chunkWrapper = document.createElement('div');
            chunkWrapper.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                width: ${totalWidth}px;
                height: ${currentChunkHeight}px;
                background: #FFFFFF;
                overflow: hidden;
                padding: ${paddingY}px ${paddingX}px;
                box-sizing: border-box;
            `;

            const chunkClone = clone.cloneNode(true);
            chunkClone.style.cssText = `
                position: absolute;
                left: ${paddingX}px;
                top: ${-yOffset + paddingY}px;
                width: calc(100% - ${paddingX * 2}px);
            `;

            chunkWrapper.appendChild(chunkClone);
            document.body.appendChild(chunkWrapper);

            // Re-convert any SVGs in this chunk
            await this.convertSvgsToImages(chunkWrapper);

            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const canvas = await html2canvas(chunkWrapper, {
                    width: totalWidth,
                    height: currentChunkHeight,
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: '#FFFFFF',
                    logging: false,
                    onclone: (clonedDoc) => {
                        const toolbars = clonedDoc.querySelectorAll('.mermaid-toolbar, .mermaid-export-buttons, .code-block-toolbar');
                        toolbars.forEach(tb => tb.remove());

                        if (isFullscreen && exportMaxWidth) {
                            const previews = clonedDoc.querySelectorAll('.markdown-preview');
                            previews.forEach(preview => {
                                preview.style.setProperty('width', `${exportMaxWidth}px`, 'important');
                                preview.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
                            });
                        }
                    }
                });

                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create PNG blob for chunk ' + (i + 1)));
                        }
                    }, 'image/png', 1.0);
                });

                const filename = numChunks > 1 ? `${baseFilename}-part${i + 1}.png` : `${baseFilename}.png`;
                this.downloadBlob(blob, filename);

                if (i < numChunks - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }

            } finally {
                if (chunkWrapper.parentNode) {
                    document.body.removeChild(chunkWrapper);
                }
            }
        }

        console.log('[DEBUG exportPNGChunked] All', numChunks, 'chunks exported');
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

        let wrapper = null;
        try {
            const prepareResult = await this.prepareForExport(previewElement);
            wrapper = prepareResult.wrapper;
            const { width, height, isFullscreen, exportMaxWidth } = prepareResult;

            console.log('[DEBUG exportAsJPG] Content dimensions - width:', width, 'height:', height, 'fullscreen:', isFullscreen);

            // Calculate if we need chunked export
            const maxDimension = this.MAX_CANVAS_DIMENSION;
            const needsChunking = height > maxDimension;

            if (needsChunking) {
                console.log('[DEBUG exportAsJPG] Content exceeds limit, using chunked export');
                await this.exportJPGChunked(wrapper, width, height, maxDimension, isFullscreen, exportMaxWidth);
            } else {
                await this.exportJPGSingle(wrapper, width, height, isFullscreen, exportMaxWidth);
            }

            // Cleanup wrapper
            if (wrapper && wrapper.parentNode) {
                document.body.removeChild(wrapper);
                wrapper = null;
            }

            this.hideLoading();
            console.log('[DEBUG exportAsJPG] Export completed successfully');

        } catch (error) {
            if (wrapper && wrapper.parentNode) {
                document.body.removeChild(wrapper);
            }
            this.hideLoading();
            console.error('JPG export failed:', error);
            throw error;
        }
    },

    /**
     * Export a single JPG (when content fits within limits)
     */
    async exportJPGSingle(wrapper, width, height, isFullscreen, exportMaxWidth) {
        const canvas = await html2canvas(wrapper, {
            width: width,
            height: height,
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#FFFFFF',
            logging: false,
            onclone: (clonedDoc) => {
                const toolbars = clonedDoc.querySelectorAll('.mermaid-toolbar, .mermaid-export-buttons, .code-block-toolbar');
                toolbars.forEach(tb => tb.remove());

                if (isFullscreen && exportMaxWidth) {
                    const previews = clonedDoc.querySelectorAll('.markdown-preview');
                    previews.forEach(preview => {
                        preview.style.setProperty('width', `${exportMaxWidth}px`, 'important');
                        preview.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
                    });
                }
            }
        });

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to create JPG blob'));
                }
            }, 'image/jpeg', 0.92);
        });

        this.downloadBlob(blob, this.generateFilename('jpg'));
    },

    /**
     * Export multiple JPG chunks when content is too large
     */
    async exportJPGChunked(wrapper, totalWidth, totalHeight, chunkHeight, isFullscreen, exportMaxWidth) {
        const numChunks = Math.ceil(totalHeight / chunkHeight);
        console.log('[DEBUG exportJPGChunked] Splitting into', numChunks, 'chunks');

        const clone = wrapper.firstElementChild;
        if (!clone) {
            throw new Error('No content element found in wrapper');
        }

        const baseFilename = this.generateFilename('jpg').replace('.jpg', '');

        for (let i = 0; i < numChunks; i++) {
            const yOffset = i * chunkHeight;
            const currentChunkHeight = Math.min(chunkHeight, totalHeight - yOffset);

            console.log('[DEBUG exportJPGChunked] Processing chunk', i + 1, '/', numChunks);

            // Create a temporary container for this chunk with proper padding
            const paddingX = this.EXPORT_PADDING_X;
            const paddingY = this.EXPORT_PADDING_Y;

            const chunkWrapper = document.createElement('div');
            chunkWrapper.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                width: ${totalWidth}px;
                height: ${currentChunkHeight}px;
                background: #FFFFFF;
                overflow: hidden;
                padding: ${paddingY}px ${paddingX}px;
                box-sizing: border-box;
            `;

            const chunkClone = clone.cloneNode(true);
            chunkClone.style.cssText = `
                position: absolute;
                left: ${paddingX}px;
                top: ${-yOffset + paddingY}px;
                width: calc(100% - ${paddingX * 2}px);
            `;

            chunkWrapper.appendChild(chunkClone);
            document.body.appendChild(chunkWrapper);

            // Re-convert any SVGs in this chunk
            await this.convertSvgsToImages(chunkWrapper);

            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const canvas = await html2canvas(chunkWrapper, {
                    width: totalWidth,
                    height: currentChunkHeight,
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: '#FFFFFF',
                    logging: false,
                    onclone: (clonedDoc) => {
                        const toolbars = clonedDoc.querySelectorAll('.mermaid-toolbar, .mermaid-export-buttons, .code-block-toolbar');
                        toolbars.forEach(tb => tb.remove());

                        if (isFullscreen && exportMaxWidth) {
                            const previews = clonedDoc.querySelectorAll('.markdown-preview');
                            previews.forEach(preview => {
                                preview.style.setProperty('width', `${exportMaxWidth}px`, 'important');
                                preview.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
                            });
                        }
                    }
                });

                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create JPG blob for chunk ' + (i + 1)));
                        }
                    }, 'image/jpeg', 0.92);
                });

                const filename = numChunks > 1 ? `${baseFilename}-part${i + 1}.jpg` : `${baseFilename}.jpg`;
                this.downloadBlob(blob, filename);

                if (i < numChunks - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }

            } finally {
                if (chunkWrapper.parentNode) {
                    document.body.removeChild(chunkWrapper);
                }
            }
        }

        console.log('[DEBUG exportJPGChunked] All', numChunks, 'chunks exported');
    },

    /**
     * Export markdown preview as SVG
     * Note: SVG export captures the HTML as an embedded image in SVG format
     * Supports chunked export for content exceeding browser canvas limits
     * @param {HTMLElement} previewElement - The markdown preview element
     */
    async exportAsSVG(previewElement) {
        this.showLoading();
        console.log('[DEBUG exportAsSVG] Starting export...');

        let wrapper = null;
        try {
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded');
            }

            const prepareResult = await this.prepareForExport(previewElement);
            wrapper = prepareResult.wrapper;
            const { width, height, isFullscreen, exportMaxWidth } = prepareResult;

            console.log('[DEBUG exportAsSVG] Content dimensions - width:', width, 'height:', height, 'fullscreen:', isFullscreen);

            // Calculate if we need chunked export
            const maxDimension = this.MAX_CANVAS_DIMENSION;
            const needsChunking = height > maxDimension;

            if (needsChunking) {
                console.log('[DEBUG exportAsSVG] Content exceeds limit, using chunked export');
                await this.exportSVGChunked(wrapper, width, height, maxDimension, isFullscreen, exportMaxWidth);
            } else {
                // Single export
                await this.exportSVGSingle(wrapper, width, height, isFullscreen, exportMaxWidth);
            }

            // Cleanup wrapper
            if (wrapper && wrapper.parentNode) {
                document.body.removeChild(wrapper);
                wrapper = null;
            }

            this.hideLoading();
            console.log('[DEBUG exportAsSVG] Export completed successfully');

        } catch (error) {
            if (wrapper && wrapper.parentNode) {
                document.body.removeChild(wrapper);
            }
            this.hideLoading();
            console.error('[DEBUG exportAsSVG] Export failed:', error);
            throw error;
        }
    },

    /**
     * Export a single SVG (when content fits within limits)
     */
    async exportSVGSingle(wrapper, width, height, isFullscreen, exportMaxWidth) {
        const canvas = await html2canvas(wrapper, {
            width: width,
            height: height,
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#FFFFFF',
            logging: false,
            onclone: (clonedDoc) => {
                const toolbars = clonedDoc.querySelectorAll('.mermaid-toolbar, .mermaid-export-buttons, .code-block-toolbar');
                toolbars.forEach(tb => tb.remove());

                if (isFullscreen && exportMaxWidth) {
                    const previews = clonedDoc.querySelectorAll('.markdown-preview');
                    previews.forEach(preview => {
                        preview.style.setProperty('width', `${exportMaxWidth}px`, 'important');
                        preview.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
                    });
                }
            }
        });

        const dataUrl = canvas.toDataURL('image/png', 1.0);
        console.log('[DEBUG exportSVGSingle] dataUrl length:', dataUrl.length);

        if (dataUrl === 'data:,' || dataUrl.length < 100) {
            throw new Error('Failed to generate image - canvas is empty');
        }

        const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width * 2} ${height * 2}">
    <image width="${width * 2}" height="${height * 2}" xlink:href="${dataUrl}"/>
</svg>`;

        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        this.downloadBlob(blob, this.generateFilename('svg'));
    },

    /**
     * Export multiple SVG chunks when content is too large
     */
    async exportSVGChunked(wrapper, totalWidth, totalHeight, chunkHeight, isFullscreen, exportMaxWidth) {
        const numChunks = Math.ceil(totalHeight / chunkHeight);
        console.log('[分片导出] 共', numChunks, '个分片, 总尺寸:', totalWidth, 'x', totalHeight);

        // Get the clone element inside wrapper
        const clone = wrapper.firstElementChild;
        if (!clone) {
            throw new Error('No content element found in wrapper');
        }

        // 检查原始内容中的 SVG 和 img 元素
        const origSvgs = clone.querySelectorAll('svg');
        const origImgs = clone.querySelectorAll('img[src^="data:image/svg"]');
        console.log('[分片导出] 原始内容 - SVG数量:', origSvgs.length, ', 已转换img数量:', origImgs.length);

        const baseFilename = this.generateFilename('svg').replace('.svg', '');

        for (let i = 0; i < numChunks; i++) {
            const yOffset = i * chunkHeight;
            const currentChunkHeight = Math.min(chunkHeight, totalHeight - yOffset);

            // Create a temporary container for this chunk with proper padding
            const paddingX = this.EXPORT_PADDING_X;
            const paddingY = this.EXPORT_PADDING_Y;

            const chunkWrapper = document.createElement('div');
            chunkWrapper.style.cssText = `
                position: fixed;
                left: -9999px;
                top: 0;
                width: ${totalWidth}px;
                height: ${currentChunkHeight}px;
                background: #FFFFFF;
                overflow: hidden;
                padding: ${paddingY}px ${paddingX}px;
                box-sizing: border-box;
            `;

            // Clone the content and position it to show the current chunk
            const chunkClone = clone.cloneNode(true);
            chunkClone.style.cssText = `
                position: absolute;
                left: ${paddingX}px;
                top: ${-yOffset + paddingY}px;
                width: calc(100% - ${paddingX * 2}px);
            `;

            chunkWrapper.appendChild(chunkClone);
            document.body.appendChild(chunkWrapper);

            // 统计分片内的 SVG
            const chunkSvgs = chunkWrapper.querySelectorAll('svg');
            const chunkImgs = chunkWrapper.querySelectorAll('img[src^="data:image/svg"]');
            console.log('[分片', i + 1, '/', numChunks, '] SVG:', chunkSvgs.length, 'img:', chunkImgs.length);

            // Re-convert any SVGs in this chunk
            await this.convertSvgsToImages(chunkWrapper);

            // Wait for layout
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                const canvas = await html2canvas(chunkWrapper, {
                    width: totalWidth,
                    height: currentChunkHeight,
                    scale: 2,
                    useCORS: true,
                    allowTaint: false,
                    backgroundColor: '#FFFFFF',
                    logging: false,
                    onclone: (clonedDoc) => {
                        const toolbars = clonedDoc.querySelectorAll('.mermaid-toolbar, .mermaid-export-buttons, .code-block-toolbar');
                        toolbars.forEach(tb => tb.remove());

                        if (isFullscreen && exportMaxWidth) {
                            const previews = clonedDoc.querySelectorAll('.markdown-preview');
                            previews.forEach(preview => {
                                preview.style.setProperty('width', `${exportMaxWidth}px`, 'important');
                                preview.style.setProperty('max-width', `${exportMaxWidth}px`, 'important');
                            });
                        }
                    }
                });

                const dataUrl = canvas.toDataURL('image/png', 1.0);

                if (dataUrl === 'data:,' || dataUrl.length < 100) {
                    console.warn('[分片', i + 1, '] Canvas 为空!');
                } else {
                    console.log('[分片', i + 1, '] dataUrl长度:', dataUrl.length);
                }

                const svgString = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${totalWidth * 2}" height="${currentChunkHeight * 2}" viewBox="0 0 ${totalWidth * 2} ${currentChunkHeight * 2}">
    <image width="${totalWidth * 2}" height="${currentChunkHeight * 2}" xlink:href="${dataUrl}"/>
</svg>`;

                const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const filename = numChunks > 1 ? `${baseFilename}-part${i + 1}.svg` : `${baseFilename}.svg`;
                this.downloadBlob(blob, filename);

                // Small delay between downloads to avoid browser blocking
                if (i < numChunks - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }

            } finally {
                // Cleanup chunk wrapper
                if (chunkWrapper.parentNode) {
                    document.body.removeChild(chunkWrapper);
                }
            }
        }

        console.log('[分片导出] 完成, 共导出', numChunks, '个文件');
    }
};

// Export for use in app.js
if (typeof window !== 'undefined') {
    window.MarkdownExporter = MarkdownExporter;
}
