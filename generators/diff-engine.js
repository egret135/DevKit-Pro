// DDL Diff Engine
// Compares two DDL schemas and generates ALTER statements

class DiffEngine {
    constructor() {
        this.statements = [];
    }

    // Main entry point
    generateDiff(targetDDL, sourceDDL) {
        this.statements = [];

        try {
            const target = this.parseDDL(targetDDL);
            const source = this.parseDDL(sourceDDL);

            if (!target || !source) {
                return ['-- 无法解析 DDL，请确保格式正确'];
            }

            if (target.tableName !== source.tableName) {
                this.statements.push(`-- 表名不同: ${target.tableName} vs ${source.tableName}`);
                this.statements.push(`-- 假设您想修改表: ${target.tableName}`);
            }

            const tableName = target.tableName; // Use target (online) table name for ALTERs

            // 1. Check for New Columns (in Source but not in Target)
            this.checkNewColumns(tableName, target.fields, source.fields);

            // 2. Check for Modified Columns (different definitions)
            this.checkModifiedColumns(tableName, target.fields, source.fields);

            // 3. Check for Removed Columns (in Target but not in Source)
            this.checkRemovedColumns(tableName, target.fields, source.fields);

            if (this.statements.length === 0) {
                return ['-- 两个 DDL 完全一致，无需修改'];
            }

            return this.statements;

        } catch (e) {
            return [`-- Diff 错误: ${e.message}`];
        }
    }

    // Parse DDL (Wrapper around existing parser)
    parseDDL(ddl) {
        // Reuse global parseMySQLDDL from parsers/mysql-parser.js
        // We might need to enhance the parser strictly for diffing if needed
        // For now, rely on consistent formatting or re-parsing
        if (!ddl || !ddl.trim()) return null;

        // Improve robustness: Try to identify DDL type or assume MySQL
        // Since diff feature is primarily asked for DDLs, we use MySQL parser
        // If PostgreSQL/SQLite needed later, we can add detection logic
        const result = parseMySQLDDL(ddl);

        if (result.error) {
            console.error("Diff Parse Error:", result.error);
            return null;
        }

        // Enrich fields with original raw definition if possible, 
        // to make reconstruction easier. 
        // Since we don't have raw line in result, we might need to rely on what we have
        // or re-parse locally if needed. 
        // Actually, let's add a helper to reconstruct definition from parsed fields
        result.fields.forEach(field => {
            field.fullDefinition = this.reconstructDefinition(field);
        });

        return result;
    }

    // Reconstruct SQL definition from parsed field
    reconstructDefinition(field) {
        // This is a "best effort" reconstruction. 
        // Ideally we capture this during parsing, but for now we build it.
        let def = `${field.type}`;

        if (field.isUnsigned) def += ` UNSIGNED`; // Parsing needs to support isUnsigned property
        if (!field.nullable) def += ` NOT NULL`;
        if (field.isAutoIncrement) def += ` AUTO_INCREMENT`;

        // Default value handling would be good here if parser supported it

        if (field.comment) def += ` COMMENT '${field.comment}'`;

        return def;
    }

    // Check for ADD COLUMN
    checkNewColumns(tableName, targetFields, sourceFields) {
        const targetNames = new Set(targetFields.map(f => f.name.toLowerCase()));

        sourceFields.forEach(sField => {
            if (!targetNames.has(sField.name.toLowerCase())) {
                // Determine position (AFTER x)
                // For simplicity, we just add it. Advanced: find previous field.
                const statement = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${sField.name}\` ${this.getRawDefinitionFromSource(sField)};`;
                this.statements.push(statement);
            }
        });
    }

    // Check for MODIFY COLUMN
    checkModifiedColumns(tableName, targetFields, sourceFields) {
        const targetMap = new Map(targetFields.map(f => [f.name.toLowerCase(), f]));

        sourceFields.forEach(sField => {
            const tField = targetMap.get(sField.name.toLowerCase());
            if (tField) {
                // Compare logic
                if (this.isDifferent(tField, sField)) {
                    const statement = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${sField.name}\` ${this.getRawDefinitionFromSource(sField)};`;
                    this.statements.push(statement);
                }
            }
        });
    }

    // Check for DROP COLUMN
    checkRemovedColumns(tableName, targetFields, sourceFields) {
        const sourceNames = new Set(sourceFields.map(f => f.name.toLowerCase()));

        targetFields.forEach(tField => {
            if (!sourceNames.has(tField.name.toLowerCase())) {
                const statement = `ALTER TABLE \`${tableName}\` DROP COLUMN \`${tField.name}\`;`;
                this.statements.push(statement);
            }
        });
    }

    // Helper: Compare two fields
    isDifferent(tField, sField) {
        // Simple comparison: Type, Nullable, AutoIncrement, Comment

        // Normalize types (e.g., lower case)
        if (tField.type.toLowerCase() !== sField.type.toLowerCase()) return true;

        if (tField.nullable !== sField.nullable) return true;
        if (tField.isAutoIncrement !== sField.isAutoIncrement) return true;

        // Comment change?
        if ((tField.comment || '') !== (sField.comment || '')) return true;

        return false;
    }

    // Helper: Get raw definition (Need to capture raw lines from parser ideally)
    // Since current parser doesn't save raw line, we reuse the reconstruction
    // OR we can upgrade parser. For now, reconstruction.
    getRawDefinitionFromSource(field) {
        // Better: We should match the field back to the DDL line provided?
        // That's complex. Let's rely on reconstruction for now, 
        // acknowledging potential minor formatting loss.
        return this.reconstructDefinition(field);
    }
}

// Global instance
const diffEngine = new DiffEngine();
