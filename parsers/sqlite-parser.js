// SQLite DDL Parser
// Parses SQLite CREATE TABLE statements (one or many) via DdlUtils

function parseSQLiteDDL(ddl) {
    return DdlUtils.parse(ddl, field => mapSQLiteTypeToGo(field.baseType || field.sqlType));
}

// Map SQLite types to Go types (type affinity rules, plus common declared names)
function mapSQLiteTypeToGo(sqliteType) {
    const type = String(sqliteType || '').toUpperCase();

    if (/^(BOOLEAN|BOOL)$/.test(type)) return 'bool';
    if (/^(DATE|DATETIME|TIMESTAMP)$/.test(type)) return 'time.Time';
    if (/INT/.test(type)) return 'int64';
    if (/CHAR|CLOB|TEXT/.test(type)) return 'string';
    if (type === '') return 'string';
    if (/BLOB/.test(type)) return '[]byte';
    if (/REAL|FLOA|DOUB/.test(type)) return 'float64';
    if (/NUMERIC|DECIMAL/.test(type)) return 'float64';
    return 'string';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseSQLiteDDL, mapSQLiteTypeToGo };
}
