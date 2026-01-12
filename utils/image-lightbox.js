// Image Lightbox Component
// Provides fullscreen viewing for Mermaid diagrams and images
// With zoom and pan support

const ImageLightbox = {
    overlay: null,
    content: null,
    imageWrapper: null,
    closeBtn: null,
    zoomControls: null,
    hint: null,
    isOpen: false,

    // Zoom and pan state
    scale: 1,
    minScale: 0.1,
    maxScale: 5,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    lastTranslateX: 0,
    lastTranslateY: 0,

    /**
     * Initialize the lightbox DOM structure
     */
    init() {
        if (this.overlay) return; // Already initialized

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'lightbox-overlay';
        this.overlay.innerHTML = `
            <button class="lightbox-close" title="关闭 (ESC)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="lightbox-zoom-controls">
                <button class="lightbox-zoom-btn" data-action="zoom-in" title="放大 (+)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        <line x1="11" y1="8" x2="11" y2="14"></line>
                        <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                </button>
                <button class="lightbox-zoom-btn" data-action="zoom-out" title="缩小 (-)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                </button>
                <button class="lightbox-zoom-btn" data-action="reset" title="重置 (0)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                        <path d="M3 3v5h5"></path>
                    </svg>
                </button>
                <button class="lightbox-zoom-btn" data-action="fit" title="适应窗口 (F)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                </button>
                <span class="lightbox-zoom-level">100%</span>
            </div>
            <div class="lightbox-content">
                <div class="lightbox-image-wrapper"></div>
            </div>
            <div class="lightbox-hint">滚轮缩放 | 拖动平移 | 按 ESC 关闭</div>
        `;

        document.body.appendChild(this.overlay);

        // Cache elements
        this.content = this.overlay.querySelector('.lightbox-content');
        this.imageWrapper = this.overlay.querySelector('.lightbox-image-wrapper');
        this.closeBtn = this.overlay.querySelector('.lightbox-close');
        this.zoomControls = this.overlay.querySelector('.lightbox-zoom-controls');
        this.zoomLevel = this.overlay.querySelector('.lightbox-zoom-level');
        this.hint = this.overlay.querySelector('.lightbox-hint');

        // Bind close button
        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.close();
        });

        // Click on overlay (not content) to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay || e.target === this.content) {
                this.close();
            }
        });

        // Prevent content clicks from closing
        this.imageWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Zoom control buttons
        this.zoomControls.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            switch (action) {
                case 'zoom-in':
                    this.zoom(1.25);
                    break;
                case 'zoom-out':
                    this.zoom(0.8);
                    break;
                case 'reset':
                    this.resetZoom();
                    break;
                case 'fit':
                    this.fitToWindow();
                    break;
            }
        });

        // Mouse wheel zoom
        this.content.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(delta, e.clientX, e.clientY);
        }, { passive: false });

        // Drag to pan
        this.imageWrapper.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            this.isDragging = true;
            this.startX = e.clientX;
            this.startY = e.clientY;
            this.lastTranslateX = this.translateX;
            this.lastTranslateY = this.translateY;
            this.imageWrapper.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isOpen) return;
            const dx = e.clientX - this.startX;
            const dy = e.clientY - this.startY;
            this.translateX = this.lastTranslateX + dx;
            this.translateY = this.lastTranslateY + dy;
            this.updateTransform();
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.imageWrapper.style.cursor = 'grab';
            }
        });

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            switch (e.key) {
                case 'Escape':
                    this.close();
                    break;
                case '+':
                case '=':
                    this.zoom(1.25);
                    break;
                case '-':
                case '_':
                    this.zoom(0.8);
                    break;
                case '0':
                    this.resetZoom();
                    break;
                case 'f':
                case 'F':
                    this.fitToWindow();
                    break;
            }
        });
    },

    /**
     * Zoom by a factor
     * @param {number} factor - Zoom factor (> 1 to zoom in, < 1 to zoom out)
     * @param {number} centerX - Center X coordinate for zoom
     * @param {number} centerY - Center Y coordinate for zoom
     */
    zoom(factor, centerX, centerY) {
        const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));

        if (centerX !== undefined && centerY !== undefined) {
            // Zoom towards mouse position
            const rect = this.imageWrapper.getBoundingClientRect();
            const offsetX = centerX - rect.left - rect.width / 2;
            const offsetY = centerY - rect.top - rect.height / 2;

            const scaleRatio = newScale / this.scale;
            this.translateX -= offsetX * (scaleRatio - 1);
            this.translateY -= offsetY * (scaleRatio - 1);
        }

        this.scale = newScale;
        this.updateTransform();
        this.updateZoomLevel();
    },

    /**
     * Reset zoom and position
     */
    resetZoom() {
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.updateTransform();
        this.updateZoomLevel();
    },

    /**
     * Fit image to window
     */
    fitToWindow() {
        const img = this.imageWrapper.firstElementChild;
        if (!img) return;

        const contentRect = this.content.getBoundingClientRect();
        const imgWidth = img.scrollWidth || img.offsetWidth || 800;
        const imgHeight = img.scrollHeight || img.offsetHeight || 600;

        const scaleX = (contentRect.width - 48) / imgWidth;
        const scaleY = (contentRect.height - 48) / imgHeight;

        this.scale = Math.min(scaleX, scaleY, 1);
        this.translateX = 0;
        this.translateY = 0;
        this.updateTransform();
        this.updateZoomLevel();
    },

    /**
     * Update the transform CSS
     */
    updateTransform() {
        this.imageWrapper.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    },

    /**
     * Update zoom level display
     */
    updateZoomLevel() {
        if (this.zoomLevel) {
            this.zoomLevel.textContent = `${Math.round(this.scale * 100)}%`;
        }
    },

    /**
     * Open the lightbox with content
     * @param {Element|string} content - The content to display (can be HTML string or element)
     * @param {string} type - Content type: 'svg', 'image', or 'html'
     */
    open(content, type = 'svg') {
        this.init();

        // Reset zoom state
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;

        // Clear previous content
        this.imageWrapper.innerHTML = '';
        this.imageWrapper.style.transform = '';
        this.imageWrapper.style.cursor = 'grab';

        if (typeof content === 'string') {
            this.imageWrapper.innerHTML = content;
        } else if (content instanceof Element) {
            const clone = content.cloneNode(true);
            // Remove export buttons from cloned content
            const exportBtns = clone.querySelectorAll('.mermaid-export-buttons, .mermaid-toolbar');
            exportBtns.forEach(btn => btn.remove());
            this.imageWrapper.appendChild(clone);
        }

        // Show overlay
        this.overlay.classList.add('visible');
        this.isOpen = true;
        this.updateZoomLevel();

        // Prevent body scrolling
        document.body.style.overflow = 'hidden';
    },

    /**
     * Open lightbox with a Mermaid diagram
     * @param {HTMLElement} mermaidContainer - The mermaid-container element
     */
    openMermaid(mermaidContainer) {
        if (!mermaidContainer) return;

        // Find the Mermaid diagram SVG element
        let svg = mermaidContainer.querySelector('svg[id^="mermaid-"]');

        if (!svg) {
            const allSvgs = mermaidContainer.querySelectorAll('svg');
            for (const s of allSvgs) {
                if (!s.closest('.mermaid-toolbar') && !s.closest('.mermaid-export-buttons')) {
                    svg = s;
                    break;
                }
            }
        }

        if (svg) {
            const svgClone = svg.cloneNode(true);

            // Keep original dimensions for proper scaling
            svgClone.style.display = 'block';
            svgClone.style.maxWidth = 'none';
            svgClone.style.maxHeight = 'none';

            this.open(svgClone, 'svg');

            // After opening, fit to window if larger than viewport
            setTimeout(() => {
                const wrapper = this.imageWrapper.firstElementChild;
                if (wrapper) {
                    const rect = wrapper.getBoundingClientRect();
                    const contentRect = this.content.getBoundingClientRect();
                    if (rect.width > contentRect.width || rect.height > contentRect.height) {
                        this.fitToWindow();
                    }
                }
            }, 50);
        }
    },

    /**
     * Close the lightbox
     */
    close() {
        if (!this.isOpen) return;

        this.overlay.classList.remove('visible');
        this.isOpen = false;
        this.isDragging = false;

        // Restore body scrolling
        document.body.style.overflow = '';

        // Clear content after animation
        setTimeout(() => {
            if (!this.isOpen) {
                this.imageWrapper.innerHTML = '';
                this.resetZoom();
            }
        }, 300);
    }
};

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ImageLightbox = ImageLightbox;
}
