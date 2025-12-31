// YAML Parser
// Parses YAML content using js-yaml library

function parseYAML(content) {
    try {
        if (typeof jsyaml === 'undefined') {
            return { error: 'js-yaml library not loaded' };
        }

        const data = jsyaml.load(content);
        return {
            type: 'yaml',
            data: data,
            raw: content
        };
    } catch (e) {
        return { error: `YAML 解析错误: ${e.message}` };
    }
}
