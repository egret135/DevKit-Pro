// Config Generators
// Generates YAML, TOML, and XML from parsed data

const ConfigGenerator = (function () {
    'use strict';

    /**
     * Generate YAML from data object
     * @param {object} data - Data to convert
     * @param {object} options - Options (indent, etc.)
     * @returns {string} YAML string
     */
    function generateYAML(data, options = {}) {
        if (typeof jsyaml === 'undefined') {
            throw new Error('js-yaml library not loaded');
        }

        const indent = options.indent || 4;
        return jsyaml.dump(data, {
            indent: indent,
            lineWidth: -1,  // No line wrapping
            noRefs: true,   // No YAML references
            sortKeys: false // Preserve key order
        });
    }

    /**
     * Generate TOML from data object
     * @param {object} data - Data to convert
     * @param {object} options - Options
     * @returns {string} TOML string
     */
    function generateTOML(data, options = {}) {
        if (typeof TOML === 'undefined') {
            throw new Error('TOML library not loaded');
        }

        // Use TOML.stringify if available
        if (TOML.stringify) {
            return TOML.stringify(data);
        }

        // Fallback: Manual TOML generation for simple objects
        return manualTOMLStringify(data, '');
    }

    /**
     * Manual TOML stringification for simple cases
     */
    function manualTOMLStringify(obj, prefix) {
        let result = '';
        const tables = [];

        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (value === null || value === undefined) {
                continue;
            } else if (typeof value === 'string') {
                result += `${key} = "${escapeTomlString(value)}"\n`;
            } else if (typeof value === 'number') {
                result += `${key} = ${value}\n`;
            } else if (typeof value === 'boolean') {
                result += `${key} = ${value}\n`;
            } else if (Array.isArray(value)) {
                if (value.length === 0 || typeof value[0] !== 'object') {
                    result += `${key} = ${JSON.stringify(value)}\n`;
                } else {
                    // Array of tables
                    for (const item of value) {
                        tables.push({ key: fullKey, value: item, isArray: true });
                    }
                }
            } else if (typeof value === 'object') {
                tables.push({ key: fullKey, value: value, isArray: false });
            }
        }

        // Process nested tables
        for (const table of tables) {
            if (table.isArray) {
                result += `\n[[${table.key}]]\n`;
            } else {
                result += `\n[${table.key}]\n`;
            }
            result += manualTOMLStringify(table.value, '');
        }

        return result;
    }

    function escapeTomlString(str) {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    /**
     * Generate XML from data object
     * @param {object} data - Data to convert
     * @param {object} options - Options (indent, rootName, etc.)
     * @returns {string} XML string
     */
    function generateXML(data, options = {}) {
        const indent = options.indent || 4;
        const rootName = options.rootName || 'root';
        const indentStr = ' '.repeat(indent);

        // Try using fast-xml-parser's XMLBuilder if available
        if (typeof XMLBuilder !== 'undefined' || (typeof fxparser !== 'undefined' && fxparser.XMLBuilder)) {
            const Builder = typeof XMLBuilder !== 'undefined' ? XMLBuilder : fxparser.XMLBuilder;
            const builder = new Builder({
                ignoreAttributes: false,
                format: true,
                indentBy: indentStr
            });
            return '<?xml version="1.0" encoding="UTF-8"?>\n' + builder.build({ [rootName]: data });
        }

        // Fallback: Manual XML generation
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
            objectToXML(data, rootName, 0, indentStr);
    }

    /**
     * Convert object to XML recursively
     */
    function objectToXML(obj, tagName, level, indentStr) {
        const currentIndent = indentStr.repeat(level);
        const childIndent = indentStr.repeat(level + 1);

        if (obj === null || obj === undefined) {
            return `${currentIndent}<${tagName}/>\n`;
        }

        if (typeof obj !== 'object') {
            return `${currentIndent}<${tagName}>${escapeXML(String(obj))}</${tagName}>\n`;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => objectToXML(item, tagName, level, indentStr)).join('');
        }

        let content = '';
        let hasChildren = false;

        for (const [key, value] of Object.entries(obj)) {
            if (key.startsWith('@_')) {
                // Skip attributes in this simple implementation
                continue;
            }
            hasChildren = true;
            content += objectToXML(value, key, level + 1, indentStr);
        }

        if (!hasChildren) {
            return `${currentIndent}<${tagName}/>\n`;
        }

        return `${currentIndent}<${tagName}>\n${content}${currentIndent}</${tagName}>\n`;
    }

    function escapeXML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Generate JSON from data object (formatted)
     * @param {object} data - Data to convert
     * @param {object} options - Options (indent)
     * @returns {string} JSON string
     */
    function generateJSON(data, options = {}) {
        const indent = options.indent || 4;
        return JSON.stringify(data, null, indent);
    }

    // Public API
    return {
        generateYAML,
        generateTOML,
        generateXML,
        generateJSON
    };
})();
