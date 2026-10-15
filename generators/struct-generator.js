// Go Struct Generator
// Generates Go structs from the unified model (DDL tables or JSON structs):
// nullable styles, json/gorm/db tags, multi-table output, optional package/import header.

const GO_DDL_INPUTS = ['mysql', 'postgresql', 'sqlite', 'ddl'];
const GO_INDENT = '    ';

const GO_SQL_NULL_TYPES = {
    'string': 'sql.NullString',
    'bool': 'sql.NullBool',
    'int8': 'sql.NullInt16',
    'int16': 'sql.NullInt16',
    'int32': 'sql.NullInt32',
    'int64': 'sql.NullInt64',
    'int': 'sql.NullInt64',
    'uint8': 'sql.NullByte',
    'uint16': 'sql.NullInt32',
    'uint32': 'sql.NullInt64',
    'uint64': 'sql.NullInt64',
    'uint': 'sql.NullInt64',
    'float32': 'sql.NullFloat64',
    'float64': 'sql.NullFloat64',
    'time.Time': 'sql.NullTime'
};

function normalizeGoOptions(parsedData, options = {}) {
    return {
        structName: options.structName || '',
        packageName: options.packageName || 'model',
        generateTableName: options.generateTableName !== false,
        inlineNestedStructs: options.inlineNestedStructs !== false,
        isDDL: GO_DDL_INPUTS.includes(options.inputType || 'ddl'),
        nullableStyle: options.nullableStyle || 'plain',
        omitempty: !!options.omitempty,
        tagStyle: options.tagStyle || 'gorm',
        gormDetail: !!options.gormDetail,
        withHeader: !!options.withHeader
    };
}

// 统一模型：兼容只有 fields/tableName 的旧结构
function goTablesOf(parsedData, opts) {
    let tables = parsedData.tables && parsedData.tables.length
        ? parsedData.tables
        : (parsedData.fields && parsedData.fields.length
            ? [{
                structName: parsedData.structName || GoNaming.toPascal(parsedData.tableName || 'Model'),
                tableName: parsedData.tableName || '',
                comment: parsedData.comment || '',
                fields: parsedData.fields
            }]
            : []);
    if (opts.structName && tables.length === 1 && !parsedData.rootAlias) {
        tables = [Object.assign({}, tables[0], { structName: opts.structName })];
    }
    return tables;
}

function generateGoStruct(parsedData, options = {}) {
    return renderGo(parsedData, options).code;
}

// 生成完整 .go 文件（package + import + 代码）
function buildGoFile(parsedData, options = {}) {
    return renderGo(parsedData, Object.assign({}, options, { withHeader: true })).code;
}

function renderGo(parsedData, options) {
    const opts = normalizeGoOptions(parsedData, options);
    const ctx = { opts, imports: new Set(), nestedMap: {} };
    for (const nested of parsedData.nestedStructs || []) ctx.nestedMap[nested.name] = nested;

    const blocks = [];
    if (parsedData.rootAlias) {
        const alias = parsedData.rootAlias;
        noteGoImports(alias.elemType, ctx);
        blocks.push(`// ${alias.name} 顶层数组\ntype ${alias.name} []${alias.elemType}\n`);
    }

    const tables = goTablesOf(parsedData, opts);
    for (const table of tables) {
        let block = `// ${table.structName} ${goStructComment(table, opts)}\n`;
        block += `type ${table.structName} struct {\n`;
        block += renderGoFields(table.fields, GO_INDENT, ctx).join('\n') + '\n';
        block += '}\n';
        if (opts.isDDL && opts.generateTableName && table.tableName) {
            block += `\n// TableName 返回表名\n`;
            block += `func (${table.structName}) TableName() string {\n`;
            block += `${GO_INDENT}return "${table.tableName}"\n`;
            block += `}\n`;
        }
        blocks.push(block);
    }

    if (!opts.inlineNestedStructs) {
        for (const nested of parsedData.nestedStructs || []) {
            let block = `// ${nested.name} 嵌套结构\n`;
            block += `type ${nested.name} struct {\n`;
            block += renderGoFields(nested.fields, GO_INDENT, ctx).join('\n') + '\n';
            block += '}\n';
            blocks.push(block);
        }
    }

    let code = blocks.join('\n');
    const imports = Array.from(ctx.imports).sort();
    if (opts.withHeader) code = goFileHeader(opts.packageName, imports) + code;
    return { code, imports };
}

function goStructComment(table, opts) {
    if (table.comment) return sanitizeGoComment(table.comment);
    if (opts.isDDL && table.tableName) return `对应表 ${table.tableName}`;
    return '根结构';
}

