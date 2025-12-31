// Input Type Detector
// Auto-detect whether input is MySQL, PostgreSQL, SQLite DDL, or JSON

function detectInputType(input) {
  const trimmed = input.trim();

  // Check if it's a CREATE TABLE DDL
  if (/CREATE\s+TABLE/i.test(trimmed)) {
    // PostgreSQL specific features
    if (/SERIAL|BIGSERIAL|UUID|TEXT\[\]|JSONB|TIMESTAMPTZ/i.test(trimmed)) {
      return 'postgresql';
    }

    // MySQL specific features
    if (/AUTO_INCREMENT|TINYINT|COMMENT\s*'/i.test(trimmed)) {
      return 'mysql';
    }

    // SQLite specific features
    if (/AUTOINCREMENT(?!\w)/i.test(trimmed)) {
      return 'sqlite';
    }

    // Default to MySQL if no specific features detected
    return 'mysql';
  }

  // Check if it's valid JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      return 'json';
    }
  } catch (e) {
    // Not valid JSON
  }

  // Check if it's YAML (has key: value patterns without JSON braces)
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    // YAML detection: look for key: value patterns
    const yamlPattern = /^[a-zA-Z_][a-zA-Z0-9_]*:\s*.+$/m;
    const yamlListPattern = /^\s*-\s+.+$/m;
    if (yamlPattern.test(trimmed) || yamlListPattern.test(trimmed)) {
      // Additional checks to distinguish from other formats
      if (!trimmed.includes('=') || trimmed.includes(':')) {
        return 'yaml';
      }
    }
  }

  // Check if it's TOML (has [section] headers and key = value patterns)
  if (/^\s*\[[a-zA-Z_][a-zA-Z0-9_.-]*\]\s*$/m.test(trimmed) ||
    /^[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*.+$/m.test(trimmed)) {
    // TOML has = for assignments, not :
    if (trimmed.includes('=') && !trimmed.includes(': ')) {
      return 'toml';
    }
  }

  // Check if it's XML (starts with < or <?xml)
  if (trimmed.startsWith('<?xml') ||
    (trimmed.startsWith('<') && trimmed.endsWith('>') && /<\/[a-zA-Z]/.test(trimmed))) {
    return 'xml';
  }

  return 'unknown';
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectInputType };
}
