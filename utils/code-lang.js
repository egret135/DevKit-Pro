// Code language table + lightweight heuristic detection for CodeMirror modes

const CodeLang = (function () {
    'use strict';

    const LANGS = {
        plain: { label: '纯文本', mode: null },
        javascript: { label: 'JavaScript', mode: 'text/javascript' },
        typescript: { label: 'TypeScript', mode: 'text/typescript' },
        json: { label: 'JSON', mode: { name: 'javascript', json: true } },
        go: { label: 'Go', mode: 'text/x-go' },
        python: { label: 'Python', mode: 'text/x-python' },
        java: { label: 'Java', mode: 'text/x-java' },
        kotlin: { label: 'Kotlin', mode: 'text/x-kotlin' },
        c: { label: 'C', mode: 'text/x-csrc' },
        cpp: { label: 'C++', mode: 'text/x-c++src' },
        csharp: { label: 'C#', mode: 'text/x-csharp' },
        rust: { label: 'Rust', mode: 'text/x-rustsrc' },
        php: { label: 'PHP', mode: 'application/x-httpd-php' },
        sql: { label: 'SQL', mode: 'text/x-sql' },
        html: { label: 'HTML', mode: 'text/html' },
        xml: { label: 'XML', mode: 'application/xml' },
        css: { label: 'CSS', mode: 'text/css' },
        shell: { label: 'Shell', mode: 'text/x-sh' },
        yaml: { label: 'YAML', mode: 'text/x-yaml' },
        toml: { label: 'TOML', mode: 'text/x-toml' },
        markdown: { label: 'Markdown', mode: 'text/x-markdown' },
        protobuf: { label: 'Protobuf', mode: 'text/x-protobuf' }
    };

    const MAX_SAMPLE_LINES = 200;
    const MIN_SCORE = 2;

    // [lang, regex, weight]; regexes run against the multi-line sample.
    const RULES = [
        ['go', /^package\s+\w+\s*$/m, 4],
        ['go', /\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/, 3],
        ['go', /:=/, 1],
        ['go', /^import\s+\(\s*$/m, 2],
        ['go', /\bfmt\.\w+\(/, 2],

        ['python', /^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w\[\], .]+)?:\s*$/m, 4],
        ['python', /^\s*(from\s+[\w.]+\s+)?import\s+[\w.]+(\s+as\s+\w+)?\s*$/m, 1],
        ['python', /^\s*class\s+\w+(\(.*\))?:\s*$/m, 3],
        ['python', /^\s*(elif|except|finally)\b.*:\s*$/m, 3],
        ['python', /\bself\.\w+/, 2],
        ['python', /^\s*if __name__ == ['"]__main__['"]:/m, 4],

        ['java', /\bpublic\s+(final\s+)?class\s+\w+/, 3],
        ['java', /\bpublic\s+static\s+void\s+main\s*\(/, 4],
        ['java', /^import\s+java\./m, 4],
        ['java', /\bSystem\.out\.print/, 3],
        ['java', /@Override\b/, 2],
        ['java', /^package\s+[\w.]+;\s*$/m, 3],

        ['kotlin', /^\s*fun\s+\w+\s*\(/m, 3],
        ['kotlin', /^\s*(val|var)\s+\w+\s*(:\s*\w+)?\s*=/m, 2],
        ['kotlin', /\bdata\s+class\b/, 3],

        ['csharp', /^\s*using\s+System(\.[\w.]+)?;\s*$/m, 4],
        ['csharp', /^\s*namespace\s+[\w.]+/m, 2],
        ['csharp', /\bConsole\.Write(Line)?\(/, 3],
        ['csharp', /\{\s*get;\s*(set;)?\s*\}/, 3],

        ['c', /^\s*#include\s*<\w+\.h>/m, 3],
        ['c', /\bprintf\s*\(/, 1],
        ['c', /\bmalloc\s*\(/, 2],
        ['cpp', /^\s*#include\s*<(iostream|vector|string|map|memory|algorithm)>/m, 4],
        ['cpp', /\bstd::\w+/, 3],
        ['cpp', /\btemplate\s*</, 2],

        ['rust', /^\s*(pub\s+)?fn\s+\w+\s*(<.*>)?\s*\(/m, 3],
        ['rust', /\blet\s+mut\s+/, 3],
        ['rust', /^\s*use\s+\w+(::\w+)+/m, 3],
        ['rust', /\bimpl\b.*\{/, 2],
        ['rust', /\w+!\(/, 1],

        ['php', /<\?php/, 6],
        ['php', /\$\w+\s*=/, 1],
        ['php', /\bfunction\s+\w+\s*\(\s*\$/, 3],

        ['typescript', /^\s*(export\s+)?(interface|type)\s+\w+/m, 3],
        ['typescript', /:\s*(string|number|boolean|void|any|unknown)\b/, 2],
        ['typescript', /\b(private|public|readonly)\s+\w+\s*:/, 2],

        ['javascript', /\b(const|let|var)\s+\w+\s*=/, 1],
        ['javascript', /\bfunction\s*\w*\s*\(/, 1],
        ['javascript', /=>\s*[{(]?/, 1],
        ['javascript', /\b(require\(|module\.exports|console\.log\()/, 2],
        ['javascript', /^\s*(import|export)\s+.*\bfrom\s+['"]/m, 2],

        ['sql', /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|VIEW)|ALTER\s+TABLE)\b/im, 4],
        ['sql', /\b(FROM|WHERE|JOIN|GROUP\s+BY|ORDER\s+BY)\b/, 1],

        ['html', /<!DOCTYPE\s+html/i, 6],
        ['html', /<(html|head|body|div|span|script|style)\b/i, 3],
        ['xml', /^\s*<\?xml\b/, 6],

        ['css', /^[ \t]*[.#]?[\w-][^\n{};=()]*\{[ \t]*$/m, 1],
        ['css', /^\s*[\w-]+\s*:\s*[^;{}]+;\s*$/m, 1],
        ['css', /@media\b|@import\b|@keyframes\b/, 3],

        ['shell', /^#!\/(usr\/)?bin\/(env\s+)?(ba|z)?sh/m, 6],
        ['shell', /^\s*(echo|export|cd|sudo|apt(-get)?|brew|chmod|grep)\s+/m, 2],
        ['shell', /\$\{?\w+\}?/, 1],
        ['shell', /\bfi\b|\bdone\b|\besac\b/, 2],

        ['yaml', /^---\s*$/m, 2],
        ['yaml', /^[\w-]+:\s*$/m, 1],
        ['yaml', /^\s+-\s+[\w-]+:\s/m, 2],

        ['toml', /^\[[\w.-]+\]\s*$/m, 3],
        ['toml', /^[\w-]+\s*=\s*("|\d|true|false|\[)/m, 1],

        ['markdown', /^#{1,6}\s+\S/m, 2],
        ['markdown', /^```/m, 2],
        ['markdown', /\[[^\]]+\]\([^)]+\)/, 2],

        ['protobuf', /^\s*syntax\s*=\s*"proto[23]"\s*;/m, 6],
        ['protobuf', /^\s*message\s+\w+\s*\{/m, 3]
    ];

    function looksLikeJson(text) {
        const trimmed = text.trim();
        if (!/^[{[]/.test(trimmed)) return false;
        try {
            JSON.parse(trimmed);
            return true;
        } catch (_) {
            return /^[{[]\s*"[^"]*"\s*:/.test(trimmed) || /^\[\s*[{["\d]/.test(trimmed);
        }
    }

    function detect(text) {
        const raw = String(text || '');
        if (!raw.trim()) return 'plain';

        const sample = raw.split('\n').slice(0, MAX_SAMPLE_LINES).join('\n');
        if (looksLikeJson(sample)) return 'json';

        const scores = {};
        for (const [lang, re, weight] of RULES) {
            if (re.test(sample)) scores[lang] = (scores[lang] || 0) + weight;
        }

        // TS is a JS superset; JS-only signals should not outrank TS-specific ones.
        if (scores.typescript) scores.typescript += scores.javascript || 0;
        if (scores.cpp && scores.c) scores.cpp += scores.c;

        let best = 'plain';
        let bestScore = MIN_SCORE - 1;
        Object.keys(scores).forEach((lang) => {
            if (scores[lang] > bestScore) {
                best = lang;
                bestScore = scores[lang];
            }
        });
        return best;
    }

    function getMode(lang) {
        return (LANGS[lang] || LANGS.plain).mode;
    }

    function getLabel(lang) {
        return (LANGS[lang] || LANGS.plain).label;
    }

    return { LANGS, detect, getMode, getLabel };
})();

if (typeof window !== 'undefined') {
    window.CodeLang = CodeLang;
}
