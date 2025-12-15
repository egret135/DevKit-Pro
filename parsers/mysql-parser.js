// MySQL DDL Parser
// Parses MySQL CREATE TABLE statements and extracts field information

function parseMySQLDDL(ddl) {
    const result = {
        tableName: '',
        fields: [],
        error: null
    };

    try {
        // Extract table name
        const tableNameMatch = ddl.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/i);
        if (!tableNameMatch) {
            throw new Error('无法解析表名');
        }
        result.tableName = tableNameMatch[1];

        // Extract fields section (between parentheses)
        const fieldsMatch = ddl.match(/\(([\s\S]+)\)/);
        if (!fieldsMatch) {
            throw new Error('无法解析字段定义');
        }

        const fieldsSection = fieldsMatch[1];

        // Split by lines and parse each field
        const lines = fieldsSection.split(/,\s*\n/).map(line => line.trim());

        for (const line of lines) {
            // Skip constraints like PRIMARY KEY, KEY, UNIQUE, etc.
            if (/^(PRIMARY\s+KEY|KEY|UNIQUE|INDEX|CONSTRAINT|FOREIGN\s+KEY)/i.test(line)) {
                continue;
            }

            // Parse field: name type [constraints] [COMMENT 'comment']
            const fieldMatch = line.match(/^`?(\w+)`?\s+(\w+(?:\([^)]+\))?)\s*(.*)/i);
            if (!fieldMatch) continue;

            const fieldName = fieldMatch[1];
            const fieldType = fieldMatch[2];
            const constraints = fieldMatch[3] || '';

            // Extract comment
            const commentMatch = constraints.match(/COMMENT\s+['"](.*?)['"]/i);
            const comment = commentMatch ? commentMatch[1] : '';

            // Check if nullable
            const nullable = !/NOT\s+NULL/i.test(constraints);

            // Check if primary key
            const isPrimaryKey = /PRIMARY\s+KEY/i.test(constraints) || /AUTO_INCREMENT/i.test(constraints);

            // Check if auto increment
            const isAutoIncrement = /AUTO_INCREMENT/i.test(constraints);

            // Check if unsigned
            const isUnsigned = /UNSIGNED/i.test(constraints) || /UNSIGNED/i.test(fieldType);

            // Map MySQL type to Go type
            const goType = mapMySQLTypeToGo(fieldType, isUnsigned);

            // Generate Go field name (snake_case to CamelCase)
            const goFieldName = snakeToCamel(fieldName);

            result.fields.push({
                name: fieldName,
                goName: goFieldName,
                type: fieldType,
                goType: goType,
                nullable: nullable,
                isPrimaryKey: isPrimaryKey,
                isAutoIncrement: isAutoIncrement,
                comment: comment || fieldName,
                jsonName: fieldName,
                dbColumn: fieldName
            });
        }

    } catch (error) {
        result.error = error.message;
    }

    return result;
}

// Map MySQL types to Go types
function mapMySQLTypeToGo(mysqlType, isUnsigned = false) {
    const type = mysqlType.toUpperCase();

    // TINYINT(1) is boolean (unless explicit handling wanted, but keep bool for now)
    if (type.match(/^TINYINT\(1\)/) && !isUnsigned) {
        return 'bool';
    }

    // Integer types with precise mapping
    // INT8/UINT8
    if (type.match(/^TINYINT/)) {
        return isUnsigned ? 'uint8' : 'int8';
    }

    // INT16/UINT16
    if (type.match(/^SMALLINT/)) {
        return isUnsigned ? 'uint16' : 'int16';
    }

    // INT/UINT (MediumInt is 24-bit, fits in 32-bit int)
    if (type.match(/^MEDIUMINT/)) {
        return isUnsigned ? 'uint' : 'int';
    }

    // INT/UINT
    if (type.match(/^(INT|INTEGER)/)) {
        return isUnsigned ? 'uint' : 'int';
    }

    // INT64/UINT64
    if (type.match(/^BIGINT/)) {
        return isUnsigned ? 'uint64' : 'int64';
    }

    // String types
    if (type.match(/^(VARCHAR|CHAR|TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT)/)) {
        return 'string';
    }

    // Float types
    if (type.match(/^(FLOAT|DOUBLE|DECIMAL|NUMERIC)/)) {
        return 'float64';
    }

    // Date/Time types
    if (type.match(/^(DATE|DATETIME|TIMESTAMP|TIME)/)) {
        return 'time.Time';
    }

    // JSON type
    if (type.match(/^JSON/)) {
        return 'json.RawMessage';
    }

    // Binary types
    if (type.match(/^(BLOB|BINARY|VARBINARY)/)) {
        return '[]byte';
    }

    // Default to string
    return 'string';
}

// Convert snake_case to CamelCase
function snakeToCamel(str) {
    return str.replace(/([-_][a-z])/g, (group) =>
        group.toUpperCase().replace('-', '').replace('_', '')
    ).replace(/^[a-z]/, (char) => char.toUpperCase());
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMySQLDDL, mapMySQLTypeToGo, snakeToCamel };
}
