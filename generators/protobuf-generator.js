// Protocol Buffer Message Generator
// Generates proto3 messages from the unified model (JSON structs or DDL tables)

const PROTO_DDL_INPUTS = ['mysql', 'postgresql', 'sqlite', 'ddl'];
const PROTO_IMPORTS = {
    'google.protobuf.Timestamp': 'google/protobuf/timestamp.proto',
    'google.protobuf.Value': 'google/protobuf/struct.proto',
    'google.protobuf.ListValue': 'google/protobuf/struct.proto'
};
const PROTO_SCALARS = {
    'string': 'string',
    'bool': 'bool',
    'int8': 'int32',
    'int16': 'int32',
    'int32': 'int32',
    'int': 'int32',
    'int64': 'int64',
    'uint8': 'uint32',
    'uint16': 'uint32',
    'uint32': 'uint32',
    'uint': 'uint32',
    'uint64': 'uint64',
    'float32': 'float',
    'float64': 'double',
    'time.Time': 'google.protobuf.Timestamp',
    'json.RawMessage': 'string',
    '[]byte': 'bytes',
    'any': 'google.protobuf.Value',
    'interface{}': 'google.protobuf.Value'
};

/**
 * Generate a .proto definition
 * @param {object} parsedData - parseJSON / DDL parser result
 * @param {object} options - { messageName, nestedMode, packageName, syntax, inputType, optionalNullable, decimal }
 */
function generateProtoMessage(parsedData, options = {}) {
    const opts = {
        messageName: options.messageName || '',
        nestedMode: options.nestedMode || 'separate',
        packageName: options.packageName === undefined ? 'model' : options.packageName,
        syntax: options.syntax || 'proto3',
        isDDL: options.inputType ? PROTO_DDL_INPUTS.includes(options.inputType) : !!parsedData.tableName,
        optionalNullable: !!options.optionalNullable,
        decimal: options.decimal || 'string'
    };
    const ctx = { opts, imports: new Set() };

    let tables = parsedData.tables && parsedData.tables.length
        ? parsedData.tables
        : (parsedData.fields && parsedData.fields.length
            ? [{ structName: parsedData.structName || GoNaming.toPascal(parsedData.tableName || 'Message'), tableName: parsedData.tableName || '', comment: '', fields: parsedData.fields }]
            : []);
    if (opts.messageName && tables.length === 1 && !parsedData.rootAlias && opts.isDDL) {
        tables = [Object.assign({}, tables[0], { structName: opts.messageName })];
    }

    const nested = parsedData.nestedStructs || [];
    const inlineNested = opts.nestedMode === 'inline' && !opts.isDDL;
    const blocks = [];

    if (parsedData.rootAlias) {
        const alias = parsedData.rootAlias;
        const elem = protoTypeOf(alias.elemType, null, ctx);
        blocks.push(`// ${alias.name} 顶层数组\nmessage ${alias.name} {\n  repeated ${elem.type} items = 1;\n}\n`);
    }

    tables.forEach((table, index) => {
        const comment = table.comment || (table.tableName ? `对应表 ${table.tableName}` : '');
        const inner = inlineNested && index === 0 ? nested : [];
        blocks.push(renderProtoMessage(table.structName, table.fields, comment, inner, ctx, ''));
    });

    if (!inlineNested) {
        for (const n of nested) blocks.push(renderProtoMessage(n.name, n.fields, '', [], ctx, ''));
    }

    let code = `syntax = "${opts.syntax}";\n\n`;
    if (opts.packageName) code += `package ${opts.packageName};\n\n`;
    const imports = Array.from(ctx.imports).sort();
    if (imports.length) code += imports.map(i => `import "${i}";`).join('\n') + '\n\n';
    return code + blocks.join('\n');
}

// DDL 表集合 -> proto
function generateProtoFromTables(tables, options = {}) {
    return generateProtoMessage({ tables, nestedStructs: [] }, Object.assign({ inputType: 'ddl' }, options));
}

function renderProtoMessage(name, fields, comment, nestedList, ctx, indent) {
    let code = '';
    if (comment) code += `${indent}// ${String(comment).replace(/\s*[\r\n]+\s*/g, ' ')}\n`;
    code += `${indent}message ${name} {\n`;

    for (const n of nestedList) {
        code += renderProtoMessage(n.name, n.fields, '', [], ctx, indent + '  ') + '\n';
    }

    const usedNames = new Set();
    const rows = fields.map((field, i) => {
        const mapped = protoTypeOf(field.goBaseType || field.goType, field, ctx);
        let label = '';
        if (mapped.repeated) label = 'repeated ';
        else if (ctx.opts.optionalNullable && (field.nullable || field.optional) && !field.isPrimaryKey) label = 'optional ';
        return {
            type: label + mapped.type,
            name: GoNaming.unique(GoNaming.toSnake(field.jsonName || field.name), usedNames),
            number: i + 1,
            comment: field.comment ? ` // ${String(field.comment).replace(/\s*[\r\n]+\s*/g, ' ')}` : ''
        };
    });
    const typeWidth = Math.max(0, ...rows.map(r => r.type.length));
    const nameWidth = Math.max(0, ...rows.map(r => r.name.length));
    for (const r of rows) {
        const decl = `${r.type.padEnd(typeWidth)} ${r.name.padEnd(nameWidth)} = ${r.number};`;
        code += `${indent}  ${decl}${r.comment}\n`;
    }
    code += `${indent}}\n`;
    return code;
}

function isDecimalField(field) {
    return !!field && /^(DECIMAL|NUMERIC|DEC|FIXED|MONEY)\b/i.test(field.baseType || field.sqlType || '');
}

// Go 类型 -> { type, repeated }
function protoTypeOf(goType, field, ctx) {
    let t = String(goType || 'any');
    let repeated = false;
    if (t.startsWith('[]') && t !== '[]byte') {
        repeated = true;
        t = t.slice(2);
        if (t.startsWith('[]') && t !== '[]byte') t = 'google.protobuf.ListValue';
    }
    let mapped;
    if (t === 'float64' && ctx.opts.decimal === 'string' && isDecimalField(field)) mapped = 'string';
    else mapped = PROTO_SCALARS[t] || t;
    if (PROTO_IMPORTS[mapped]) ctx.imports.add(PROTO_IMPORTS[mapped]);
    return { type: mapped, repeated };
}

// Map Go type to Protocol Buffer type (kept for compatibility)
function mapTypeToProtobuf(goType) {
    return PROTO_SCALARS[goType] || goType;
}

function toSnakeCase(fieldName) {
    return GoNaming.toSnake(fieldName);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateProtoMessage, generateProtoFromTables, mapTypeToProtobuf, toSnakeCase };
}
