/**
 * EditorManager - Manages CodeMirror instances
 */
class EditorManager {
    constructor() {
        this.editors = new Map();
        this.commonOptions = {
            theme: 'dracula',
            lineNumbers: true,
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
        };
    }

    /**
     * Initialize a CodeMirror editor from a textarea
     * @param {string} textareaId - The ID of the textarea to replace
     * @param {string} mode - The mode (language) to use (e.g., 'sql', 'go', 'javascript', 'markdown')
     * @param {Object} options - Additional CodeMirror options
     */
    initFromTextArea(textareaId, mode, options = {}) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) {
            console.warn(`Textarea with ID '${textareaId}' not found.`);
            return null;
        }

        const editorConfig = {
            ...this.commonOptions,
            mode: this._resolveMode(mode),
            ...options
        };

        const editor = CodeMirror.fromTextArea(textarea, editorConfig);

        // Ensure editor resizes properly
        editor.setSize('100%', '100%');

        this.editors.set(textareaId, editor);
        return editor;
    }

    /**
     * Get the value of an editor
     * @param {string} textareaId 
     * @returns {string}
     */
    getValue(textareaId) {
        const editor = this.editors.get(textareaId);
        if (editor) {
            return editor.getValue();
        }
        // Fallback to textarea value if editor not initialized (should not happen if usage is correct)
        const textarea = document.getElementById(textareaId);
        return textarea ? textarea.value : '';
    }

    /**
     * Set the value of an editor
     * @param {string} textareaId 
     * @param {string} value 
     */
    setValue(textareaId, value) {
        // Ensure value is a string
        const stringValue = typeof value === 'string' ? value :
            (value === null || value === undefined ? '' : JSON.stringify(value, null, 2));

        const editor = this.editors.get(textareaId);
        if (editor) {
            editor.setValue(stringValue);
        } else {
            const textarea = document.getElementById(textareaId);
            if (textarea) textarea.value = stringValue;
        }
    }

    /**
     * Get the editor instance
     * @param {string} textareaId 
     * @returns {CodeMirror}
     */
    get(textareaId) {
        return this.editors.get(textareaId);
    }

    /**
     * Set editor mode dynamically
     * @param {string} textareaId 
     * @param {string} mode 
     */
    setMode(textareaId, mode) {
        const editor = this.editors.get(textareaId);
        if (editor) {
            editor.setOption('mode', this._resolveMode(mode));
        }
    }

    _resolveMode(mode) {
        switch (mode) {
            case 'json':
                return { name: 'javascript', json: true };
            case 'mysql':
            case 'postgresql':
            case 'sqlite':
                return 'text/x-sql'; // Generic SQL for now, or specific MIME types if loaded
            case 'go':
                return 'text/x-go';
            case 'proto':
                return 'text/x-protobuf'; // Note: Requires protobuf mode to be loaded, fallback to simple mode otherwise
            default:
                return mode;
        }
    }

    /**
     * Set theme for all editors or a specific one
     * @param {string} theme 
     * @param {string} [id] Optional specific editor ID
     */
    setTheme(theme, id = null) {
        if (id) {
            const editor = this.editors.get(id);
            if (editor) editor.setOption('theme', theme);
        } else {
            this.commonOptions.theme = theme;
            this.editors.forEach(editor => {
                editor.setOption('theme', theme);
            });
        }
    }

    /**
     * Set font family for all editors
     * @param {string} fontFamily 
     */
    setFont(fontFamily) {
        // We update the CSS by injecting or modifying a style block
        let style = document.getElementById('dynamic-editor-font');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamic-editor-font';
            document.head.appendChild(style);
        }
        style.textContent = `
            .CodeMirror {
                font-family: ${fontFamily} !important;
            }
        `;
    }
}

// Export global instance
window.editorManager = new EditorManager();
