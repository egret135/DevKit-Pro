// CodeMirror TOML mode (simple implementation)
(function (mod) {
    if (typeof exports == "object" && typeof module == "object")
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd)
        define(["../../lib/codemirror"], mod);
    else
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";

    CodeMirror.defineMode("toml", function () {
        return {
            token: function (stream, state) {
                // Comments
                if (stream.match(/^#.*/)) {
                    return "comment";
                }

                // Strings (double or single quoted)
                if (stream.match(/^"([^"\\]|\\.)*"/) || stream.match(/^'([^'\\]|\\.)*'/)) {
                    return "string";
                }

                // Multi-line strings
                if (stream.match(/^"""/) || stream.match(/^'''/)) {
                    return "string";
                }

                // Section headers [section] or [[array]]
                if (stream.match(/^\[\[[^\]]+\]\]/) || stream.match(/^\[[^\]]+\]/)) {
                    return "header";
                }

                // Booleans
                if (stream.match(/^(true|false)\b/)) {
                    return "atom";
                }

                // Numbers (integers, floats, hex, octal, binary)
                if (stream.match(/^0x[0-9a-fA-F_]+/) ||
                    stream.match(/^0o[0-7_]+/) ||
                    stream.match(/^0b[01_]+/) ||
                    stream.match(/^[+-]?(\d+(_\d+)*)(\.(\d+(_\d+)*))?([eE][+-]?\d+)?/)) {
                    return "number";
                }

                // Dates
                if (stream.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/)) {
                    return "number";
                }

                // Keys (before =)
                if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_.-]*\s*(?==)/)) {
                    stream.backUp(stream.current().length - stream.current().trimEnd().length);
                    return "property";
                }

                // Operators
                if (stream.match(/^[=,]/)) {
                    return "operator";
                }

                // Brackets
                if (stream.match(/^[\[\]{}]/)) {
                    return "bracket";
                }

                stream.next();
                return null;
            }
        };
    });

    CodeMirror.defineMIME("text/x-toml", "toml");
    CodeMirror.defineMIME("application/toml", "toml");

});
