// MySQL DDL Parser
// Parses MySQL CREATE TABLE statements (one or many) via DdlUtils

function parseMySQLDDL(ddl) {
    return DdlUtils.parse(ddl, field => mapMySQLTypeToGo(field.sqlType, field.isUnsigned));
}

// Map MySQL types to Go types
function mapMySQLTypeToGo(mysqlType, isUnsigned = false) {
    const type = String(mysqlType || '').toUpperCase();

    if (/^(TINYINT\(1\)|BOOL|BOOLEAN|BIT\(1\)|BIT$)/.test(type) && !isUnsigned) return 'bool';
    if (/^TINYINT/.test(type)) return isUnsigned ? 'uint8' : 'int8';
    if (/^SMALLINT/.test(type)) return isUnsigned ? 'uint16' : 'int16';
    if (/^(MEDIUMINT|INT|INTEGER)\b/.test(type)) return isUnsigned ? 'uint32' : 'int32';
    if (/^BIGINT/.test(type)) return isUnsigned ? 'uint64' : 'int64';
    if (/^YEAR/.test(type)) return 'int16';
    if (/^(FLOAT|REAL)\b/.test(type)) return 'float32';
    if (/^(DOUBLE|DECIMAL|NUMERIC|DEC|FIXED)\b/.test(type)) return 'float64';
    if (/^(DATETIME|TIMESTAMP|DATE)\b/.test(type)) return 'time.Time';
    if (/^TIME\b/.test(type)) return 'string';
    if (/^JSON/.test(type)) return 'json.RawMessage';
    if (/^(TINYBLOB|BLOB|MEDIUMBLOB|LONGBLOB|BINARY|VARBINARY|BIT)/.test(type)) return '[]byte';
    return 'string';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseMySQLDDL, mapMySQLTypeToGo };
}
