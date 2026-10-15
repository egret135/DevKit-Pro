// JSON Parser
// Infers Go-oriented struct models from JSON: merges array samples, distinguishes
// int/float, detects RFC3339 times, reuses identical nested structs.

const JSON_MAX_SAMPLES = 200;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const LOOSE_TIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;

function parseJSON(jsonStr, structName = 'Response') {
    const result = {
        structName: structName,
        tables: [],
        fields: [],
        nestedStructs: [],
        rootAlias: null,
        error: null,
        errorLine: 0
    };

    try {
        let root;
        try {
            root = JSON.parse(jsonStr);
        } catch (e) {
            result.errorLine = jsonErrorLine(e, jsonStr);
            throw new Error('JSON 解析失败：' + e.message);
        }
        if (root === null || typeof root !== 'object') {
            throw new Error('JSON 顶层必须是对象或数组');
        }

        const rootName = /^[A-Z][A-Za-z0-9_]*$/.test(structName) ? structName : GoNaming.toPascal(structName || 'Response');
        const builder = createStructBuilder();
        builder.used.add(rootName);

        if (Array.isArray(root)) {
            const elem = root.length ? describeValues(root.slice(0, JSON_MAX_SAMPLES)) : null;
            if (elem && elem.kind === 'object') {
                const itemName = GoNaming.unique(rootName + 'Item', builder.used);
                const fields = builder.fieldsOf(elem, itemName);
                result.tables.push({ structName: itemName, tableName: '', comment: '', fields });
                result.rootAlias = { name: rootName, elemType: itemName };
            } else {
                result.rootAlias = { name: rootName, elemType: elem ? builder.goTypeOf(elem, rootName + 'Item', rootName) : 'any' };
            }
        } else {
            const fields = builder.fieldsOf(describeValues([root]), rootName);
            result.tables.push({ structName: rootName, tableName: '', comment: '', fields });
        }

        result.nestedStructs = builder.structs;
        result.structName = result.tables[0] ? result.tables[0].structName : rootName;
        result.fields = result.tables[0] ? result.tables[0].fields : [];
    } catch (error) {
        result.error = error.message;
    }

    return result;
}

// 从 JSON.parse 错误信息里提取行号（兼容 "at position N" 与 "(line X column Y)" 两种格式）
function jsonErrorLine(err, text) {
    const msg = String(err && err.message || '');
    const lm = /line (\d+)/i.exec(msg);
    if (lm) return parseInt(lm[1], 10);
    const pm = /position (\d+)/i.exec(msg);
    if (!pm) return 0;
    const pos = parseInt(pm[1], 10);
    let line = 1;
    for (let i = 0; i < pos && i < text.length; i++) if (text[i] === '\n') line++;
    return line;
}

// 合并多个样本值，得到类型描述
function describeValues(values) {
    const desc = { kind: 'null', nullable: false, bigInt: false, looseTime: false };
    const cats = new Set();
    const objects = [];
    const arrays = [];
    let hasFloat = false;
    let allTime = true;
    let allLooseTime = true;

    for (const v of values) {
        if (v === null || v === undefined) { desc.nullable = true; continue; }
        if (Array.isArray(v)) { cats.add('array'); arrays.push(v); continue; }
        switch (typeof v) {
            case 'object': cats.add('object'); objects.push(v); break;
            case 'number':
                cats.add('number');
                if (!Number.isInteger(v)) hasFloat = true;
                else if (!Number.isSafeInteger(v)) desc.bigInt = true;
                break;
            case 'string':
                cats.add('string');
                if (!RFC3339_RE.test(v)) allTime = false;
                if (!LOOSE_TIME_RE.test(v)) allLooseTime = false;
                break;
            case 'boolean': cats.add('bool'); break;
            default: cats.add('other');
        }
    }

    if (cats.size === 0) return desc;
    if (cats.size > 1) { desc.kind = 'any'; return desc; }

    const cat = cats.values().next().value;
    if (cat === 'number') desc.kind = hasFloat ? 'float' : 'int';
    else if (cat === 'string') {
        desc.kind = allTime ? 'time' : 'string';
        desc.looseTime = !allTime && allLooseTime;
    } else if (cat === 'bool') desc.kind = 'bool';
    else if (cat === 'object') {
        desc.kind = 'object';
        const props = new Map();
        const sample = objects.slice(0, JSON_MAX_SAMPLES);
        for (const obj of sample) {
            for (const key of Object.keys(obj)) {
                let entry = props.get(key);
                if (!entry) { entry = { values: [], present: 0 }; props.set(key, entry); }
                entry.values.push(obj[key]);
                entry.present++;
            }
        }
        desc.props = Array.from(props, ([key, entry]) => ({
            key,
            optional: entry.present < sample.length,
            desc: describeValues(entry.values)
        }));
    } else if (cat === 'array') {
        desc.kind = 'array';
        const elems = [];
        for (const arr of arrays) {
            for (const item of arr) {
                if (elems.length >= JSON_MAX_SAMPLES) break;
                elems.push(item);
            }
            if (elems.length >= JSON_MAX_SAMPLES) break;
        }
        desc.elem = elems.length ? describeValues(elems) : null;
    } else {
        desc.kind = 'any';
    }
    return desc;
}

