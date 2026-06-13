/* global JsonUtils */
'use strict';

importScripts('../utils/json-utils.js');

self.onmessage = function onMessage(event) {
    const { id, op, text, options } = event.data;

    try {
        let result;

        switch (op) {
            case 'format': {
                const formatted = JsonUtils.format(text, options || {});
                result = { text: formatted };
                break;
            }
            case 'minify': {
                result = { text: JsonUtils.minify(text) };
                break;
            }
            case 'sortKeys': {
                const parsed = JsonUtils.parse(text);
                if (!parsed.ok) {
                    throw new Error(parsed.error);
                }
                const sorted = JsonUtils.sortKeys(parsed.value);
                result = { text: JsonUtils.format(sorted, options || {}) };
                break;
            }
            default:
                throw new Error(`Unsupported worker op: ${op}`);
        }

        self.postMessage({ id, ok: true, result });
    } catch (error) {
        self.postMessage({
            id,
            ok: false,
            error: error && error.message ? error.message : String(error)
        });
    }
};
