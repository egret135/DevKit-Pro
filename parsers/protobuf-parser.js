// Protocol Buffer Parser
// Parses JSON and prepares data for Protocol Buffer message generation

/**
 * Parse JSON for Protocol Buffer message generation
 * Reuses parseJSON() from json-parser.js and adds Protocol Buffer specific metadata
 * @param {string} jsonStr - JSON string
 * @param {string} messageName - Name of the Protocol Buffer message
 * @returns {object} - Parsed data with Protocol Buffer metadata
 */
function parseJSONForProtobuf(jsonStr, messageName = 'Message') {
    // Reuse JSON parser
    const result = parseJSON(jsonStr, messageName);

    if (result.error) {
        return result;
    }

    // Add Protocol Buffer specific metadata
    addProtobufMetadata(result.fields, 1);

    // Process nested structs
    if (result.nestedStructs && result.nestedStructs.length > 0) {
        for (const nested of result.nestedStructs) {
            addProtobufMetadata(nested.fields, 1);
        }
    }

    return result;
}

/**
 * Add Protocol Buffer metadata to fields (field numbers, etc.)
 * @param {Array} fields - Array of field objects
 * @param {number} startNumber - Starting field number
 */
function addProtobufMetadata(fields, startNumber = 1) {
    let fieldNumber = startNumber;

    for (const field of fields) {
        // Add field number (sequential)
        field.protoFieldNumber = fieldNumber++;

        // Mark repeated fields (arrays)
        field.isRepeated = field.goType.startsWith('[]');

        // Clean up goType for proto (remove [] prefix if array)
        if (field.isRepeated) {
            field.protoElementType = field.goType.substring(2); // Remove "[]"
        } else {
            field.protoElementType = field.goType;
        }
    }
}

/**
 * Convert snake_case or camelCase to PascalCase for message names
 * @param {string} str - Input string
 * @returns {string} - PascalCase string
 */
function toPascalCase(str) {
    if (!str) return '';

    // Handle snake_case
    return str
        .split('_')
        .map(word => {
            if (!word) return '';
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join('');
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseJSONForProtobuf,
        addProtobufMetadata,
        toPascalCase
    };
}
