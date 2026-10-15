// Go Naming Utility
// Shared identifier conversion for parsers and generators (Go initialisms aware)

const GoNaming = (function () {
    'use strict';

    // golint 常用缩写，整体大写
    const INITIALISMS = new Set([
        'ACL', 'API', 'ASCII', 'CPU', 'CSS', 'DNS', 'EOF', 'GUID', 'HTML', 'HTTP', 'HTTPS',
        'ID', 'IP', 'JSON', 'LHS', 'QPS', 'RAM', 'RHS', 'RPC', 'SLA', 'SMTP', 'SQL',
        'SSH', 'TCP', 'TLS', 'TTL', 'UDP', 'UI', 'UID', 'UUID', 'URI', 'URL', 'UTF8', 'VM',
        'XML', 'XMPP', 'XSRF', 'XSS', 'SKU', 'OS', 'MD5', 'SHA'
    ]);

    function splitWords(name) {
        return String(name == null ? '' : name)
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(/[^A-Za-z0-9]+/)
            .filter(Boolean);
    }

    function capitalize(word) {
        const upper = word.toUpperCase();
        if (INITIALISMS.has(upper)) return upper;
        if (upper.length > 2 && upper.endsWith('S') && INITIALISMS.has(upper.slice(0, -1))) {
            return upper.slice(0, -1) + 's';
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    // user_id -> UserID, httpServer -> HTTPServer, 123abc -> Field123abc
    function toPascal(name) {
        const words = splitWords(name);
        if (words.length === 0) return 'Field';
        const out = words.map(capitalize).join('');
        return /^[0-9]/.test(out) ? 'Field' + out : out;
    }

    function toCamel(name) {
        const pascal = toPascal(name);
        const m = pascal.match(/^[A-Z]+(?=[A-Z][a-z]|[0-9]|$)/);
        if (m && m[0].length > 1) return m[0].toLowerCase() + pascal.slice(m[0].length);
        return pascal.charAt(0).toLowerCase() + pascal.slice(1);
    }

    function toSnake(name) {
        const words = splitWords(name);
        if (words.length === 0) return 'field';
        const out = words.map(w => w.toLowerCase()).join('_');
        return /^[0-9]/.test(out) ? 'f_' + out : out;
    }

    // 在 used 集合内保证名称唯一：Name, Name2, Name3...
    function unique(name, used) {
        let candidate = name;
        let n = 2;
        while (used.has(candidate)) candidate = name + n++;
        used.add(candidate);
        return candidate;
    }

    return { INITIALISMS, splitWords, toPascal, toCamel, toSnake, unique };
})();

// 兼容旧调用：各解析器原先各自定义的全局 snakeToCamel
function snakeToCamel(str) {
    return GoNaming.toPascal(str);
}

if (typeof window !== 'undefined') window.GoNaming = GoNaming;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GoNaming, snakeToCamel };
}
