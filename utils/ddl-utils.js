// DDL Utilities
// Shared, quote/paren-aware scanning for CREATE TABLE parsing (MySQL / PostgreSQL / SQLite).
// All regexes here are anchored or single-pass; no nested quantifiers.

const DdlUtils = (function () {
    'use strict';

    const QUOTES = { "'": "'", '"': '"', '`': '`', '[': ']' };

    // 跳过从 i 开始的引号串，返回结束引号之后的位置
    function skipQuoted(sql, i) {
        const open = sql[i];
        const close = QUOTES[open];
        let j = i + 1;
        while (j < sql.length) {
            const ch = sql[j];
            if (ch === '\\' && open !== '[') { j += 2; continue; }
            if (ch === close) {
                if (sql[j + 1] === close && open !== '[') { j += 2; continue; }
                return j + 1;
            }
            j++;
        }
        return sql.length;
    }

    // 去掉 -- 行注释与 /* */ 块注释，保留换行以便行号定位
    function stripComments(sql) {
        let out = '';
        let i = 0;
        while (i < sql.length) {
            const ch = sql[i];
            if (ch === "'" || ch === '"' || ch === '`') {
                const end = skipQuoted(sql, i);
                out += sql.slice(i, end);
                i = end;
            } else if (ch === '-' && sql[i + 1] === '-') {
                while (i < sql.length && sql[i] !== '\n') i++;
            } else if (ch === '/' && sql[i + 1] === '*') {
                const end = sql.indexOf('*/', i + 2);
                const stop = end === -1 ? sql.length : end + 2;
                out += sql.slice(i, stop).replace(/[^\n]/g, ' ');
                i = stop;
            } else {
                out += ch;
                i++;
            }
        }
        return out;
    }

    // 引号内容替换为空格，用于在不受注释/默认值文本干扰的情况下做关键字匹配
    function maskQuoted(text) {
        let out = '';
        let i = 0;
        while (i < text.length) {
            const ch = text[i];
            if (ch === "'" || ch === '"' || ch === '`') {
                const end = skipQuoted(text, i);
                out += ch + ' '.repeat(Math.max(0, end - i - 2)) + (end - i >= 2 ? text[end - 1] : '');
                i = end;
            } else {
                out += ch;
                i++;
            }
        }
        return out;
    }

    // 从 open 处的 '(' 找到匹配的 ')'，返回其下标；找不到返回 -1
    function findClosingParen(sql, open) {
        let depth = 0;
        let i = open;
        while (i < sql.length) {
            const ch = sql[i];
            if (ch === "'" || ch === '"' || ch === '`') { i = skipQuoted(sql, i); continue; }
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) return i;
            }
            i++;
        }
        return -1;
    }

    // 按顶层逗号切分（忽略括号与引号内的逗号）
    function splitTopLevel(text, sep = ',') {
        const parts = [];
        let depth = 0;
        let start = 0;
        let i = 0;
        while (i < text.length) {
            const ch = text[i];
            if (ch === "'" || ch === '"' || ch === '`') { i = skipQuoted(text, i); continue; }
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            else if (ch === sep && depth === 0) {
                parts.push(text.slice(start, i));
                start = i + 1;
            }
            i++;
        }
        parts.push(text.slice(start));
        return parts.map(p => p.trim()).filter(Boolean);
    }

    function unquoteIdent(id) {
        const s = String(id || '').trim();
        if (s.length >= 2) {
            const open = s[0];
            if (QUOTES[open] && s[s.length - 1] === QUOTES[open]) return s.slice(1, -1);
        }
        return s;
    }

    // 读取一个（可能带引号/schema 前缀的）标识符，返回 { name, end }
    function readIdentifier(text, i) {
        while (i < text.length && /\s/.test(text[i])) i++;
        let name = '';
        for (;;) {
            if (QUOTES[text[i]] && text[i] !== "'") {
                const end = skipQuoted(text, i);
                name = unquoteIdent(text.slice(i, end));
                i = end;
            } else {
                const m = /^[\w$]+/.exec(text.slice(i, i + 256));
                if (!m) break;
                name = m[0];
                i += m[0].length;
            }
            if (text[i] === '.') { i++; continue; }
            break;
        }
        return { name, end: i };
    }

    function unquoteString(raw) {
        const s = String(raw || '');
        if (s.length >= 2 && (s[0] === "'" || s[0] === '"') && s[s.length - 1] === s[0]) {
            const q = s[0];
            return s.slice(1, -1).split(q + q).join(q).replace(/\\(.)/g, '$1');
        }
        return s;
    }

    function lineOf(text, index) {
        let line = 1;
        for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
        return line;
    }

    // 找出全部 CREATE TABLE 语句
    function extractCreateTables(sql) {
        const tables = [];
        const re = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:GLOBAL|LOCAL)\s+)?(?:TEMPORARY\s+|TEMP\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
        let m;
        while ((m = re.exec(sql)) !== null) {
            const ident = readIdentifier(sql, m.index + m[0].length);
            if (!ident.name) continue;
            const open = sql.indexOf('(', ident.end);
            if (open === -1 || sql.slice(ident.end, open).trim() !== '') continue;
            const close = findClosingParen(sql, open);
            if (close === -1) {
                tables.push({ name: ident.name, body: null, options: '', line: lineOf(sql, m.index) });
                break;
            }
            let stop = close + 1;
            while (stop < sql.length && sql[stop] !== ';') {
                if (sql[stop] === "'" || sql[stop] === '"' || sql[stop] === '`') stop = skipQuoted(sql, stop);
                else stop++;
            }
            tables.push({
                name: ident.name,
                body: sql.slice(open + 1, close),
                options: sql.slice(close + 1, stop),
                line: lineOf(sql, m.index)
            });
            re.lastIndex = stop;
        }
        return tables;
    }

    // 多词类型优先匹配（PostgreSQL 等）
    const MULTI_WORD_TYPE = /^(?:DOUBLE\s+PRECISION|CHARACTER\s+VARYING|NATIONAL\s+CHARACTER\s+VARYING|NATIONAL\s+CHAR(?:ACTER)?|BIT\s+VARYING|LONG\s+VARCHAR|(?:TIMESTAMP|TIME)(?:\s*\(\s*\d+\s*\))?\s+(?:WITH|WITHOUT)\s+TIME\s+ZONE)/i;
    const CONSTRAINT_WORD = /^(?:PRIMARY|NOT|NULL|DEFAULT|UNIQUE|CHECK|REFERENCES|CONSTRAINT|AUTO_INCREMENT|AUTOINCREMENT|COMMENT|GENERATED|COLLATE|AS)\b/i;

    // 解析列类型，返回 { sqlType, baseType, args, rest }
    function readColumnType(def) {
        let i = 0;
        while (i < def.length && /\s/.test(def[i])) i++;
        const head = def.slice(i);
        if (!head || CONSTRAINT_WORD.test(head)) {
            return { sqlType: '', baseType: '', args: '', rest: head };
        }
        let base;
        const multi = MULTI_WORD_TYPE.exec(head);
        if (multi) {
            base = multi[0];
        } else {
            const word = /^[A-Za-z_][\w]*/.exec(head);
            if (!word) return { sqlType: '', baseType: '', args: '', rest: head };
            base = word[0];
        }
        let j = base.length;
        let args = '';
        let k = j;
        while (k < head.length && head[k] === ' ') k++;
        if (head[k] === '(') {
            const close = findClosingParen(head, k);
            if (close !== -1) {
                args = head.slice(k + 1, close).trim();
                j = close + 1;
            }
        }
        while (head.slice(j, j + 2) === '[]') j += 2;
        const sqlType = head.slice(0, j).replace(/\s+/g, ' ').trim();
        let baseType = base.replace(/\s+/g, ' ').replace(/\s*\(\s*\d+\s*\)/, '').toUpperCase();
        if (/\[\]$/.test(sqlType)) baseType += '[]';
        return { sqlType, baseType, args, rest: head.slice(j) };
    }

    // 读取 DEFAULT 之后的取值（原文）
    function readDefault(rest, masked) {
        const m = /\bDEFAULT\b\s*/i.exec(masked);
        if (!m) return null;
        let i = m.index + m[0].length;
        const ch = rest[i];
        if (ch === "'" || ch === '"') return rest.slice(i, skipQuoted(rest, i));
        if (ch === '(') {
            const close = findClosingParen(rest, i);
            return close === -1 ? rest.slice(i) : rest.slice(i, close + 1);
        }
        const tok = /^[^\s,(]+/.exec(rest.slice(i));
        if (!tok) return null;
        let value = tok[0];
        const after = i + value.length;
        if (rest[after] === '(') {
            const close = findClosingParen(rest, after);
            value += close === -1 ? rest.slice(after) : rest.slice(after, close + 1);
        }
        return value;
    }

    function readComment(rest, masked) {
        const m = /\bCOMMENT\b\s*/i.exec(masked);
        if (!m) return '';
        const i = m.index + m[0].length;
        if (rest[i] !== "'" && rest[i] !== '"') return '';
        return unquoteString(rest.slice(i, skipQuoted(rest, i)));
    }

    function readColumnNames(text) {
        const open = text.indexOf('(');
        if (open === -1) return [];
        const close = findClosingParen(text, open);
        const inner = text.slice(open + 1, close === -1 ? text.length : close);
        return splitTopLevel(inner).map(c => unquoteIdent(c.replace(/\s*\(\s*\d+\s*\)/, '').replace(/\s+(ASC|DESC)\s*$/i, '').trim()));
    }

    // 表级约束：返回 { kind: 'pk'|'unique'|'index'|'skip', name, columns } 或 null（表示是列定义）
    function parseTableConstraint(item) {
        let text = item;
        let name = '';
        const cm = /^CONSTRAINT\s+/i.exec(text);
        if (cm) {
            const id = readIdentifier(text, cm[0].length);
            name = id.name;
            text = text.slice(id.end).trim();
        }
        if (/^PRIMARY\s+KEY\b/i.test(text)) {
            return { kind: 'pk', name, columns: readColumnNames(text) };
        }
        const um = /^UNIQUE(?:\s+(?:KEY|INDEX))?\b/i.exec(text);
        if (um) {
            const after = text.slice(um[0].length).trim();
            if (after[0] !== '(') {
                const id = readIdentifier(after, 0);
                if (id.name && !/^USING$/i.test(id.name)) name = id.name;
            }
            return { kind: 'unique', name, columns: readColumnNames(text) };
        }
        const im = /^(?:FULLTEXT\s+|SPATIAL\s+)?(?:KEY|INDEX)\b/i.exec(text);
        if (im) {
            const after = text.slice(im[0].length).trim();
            if (after[0] !== '(') {
                const id = readIdentifier(after, 0);
                if (id.name && !/^USING$/i.test(id.name)) name = id.name;
            }
            return { kind: 'index', name, columns: readColumnNames(text) };
        }
        if (cm || /^(?:FOREIGN\s+KEY|CHECK|EXCLUDE|PERIOD)\b/i.test(text)) {
            return { kind: 'skip' };
        }
        return null;
    }

    function indexName(kind, table, columns) {
        return (kind === 'unique' ? 'uk_' : 'idx_') + table + '_' + columns.join('_');
    }

    // PostgreSQL / 通用 COMMENT ON 语句
    function extractCommentOn(sql) {
        const result = { tables: {}, columns: {} };
        const re = /\bCOMMENT\s+ON\s+(COLUMN|TABLE)\s+([\w."`]+)\s+IS\s+('(?:[^']|'')*')/gi;
        let m;
        while ((m = re.exec(sql)) !== null) {
            const parts = m[2].split('.').map(unquoteIdent);
            const text = unquoteString(m[3]);
            if (m[1].toUpperCase() === 'TABLE') {
                result.tables[parts[parts.length - 1]] = text;
            } else if (parts.length >= 2) {
                result.columns[parts[parts.length - 2] + '.' + parts[parts.length - 1]] = text;
            }
        }
        return result;
    }

    // 独立的 CREATE [UNIQUE] INDEX 语句
    function extractCreateIndexes(sql) {
        const list = [];
        const re = /\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w."`]+)\s+ON\s+(?:ONLY\s+)?([\w."`]+)/gi;
        let m;
        while ((m = re.exec(sql)) !== null) {
            const tableParts = m[3].split('.');
            const nameParts = m[2].split('.');
            const columns = readColumnNames(sql.slice(re.lastIndex, re.lastIndex + 2000));
            list.push({
                unique: !!m[1],
                name: unquoteIdent(nameParts[nameParts.length - 1]),
                table: unquoteIdent(tableParts[tableParts.length - 1]),
                columns
            });
        }
        return list;
    }

    /**
     * 通用 DDL 解析入口
     * @param {string} ddl
     * @param {function} mapType (field) => goType，field 含 baseType/args/sqlType/isUnsigned
     * @returns {{tables, tableName, structName, fields, comment, nestedStructs, error, errorLine}}
     */
    function parse(ddl, mapType) {
        const result = { tables: [], tableName: '', structName: '', fields: [], comment: '', nestedStructs: [], error: null, errorLine: 0 };
        try {
            const sql = stripComments(String(ddl || ''));
            const raw = extractCreateTables(sql);
            if (raw.length === 0) throw new Error('未找到 CREATE TABLE 语句');

            const commentOn = extractCommentOn(sql);
            const extraIndexes = extractCreateIndexes(sql);

            for (const t of raw) {
                if (t.body === null) {
                    result.errorLine = t.line;
                    throw new Error(`表 ${t.name} 的括号未闭合（第 ${t.line} 行）`);
                }
                const table = buildTable(t, mapType, commentOn, extraIndexes);
                if (table.fields.length === 0) {
                    result.errorLine = t.line;
                    throw new Error(`表 ${t.name} 未解析到任何字段（第 ${t.line} 行）`);
                }
                result.tables.push(table);
            }

            const usedStructNames = new Set();
            for (const table of result.tables) {
                table.structName = GoNaming.unique(GoNaming.toPascal(table.tableName), usedStructNames);
            }

            const first = result.tables[0];
            result.tableName = first.tableName;
            result.structName = first.structName;
            result.fields = first.fields;
            result.comment = first.comment;
        } catch (error) {
            result.error = error.message;
        }
        return result;
    }

    function buildTable(raw, mapType, commentOn, extraIndexes) {
        const table = { tableName: raw.name, structName: '', comment: '', fields: [], indexes: [], line: raw.line };
        const items = splitTopLevel(raw.body);
        const constraints = [];
        const usedGoNames = new Set();

        for (const item of items) {
            const constraint = parseTableConstraint(item);
            if (constraint) {
                if (constraint.kind !== 'skip') constraints.push(constraint);
                continue;
            }
            if (/^(?:LIKE|PERIOD)\b/i.test(item)) continue;

            const ident = readIdentifier(item, 0);
            if (!ident.name) continue;
            const type = readColumnType(item.slice(ident.end));
            const rest = type.rest;
            const masked = maskQuoted(rest);
            const upperType = type.sqlType.toUpperCase();

            const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(masked);
            const field = {
                name: ident.name,
                goName: GoNaming.unique(GoNaming.toPascal(ident.name), usedGoNames),
                type: type.sqlType,
                sqlType: type.sqlType,
                baseType: type.baseType,
                typeArgs: type.args,
                size: /^\d+$/.test(type.args) ? parseInt(type.args, 10) : 0,
                isUnsigned: /\bUNSIGNED\b/i.test(masked) || /\bUNSIGNED\b/.test(upperType),
                nullable: !isPrimaryKey && !/\bNOT\s+NULL\b/i.test(masked),
                isPrimaryKey,
                isAutoIncrement: /\bAUTO_?INCREMENT\b/i.test(masked) ||
                    /^(?:SMALL|BIG)?SERIAL\d?$/.test(type.baseType) ||
                    /\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(masked),
                unique: /\bUNIQUE\b/i.test(masked),
                defaultValue: readDefault(rest, masked),
                comment: readComment(rest, masked) || commentOn.columns[raw.name + '.' + ident.name] || '',
                indexNames: [],
                jsonName: ident.name,
                dbColumn: ident.name
            };
            field.goType = mapType(field);
            field.goBaseType = field.goType;
            table.fields.push(field);
        }

        const byName = new Map(table.fields.map(f => [f.name.toLowerCase(), f]));
        const indexes = constraints.concat(
            extraIndexes.filter(ix => ix.table === raw.name).map(ix => ({ kind: ix.unique ? 'unique' : 'index', name: ix.name, columns: ix.columns }))
        );
        for (const c of indexes) {
            const cols = c.columns.map(col => byName.get(String(col).toLowerCase())).filter(Boolean);
            if (cols.length === 0) continue;
            if (c.kind === 'pk') {
                cols.forEach(f => { f.isPrimaryKey = true; f.nullable = false; });
                continue;
            }
            const unique = c.kind === 'unique';
            if (unique && cols.length === 1 && !c.name) {
                cols[0].unique = true;
                continue;
            }
            const name = c.name || indexName(c.kind, raw.name, cols.map(f => f.name));
            table.indexes.push({ name, unique, columns: cols.map(f => f.name) });
            cols.forEach(f => f.indexNames.push({ name, unique }));
        }

        const opts = maskQuoted(raw.options);
        const cm = /\bCOMMENT\s*=?\s*/i.exec(opts);
        if (cm) {
            const i = cm.index + cm[0].length;
            if (raw.options[i] === "'" || raw.options[i] === '"') {
                table.comment = unquoteString(raw.options.slice(i, skipQuoted(raw.options, i)));
            }
        }
        if (!table.comment && commentOn.tables[raw.name]) table.comment = commentOn.tables[raw.name];
        return table;
    }

    return {
        stripComments, maskQuoted, findClosingParen, splitTopLevel, unquoteIdent, unquoteString,
        readIdentifier, readColumnType, extractCreateTables, parseTableConstraint, lineOf, parse
    };
})();

if (typeof window !== 'undefined') window.DdlUtils = DdlUtils;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DdlUtils };
}
