// TOML Parser
// Parses TOML content using inline TOML library

function parseTOML(content) {
    try {
        if (typeof TOML === 'undefined' || typeof TOML.parse !== 'function') {
            return { error: 'TOML library not loaded' };
        }

        const data = TOML.parse(content);
        return {
            type: 'toml',
            data: data,
            raw: content
        };
    } catch (e) {
        return { error: `TOML 解析错误: ${e.message}` };
    }
}
