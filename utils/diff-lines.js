// Line-based diff utilities (LCS) shared by code diff and JSON side-by-side compare

const DiffLines = (function () {
    'use strict';

    const MAX_LINES = 8000;

    // Beyond this edit distance the Myers trace gets too large; the middle falls back to replace-all.
    const MAX_EDIT_DISTANCE = 2000;

    // Myers O((N+M)D) diff over integer ids. Returns ops [kind, indexA, indexB] or null if D exceeds maxD.
    function myersDiff(a, b, maxD) {
        const n = a.length;
        const m = b.length;
        const max = n + m;
        const off = max + 1;
        const v = new Int32Array(2 * max + 3);
        const trace = [];
        const limit = Math.min(max, maxD);

        for (let d = 0; d <= limit; d++) {
            trace.push(v.slice(off - d - 1, off + d + 2));
            for (let k = -d; k <= d; k += 2) {
                let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]))
                    ? v[off + k + 1]
                    : v[off + k - 1] + 1;
                let y = x - k;
                while (x < n && y < m && a[x] === b[y]) {
                    x++;
                    y++;
                }
                v[off + k] = x;
                if (x >= n && y >= m) return backtrackMyers(trace, n, m);
            }
        }
        return null;
    }

    function backtrackMyers(trace, n, m) {
        const ops = [];
        let x = n;
        let y = m;
        for (let d = trace.length - 1; d >= 0; d--) {
            const snap = trace[d];
            const get = (k) => snap[k + d + 1];
            const k = x - y;
            const prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
            const prevX = get(prevK);
            const prevY = prevX - prevK;
            while (x > prevX && y > prevY) {
                ops.push(['equal', x - 1, y - 1]);
                x--;
                y--;
            }
            if (d > 0) {
                if (x === prevX) {
                    ops.push(['add', -1, y - 1]);
                    y--;
                } else {
                    ops.push(['remove', x - 1, -1]);
                    x--;
                }
            }
        }
        return ops.reverse();
    }

    function computeLCSDiff(linesA, linesB, normalize) {
        const ids = new Map();
        const toId = (line) => {
            const key = normalize(line);
            let id = ids.get(key);
            if (id === undefined) {
                id = ids.size;
                ids.set(key, id);
            }
            return id;
        };
        const a = linesA.map(toId);
        const b = linesB.map(toId);

        let start = 0;
        while (start < a.length && start < b.length && a[start] === b[start]) start++;
        let endA = a.length;
        let endB = b.length;
        while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
            endA--;
            endB--;
        }

        const result = [];
        const pushEqual = (i, j) => result.push({ type: 'equal', line: linesA[i], lineA: i + 1, lineB: j + 1 });

        for (let i = 0; i < start; i++) pushEqual(i, i);

        const ops = myersDiff(a.slice(start, endA), b.slice(start, endB), MAX_EDIT_DISTANCE);
        if (ops) {
            ops.forEach(([kind, i, j]) => {
                if (kind === 'equal') pushEqual(start + i, start + j);
                else if (kind === 'remove') result.push({ type: 'remove', line: linesA[start + i], lineA: start + i + 1, lineB: null });
                else result.push({ type: 'add', line: linesB[start + j], lineA: null, lineB: start + j + 1 });
            });
        } else {
            for (let i = start; i < endA; i++) result.push({ type: 'remove', line: linesA[i], lineA: i + 1, lineB: null });
            for (let j = start; j < endB; j++) result.push({ type: 'add', line: linesB[j], lineA: null, lineB: j + 1 });
        }

        for (let i = endA, j = endB; i < a.length; i++, j++) pushEqual(i, j);
        return result;
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

    function tokenize(line) {
        return String(line).match(/\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu) || [''];
    }

    const WORD_DIFF_MAX_CELLS = 40000;
    const WORD_DIFF_TOTAL_BUDGET = 4000000;

    // Word-level LCS for a modified line pair. Returns token arrays for each side.
    function computeWordDiff(lineA, lineB) {
        const a = tokenize(lineA);
        const b = tokenize(lineB);
        const m = a.length;
        const n = b.length;
        // Cap the DP table so one very long line cannot stall the UI.
        if (m * n > WORD_DIFF_MAX_CELLS) {
            return null;
        }
        const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        const tokensA = [];
        const tokensB = [];
        let i = m;
        let j = n;
        const stackA = [];
        const stackB = [];
        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
                stackA.push({ text: a[i - 1], type: 'eq' });
                stackB.push({ text: b[j - 1], type: 'eq' });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                stackB.push({ text: b[j - 1], type: 'add' });
                j--;
            } else {
                stackA.push({ text: a[i - 1], type: 'del' });
                i--;
            }
        }
        while (stackA.length) tokensA.push(stackA.pop());
        while (stackB.length) tokensB.push(stackB.pop());
        return { tokensA, tokensB };
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
        const wordsA = new Array(linesA.length).fill(null);
        const wordsB = new Array(linesB.length).fill(null);
        let added = 0;
        let removed = 0;
        let modified = 0;
        let unchanged = 0;
        let wordBudget = WORD_DIFF_TOTAL_BUDGET;

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
                if (row.lineA != null) statusA[row.lineA - 1] = 'mod';
                if (row.lineB != null) statusB[row.lineB - 1] = 'mod';
                if (row.lineA != null && row.lineB != null && wordBudget > 0) {
                    const lineA = linesA[row.lineA - 1];
                    const lineB = linesB[row.lineB - 1];
                    wordBudget -= (lineA.length + 1) * (lineB.length + 1);
                    const wd = computeWordDiff(lineA, lineB);
                    if (wd) {
                        wordsA[row.lineA - 1] = wd.tokensA;
                        wordsB[row.lineB - 1] = wd.tokensB;
                    }
                }
            }
        }

        return {
            rows,
            statusA,
            statusB,
            wordsA,
            wordsB,
            stats: { added, removed, modified, unchanged }
        };
    }

    function buildHunks(status, side) {
        const hunks = [];
        let inHunk = false;
        for (let i = 0; i < status.length; i++) {
            if (status[i] !== 'equal') {
                if (!inHunk) {
                    hunks.push({ line: i, side, kind: status[i] });
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

    function truncateLines(lines, max) {
        const limit = max || MAX_LINES;
        if (lines.length <= limit) {
            return { lines, truncated: false, originalCount: lines.length };
        }
        return {
            lines: lines.slice(0, limit),
            truncated: true,
            originalCount: lines.length
        };
    }

    return {
        MAX_LINES,
        computeLCSDiff,
        buildSideBySideRows,
        computeLineDiff,
        computeWordDiff,
        buildHunks,
        mergeHunks,
        formatStatsHtml,
        truncateLines
    };
})();