// items -> Item, categories -> Category, data -> DataItem
function singularize(name) {
    if (/ies$/.test(name) && name.length > 3) return name.slice(0, -3) + 'y';
    if (/(ses|xes|ches|shes)$/.test(name)) return name.slice(0, -2);
    if (/[^s]s$/.test(name) && name.length > 2) return name.slice(0, -1);
    return name + 'Item';
}

function createStructBuilder() {
    const used = new Set();
    const structs = [];
    const bySignature = new Map();

    function goTypeOf(desc, hint, parentName) {
        switch (desc.kind) {
            case 'bool': return 'bool';
            case 'int': return 'int64';
            case 'float': return 'float64';
            case 'string': return 'string';
            case 'time': return 'time.Time';
            case 'object': return structFor(desc, hint, parentName);
            case 'array':
                return desc.elem ? '[]' + goTypeOf(desc.elem, singularize(hint), parentName) : '[]any';
            default: return 'any';
        }
    }

    function structFor(desc, hint, parentName) {
        let name = hint;
        if (used.has(name)) name = parentName + hint;
        name = GoNaming.unique(name, used);
        const entry = { name, fields: [] };
        structs.push(entry);
        entry.fields = fieldsOf(desc, name);

        const signature = entry.fields.map(f => `${f.jsonName}:${f.goType}:${f.optional ? 1 : 0}`).join(',');
        const existing = bySignature.get(signature);
        if (existing) {
            structs.splice(structs.indexOf(entry), 1);
            used.delete(name);
            return existing;
        }
        bySignature.set(signature, name);
        return name;
    }

    function fieldsOf(desc, structName) {
        const usedGoNames = new Set();
        return (desc.props || []).map(prop => {
            const d = prop.desc;
            const goName = GoNaming.unique(GoNaming.toPascal(prop.key), usedGoNames);
            const goType = goTypeOf(d, goName, structName);
            let comment = '';
            if (d.bigInt) comment = '数值超出 JS 安全整数范围，请核对精度';
            else if (d.looseTime) comment = '时间字符串（非 RFC3339，time.Time 无法直接解析）';
            return {
                name: prop.key,
                goName,
                type: d.kind,
                goType,
                goBaseType: goType,
                nullable: d.nullable && d.kind !== 'null',
                optional: prop.optional,
                isPrimaryKey: false,
                isAutoIncrement: false,
                comment,
                jsonName: prop.key,
                dbColumn: prop.key
            };
        });
    }

    return { used, structs, goTypeOf, fieldsOf };
}

// Infer type from a single JSON value (kept for compatibility)
function inferType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
    return typeof value;
}

// Map JSON type to Go type (kept for compatibility)
function mapJSONTypeToGo(jsonType) {
    switch (jsonType) {
        case 'string': return 'string';
        case 'int': return 'int64';
        case 'float':
        case 'number': return 'float64';
        case 'boolean': return 'bool';
        case 'null': return 'any';
        default: return jsonType;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseJSON, inferType, mapJSONTypeToGo, describeValues };
}
