// XML Parser
// Parses XML content using fast-xml-parser library

function parseXML(content) {
    try {
        if (typeof XMLParser === 'undefined' && typeof fxparser === 'undefined') {
            return { error: 'fast-xml-parser library not loaded' };
        }

        const Parser = typeof XMLParser !== 'undefined' ? XMLParser : fxparser.XMLParser;
        const parser = new Parser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            textNodeName: '#text'
        });

        const data = parser.parse(content);
        return {
            type: 'xml',
            data: data,
            raw: content
        };
    } catch (e) {
        return { error: `XML 解析错误: ${e.message}` };
    }
}
