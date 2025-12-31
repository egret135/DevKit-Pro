/**
 * HistoryManager - Manages local history using localStorage
 */
class HistoryManager {
    constructor(prefix = 'devkit_pro_') {
        this.prefix = prefix;
    }

    /**
     * Save a value to local storage
     * @param {string} key 
     * @param {string|object} value 
     */
    save(key, value) {
        try {
            const storageKey = this.prefix + key;
            const serialized = typeof value === 'object' ? JSON.stringify(value) : value;
            localStorage.setItem(storageKey, serialized);
        } catch (e) {
            console.error('Failed to save history:', e);
        }
    }

    /**
     * Load a value from local storage
     * @param {string} key 
     * @param {any} defaultValue 
     * @returns {string}
     */
    load(key, defaultValue = null) {
        try {
            const storageKey = this.prefix + key;
            const value = localStorage.getItem(storageKey);
            if (value === null) return defaultValue;

            // Return raw string value. Caller should parse if expecting an object.
            return value;
        } catch (e) {
            console.error('Failed to load history:', e);
            return defaultValue;
        }
    }

    /**
     * Clear specific history item
     * @param {string} key 
     */
    remove(key) {
        localStorage.removeItem(this.prefix + key);
    }

    /**
     * Debounce save operation
     * @param {Function} func 
     * @param {number} wait 
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Export global instance
window.historyManager = new HistoryManager();
