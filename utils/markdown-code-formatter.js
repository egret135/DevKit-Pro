// Markdown Code Formatter
// Dedicated formatter for code blocks in Markdown preview
// Does NOT affect other panels - standalone module for Markdown rendering only

const MarkdownCodeFormatter = (function () {
    'use strict';

    // Default formatting options
    const DEFAULT_OPTIONS = {
        tabWidth: 4,
        useTabs: false,
        printWidth: 80
    };

    // Language aliases mapping
    const LANGUAGE_ALIASES = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'yml': 'yaml',
        'md': 'markdown',
        'sh': 'bash',
        'shell': 'bash',
        'zsh': 'bash',
        'htm': 'html',
        'scss': 'css',
        'less': 'css',
        'mysql': 'sql',
        'postgresql': 'sql',
        'postgres': 'sql',
        'sqlite': 'sql',
        'c++': 'cpp',
        'c#': 'csharp',
        'golang': 'go',
        'objc': 'objectivec',
        'objective-c': 'objectivec'
    };

    // Languages supported by Prettier
    const PRETTIER_LANGUAGES = ['javascript', 'typescript', 'html', 'css', 'php'];

    // Languages with built-in formatters
    const BUILTIN_LANGUAGES = ['json', 'sql', 'yaml', 'xml'];

    // Languages with basic indent formatting
    const BASIC_FORMAT_LANGUAGES = ['python', 'go', 'c', 'cpp', 'java', 'csharp', 'ruby', 'rust', 'swift', 'kotlin'];

    /**
     * Normalize language name
     */
    function normalizeLanguage(lang) {
        if (!lang) return null;
        const normalized = lang.toLowerCase().trim();
        return LANGUAGE_ALIASES[normalized] || normalized;
    }

    /**
     * Check if a language is supported for formatting
     */
    function isSupported(language) {
        const lang = normalizeLanguage(language);
        return PRETTIER_LANGUAGES.includes(lang) ||
            BUILTIN_LANGUAGES.includes(lang) ||
            BASIC_FORMAT_LANGUAGES.includes(lang);
    }

    /**
     * Get formatter type for a language
     */
    function getFormatterType(language) {
        const lang = normalizeLanguage(language);
        if (PRETTIER_LANGUAGES.includes(lang)) return 'prettier';
        if (BUILTIN_LANGUAGES.includes(lang)) return 'builtin';
        if (BASIC_FORMAT_LANGUAGES.includes(lang)) return 'basic';
        return null;
    }

    /**
     * Format code using Prettier
     */
    async function formatWithPrettier(code, language, options = {}) {
        if (typeof prettier === 'undefined') {
            console.warn('Prettier not loaded');
            return code;
        }

        const opts = { ...DEFAULT_OPTIONS, ...options };
        const lang = normalizeLanguage(language);

        try {
            let parser;
            let plugins = [];

            // Prettier 3.x standalone loads plugins as separate global objects
            switch (lang) {
                case 'javascript':
                case 'typescript':
                    parser = 'babel';
                    // Try different possible plugin locations
                    if (typeof prettierPlugins !== 'undefined' && prettierPlugins.babel) {
                        plugins.push(prettierPlugins.babel);
                    } else if (typeof prettierBabel !== 'undefined') {
                        plugins.push(prettierBabel);
                    }
                    break;
                case 'html':
                    parser = 'html';
                    if (typeof prettierPlugins !== 'undefined' && prettierPlugins.html) {
                        plugins.push(prettierPlugins.html);
                    } else if (typeof prettierHtml !== 'undefined') {
                        plugins.push(prettierHtml);
                    }
                    break;
                case 'css':
                    parser = 'css';
                    if (typeof prettierPlugins !== 'undefined' && prettierPlugins.postcss) {
                        plugins.push(prettierPlugins.postcss);
                    } else if (typeof prettierPostcss !== 'undefined') {
                        plugins.push(prettierPostcss);
                    }
                    break;
                case 'php':
                    parser = 'php';
                    if (typeof prettierPlugins !== 'undefined' && prettierPlugins.php) {
                        plugins.push(prettierPlugins.php);
                    } else if (typeof prettierPhp !== 'undefined') {
                        plugins.push(prettierPhp);
                    } else if (typeof phpPlugin !== 'undefined') {
                        plugins.push(phpPlugin);
                    }
                    break;
                default:
                    return code;
            }

            if (plugins.length === 0) {
                // Fallback to basic formatting for these languages
                console.warn(`Prettier plugin for ${lang} not loaded, using basic formatter`);
                return formatBasic(code, lang, options);
            }

            const formatted = await prettier.format(code, {
                parser: parser,
                plugins: plugins,
                tabWidth: opts.tabWidth,
                useTabs: opts.useTabs,
                printWidth: opts.printWidth,
                semi: true,
                singleQuote: true
            });

            return formatted.trim();
        } catch (error) {
            console.warn(`Prettier formatting failed for ${lang}:`, error.message);
            // Fallback to basic formatting
            return formatBasic(code, lang, options);
        }
    }

    /**
     * Format JSON
     */
    function formatJSON(code, options = {}) {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        try {
            const parsed = JSON.parse(code.trim());
            return JSON.stringify(parsed, null, opts.tabWidth);
        } catch (e) {
            return code;
        }
    }

    /**
     * Format SQL using sql-formatter
     */
    function formatSQL(code, options = {}) {
        if (typeof sqlFormatter === 'undefined') {
            console.warn('sql-formatter not loaded');
            return code;
        }
        const opts = { ...DEFAULT_OPTIONS, ...options };
        try {
            return sqlFormatter.format(code, {
                language: 'sql',
                tabWidth: opts.tabWidth,
                useTabs: opts.useTabs,
                keywordCase: 'upper',
                linesBetweenQueries: 2
            });
        } catch (e) {
            console.warn('SQL formatting failed:', e.message);
            return code;
        }
    }

    /**
     * Format YAML using js-yaml
     */
    function formatYAML(code, options = {}) {
        if (typeof jsyaml === 'undefined') {
            console.warn('js-yaml not loaded');
            return code;
        }
        const opts = { ...DEFAULT_OPTIONS, ...options };
        try {
            const parsed = jsyaml.load(code);
            return jsyaml.dump(parsed, { indent: opts.tabWidth, lineWidth: -1 });
        } catch (e) {
            console.warn('YAML formatting failed:', e.message);
            return code;
        }
    }

    /**
     * Format XML with proper indentation
     */
    function formatXML(code, options = {}) {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const indent = opts.useTabs ? '\t' : ' '.repeat(opts.tabWidth);

        try {
            let formatted = '';
            let pad = 0;

            // Remove existing whitespace between tags
            code = code.replace(/(>)\s*(<)/g, '$1\n$2');

            code.split('\n').forEach(node => {
                node = node.trim();
                if (!node) return;

                if (node.match(/^<\/\w/)) {
                    pad -= 1;
                }

                formatted += indent.repeat(Math.max(0, pad)) + node + '\n';

                if (node.match(/^<\w[^>]*[^/]>.*$/) && !node.match(/^<\w[^>]*>.*<\/\w+>$/)) {
                    pad += 1;
                }
            });

            return formatted.trim();
        } catch (e) {
            console.warn('XML formatting failed:', e.message);
            return code;
        }
    }

    /**
     * Basic indent formatter for Python, Go, C, etc.
     * Preserves original indentation structure but normalizes it
     */
    function formatBasic(code, language, options = {}) {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const indent = opts.useTabs ? '\t' : ' '.repeat(opts.tabWidth);
        const lang = normalizeLanguage(language);

        try {
            const lines = code.split('\n');
            let result = [];

            // Bracket-based languages (C, C++, Java, Go, etc.)
            const bracketLang = ['c', 'cpp', 'java', 'go', 'csharp', 'rust', 'swift', 'kotlin', 'javascript', 'typescript'].includes(lang);
            // Indent-based language (Python, Ruby)
            const indentLang = ['python', 'ruby'].includes(lang);

            if (bracketLang) {
                // For bracket-based languages, preserve existing relative indentation
                // but normalize the indent characters

                // First pass: detect existing indent unit (spaces or tabs)
                let existingIndentUnit = 4; // default
                for (const line of lines) {
                    const match = line.match(/^(\s+)/);
                    if (match) {
                        const spaces = match[1];
                        if (spaces.includes('\t')) {
                            existingIndentUnit = 1; // tabs
                            break;
                        } else if (spaces.length > 0 && spaces.length < existingIndentUnit) {
                            existingIndentUnit = spaces.length;
                        }
                    }
                }

                // Second pass: normalize indentation
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    let trimmed = line.trim();

                    if (!trimmed) {
                        result.push('');
                        continue;
                    }

                    // Calculate current indent level from original line
                    const leadingMatch = line.match(/^(\s*)/);
                    const leadingSpaces = leadingMatch ? leadingMatch[1] : '';
                    let indentLevel = 0;

                    if (leadingSpaces.includes('\t')) {
                        // Count tabs
                        indentLevel = (leadingSpaces.match(/\t/g) || []).length;
                    } else {
                        // Count space-based indent
                        indentLevel = Math.round(leadingSpaces.length / existingIndentUnit);
                    }

                    result.push(indent.repeat(indentLevel) + trimmed);
                }
            } else if (indentLang) {
                // For Python/Ruby, normalize existing indentation
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    let trimmed = line.trim();

                    if (!trimmed) {
                        result.push('');
                        continue;
                    }

                    const leadingSpaces = line.match(/^(\s*)/)[1];
                    const indentLevel = Math.round(leadingSpaces.length / 4);
                    result.push(indent.repeat(indentLevel) + trimmed);
                }
            } else {
                // Unknown language - just return as-is
                return code;
            }

            return result.join('\n');
        } catch (e) {
            console.warn(`Basic formatting failed for ${lang}:`, e.message);
            return code;
        }
    }

    /**
     * Main format function - formats code based on language
     */
    async function format(code, language, options = {}) {
        if (!code || !code.trim()) return code;

        const lang = normalizeLanguage(language);
        const formatterType = getFormatterType(lang);

        if (!formatterType) {
            return code; // Unsupported language, return as-is
        }

        switch (formatterType) {
            case 'prettier':
                return await formatWithPrettier(code, lang, options);
            case 'builtin':
                switch (lang) {
                    case 'json':
                        return formatJSON(code, options);
                    case 'sql':
                        return formatSQL(code, options);
                    case 'yaml':
                        return formatYAML(code, options);
                    case 'xml':
                        return formatXML(code, options);
                    default:
                        return code;
                }
            case 'basic':
                return formatBasic(code, lang, options);
            default:
                return code;
        }
    }

    // Public API
    return {
        format,
        formatJSON,
        formatSQL,
        formatYAML,
        formatXML,
        formatBasic,
        formatWithPrettier,
        isSupported,
        normalizeLanguage,
        getFormatterType
    };
})();

// Export for use in markdown-renderer.js
if (typeof window !== 'undefined') {
    window.MarkdownCodeFormatter = MarkdownCodeFormatter;
}
