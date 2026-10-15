// TypeScript Interface Generator
// Generates `export interface` declarations from the unified model (JSON structs or DDL tables)

const TS_DDL_INPUTS = ['mysql', 'postgresql', 'sqlite', 'ddl'];
const TS_SCALARS = {
    'string': 'string',
    'bool': 'boolean',
    'time.Time': 'string',
    'json.RawMessage': 'unknown',
    '[]byte': 'string',
    'any': 'unknown',
    'interface{}': 'unknown'
};

function tsTypeOf(goType) {
    const t = String(goType || 'any');
    if (TS_SCALARS[t]) return TS_SCALARS[t];
    if (/^u?int(8|16|32|64)?$|^float(32|64)$/.test(t)) return 'number';
    if (t.startsWith('[]')) {
        const el = tsTypeOf(t.slice(2));
        return /[\s|]/.test(el) ? `Array<${el}>` : `${el}[]`;
    }
    return t;
}

function tsPropName(name) {
    return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function tsDoc(comment, indent) {
    const text = String(comment || '').replace(/\s*[\r\n]+\s*/g, ' ').replace(/\*\//g, '* /').trim();
    return text ? `${indent}/** ${text} */\n` : '';
}

function renderTsInterface(name, fields, comment, isDDL) {
    let code = tsDoc(comment, '');
    code += `export interface ${name} {\n`;
    for (const field of fields) {
        let type = tsTypeOf(field.goBaseType || field.goType);
        if (field.nullable && !field.isPrimaryKey && type !== 'unknown') type += ' | null';
        const optional = !isDDL && field.optional ? '?' : '';
        code += tsDoc(field.comment, '  ');
        code += `  ${tsPropName(field.jsonName || field.name)}${optional}: ${type};\n`;
    }
    code += '}\n';
    return code;
}

/**
 * @param {object} parsedData - parseJSON / DDL parser result
 * @param {object} options - { inputType, structName }
 */
function generateTypeScript(parsedData, options = {}) {
    const isDDL = options.inputType ? TS_DDL_INPUTS.includes(options.inputType) : !!parsedData.tableName;
    let tables = parsedData.tables && parsedData.tables.length
        ? parsedData.tables
        : (parsedData.fields && parsedData.fields.length
            ? [{ structName: parsedData.structName || 'Model', tableName: parsedData.tableName || '', fields: parsedData.fields }]
            : []);
    if (options.structName && tables.length === 1 && !parsedData.rootAlias && isDDL) {
        tables = [Object.assign({}, tables[0], { structName: options.structName })];
    }

    const blocks = [];
    if (parsedData.rootAlias) {
        const el = tsTypeOf(parsedData.rootAlias.elemType);
        blocks.push(`export type ${parsedData.rootAlias.name} = ${/[\s|]/.test(el) ? `Array<${el}>` : `${el}[]`};\n`);
    }
    for (const table of tables) {
        const comment = table.comment || (table.tableName ? `对应表 ${table.tableName}` : '');
        blocks.push(renderTsInterface(table.structName, table.fields, comment, isDDL));
    }
    for (const nested of parsedData.nestedStructs || []) {
        blocks.push(renderTsInterface(nested.name, nested.fields, '', isDDL));
    }
    return blocks.join('\n');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateTypeScript, tsTypeOf };
}
