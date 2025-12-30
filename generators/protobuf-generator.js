// Protocol Buffer Message Generator
// Generates .proto file message definitions from parsed JSON data

/**
 * Generate Protocol Buffer message definition
 * @param {object} parsedData - Parsed JSON data from protobuf-parser
 * @param {object} options - Generation options
 * @returns {string} - Protocol Buffer message definition
 */
function generateProtoMessage(parsedData, options = {}) {
    const {
        messageName = parsedData.structName || 'Message',
        nestedMode = 'separate',  // 'inline' | 'separate'
        packageName = 'model',
        syntax = 'proto3',
        numericIntType = 'int32',
        numericFloatType = 'float'
    } = options;

    let code = '';

    // Add syntax declaration
    code += `syntax = "${syntax}";\n\n`;

    // Add package declaration
    if (packageName) {
        code += `package ${packageName};\n\n`;
    }

    // Generate nested messages first if in separate mode
    if (nestedMode === 'separate' && parsedData.nestedStructs && parsedData.nestedStructs.length > 0) {
        for (const nested of parsedData.nestedStructs) {
            code += generateMessage(nested, { numericIntType, numericFloatType });
            code += '\n';
        }
    }

    // Generate main message
    code += generateMessage(
        {
            name: messageName,
            fields: parsedData.fields,
            nestedStructs: nestedMode === 'inline' ? parsedData.nestedStructs : []
        },
        { numericIntType, numericFloatType, nestedMode }
    );

    return code;
}

/**
 * Generate a single Protocol Buffer message
 * @param {object} messageData - Message data (name, fields, nestedStructs)
 * @param {object} options - Generation options
 * @returns {string} - Message definition
 */
function generateMessage(messageData, options = {}) {
    const { name, fields, nestedStructs = [] } = messageData;
    const { numericIntType = 'int32', numericFloatType = 'float', nestedMode = 'separate' } = options;

    let code = '';

    // Add message comment
    code += `// ${name} message\n`;
    code += `message ${name} {\n`;

    // Generate nested messages first if in inline mode
    if (nestedMode === 'inline' && nestedStructs.length > 0) {
        for (const nested of nestedStructs) {
            const nestedCode = generateMessage(nested, { numericIntType, numericFloatType, nestedMode });
            // Indent nested message
            const indentedNested = nestedCode.split('\n').map(line => '  ' + line).join('\n');
            code += indentedNested + '\n';
        }
    }

    // Calculate max widths for alignment
    const protoTypes = fields.map(f => formatFieldType(f, { numericIntType, numericFloatType }));
    const fieldNames = fields.map(f => f.jsonName || f.name);

    const maxTypeLen = Math.max(...protoTypes.map(t => t.length), 0);
    const maxNameLen = Math.max(...fieldNames.map(n => n.length), 0);

    // Generate fields
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const protoType = protoTypes[i].padEnd(maxTypeLen);
        const fieldName = fieldNames[i].padEnd(maxNameLen);
        const fieldNumber = field.protoFieldNumber || (i + 1);

        code += `  ${protoType} ${fieldName} = ${fieldNumber};\n`;
    }

    code += `}\n`;

    return code;
}

/**
 * Format field type for Protocol Buffer
 * @param {object} field - Field object
 * @param {object} options - Type mapping options
 * @returns {string} - Protocol Buffer type string
 */
function formatFieldType(field, options = {}) {
    const { numericIntType = 'int32', numericFloatType = 'float' } = options;

    // Handle repeated fields (arrays)
    if (field.isRepeated) {
        const elementType = mapTypeToProtobuf(field.protoElementType, options);
        return `repeated ${elementType}`;
    }

    // Handle regular fields
    return mapTypeToProtobuf(field.goType, options);
}

/**
 * Map Go type (from json-parser) to Protocol Buffer type
 * @param {string} goType - Go type string
 * @param {object} options - Mapping options
 * @returns {string} - Protocol Buffer type
 */
function mapTypeToProtobuf(goType, options = {}) {
    const { numericIntType = 'int32', numericFloatType = 'float' } = options;

    // Direct type mappings
    const typeMap = {
        'string': 'string',
        'int': numericIntType,
        'int64': 'int64',
        'int32': 'int32',
        'float64': numericFloatType,
        'float32': 'float',
        'bool': 'bool',
        'interface{}': 'string', // Fallback for null/unknown types
    };

    // Check if it's a direct mapping
    if (typeMap[goType]) {
        return typeMap[goType];
    }

    // If it's a custom type (nested message), return as-is
    // These are typically PascalCase struct names
    return goType;
}

/**
 * Convert field name to snake_case (Protocol Buffer convention)
 * @param {string} fieldName - Field name
 * @returns {string} - snake_case field name
 */
function toSnakeCase(fieldName) {
    return fieldName
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateProtoMessage,
        generateMessage,
        formatFieldType,
        mapTypeToProtobuf,
        toSnakeCase
    };
}
