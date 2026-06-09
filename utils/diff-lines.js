// Line-based diff utilities (LCS) shared by code diff and JSON side-by-side compare

const DiffLines = (function () {
    'use strict';

    function computeLCSDiff(linesA, linesB, normalize) {
        const m = linesA.length;
        const n = linesB.length;

        const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (normalize(linesA[i - 1]) === normalize(linesB[j - 1])) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        const result = [];
        let i = m;
        let j = n;
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && normalize(linesA[i - 1]) === normalize(linesB[j - 1])) {
                result.push({ type: 'equal', line: linesA[i - 1], lineA: i, lineB: j });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                result.push({ type: 'add', line: linesB[j - 1], lineA: null, lineB: j });
                j--;
            } else {
                result.push({ type: 'remove', line: linesA[i - 1], lineA: i, lineB: null });
                i--;
            }
        }

        return result.reverse();
    }

    function buildSideBySideRows(diff) {
        const rows = [];
        let i = 0;
        while (i < diff.length) {
            if (diff[i].type === 'equal') {
                rows.push({ type: 'equal', lineA: diff[i].lineA, lineB: diff[i].lineB });
                i++;
            } else {
                const removes = [];
                const adds = [];
                while (i < diff.length && diff[i].type === 'remove') {
                    removes.push(diff[i]);
                    i++;
                }
                while (i < diff.length && diff[i].type === 'add') {
                    adds.push(diff[i]);
                    i++;
                }

                const pairs = Math.min(removes.length, adds.length);
                for (let p = 0; p < pairs; p++) {
                    rows.push({ type: 'modify', lineA: removes[p].lineA, lineB: adds[p].lineB });
                }
                for (let p = pairs; p < removes.length; p++) {
                    rows.push({ type: 'remove', lineA: removes[p].lineA });
                }
                for (let p = pairs; p < adds.length; p++) {
                    rows.push({ type: 'add', lineB: adds[p].lineB });
                }
            }
        }
        return rows;
    }

    function computeLineDiff(linesA, linesB, options = {}) {
        const ignoreWhitespace = options.ignoreWhitespace || false;
        const ignoreCase = options.ignoreCase || false;

        const normalize = (line) => {
            let value = line;
            if (ignoreWhitespace) value = value.replace(/\s+/g, ' ').trim();
            if (ignoreCase) value = value.toLowerCase();
            return value;
        };

        const rawDiff = computeLCSDiff(linesA, linesB, normalize);
        const rows = buildSideBySideRows(rawDiff);

        const statusA = new Array(linesA.length).fill('equal');
        const statusB = new Array(linesB.length).fill('equal');
        let added = 0;
        let removed = 0;
        let modified = 0;
        let unchanged = 0;

        for (const row of rows) {
            if (row.type === 'equal') {
                unchanged++;
            } else if (row.type === 'remove') {
                removed++;
                if (row.lineA != null) statusA[row.lineA - 1] = 'del';
            } else if (row.type === 'add') {
                added++;
                if (row.lineB != null) statusB[row.lineB - 1] = 'add';
            } else if (row.type === 'modify') {
                modified++;
                if (row.lineA != null) statusA[row.lineA - 1] = 'del';
                if (row.lineB != null) statusB[row.lineB - 1] = 'add';
            }
        }

        return {
            rows,
            statusA,
            statusB,
            stats: { added, removed, modified, unchanged }
        };
    }

    function renderOverlay(gutterId, backdropId, lineCount, status) {
        const gutter = document.getElementById(gutterId);
        const backdrop = document.getElementById(backdropId);
        if (!gutter || !backdrop) return;

        const gutterHtml = [];
        const backdropHtml = [];
        for (let i = 0; i < lineCount; i++) {
            const state = status[i] || 'equal';
            const cls = state !== 'equal' ? ' ' + state : '';
            gutterHtml.push(`<div class="cdiff-gutter-line${cls}">${i + 1}</div>`);
            backdropHtml.push(`<div class="cdiff-backdrop-line${cls}"></div>`);
        }
        gutter.innerHTML = gutterHtml.join('');
        backdrop.innerHTML = backdropHtml.join('');
    }

    function buildHunks(status, side) {
        const hunks = [];
        let inHunk = false;
        for (let i = 0; i < status.length; i++) {
            if (status[i] !== 'equal') {
                if (!inHunk) {
                    hunks.push({ line: i, side });
                    inHunk = true;
                }
            } else {
                inHunk = false;
            }
        }
        return hunks;
    }

    function mergeHunks(hunksA, hunksB) {
        return [...hunksA, ...hunksB].sort((a, b) => a.line - b.line || (a.side === 'a' ? -1 : 1));
    }

    function formatStatsHtml(stats) {
        return (
            `<span class="cdiff-stat-eq">${stats.unchanged} 不变</span>` +
            `<span class="cdiff-stat-mod">~${stats.modified} 修改</span>` +
            `<span class="cdiff-stat-add">+${stats.added} 新增</span>` +
            `<span class="cdiff-stat-rm">-${stats.removed} 删除</span>`
        );
    }

    return {
        computeLCSDiff,
        buildSideBySideRows,
        computeLineDiff,
        renderOverlay,
        buildHunks,
        mergeHunks,
        formatStatsHtml
    };
})();
