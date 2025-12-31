// Auto-Formatter Utility
// Provides automatic formatting for various input types

const AutoFormatter = (function () {
    'use strict';

    /**
     * Format content based on detected type
     * @param {string} content - Raw content to format
     * @param {string} type - Detected type (json, mysql, yaml, etc.)
     * @param {object} options - Formatting options
     * @returns {string} Formatted content, or original if formatting fails
     */
    function format(content, type, options = {}) {
        const indent = options.indent || 4;
        const indentStr = options.useTabs ? '\t' : ' '.repeat(indent);

        try {
            switch (type) {
                case 'json':
                    return formatJSON(content, indent);
                case 'mysql':
                case 'postgresql':
                case 'sqlite':
                    return formatSQL(content, type, indentStr);
                case 'yaml':
                    return formatYAML(content, indent);
                case 'xml':
                    return formatXML(content, indentStr);
                default:
                    return content; // No formatting for unknown types
            }
        } catch (e) {
            console.warn('Auto-format failed:', e.message);
            return content; // Return original on error
        }
    }

    /**
     * Format JSON with specified indentation
     */
    function formatJSON(content, indent) {
        // Try to parse and re-stringify
        const trimmed = content.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            return content; // Not valid JSON structure
        }
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(parsed, null, indent);
    }

    /**
     * Format SQL using sql-formatter library
     */
    function formatSQL(content, dialect, indentStr) {
        if (typeof sqlFormatter === 'undefined') {
            console.warn('sql-formatter not loaded');
            return content;
        }

        // Map our dialect names to sql-formatter's
        const dialectMap = {
            'mysql': 'mysql',
            'postgresql': 'postgresql',
            'sqlite': 'sqlite'
        };

        return sqlFormatter.format(content, {
            language: dialectMap[dialect] || 'sql',
            tabWidth: indentStr === '\t' ? 1 : indentStr.length,
            useTabs: indentStr === '\t',
            keywordCase: 'upper',
            linesBetweenQueries: 2
        });
    }

    /**
     * Format YAML (requires js-yaml library)
     */
    function formatYAML(content, indent) {
        if (typeof jsyaml === 'undefined') {
            console.warn('js-yaml not loaded');
            return content;
        }
        const parsed = jsyaml.load(content);
        return jsyaml.dump(parsed, { indent: indent, lineWidth: -1 });
    }

    /**
     * Format XML with proper indentation
     */
    function formatXML(content, indentStr) {
        // Simple XML formatter without external library
        const PADDING = indentStr;
        let formatted = '';
        let pad = 0;

        // Remove existing whitespace between tags
        content = content.replace(/(>)\s*(<)/g, '$1\n$2');

        content.split('\n').forEach(node => {
            node = node.trim();
            if (!node) return;

            let indent = 0;
            if (node.match(/^<\/\w/)) {
                // Closing tag
                pad -= 1;
            }
            indent = pad;
            if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
                // Opening tag (not self-closing)
                pad += 1;
            }

            formatted += PADDING.repeat(indent) + node + '\n';
        });

        return formatted.trim();
    }

    /**
     * Check if content appears to be minified/needs formatting
     * @param {string} content 
     * @param {string} type 
     * @returns {boolean}
     */
    function needsFormatting(content, type) {
        if (!content || content.length < 20) return false;

        switch (type) {
            case 'json':
                // Check if JSON is minified (no newlines between braces)
                const trimmed = content.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    // If content has objects/arrays but few newlines, it's likely minified
                    const newlineCount = (content.match(/\n/g) || []).length;
                    const braceCount = (content.match(/[{}\[\]]/g) || []).length;
                    // Lower threshold: format if braces > 2 and few newlines relative to content
                    return braceCount > 2 && newlineCount < braceCount;
                }
                return false;

            case 'mysql':
            case 'postgresql':
            case 'sqlite':
                // Check if SQL is on single line or poorly formatted
                const lines = content.split('\n').filter(l => l.trim());
                if (lines.length === 1 && content.length > 50) return true;
                // Check for keywords not at line start
                const keywordPattern = /\b(SELECT|FROM|WHERE|JOIN|AND|OR|ORDER BY|GROUP BY|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/gi;
                const matches = content.match(keywordPattern) || [];
                return matches.length > 3 && lines.length < matches.length / 2;

            default:
                return false;
        }
    }

    // Public API
    return {
        format,
        formatJSON,
        formatSQL,
        formatYAML,
        formatXML,
        needsFormatting
    };
})();
