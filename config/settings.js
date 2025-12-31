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
        editorFont: "'JetBrains Mono', monospace"
    },

    // Load settings from chrome.storage
    async load() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.get(['settings'], (result) => {
                    const settings = result.settings || this.defaults;
                    resolve({ ...this.defaults, ...settings });
                });
            } else {
                // Fallback to localStorage
                const stored = localStorage.getItem('settings');
                const settings = stored ? JSON.parse(stored) : this.defaults;
                resolve({ ...this.defaults, ...settings });
            }
        });
    },

    // Save settings to chrome.storage
    async save(settings) {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage) {
                chrome.storage.sync.set({ settings }, () => {
                    resolve();
                });
            } else {
                // Fallback to localStorage
                localStorage.setItem('settings', JSON.stringify(settings));
                resolve();
            }
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
