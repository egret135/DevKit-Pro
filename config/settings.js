// Settings Manager
// Handles user configuration storage and retrieval

const Settings = {
    // Default settings
    defaults: {
        structName: '',
        packageName: 'model',
        generateTableName: true,
        theme: 'dark',
        editorTheme: 'dracula',
        editorFont: "'JetBrains Mono', monospace",
        autoFormat: 'always',  // 'always', 'paste', 'never'
        formatIndent: 4,       // 2, 4, or 'tab'
        lastMode: 'converter',  // 'converter', 'diff', 'markdown', 'json', 'toolbox'
        jsonCompareMode: 'structural', // 'structural' | 'sideBySide'
        jsonSortKeysOnCompare: true,
        jsonSubView: 'format', // 'format' | 'compare'
        jsonAutoFormat: true
    },

    getStorageArea() {
        if (typeof chrome === 'undefined' || !chrome.storage) return null;
        return {
            primary: chrome.storage.sync || null,
            fallback: chrome.storage.local || null
        };
    },

    // Load settings from extension storage
    async load() {
        return new Promise((resolve) => {
            const storage = this.getStorageArea();

            const resolveFromLocalStorage = () => {
                try {
                    const stored = localStorage.getItem('settings');
                    const settings = stored ? JSON.parse(stored) : this.defaults;
                    resolve({ ...this.defaults, ...(settings || {}) });
                } catch (_) {
                    resolve({ ...this.defaults });
                }
            };

            const readFromArea = (area, onError) => {
                area.get(['settings'], (result) => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        onError();
                        return;
                    }
                    if (result == null) {
                        onError();
                        return;
                    }
                    const settings = (result && result.settings) || this.defaults;
                    resolve({ ...this.defaults, ...settings });
                });
            };

            if (storage && storage.primary) {
                readFromArea(storage.primary, () => {
                    if (storage.fallback && storage.fallback !== storage.primary) {
                        readFromArea(storage.fallback, resolveFromLocalStorage);
                        return;
                    }
                    resolveFromLocalStorage();
                });
                return;
            }

            if (storage && storage.fallback) {
                readFromArea(storage.fallback, resolveFromLocalStorage);
                return;
            }

            resolveFromLocalStorage();
        });
    },

    // Save settings to extension storage
    async save(settings) {
        return new Promise((resolve) => {
            const storage = this.getStorageArea();

            const saveToLocalStorage = () => {
                try {
                    localStorage.setItem('settings', JSON.stringify(settings));
                } catch (_) {
                    // Ignore localStorage write failures and keep app flow running.
                }
                resolve();
            };

            const writeToArea = (area, onError) => {
                area.set({ settings }, () => {
                    if (chrome.runtime && chrome.runtime.lastError) {
                        onError();
                        return;
                    }
                    resolve();
                });
            };

            if (storage && storage.primary) {
                writeToArea(storage.primary, () => {
                    if (storage.fallback && storage.fallback !== storage.primary) {
                        writeToArea(storage.fallback, saveToLocalStorage);
                        return;
                    }
                    saveToLocalStorage();
                });
                return;
            }

            if (storage && storage.fallback) {
                writeToArea(storage.fallback, saveToLocalStorage);
                return;
            }

            saveToLocalStorage();
        });
    },

    // Get a specific setting
    async get(key) {
        const settings = await this.load();
        return settings[key];
    },

    // Set a specific setting
    async set(key, value) {
        const settings = await this.load();
        settings[key] = value;
        await this.save(settings);
    },

    // Reset to defaults
    async reset() {
        await this.save(this.defaults);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Settings };
}
