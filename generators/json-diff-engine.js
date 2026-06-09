// JSON Diff Engine - structural comparison with JSONPath-style paths

const jsonDiffEngine = (function () {
    'use strict';

    function typeName(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    function jsonVal(value) {
        if (typeof value === 'string') return `"${value}"`;
        if (value === null) return 'null';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function isPrimitiveEqual(a, b) {
        if (a === b) return true;
        if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) {
            return true;
        }
        return JSON.stringify(a) === JSON.stringify(b);
    }

    function diffValues(a, b, path, changes) {
        const typeA = typeName(a);
        const typeB = typeName(b);

        if (typeA !== typeB) {
            changes.push({
                type: 'changed',
                path,
                oldValue: a,
                newValue: b,
                typeChange: `${typeA} → ${typeB}`
            });
            return;
        }

        if (a === null || typeof a !== 'object') {
            if (!isPrimitiveEqual(a, b)) {
                changes.push({ type: 'changed', path, oldValue: a, newValue: b });
            }
            return;
        }

        if (Array.isArray(a)) {
            const maxLen = Math.max(a.length, b.length);
            for (let i = 0; i < maxLen; i++) {
                const childPath = `${path}[${i}]`;
                if (i >= a.length) {
                    changes.push({ type: 'added', path: childPath, newValue: b[i] });
                } else if (i >= b.length) {
                    changes.push({ type: 'removed', path: childPath, oldValue: a[i] });
                } else {
                    diffValues(a[i], b[i], childPath, changes);
                }
            }
            return;
        }

        const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of allKeys) {
            const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
            if (!(key in a)) {
                changes.push({ type: 'added', path: childPath, newValue: b[key] });
            } else if (!(key in b)) {
                changes.push({ type: 'removed', path: childPath, oldValue: a[key] });
            } else {
                diffValues(a[key], b[key], childPath, changes);
            }
        }
    }

    function diff(a, b, options = {}) {
        let valueA = a;
        let valueB = b;
        if (options.sortKeys && typeof JsonUtils !== 'undefined') {
            valueA = JsonUtils.sortKeys(valueA);
            valueB = JsonUtils.sortKeys(valueB);
        }

        const changes = [];
        diffValues(valueA, valueB, '$', changes);

        const stats = { added: 0, removed: 0, changed: 0 };
        changes.forEach((change) => {
            if (change.type === 'added') stats.added++;
            else if (change.type === 'removed') stats.removed++;
            else if (change.type === 'changed') stats.changed++;
        });

        const lines = changes.map(formatChangeLine);
        return { changes, lines, stats };
    }

    function formatChangeLine(change) {
        const path = escapeHtml(change.path);
        const renderVal = (value) => escapeHtml(jsonVal(value));

        if (change.type === 'added') {
            return `<span class="diff-line diff-added">+ <span class="diff-key">${path}</span>: ${renderVal(change.newValue)}</span>`;
        }
        if (change.type === 'removed') {
            return `<span class="diff-line diff-removed">- <span class="diff-key">${path}</span>: ${renderVal(change.oldValue)}</span>`;
        }
        if (change.typeChange) {
            return `<span class="diff-line diff-changed">~ <span class="diff-key">${path}</span>: ${escapeHtml(change.typeChange)}</span>`;
        }
        return `<span class="diff-line diff-changed">~ <span class="diff-key">${path}</span>: ${renderVal(change.oldValue)} → ${renderVal(change.newValue)}</span>`;
    }

    function diffFromText(textA, textB, options = {}) {
        if (typeof JsonUtils === 'undefined') {
            return { ok: false, error: 'JsonUtils 未加载' };
        }

        const parsedA = JsonUtils.parse(textA);
        const parsedB = JsonUtils.parse(textB);

        if (!parsedA.ok) return { ok: false, error: `JSON A 解析错误: ${parsedA.error}` };
        if (!parsedB.ok) return { ok: false, error: `JSON B 解析错误: ${parsedB.error}` };

        if (!textA.trim() && !textB.trim()) {
            return { ok: true, changes: [], lines: [], stats: { added: 0, removed: 0, changed: 0 } };
        }

        const result = diff(parsedA.value, parsedB.value, options);
        return { ok: true, ...result };
    }

    return {
        diff,
        diffFromText,
        formatChangeLine
    };
})();
