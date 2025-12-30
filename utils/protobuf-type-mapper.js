// Protocol Buffer Type Mapper
// Maps JSON types to Protocol Buffer types

/**
 * Map JSON type to Protocol Buffer type
 * @param {string} jsonType - JSON type (string, int, float, boolean, array, object, null)
 * @param {object} options - Mapping options
 * @returns {string} - Protocol Buffer type
 */
function mapJSONTypeToProtobuf(jsonType, options = {}) {
    const {
        numericIntType = 'int32',    // Default integer type
        numericFloatType = 'float'   // Default float type
    } = options;

    switch (jsonType) {
        case 'string':
            return 'string';
        case 'int':
            return numericIntType;
        case 'float':
        case 'number':
            return numericFloatType;
        case 'boolean':
            return 'bool';
        case 'null':
            // proto3 doesn't support null, typically ignored or use google.protobuf.Value
            return 'string'; // Fallback to string for safety
        case 'array':
            return 'repeated'; // Will be prefixed, e.g., "repeated string"
        case 'object':
            return 'message'; // Nested message
        default:
            return jsonType; // For custom types like nested message names
    }
}

/**
 * Get all available Protocol Buffer numeric types
 * @returns {object} - Available types categorized
 */
function getProtobufNumericTypes() {
    return {
        integers: ['int32', 'int64', 'sint32', 'sint64', 'uint32', 'uint64', 'fixed32', 'fixed64', 'sfixed32', 'sfixed64'],
        floats: ['float', 'double']
    };
}

/**
 * Validate if a type is a valid Protocol Buffer type
 * @param {string} type - Type to validate
 * @returns {boolean}
 */
function isValidProtobufType(type) {
    const validTypes = [
        'double', 'float',
        'int32', 'int64', 'uint32', 'uint64', 'sint32', 'sint64',
        'fixed32', 'fixed64', 'sfixed32', 'sfixed64',
        'bool', 'string', 'bytes'
    ];
    
    return validTypes.includes(type);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        mapJSONTypeToProtobuf, 
        getProtobufNumericTypes,
        isValidProtobufType
    };
}
