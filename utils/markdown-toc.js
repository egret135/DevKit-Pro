/**
 * MarkdownToc - Floating table of contents for Markdown preview
 * Corner layout (split view): 2 shallowest heading levels, bottom-right
 * Sidebar layout (fullscreen): up to 6 levels, left side
 * Supports collapsing nested heading branches (e.g. 3 hides 3.1 / 3.2).
 */
(function () {
    'use strict';

    const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
    const SPY_PAUSE_MS = 400;

    let containerEl = null;
    let hostEl = null;
    let workspaceEl = null;
    let rootEl = null;
    let listEl = null;
    let toggleBtn = null;
    let panelEl = null;
    let foldAllBtn = null;

    /** @type {{ id: string, level: number, text: string, el: HTMLElement }[]} */
    let allHeadings = [];
    /** @type {{ id: string, level: number, text: string }[]} */
    let visibleItems = [];
    /** Collapsed parent heading ids */
    let collapsedIds = new Set();
    let lastActiveId = null;

    let isFullscreen = false;
    /** Whether the sidebar (fullscreen) TOC panel itself is collapsed/hidden */
    let sidebarCollapsed = false;
    let spyPaused = false;
    let spyPauseTimer = null;
    let scrollHandler = null;
    let outsideClickHandler = null;
    let resizeHandler = null;

    function mount(previewContainer, workspace) {
        if (!previewContainer) return;

        // Scroll happens on the preview body; TOC must live on a non-scrolling host
        // so it stays fixed while content scrolls.
        containerEl = previewContainer;
        hostEl = previewContainer.closest('.panel') || previewContainer;
        workspaceEl = workspace || null;

        if (getComputedStyle(hostEl).position === 'static') {
            hostEl.style.position = 'relative';
        }

        rootEl = document.createElement('div');
        rootEl.className = 'md-toc';
        rootEl.hidden = true;
        rootEl.setAttribute('data-layout', 'corner');
        rootEl.innerHTML = [
            '<button type="button" class="md-toc-toggle" title="目录" aria-expanded="false">',
            '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '    <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
            '  </svg>',
            '  <span>目录</span>',
            '</button>',
            '<nav class="md-toc-panel" aria-label="文档目录">',
            '  <div class="md-toc-header">',
            '    <span>目录</span>',
            '    <div class="md-toc-header-actions">',
            '      <button type="button" class="md-toc-fold-all" title="收起目录" aria-label="收起目录">',
            '        <svg class="icon-collapse-all" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '          <path d="M14 7l-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
            '          <path d="M19 7l-5 5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
            '        </svg>',
            '        <svg class="icon-expand-all hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '          <path d="M5 7l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
            '          <path d="M10 7l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
            '        </svg>',
            '      </button>',
            '      <button type="button" class="md-toc-close" title="收起" aria-label="收起目录">&times;</button>',
            '    </div>',
            '  </div>',
            '  <ul class="md-toc-list"></ul>',
            '</nav>'
        ].join('');

        toggleBtn = rootEl.querySelector('.md-toc-toggle');
        panelEl = rootEl.querySelector('.md-toc-panel');
        listEl = rootEl.querySelector('.md-toc-list');
        foldAllBtn = rootEl.querySelector('.md-toc-fold-all');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isFullscreen) return;
            setOpen(!rootEl.classList.contains('is-open'));
        });

        rootEl.querySelector('.md-toc-close').addEventListener('click', (e) => {
            e.stopPropagation();
            if (isFullscreen) return;
            setOpen(false);
        });

        foldAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebarCollapse();
        });

        listEl.addEventListener('click', handleItemClick);

        hostEl.appendChild(rootEl);

        scrollHandler = () => {
            if (spyPaused || !visibleItems.length) return;
            updateActiveFromScroll();
        };
        containerEl.addEventListener('scroll', scrollHandler, { passive: true });

        outsideClickHandler = (e) => {
            if (isFullscreen) return;
            if (!rootEl.classList.contains('is-open')) return;
            if (rootEl.contains(e.target)) return;
            setOpen(false);
        };
        document.addEventListener('click', outsideClickHandler);

        resizeHandler = () => syncSidebarPosition();
        window.addEventListener('resize', resizeHandler);

        isFullscreen = !!(workspaceEl && workspaceEl.classList.contains('fullscreen-preview'));
        applyLayout();
    }

    /**
     * Pin sidebar TOC to the top-left corner of the preview area.
     */
    function syncSidebarPosition() {
        if (!rootEl || !hostEl || !containerEl) return;

        if (!isFullscreen || rootEl.hidden) {
            rootEl.style.top = '';
            rootEl.style.left = '';
            rootEl.style.bottom = '';
            return;
        }

        const hostRect = hostEl.getBoundingClientRect();
        const top = Math.max(0, containerEl.getBoundingClientRect().top - hostRect.top);

        rootEl.style.top = top + 'px';
        rootEl.style.left = '0';
        rootEl.style.bottom = '0';
    }

    function setOpen(open) {
        if (!rootEl) return;
        if (isFullscreen && !open) return;
        rootEl.classList.toggle('is-open', open);
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
    }

    function setFullscreen(fullscreen) {
        isFullscreen = !!fullscreen;
        if (!isFullscreen) sidebarCollapsed = false;
        applyLayout();
        renderList();
        if (!rootEl || rootEl.hidden) {
            syncSidebarPosition();
            return;
        }
        if (isFullscreen) {
            setOpen(true);
        }
        requestAnimationFrame(() => {
            syncSidebarPosition();
            updateActiveFromScroll();
        });
    }

    function applyLayout() {
        if (!rootEl) return;
        rootEl.setAttribute('data-layout', isFullscreen ? 'sidebar' : 'corner');
        rootEl.classList.toggle('is-locked-open', isFullscreen);
        if (!isFullscreen) {
            rootEl.style.top = '';
            rootEl.style.left = '';
            rootEl.style.bottom = '';
        }
        syncSidebarCollapse();
    }

    /**
     * Collapse/expand the entire sidebar TOC panel (fullscreen mode only).
     * Distinct from per-item folding of nested tree branches.
     */
    function toggleSidebarCollapse() {
        sidebarCollapsed = !sidebarCollapsed;
        syncSidebarCollapse();
    }

    function syncSidebarCollapse() {
        if (!rootEl) return;
        const collapsed = isFullscreen && sidebarCollapsed;
        rootEl.classList.toggle('is-sidebar-collapsed', collapsed);

        if (foldAllBtn) {
            foldAllBtn.title = collapsed ? '展开目录' : '收起目录';
            foldAllBtn.setAttribute('aria-label', collapsed ? '展开目录' : '收起目录');
            const collapseIcon = foldAllBtn.querySelector('.icon-collapse-all');
            const expandIcon = foldAllBtn.querySelector('.icon-expand-all');
            if (collapseIcon) collapseIcon.classList.toggle('hidden', collapsed);
            if (expandIcon) expandIcon.classList.toggle('hidden', !collapsed);
        }

        requestAnimationFrame(() => syncSidebarPosition());
    }

    function update(previewEl) {
        if (!rootEl || !previewEl) return;

        allHeadings = collectHeadings(previewEl);
        renderList();

        if (!visibleItems.length) {
            clear();
            return;
        }

        rootEl.hidden = false;
        if (isFullscreen) {
            setOpen(true);
        }
        requestAnimationFrame(() => {
            syncSidebarPosition();
            updateActiveFromScroll();
        });
    }

    function clear() {
        allHeadings = [];
        visibleItems = [];
        collapsedIds = new Set();
        lastActiveId = null;
        if (listEl) listEl.innerHTML = '';
        if (rootEl) {
            rootEl.hidden = true;
            rootEl.classList.remove('is-open');
            rootEl.style.top = '';
            rootEl.style.left = '';
            rootEl.style.bottom = '';
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        }
    }

    function collectHeadings(previewEl) {
        const nodes = previewEl.querySelectorAll(HEADING_SELECTOR);
        const items = [];

        nodes.forEach((el) => {
            const tag = el.tagName.toLowerCase();
            const level = parseInt(tag.charAt(1), 10);
            if (!level || level < 1 || level > 6) return;

            let id = el.id;
            if (!id) {
                id = 'heading-' + items.length;
                el.id = id;
            }

            const text = (el.textContent || '').trim();
            if (!text) return;

            items.push({ id, level, text, el });
        });

        return items;
    }

    /**
     * Non-fullscreen: two shallowest levels present in the document.
     * Fullscreen: all levels up to h6.
     */
    function filterVisible(headings) {
        if (!headings.length) return [];

        if (isFullscreen) {
            return headings.map(({ id, level, text }) => ({ id, level, text }));
        }

        const uniqueLevels = [...new Set(headings.map((h) => h.level))].sort((a, b) => a - b);
        const allowed = new Set(uniqueLevels.slice(0, 2));

        return headings
            .filter((h) => allowed.has(h.level))
            .map(({ id, level, text }) => ({ id, level, text }));
    }

    /**
     * Build a nested tree from a flat heading list (document order).
     * @param {{ id: string, level: number, text: string }[]} items
     */
    function buildTree(items) {
        const roots = [];
        const stack = [];

        items.forEach((item) => {
            const node = {
                id: item.id,
                level: item.level,
                text: item.text,
                children: []
            };

            while (stack.length && stack[stack.length - 1].level >= node.level) {
                stack.pop();
            }

            if (stack.length) {
                stack[stack.length - 1].children.push(node);
            } else {
                roots.push(node);
            }
            stack.push(node);
        });

        return roots;
    }

    function pruneCollapsedIds(items) {
        const valid = new Set(items.map((i) => i.id));
        collapsedIds.forEach((id) => {
            if (!valid.has(id)) collapsedIds.delete(id);
        });
    }

    function renderList() {
        if (!listEl) return;

        visibleItems = filterVisible(allHeadings);
        pruneCollapsedIds(visibleItems);
        listEl.innerHTML = '';

        if (!visibleItems.length) return;

        const minLevel = Math.min(...visibleItems.map((i) => i.level));
        const tree = buildTree(visibleItems);
        const frag = document.createDocumentFragment();
        tree.forEach((node) => frag.appendChild(renderTreeNode(node, minLevel)));
        listEl.appendChild(frag);
    }

    function renderTreeNode(node, minLevel) {
        const li = document.createElement('li');
        li.className = 'md-toc-item level-' + node.level;
        li.dataset.id = node.id;
        li.style.setProperty('--toc-indent', String(node.level - minLevel));

        const hasChildren = node.children.length > 0;
        const isCollapsed = hasChildren && collapsedIds.has(node.id);
        if (hasChildren) {
            li.classList.add('has-children');
            if (isCollapsed) li.classList.add('is-collapsed');
        }

        const row = document.createElement('div');
        row.className = 'md-toc-row';

        if (hasChildren) {
            const foldBtn = document.createElement('button');
            foldBtn.type = 'button';
            foldBtn.className = 'md-toc-fold';
            foldBtn.title = isCollapsed ? '展开' : '折叠';
            foldBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
            foldBtn.setAttribute('aria-label', isCollapsed ? '展开子目录' : '折叠子目录');
            foldBtn.innerHTML =
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
                '<path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" ' +
                'stroke-linecap="round" stroke-linejoin="round"/>' +
                '</svg>';
            row.appendChild(foldBtn);
        } else {
            const spacer = document.createElement('span');
            spacer.className = 'md-toc-fold-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            row.appendChild(spacer);
        }

        const a = document.createElement('a');
        a.href = '#' + encodeURIComponent(node.id);
        a.dataset.id = node.id;
        a.textContent = node.text;
        a.title = node.text;
        row.appendChild(a);
        li.appendChild(row);

        if (hasChildren) {
            const childList = document.createElement('ul');
            childList.className = 'md-toc-children';
            node.children.forEach((child) => {
                childList.appendChild(renderTreeNode(child, minLevel));
            });
            li.appendChild(childList);
        }

        return li;
    }

    function handleItemClick(e) {
        const foldBtn = e.target.closest('.md-toc-fold');
        if (foldBtn) {
            e.preventDefault();
            e.stopPropagation();
            const item = foldBtn.closest('.md-toc-item');
            if (item) toggleFold(item);
            return;
        }

        const link = e.target.closest('a[data-id]');
        if (!link) return;

        e.preventDefault();
        e.stopPropagation();

        const id = link.dataset.id;
        const heading = allHeadings.find((h) => h.id === id);
        if (!heading || !heading.el || !containerEl) return;

        pauseSpy();
        expandAncestors(id);
        setActiveId(id);

        const containerRect = containerEl.getBoundingClientRect();
        const headingRect = heading.el.getBoundingClientRect();
        const offset = headingRect.top - containerRect.top + containerEl.scrollTop - 16;

        containerEl.scrollTo({
            top: Math.max(0, offset),
            behavior: 'smooth'
        });
    }

    function toggleFold(itemEl) {
        const id = itemEl.dataset.id;
        if (!id) return;

        const collapsing = !itemEl.classList.contains('is-collapsed');
        if (collapsing) {
            collapsedIds.add(id);
            itemEl.classList.add('is-collapsed');
        } else {
            collapsedIds.delete(id);
            itemEl.classList.remove('is-collapsed');
        }

        const foldBtn = itemEl.querySelector(':scope > .md-toc-row > .md-toc-fold');
        if (foldBtn) {
            foldBtn.setAttribute('aria-expanded', collapsing ? 'false' : 'true');
            foldBtn.title = collapsing ? '展开' : '折叠';
            foldBtn.setAttribute('aria-label', collapsing ? '展开子目录' : '折叠子目录');
        }
    }

    /** Expand collapsed ancestors so the target entry is visible. */
    function expandAncestors(id) {
        if (!listEl) return;
        const link = findLinkById(id);
        if (!link) return;

        let item = link.closest('.md-toc-item');
        while (item) {
            const parentChildren = item.parentElement;
            const parentItem = parentChildren && parentChildren.classList.contains('md-toc-children')
                ? parentChildren.closest('.md-toc-item')
                : null;
            if (!parentItem) break;

            if (parentItem.classList.contains('is-collapsed')) {
                collapsedIds.delete(parentItem.dataset.id);
                parentItem.classList.remove('is-collapsed');
                const foldBtn = parentItem.querySelector(':scope > .md-toc-row > .md-toc-fold');
                if (foldBtn) {
                    foldBtn.setAttribute('aria-expanded', 'true');
                    foldBtn.title = '折叠';
                    foldBtn.setAttribute('aria-label', '折叠子目录');
                }
            }
            item = parentItem;
        }
    }

    function findLinkById(id) {
        if (!listEl) return null;
        const links = listEl.querySelectorAll('a[data-id]');
        for (let i = 0; i < links.length; i++) {
            if (links[i].dataset.id === id) return links[i];
        }
        return null;
    }

    function pauseSpy() {
        spyPaused = true;
        if (spyPauseTimer) clearTimeout(spyPauseTimer);
        spyPauseTimer = setTimeout(() => {
            spyPaused = false;
            updateActiveFromScroll();
        }, SPY_PAUSE_MS);
    }

    function updateActiveFromScroll() {
        if (!containerEl || !visibleItems.length) return;

        const containerTop = containerEl.getBoundingClientRect().top;
        const threshold = containerTop + 24;
        let currentId = visibleItems[0].id;

        for (let i = 0; i < allHeadings.length; i++) {
            const h = allHeadings[i];
            if (!h.el) continue;
            if (h.el.getBoundingClientRect().top <= threshold) {
                const visible = findVisibleForHeading(h, i);
                if (visible) currentId = visible.id;
            } else {
                break;
            }
        }

        // If active target is under a collapsed branch, highlight nearest expanded ancestor
        setActiveId(resolveVisibleActiveId(currentId));
    }

    function resolveVisibleActiveId(id) {
        if (!listEl) return id;
        const link = findLinkById(id);
        if (!link) return id;

        let item = link.closest('.md-toc-item');
        let resultId = id;

        while (item) {
            const parentChildren = item.parentElement;
            const parentItem = parentChildren && parentChildren.classList.contains('md-toc-children')
                ? parentChildren.closest('.md-toc-item')
                : null;
            if (!parentItem) break;
            if (parentItem.classList.contains('is-collapsed')) {
                resultId = parentItem.dataset.id || resultId;
            }
            item = parentItem;
        }

        return resultId;
    }

    /**
     * Map a document heading to the nearest visible TOC entry
     * (itself if shown, otherwise the closest earlier visible ancestor-level item).
     */
    function findVisibleForHeading(heading, indexInAll) {
        const visibleIds = new Set(visibleItems.map((v) => v.id));
        if (visibleIds.has(heading.id)) {
            return { id: heading.id };
        }

        for (let i = indexInAll - 1; i >= 0; i--) {
            const prev = allHeadings[i];
            if (visibleIds.has(prev.id) && prev.level <= heading.level) {
                return { id: prev.id };
            }
        }

        return visibleItems[0] ? { id: visibleItems[0].id } : null;
    }

    function setActiveId(id) {
        if (!listEl || !id) return;

        if (id !== lastActiveId) {
            listEl.querySelectorAll('.md-toc-item.is-active').forEach((el) => {
                el.classList.remove('is-active');
            });
            lastActiveId = id;
        }

        const link = findLinkById(id);
        if (!link) return;

        const item = link.closest('.md-toc-item');
        if (!item) return;

        if (!item.classList.contains('is-active')) {
            item.classList.add('is-active');
        }

        scrollTocItemIntoView(item);
    }

    /**
     * Keep the active TOC entry visible inside the TOC list scroller
     * without affecting the preview scroll position.
     */
    function scrollTocItemIntoView(item) {
        if (!listEl || !item) return;

        const row = item.querySelector(':scope > .md-toc-row') || item;
        const listRect = listEl.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const pad = 12;

        if (rowRect.top >= listRect.top + pad && rowRect.bottom <= listRect.bottom - pad) {
            return;
        }

        // Prefer centering when the jump is large (e.g. 8.x → 1.x)
        const rowTopInList = rowRect.top - listRect.top + listEl.scrollTop;
        const target = rowTopInList - (listEl.clientHeight / 2) + (rowRect.height / 2);
        listEl.scrollTo({
            top: Math.max(0, target),
            behavior: 'auto'
        });
    }

    window.MarkdownToc = {
        mount,
        update,
        clear,
        setFullscreen
    };
})();
