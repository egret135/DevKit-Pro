// PostgreSQL DDL Parser
// Parses PostgreSQL CREATE TABLE statements (one or many) via DdlUtils, incl. COMMENT ON

function parsePostgreSQLDDL(ddl) {
    return DdlUtils.parse(ddl, field => mapPostgreSQLTypeToGo(field.baseType || field.sqlType));
}

// Map PostgreSQL types to Go types
function mapPostgreSQLTypeToGo(pgType) {
    const type = String(pgType || '').toUpperCase().replace(/\s*\(.*?\)/, '').trim();

    if (/\[\]$/.test(type)) {
        const base = mapPostgreSQLTypeToGo(type.replace(/(\[\])+$/, ''));
        return base === '[]byte' ? '[][]byte' : `[]${base}`;
    }
    if (/^(BOOLEAN|BOOL)$/.test(type)) return 'bool';
    if (/^(SMALLINT|INT2|SMALLSERIAL|SERIAL2)$/.test(type)) return 'int16';
    if (/^(INTEGER|INT|INT4|SERIAL|SERIAL4)$/.test(type)) return 'int32';
    if (/^(BIGINT|INT8|BIGSERIAL|SERIAL8)$/.test(type)) return 'int64';
    if (/^(REAL|FLOAT4)$/.test(type)) return 'float32';
    if (/^(DOUBLE PRECISION|FLOAT8|FLOAT|NUMERIC|DECIMAL|MONEY)$/.test(type)) return 'float64';
    if (/^(TIMESTAMP|TIMESTAMPTZ|DATE)\b/.test(type)) return 'time.Time';
    if (/^(TIME|TIMETZ|INTERVAL)\b/.test(type)) return 'string';
    if (/^(JSON|JSONB)$/.test(type)) return 'json.RawMessage';
    if (/^BYTEA$/.test(type)) return '[]byte';
    return 'string';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parsePostgreSQLDDL, mapPostgreSQLTypeToGo };
}
