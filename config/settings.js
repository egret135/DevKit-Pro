// Settings Manager
// Handles user configuration storage and retrieval

const Settings = {
    // In-memory cache so get/set don't re-read chrome.storage on every UI tick.
    _cache: null,
    _cachePromise: null,
    _saveTimer: null,
    _saveWaitMs: 200,

    // Default settings
    defaults: {
        structName: '',
        packageName: 'model',
        generateTableName: true,
        inlineNestedStructs: true,
        converterFormat: 'go', // 'go' | 'proto' | 'ts' | 'json' | 'yaml' | 'toml'
        converterOptionsOpen: true,
        goNullableStyle: 'plain', // 'plain' | 'pointer' | 'sqlnull'
        goJsonOmitempty: false,
        goTagStyle: 'gorm', // 'gorm' | 'db' | 'json'
        goGormDetail: false,
        goWithHeader: false,
        protoNestedMode: 'separate', // 'separate' | 'inline'
        protoOptional: false,
        protoDecimalString: true,
        theme: 'dark',
        editorTheme: 'dracula',
        editorFont: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
        autoFormat: 'always',  // 'always', 'paste', 'never'
        formatIndent: 4,       // 2, 4, or 'tab'
        lastMode: 'converter',  // 'converter', 'markdown', 'json', 'toolbox', 'image', 'media'
        navCollapsed: false,
        onboardingDone: false,
        pwdOptions: {
            mode: 'random', // 'random' | 'passphrase'
            length: 16,
            count: 5,
            uppercase: true,
            lowercase: true,
            numbers: true,
            symbols: false,
            symbolCharset: '!@#$%^&*()_+-=[]{}|;:,.<>?',
            excludeAmbiguous: false,
            wordCount: 4,
            phraseSeparator: '-',
            phraseCapitalize: true,
            phraseNumber: false
        },
        uuidOptions: {
            type: 'uuid', // 'uuid' | 'snowflake' | 'nanoid'
            count: 5,
            uuidHyphen: true,
            uuidUppercase: false,
            snowflakeWorker: 1,
            snowflakeDatacenter: 1,
            nanoidSize: 21,
            nanoidAlphabet: 'url' // 'url' | 'alnum' | 'numeric'
        },
        cronOptions: {
            mode: 'expr', // 'expr' | 'builder'
            expression: '0 9 * * 1-5',
            withSeconds: false,
            nextCount: 10
        },
        base64Options: {
            mode: 'encode', // 'encode' | 'decode'
            urlSafe: false,
            noPad: false
        },
        urlOptions: {
            mode: 'encode', // 'encode' | 'decode'
            style: 'component' // 'component' | 'uri'
        },
        jwtOptions: {
            // secret intentionally not persisted
        },
        hashOptions: {
            uppercase: false,
            hmac: false
            // hmac key intentionally not persisted
        },
        regexOptions: {
            mode: 'match', // 'match' | 'replace'
            flags: 'g',
            pattern: '',
            replace: ''
        },
        codeDiffOptions: {
            ignoreWhitespace: false,
            ignoreCase: false,
            syncScroll: true,
            lang: 'auto'
        },
        colorOptions: {
            uppercase: true,
            modernSyntax: false
        },
        colorHistory: [], // '#RRGGBB' or '#RRGGBBAA', newest first, max 16
        imgConvertFormat: 'image/webp', // 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif' | 'image/x-icon' | 'image/bmp'
        imgConvertQuality: 90, // 1..100
        imgConvertBg: '#ffffff', // fill for transparent pixels when the target has no alpha
        imgConvertResize: { mode: 'original', width: 0, height: 0, percent: 100, lock: true, icoSizes: [16, 32, 48] },
        imgCompressFormat: 'auto', // 'auto' | 'keep' | 'image/jpeg' | 'image/webp' | 'image/avif' | 'image/png'
        imgCompressQuality: 75, // 1..100
        imgCompressMode: 'quality', // 'quality' | 'target'
        imgCompressTarget: { value: 200, unit: 'KB', allowShrink: true },
        imgCompressMaxDim: 0, // longest side in px, 0 = no limit
        imgCompressGuard: true, // keep the original when compression would make it bigger
        imgCompressBg: '#ffffff',
        imgEditorCropRatio: 'free', // 'free' | 'orig' | 'W:H'
        imgEditorResize: { mode: 'px', percent: 50, maxSide: 1920, lock: true, smoothing: 'high' },
        imgEditorWatermark: {
            type: 'text', text: '', font: 'sans', bold: false, size: 32, color: '#999999',
            stroke: false, strokeColor: '#ffffff', strokeWidth: 2, shadow: false,
            mode: 'tile', angle: -30, gapX: 2, gapY: 3,
            position: 'bottom-right', center: { rx: 0.5, ry: 0.5 }, margin: 24,
            opacity: 20, imageScale: 20
        },
        imgEditorExport: { format: 'image/png', quality: 92, bg: '#ffffff' },
        imgExifOrientFix: true,
        imgExifStripMode: 'lossless', // 'lossless' | 'reencode'
        imgExifExportFormat: 'image/jpeg',
        imgExifExportQuality: 95,
        imgExifExportBg: '#ffffff',
        imgDiffThreshold: 0.1,
        imgDiffIncludeAA: false,
        imgDiffAlign: 'toA', // 'toA' | 'toB' | 'fit'
        imgDiffView: 'diff', // 'diff' | 'slider' | 'onion'
        imgDiffDiffColor: '#ff0000',
        imgDiffAaColor: '#ffff00',
        imgDiffAlpha: 0.1,
        imgDiffMask: false,
        imgQrTab: 'generate', // 'generate' | 'scan'
        imgQrType: 'text', // 'text' | 'url' | 'wifi' | 'vcard'
        imgQrLevel: 'M',
        imgQrSize: 300,
        imgQrFg: '#000000',
        imgQrBg: '#ffffff',
        imgQrMargin: 2,
        imgQrRadius: 0,
        imgQrHistory: [],
        imgFavPacks: ['standard'], // 'standard' | 'apple' | 'android' | 'all'
        imgFavFit: 'contain', // 'contain' | 'cover'
        imgFavPad: 0, // 0..40 (%)
        imgFavBg: '#ffffff',
        imgFavBgTransparent: true,
        imgFavPrefix: '/',
        imgFavOptApple: true,
        imgFavOptManifest: true,
        imgFavOptTheme: true,
        imgFavThemeColor: '#1F6FEB',
        imgPhWidth: 640,
        imgPhHeight: 360,
        imgPhLock: true,
        imgPhPreset: 'custom', // '16:9' | '4:3' | '1:1' | 'social' | 'banner' | 'custom'
        imgPhPattern: 'solid', // 'solid' | 'gradient' | 'checker' | 'stripe'
        imgPhBg: '#D1D5DB',
        imgPhBg2: '#9CA3AF',
        imgPhFg: '#4B5563',
        imgPhText: '',
        imgPhFontScale: 100, // 50..200
        imgPhBold: false,
        imgPhDiagonal: false,
        imgPhFormat: 'image/png', // 'image/png' | 'image/jpeg' | 'image/webp'
        imgPhQuality: 92,
        imgPhFilename: '',
        imgPhSnippet: 'dataUri', // 'dataUri' | 'html' | 'markdown' | 'css'
        imgPhBatch: [], // widths e.g. [640, 1280]
        mediaRecSource: 'screen', // 'screen' | 'camera'
        mediaRecMic: false,
        mediaRecSysAudio: false,
        mediaRecMaxRes: 0, // 0 = original, or 1080 / 720 / 480
        mediaRecFps: 30,
        mediaRecBitrate: 'mid', // 'high' | 'mid' | 'low'
        mediaRecFilenamePrefix: 'recording',
        mediaFrmStep: 'frame', // 'frame' | '0.1' | '1' | '5'
        mediaFrmFormat: 'image/png', // 'image/png' | 'image/jpeg' | 'image/webp'
        mediaFrmQuality: 92,
        mediaFrmScale: 'original', // 'original' | '1080' | '720' | 'custom'
        mediaFrmCustomW: 1280,
        mediaFrmFilename: 'frame',
        mediaGifFps: 10, // 5 | 10 | 15 | 20
        mediaGifWidth: '320', // '240' | '320' | '480' | '640' | 'original'
        mediaGifQuality: 'mid', // 'high' | 'mid' | 'low'
        mediaGifFilename: 'video',
        mediaMcpRes: '0', // '0' | '1080' | '720' | '480'
        mediaMcpBitrate: 'mid', // 'high' | 'mid' | 'low' | 'min'
        mediaMcpFps: 30, // 24 | 30
        mediaMcpKeepAudio: true,
        mediaMcpFilename: 'compressed',
        mediaAtrFormat: 'wav', // 'wav' | 'mp3'
        mediaAtrMp3Bitrate: 192, // 128 | 192 | 320
        mediaAtrFilename: 'trim',
        mediaAcvFormat: 'wav', // 'wav' | 'mp3'
        mediaAcvMp3Bitrate: 192, // 128 | 192 | 320
        mediaAcvFilename: 'audio',
        mediaMiTrackFilter: 'all', // 'all' | 'General' | 'Video' | 'Audio' | 'Text' | 'Other'

        jsonSortKeysOnCompare: true,
        jsonSubView: 'format', // 'format' | 'compare'
        jsonAutoFormat: true,
        jsonExpandEscapedStrings: false,
        markdownView: 'split', // 'edit' | 'split' | 'preview'
        markdownSyncScroll: true,
        mermaidCurve: 'basis', // 'basis' (curve) | 'orthogonal' (right-angle)
        timestampFavoriteZones: [], // pinned timezones in the timestamp tool (local is always shown, implicitly); user adds their own (e.g. UTC) as needed
        timestampUnixResultZone: 'local', // primary target zone for Unix -> Date
        timestampDateStringZone: 'local', // zone the "date string" input is interpreted in
        timestampPartsZone: 'local', // zone the "date parts" input is interpreted in
        timestampConvertFromZone: 'local', // zone conversion row: source zone
        timestampConvertToZone: 'UTC' // zone conversion row: target zone
    },

    getStorageArea() {
        if (typeof chrome === 'undefined' || !chrome.storage) return null;
        return {
            primary: chrome.storage.sync || null,
            fallback: chrome.storage.local || null
        };
    },

    // Load settings from extension storage (cached after first read)
    async load() {
        if (this._cache) {
            return { ...this._cache };
        }
        if (this._cachePromise) {
            return this._cachePromise.then((s) => ({ ...s }));
        }

        this._cachePromise = new Promise((resolve) => {
            const storage = this.getStorageArea();

            const finish = (settings) => {
                this._cache = { ...this.defaults, ...(settings || {}) };
                this._cachePromise = null;
                resolve(this._cache);
            };

            const resolveFromLocalStorage = () => {
                try {
                    const stored = localStorage.getItem('settings');
                    const settings = stored ? JSON.parse(stored) : this.defaults;
                    finish(settings);
                } catch (_) {
                    finish(this.defaults);
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
                    finish((result && result.settings) || this.defaults);
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

        return this._cachePromise.then((s) => ({ ...s }));
    },

    // Persist current cache to extension storage
    async save(settings) {
        if (settings) {
            this._cache = { ...this.defaults, ...settings };
        }
        const payload = this._cache || { ...this.defaults };

        return new Promise((resolve) => {
            const storage = this.getStorageArea();

            const saveToLocalStorage = () => {
                try {
                    localStorage.setItem('settings', JSON.stringify(payload));
                } catch (_) {
                    // Ignore localStorage write failures and keep app flow running.
                }
                resolve();
            };

            const writeToArea = (area, onError) => {
                area.set({ settings: payload }, () => {
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

    _scheduleSave() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.save();
        }, this._saveWaitMs);
    },

    // Get a specific setting
    async get(key) {
        const settings = await this.load();
        return settings[key];
    },

    // Set a specific setting (memory-first; storage write is coalesced)
    async set(key, value) {
        if (!this._cache) {
            await this.load();
        }
        this._cache[key] = value;
        this._scheduleSave();
    },

    // Reset to defaults
    async reset() {
        this._cache = { ...this.defaults };
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        await this.save(this._cache);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Settings };
}
