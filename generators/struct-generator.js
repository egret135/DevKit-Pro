// Go Struct Generator
// Generates Go struct code with json and gorm tags, and inline comments

function generateGoStruct(parsedData, options = {}) {
    const {
        structName = parsedData.structName || snakeToCamel(parsedData.tableName),
        generateTableName = true,
        packageName = 'model',
        inlineNestedStructs = true,  // New option: inline nested structs by default
        inputType = 'ddl'  // New option: 'json' or 'ddl' to determine tag generation
    } = options;

    let code = '';

    // Add struct comment
    const structComment = parsedData.tableName ? `${parsedData.tableName}表` : structName;
    code += `// ${structName} ${structComment}\n`;
    code += `type ${structName} struct {\n`;

    // Process fields - check if we need to inline nested structs
    const fields = processFieldsForInline(parsedData.fields, parsedData.nestedStructs, inlineNestedStructs);

    // Calculate max widths for alignment
    const maxFieldNameLen = Math.max(...fields.map(f => f.goName.length));
    const maxTypeLen = Math.max(...fields.map(f => f.goType.length));

    // Generate tags based on input type
    const fieldTags = fields.map(f => generateFieldTag(f, inputType));
    const maxTagLen = Math.max(...fieldTags.map(t => t.length));

    // Generate fields with alignment
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const tag = fieldTags[i];

        const fieldName = field.goName.padEnd(maxFieldNameLen);
        const fieldType = field.goType.padEnd(maxTypeLen);
        const tagStr = tag.padEnd(maxTagLen);
        const comment = field.comment ? ` // ${field.comment}` : '';

        code += `    ${fieldName} ${fieldType} ${tagStr}${comment}\n`;
    }

    code += `}\n`;

    // Add TableName method if enabled (only for DDL, not JSON)
    if (inputType !== 'json' && generateTableName && parsedData.tableName) {
        code += `\n// TableName 返回表名\n`;
        code += `func (${structName}) TableName() string {\n`;
        code += `    return "${parsedData.tableName}"\n`;
        code += `}\n`;
    }

    // Handle nested structs (for JSON) - only generate separately if not inline
    if (!inlineNestedStructs && parsedData.nestedStructs && parsedData.nestedStructs.length > 0) {
        for (const nested of parsedData.nestedStructs) {
            code += '\n';
            code += generateNestedStruct(nested, inputType);
        }
    }

    return code;
}

// Process fields to inline nested structs if needed
function processFieldsForInline(fields, nestedStructs, inlineNestedStructs) {
    if (!inlineNestedStructs || !nestedStructs || nestedStructs.length === 0) {
        return fields;
    }

    // Create a map of nested struct names to their definitions
    const nestedMap = {};
    for (const nested of nestedStructs) {
        nestedMap[nested.name] = nested;
    }

    // Process each field
    return fields.map(field => {
        // Check if this field's type is a nested struct
        if (nestedMap[field.goType]) {
            const nested = nestedMap[field.goType];
            // Replace type with inline struct definition
            return {
                ...field,
                goType: generateInlineStruct(nested)
            };
        }
        return field;
    });
}

// Generate inline struct definition
function generateInlineStruct(nestedData) {
    let code = 'struct {\n';

    const fields = nestedData.fields;
    const maxFieldNameLen = Math.max(...fields.map(f => f.goName.length));
    const maxTypeLen = Math.max(...fields.map(f => f.goType.length));

    const fieldTags = fields.map(f => `\`json:"${f.jsonName}"\``);
    const maxTagLen = Math.max(...fieldTags.map(t => t.length));

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const tag = fieldTags[i];

        const fieldName = field.goName.padEnd(maxFieldNameLen);
        const fieldType = field.goType.padEnd(maxTypeLen);
        const tagStr = tag.padEnd(maxTagLen);
        const comment = field.comment ? ` // ${field.comment}` : '';

        code += `        ${fieldName} ${fieldType} ${tagStr}${comment}\n`;
    }

    code += `    }`;

    return code;
}

// Generate field tag based on input type
function generateFieldTag(field, inputType) {
    if (inputType === 'json') {
        // JSON input: only json tag
        return `\`json:"${field.jsonName}"\``;
    } else {
        // DDL input: json + gorm tags
        return generateGormTag(field);
    }
}

// Generate gorm tag for a field
function generateGormTag(field) {
    const jsonTag = `json:"${field.jsonName}"`;

    let gormParts = [`column:${field.dbColumn}`];

    if (field.isPrimaryKey) {
        gormParts.push('primaryKey');
    }

    if (field.isAutoIncrement) {
        gormParts.push('autoIncrement');
    }

    if (!field.nullable) {
        gormParts.push('not null');
    }

    const gormTag = `gorm:"${gormParts.join(';')}"`;

    return `\`${jsonTag} ${gormTag}\``;
}

// Generate nested struct (for JSON objects)
function generateNestedStruct(nestedData, inputType = 'ddl') {
    let code = '';

    code += `// ${nestedData.name} 嵌套结构\n`;
    code += `type ${nestedData.name} struct {\n`;

    const fields = nestedData.fields;
    const maxFieldNameLen = Math.max(...fields.map(f => f.goName.length));
    const maxTypeLen = Math.max(...fields.map(f => f.goType.length));

    const fieldTags = fields.map(f => {
        if (inputType === 'json') {
            return `\`json:"${f.jsonName}"\``;
        } else {
            return `\`json:"${f.jsonName}"\``;  // Nested structs from JSON only have json tags
        }
    });
    const maxTagLen = Math.max(...fieldTags.map(t => t.length));

    for (let i = 0; i < fields.length; i++) {
        const field = fields[i];
        const tag = fieldTags[i];

        const fieldName = field.goName.padEnd(maxFieldNameLen);
        const fieldType = field.goType.padEnd(maxTypeLen);
        const tagStr = tag.padEnd(maxTagLen);
        const comment = field.comment ? ` // ${field.comment}` : '';

        code += `    ${fieldName} ${fieldType} ${tagStr}${comment}\n`;
    }

    code += `}\n`;

    return code;
}

// Convert snake_case to PascalCase
function snakeToCamel(str) {
    if (!str) return '';

    // Split by underscores and capitalize first letter of each word
    return str
        .split('_')
        .map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('');
}

// Determine required imports based on field types
function getRequiredImports(fields) {
    const imports = new Set();

    for (const field of fields) {
        if (field.goType === 'time.Time') {
            imports.add('time');
        }
        if (field.goType === 'json.RawMessage') {
            imports.add('encoding/json');
        }
    }

    return Array.from(imports);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateGoStruct, generateGormTag, getRequiredImports };
}