function goFileHeader(packageName, imports) {
    let head = `package ${packageName || 'model'}\n\n`;
    if (imports.length === 1) head += `import "${imports[0]}"\n\n`;
    else if (imports.length > 1) head += 'import (\n' + imports.map(i => `\t"${i}"`).join('\n') + '\n)\n\n';
    return head;
}

function noteGoImports(type, ctx) {
    if (/\btime\.Time\b/.test(type)) ctx.imports.add('time');
    if (/\bjson\.RawMessage\b/.test(type)) ctx.imports.add('encoding/json');
    if (/\bsql\.Null/.test(type)) ctx.imports.add('database/sql');
}

function resolveGoFieldType(field, opts) {
    const base = field.goBaseType || field.goType;
    const style = opts.nullableStyle;
    if (style === 'plain' || base === 'any' || base.startsWith('[]') || base === 'json.RawMessage') return base;
    if (opts.isDDL) {
        if (!field.nullable || field.isPrimaryKey) return base;
        if (style === 'sqlnull') return GO_SQL_NULL_TYPES[base] || base;
        return '*' + base;
    }
    return (field.optional || field.nullable) ? '*' + base : base;
}

function sanitizeGoComment(text) {
    return String(text || '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

function sanitizeTagValue(text) {
    return String(text || '').replace(/[`"\r\n]/g, '').replace(/;/g, ',').trim();
}

function buildGoTag(field, opts) {
    const omit = opts.omitempty || (!opts.isDDL && field.optional);
    const parts = [`json:"${field.jsonName}${omit ? ',omitempty' : ''}"`];
    if (!opts.isDDL || opts.tagStyle === 'json') return '`' + parts[0] + '`';
    if (opts.tagStyle === 'db') return '`' + parts[0] + ` db:"${field.dbColumn}"` + '`';

    const gorm = [`column:${field.dbColumn}`];
    if (opts.gormDetail && field.sqlType) gorm.push(`type:${sanitizeTagValue(field.sqlType)}`);
    if (field.isPrimaryKey) gorm.push('primaryKey');
    if (field.isAutoIncrement) gorm.push('autoIncrement');
    if (opts.gormDetail) {
        if (field.unique && !field.isPrimaryKey) gorm.push('unique');
        for (const ix of field.indexNames || []) gorm.push(`${ix.unique ? 'uniqueIndex' : 'index'}:${ix.name}`);
    }
    if (!field.nullable && !field.isPrimaryKey) gorm.push('not null');
    if (opts.gormDetail) {
        const def = field.defaultValue;
        if (def != null && !/^NULL$/i.test(def) && !/[;"`]/.test(def)) gorm.push(`default:${def}`);
        if (field.comment) gorm.push(`comment:${sanitizeTagValue(field.comment)}`);
    }
    parts.push(`gorm:"${gorm.join(';')}"`);
    return '`' + parts.join(' ') + '`';
}

// 渲染字段行；内联模式下嵌套结构展开为 struct { ... }
function renderGoFields(fields, indent, ctx) {
    const rows = fields.map(field => {
        let type = resolveGoFieldType(field, ctx.opts);
        noteGoImports(type, ctx);
        const core = type.replace(/^[*\[\]]+/, '');
        const nested = ctx.opts.inlineNestedStructs ? ctx.nestedMap[core] : null;
        let multiline = false;
        if (nested) {
            const prefix = type.slice(0, type.length - core.length);
            const inner = renderGoFields(nested.fields, indent + GO_INDENT, ctx);
            type = `${prefix}struct {\n${inner.join('\n')}\n${indent}}`;
            multiline = true;
        }
        return {
            name: field.goName,
            type,
            multiline,
            tag: buildGoTag(field, ctx.opts),
            comment: field.comment ? ` // ${sanitizeGoComment(field.comment)}` : ''
        };
    });

    const nameWidth = Math.max(0, ...rows.map(r => r.name.length));
    const typeWidth = Math.max(0, ...rows.filter(r => !r.multiline).map(r => r.type.length));
    const tagWidth = Math.max(0, ...rows.map(r => r.tag.length));

    return rows.map(r => {
        const name = r.name.padEnd(nameWidth);
        if (r.multiline) return `${indent}${name} ${r.type} ${r.tag}${r.comment}`;
        const tag = r.comment ? r.tag.padEnd(tagWidth) : r.tag;
        return `${indent}${name} ${r.type.padEnd(typeWidth)} ${tag}${r.comment}`.replace(/\s+$/, '');
    });
}

// Determine required imports based on field types (kept for compatibility)
function getRequiredImports(fields) {
    const ctx = { imports: new Set() };
    for (const field of fields || []) noteGoImports(field.goType || '', ctx);
    return Array.from(ctx.imports);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateGoStruct, buildGoFile, renderGo, getRequiredImports };
}
