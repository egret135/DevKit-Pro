// Timezone Utilities
// Pure native Intl-based timezone math (no third-party date library needed).
// Provides zone listing, offset labels, zone-aware formatting, and the
// reverse "wall-clock parts in zone X -> Unix ms" conversion used across the
// Timestamp tool (favorites bar, multi-zone comparison, zone conversion row).

const TimezoneUtils = {
    /**
     * Curated fallback list used only if Intl.supportedValuesOf is unavailable
     * (very old Chrome). Covers the most commonly needed zones.
     */
    FALLBACK_ZONES: [
        'UTC',
        'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
        'America/Anchorage', 'America/Bogota', 'America/Chicago', 'America/Denver',
        'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
        'America/Sao_Paulo', 'America/Toronto', 'America/Vancouver',
        'Asia/Bangkok', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta',
        'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Seoul',
        'Asia/Shanghai', 'Asia/Singapore', 'Asia/Taipei', 'Asia/Tokyo',
        'Australia/Melbourne', 'Australia/Perth', 'Australia/Sydney',
        'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/London',
        'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Europe/Rome',
        'Pacific/Auckland', 'Pacific/Honolulu'
    ],

    /**
     * @returns {string} The IANA zone id of the system/browser's local timezone.
     */
    getLocalZone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch (_) {
            return 'UTC';
        }
    },

    /**
     * @returns {string[]} All IANA timezone ids supported by the browser,
     * falling back to a curated list on older engines.
     */
    listZones() {
        try {
            if (typeof Intl.supportedValuesOf === 'function') {
                const zones = Intl.supportedValuesOf('timeZone');
                if (zones && zones.length) return zones;
            }
        } catch (_) {
            // fall through to fallback list
        }
        return this.FALLBACK_ZONES.slice();
    },

    /**
     * @returns {string[]} A short list of commonly used zones for quick-pick UI.
     */
    getQuickZones() {
        return [
            'UTC', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Kolkata',
            'Asia/Dubai', 'Europe/London', 'Europe/Berlin', 'Europe/Moscow',
            'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo',
            'Australia/Sydney', 'Pacific/Auckland'
        ];
    },

    /**
     * Human-friendly UTC offset label for a zone at a given instant, e.g.
     * "UTC+8:00" or "UTC-5:00". Accounts for DST since it's evaluated at `date`.
     * @param {string} zone - IANA timezone id
     * @param {Date} [date]
     * @returns {string}
     */
    getOffsetLabel(zone, date = new Date()) {
        try {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: zone,
                timeZoneName: 'longOffset'
            }).formatToParts(date);
            const tzPart = parts.find((p) => p.type === 'timeZoneName');
            const raw = (tzPart && tzPart.value) || 'GMT+0';
            return raw.replace('GMT', 'UTC');
        } catch (_) {
            return 'UTC+0:00';
        }
    },

    /**
     * A short label like "上海" not attempted (avoids maintaining a translation
     * table); instead expose the raw zone id plus offset, e.g.
     * "Asia/Shanghai (UTC+8:00)".
     * @param {string} zone
     * @param {Date} [date]
     * @returns {string}
     */
    describeZone(zone, date = new Date()) {
        return `${zone} (${this.getOffsetLabel(zone, date)})`;
    },

    /**
     * Format a Date instance as "YYYY-MM-DD HH:mm:ss" wall-clock time in the
     * given IANA zone.
     * @param {Date} date
     * @param {string} zone
     * @returns {string}
     */
    formatInZone(date, zone) {
        const parts = this._partsInZone(zone, date.getTime());
        const pad = (n) => n.toString().padStart(2, '0');
        return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ` +
            `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
    },

    /**
     * Reverse conversion: given wall-clock parts that represent a local time
     * in `zone`, compute the corresponding Unix timestamp in milliseconds.
     *
     * Approach: make an initial guess by treating the parts as if they were
     * UTC, look up that zone's actual offset at the guessed instant, and
     * correct for it. Re-check the offset once more at the corrected instant
     * to handle DST transition edges (the offset can change between the
     * guess and the corrected instant); this converges within two lookups.
     *
     * @param {{year:number, month:number, day:number, hour:number, minute:number, second?:number}} parts
     *   `month` is 1-based (1 = January), matching calendar conventions.
     * @param {string} zone - IANA timezone id
     * @returns {number} Unix timestamp in milliseconds
     */
    zonedPartsToUnixMs(parts, zone) {
        const guessMs = Date.UTC(
            parts.year, parts.month - 1, parts.day,
            parts.hour, parts.minute, parts.second || 0
        );

        const offset1 = this._offsetMinutes(zone, guessMs);
        let resultMs = guessMs - offset1 * 60000;

        const offset2 = this._offsetMinutes(zone, resultMs);
        if (offset2 !== offset1) {
            resultMs = guessMs - offset2 * 60000;
        }

        return resultMs;
    },

    /**
     * The zone's UTC offset in minutes at the given instant (positive east of UTC).
     * @param {string} zone
     * @param {number} ms - Unix ms
     * @returns {number}
     * @private
     */
    _offsetMinutes(zone, ms) {
        const parts = this._partsInZone(zone, ms);
        const asUTC = Date.UTC(
            parts.year, parts.month - 1, parts.day,
            parts.hour, parts.minute, parts.second
        );
        return Math.round((asUTC - ms) / 60000);
    },

    /**
     * Break a Unix ms instant into calendar/wall-clock parts as seen in `zone`.
     * @param {string} zone
     * @param {number} ms
     * @returns {{year:number, month:number, day:number, hour:number, minute:number, second:number}}
     * @private
     */
    _partsInZone(zone, ms) {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone: zone,
            hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const parts = dtf.formatToParts(new Date(ms));
        const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
        return {
            year: get('year'),
            month: get('month'),
            day: get('day'),
            hour: get('hour') % 24, // hourCycle h23 can emit "24" for midnight in some engines
            minute: get('minute'),
            second: get('second')
        };
    }
};

if (typeof window !== 'undefined') {
    window.TimezoneUtils = TimezoneUtils;
}
