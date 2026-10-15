// Toolbox - Developer Tools Collection
// Handles all toolbox functionality with new UI layout

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    let currentTool = 'uuid';
    let timestampInterval = null;

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Initialize toolbox
    function init() {
        // Tab switching
        const tabs = document.querySelectorAll('.toolbox-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => switchTool(tab.dataset.tool));
        });

        initToolboxFilter();

        // Initialize timestamp tool
        initTzPicker();
        initTimestamp();
        initBase64();
        initUrl();
        initJwt();
        initHash();
        initUuid();
        initPassword();
        initRegex();
        initColor();
        initCron();
        initCodeDiff();
    }

    function initToolboxFilter() {
        const input = document.getElementById('toolboxFilter');
        if (!input) return;

        const apply = () => {
            const q = (input.value || '').trim().toLowerCase();
            document.querySelectorAll('.toolbox-group').forEach((group) => {
                let visible = 0;
                group.querySelectorAll('.toolbox-tab').forEach((tab) => {
                    const hay = `${tab.textContent || ''} ${tab.dataset.keywords || ''} ${tab.dataset.tool || ''}`.toLowerCase();
                    const match = !q || hay.includes(q);
                    tab.classList.toggle('is-filtered-out', !match);
                    if (match) visible += 1;
                });
                group.classList.toggle('is-filtered-out', visible === 0);
            });
        };

        input.addEventListener('input', apply);
    }

    function switchTool(tool) {
        currentTool = tool;

        // Update tab states
        document.querySelectorAll('.toolbox-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.toolbox-tab[data-tool="${tool}"]`)?.classList.add('active');

        // Show corresponding panel
        document.querySelectorAll('#toolboxWorkspace .tool-panel').forEach(p => p.classList.remove('active'));
        const panelId = 'toolPanel' + tool.charAt(0).toUpperCase() + tool.slice(1);
        const panel = document.getElementById(panelId);
        if (panel) {
            panel.classList.add('active');
        }
        if (tool === 'codeDiff') onCodeDiffShown();
    }

    // ==================== Shared Helpers ====================

    // Copies text and shows a brief "已复制" confirmation on the triggering button.
    function copyText(text, btn) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (!btn) return;
            const original = btn.textContent;
            btn.textContent = '已复制';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('copied');
            }, 1200);
        });
    }

    // Parses a free-form date/time string into raw calendar parts, WITHOUT
    // applying any timezone interpretation - the caller decides which zone
    // the parts represent (via TimezoneUtils.zonedPartsToUnixMs). Primary
    // format is "YYYY-MM-DD HH:mm:ss" (matches the input placeholder); falls
    // back to native Date parsing (read back via local getters) for anything
    // else the engine can understand.
    function parseDateTimeStringToParts(input) {
        if (!input) return null;
        const trimmed = input.trim();
        if (!trimmed) return null;

        const m = trimmed.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
        if (m) {
            return {
                year: parseInt(m[1], 10),
                month: parseInt(m[2], 10),
                day: parseInt(m[3], 10),
                hour: m[4] ? parseInt(m[4], 10) : 0,
                minute: m[5] ? parseInt(m[5], 10) : 0,
                second: m[6] ? parseInt(m[6], 10) : 0
            };
        }

        const fallback = new Date(trimmed);
        if (fallback.toString() === 'Invalid Date') return null;
        return {
            year: fallback.getFullYear(),
            month: fallback.getMonth() + 1,
            day: fallback.getDate(),
            hour: fallback.getHours(),
            minute: fallback.getMinutes(),
            second: fallback.getSeconds()
        };
    }

    // Checks whether a persisted zone key is still a valid IANA zone (or the
    // 'local' sentinel), guarding against stale/corrupted settings.
    function isValidZoneKey(key) {
        if (key === 'local') return true;
        if (typeof key !== 'string' || !key) return false;
        try {
            // eslint-disable-next-line no-new
            new Intl.DateTimeFormat('en-US', { timeZone: key });
            return true;
        } catch (_) {
            return false;
        }
    }

    // ==================== Timezone Picker (shared, searchable dropdown) ====================
    // A single popover instance reused by every "pick a timezone" trigger
    // across the Timestamp tool (favorites bar, per-row zone buttons, zone
    // conversion row). Positioned next to whichever button opened it.
    let tzPickerOnSelect = null;

    function continentOf(zone) {
        if (zone === 'UTC' || zone === 'GMT') return 'UTC';
        const slash = zone.indexOf('/');
        return slash === -1 ? '其它' : zone.slice(0, slash);
    }

    function makeTzPickerItem(zone) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'tz-picker-item';
        const nameEl = document.createElement('span');
        nameEl.className = 'tz-picker-item-name';
        nameEl.textContent = zone;
        const offsetEl = document.createElement('span');
        offsetEl.className = 'tz-picker-item-offset';
        offsetEl.textContent = TimezoneUtils.getOffsetLabel(zone);
        item.append(nameEl, offsetEl);
        item.addEventListener('click', () => {
            const onSelect = tzPickerOnSelect;
            closeTzPicker();
            if (onSelect) onSelect(zone);
        });
        return item;
    }

    function renderTzPickerList(filterText) {
        const list = document.getElementById('tzPickerList');
        if (!list) return;
        list.innerHTML = '';

        const allZones = TimezoneUtils.listZones();
        const query = (filterText || '').trim().toLowerCase();

        if (!query) {
            const quickLabel = document.createElement('div');
            quickLabel.className = 'tz-picker-group-label';
            quickLabel.textContent = '常用';
            list.appendChild(quickLabel);
            TimezoneUtils.getQuickZones().forEach((zone) => list.appendChild(makeTzPickerItem(zone)));

            const groups = new Map();
            allZones.forEach((zone) => {
                const key = continentOf(zone);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(zone);
            });
            Array.from(groups.keys()).sort().forEach((continent) => {
                const label = document.createElement('div');
                label.className = 'tz-picker-group-label';
                label.textContent = continent;
                list.appendChild(label);
                groups.get(continent).sort().forEach((zone) => list.appendChild(makeTzPickerItem(zone)));
            });
        } else {
            const filtered = allZones.filter((zone) =>
                zone.toLowerCase().includes(query) ||
                TimezoneUtils.getOffsetLabel(zone).toLowerCase().includes(query)
            );
            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'tz-picker-empty';
                empty.textContent = '没有找到匹配的时区';
                list.appendChild(empty);
            } else {
                filtered.forEach((zone) => list.appendChild(makeTzPickerItem(zone)));
            }
        }
    }

    function handleTzPickerOutsideClick(e) {
        const popover = document.getElementById('tzPickerPopover');
        if (!popover || popover.classList.contains('hidden')) return;
        if (popover.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.tz-picker-trigger, #tzAddFavoriteBtn')) return;
        closeTzPicker();
    }

    function closeTzPicker() {
        const popover = document.getElementById('tzPickerPopover');
        if (!popover) return;
        popover.classList.add('hidden');
        tzPickerOnSelect = null;
        document.removeEventListener('mousedown', handleTzPickerOutsideClick);
    }

    function openTzPicker(anchorEl, onSelect) {
        const popover = document.getElementById('tzPickerPopover');
        const search = document.getElementById('tzPickerSearch');
        if (!popover || !anchorEl) return;

        tzPickerOnSelect = onSelect;

        const rect = anchorEl.getBoundingClientRect();
        const popoverWidth = 300; // matches CSS width
        const left = Math.min(rect.left, window.innerWidth - popoverWidth - 12);
        popover.style.left = `${Math.max(8, Math.round(left))}px`;
        popover.style.top = `${Math.round(rect.bottom + 4)}px`;

        popover.classList.remove('hidden');
        if (search) {
            search.value = '';
        }
        renderTzPickerList('');
        if (search) {
            setTimeout(() => search.focus(), 0);
        }

        document.addEventListener('mousedown', handleTzPickerOutsideClick);
    }

    function initTzPicker() {
        document.getElementById('tzPickerSearch')?.addEventListener('input', (e) => {
            renderTzPickerList(e.target.value);
        });
    }

    // ==================== Timestamp Tool ====================
    let prevDigits = [];

    function initTimestamp() {
        const currentTs = document.getElementById('currentTimestamp');
        const flipContainer = document.getElementById('flipClockContainer');
        const startBtn = document.getElementById('timestampStartBtn');
        const stopBtn = document.getElementById('timestampStopBtn');
        const refreshBtn = document.getElementById('timestampRefreshBtn');

        // ---- Multi-timezone state ----
        const localZone = TimezoneUtils.getLocalZone();
        // No favorites by default - most users only need local time; anyone
        // who wants UTC or other zones pinned can add them via "+ 添加时区",
        // and that choice is persisted (see hydration below).
        let favoriteZones = [];
        let lastUnixResultDate = null;
        const rowZones = {
            unixResult: 'local',
            dateString: 'local',
            parts: 'local',
            convertFrom: 'local',
            convertTo: 'UTC'
        };

        function resolveZone(key) {
            return key === 'local' ? localZone : key;
        }

        function shortZoneLabel(key) {
            if (key === 'local') return '本地';
            if (key === 'UTC') return 'UTC';
            const seg = key.split('/').pop() || key;
            return seg.replace(/_/g, ' ');
        }

        function setZoneButtonLabel(btn, key) {
            if (!btn) return;
            btn.textContent = shortZoneLabel(key);
            btn.title = key === 'local'
                ? `本地 (${localZone} · ${TimezoneUtils.getOffsetLabel(localZone)})`
                : TimezoneUtils.describeZone(key);
        }

        function wireZoneButton(buttonId, key, onChange) {
            const btn = document.getElementById(buttonId);
            if (!btn) return;
            setZoneButtonLabel(btn, key);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openTzPicker(btn, (zone) => {
                    onChange(zone);
                    setZoneButtonLabel(btn, zone);
                });
            });
        }

        // Initialize flip clock digits
        function initFlipClock() {
            if (!flipContainer) return;
            flipContainer.innerHTML = '';
            const timestamp = Math.floor(Date.now() / 1000).toString();
            prevDigits = timestamp.split('');

            for (let i = 0; i < timestamp.length; i++) {
                const digit = document.createElement('div');
                digit.className = 'flip-digit';
                digit.innerHTML = `<div class="flip-digit-inner">${timestamp[i]}</div>`;
                flipContainer.appendChild(digit);
            }
        }

        // Update flip clock with animation
        function updateFlipClock() {
            if (!flipContainer) return;
            const timestamp = Math.floor(Date.now() / 1000);
            if (currentTs) currentTs.value = timestamp;

            const newDigits = timestamp.toString().split('');
            const digitElements = flipContainer.querySelectorAll('.flip-digit');

            // Add more digit elements if needed
            while (digitElements.length < newDigits.length) {
                const digit = document.createElement('div');
                digit.className = 'flip-digit';
                digit.innerHTML = `<div class="flip-digit-inner">0</div>`;
                flipContainer.appendChild(digit);
            }

            const updatedElements = flipContainer.querySelectorAll('.flip-digit');

            newDigits.forEach((digit, index) => {
                const el = updatedElements[index];
                const inner = el.querySelector('.flip-digit-inner');

                if (prevDigits[index] !== digit) {
                    // Trigger flip animation
                    el.classList.add('flipping');

                    setTimeout(() => {
                        inner.textContent = digit;
                    }, 150);

                    setTimeout(() => {
                        el.classList.remove('flipping');
                    }, 300);
                }
            });

            prevDigits = newDigits;
            updateLiveStripTimes();
        }

        // ---- Favorite timezones bar ----
        function renderFavoritesBar() {
            const bar = document.getElementById('tzFavoritesBar');
            if (!bar) return;
            bar.innerHTML = '';

            const localChip = document.createElement('span');
            localChip.className = 'tz-chip tz-chip-fixed';
            localChip.title = `${localZone} (${TimezoneUtils.getOffsetLabel(localZone)})`;
            localChip.textContent = `本地 · ${TimezoneUtils.getOffsetLabel(localZone)}`;
            bar.appendChild(localChip);

            favoriteZones.forEach((zone) => {
                const chip = document.createElement('span');
                chip.className = 'tz-chip';
                chip.title = zone;

                const label = document.createElement('span');
                label.textContent = `${shortZoneLabel(zone)} · ${TimezoneUtils.getOffsetLabel(zone)}`;

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'tz-chip-remove';
                removeBtn.textContent = '×';
                removeBtn.title = '取消收藏';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    favoriteZones = favoriteZones.filter((z) => z !== zone);
                    Settings.set('timestampFavoriteZones', favoriteZones);
                    renderFavoritesBar();
                    renderLiveStrip();
                    if (lastUnixResultDate) renderUnixMultiZone(lastUnixResultDate);
                });

                chip.append(label, removeBtn);
                bar.appendChild(chip);
            });
        }

        document.getElementById('tzAddFavoriteBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openTzPicker(e.currentTarget, (zone) => {
                if (favoriteZones.includes(zone)) return;
                favoriteZones = [...favoriteZones, zone];
                Settings.set('timestampFavoriteZones', favoriteZones);
                renderFavoritesBar();
                renderLiveStrip();
                if (lastUnixResultDate) renderUnixMultiZone(lastUnixResultDate);
            });
        });

        // ---- Shared row builder for the live clock strip + Unix multi-zone list ----
        // Both surfaces show the same shape of data (zone identity, date/time,
        // UTC offset, copy action) so they share one DOM/CSS skeleton for a
        // consistent, polished look instead of a plain flat text row.
        function createZoneRow(key, zone) {
            const row = document.createElement('div');
            row.className = 'tz-multizone-row';
            row.dataset.zone = zone;
            row.dataset.key = key;

            const dot = document.createElement('span');
            dot.className = 'tz-multizone-dot';

            const zoneInfo = document.createElement('div');
            zoneInfo.className = 'tz-multizone-zone';
            const mainLabel = document.createElement('span');
            mainLabel.className = 'tz-multizone-zone-label';
            mainLabel.textContent = shortZoneLabel(key);
            zoneInfo.appendChild(mainLabel);
            if (zone !== mainLabel.textContent) {
                const sub = document.createElement('span');
                sub.className = 'tz-multizone-zone-sub';
                sub.textContent = zone;
                zoneInfo.appendChild(sub);
            }

            const datetime = document.createElement('div');
            datetime.className = 'tz-multizone-datetime';
            const dateEl = document.createElement('span');
            dateEl.className = 'tz-multizone-date';
            const timeEl = document.createElement('span');
            timeEl.className = 'tz-multizone-time';
            datetime.append(dateEl, timeEl);

            const trailing = document.createElement('div');
            trailing.className = 'tz-multizone-trailing';
            const offsetEl = document.createElement('span');
            offsetEl.className = 'tz-multizone-offset';
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'tz-result-copy';
            copyBtn.textContent = '复制';
            trailing.append(offsetEl, copyBtn);

            row.append(dot, zoneInfo, datetime, trailing);
            return { row, dateEl, timeEl, offsetEl, copyBtn };
        }

        function fillZoneRow(refs, formattedDateTime, offsetLabel) {
            const [datePart, timePart] = formattedDateTime.split(' ');
            refs.dateEl.textContent = datePart || '';
            refs.timeEl.textContent = timePart || formattedDateTime;
            refs.offsetEl.textContent = offsetLabel;
        }

        // ---- Live multi-timezone clock strip (refreshed alongside the flip clock) ----
        function renderLiveStrip() {
            const strip = document.getElementById('tzLiveStrip');
            if (!strip) return;
            strip.innerHTML = '';

            const entries = [{ key: 'local', zone: localZone }, ...favoriteZones.map((z) => ({ key: z, zone: z }))];
            entries.forEach(({ key, zone }) => {
                const refs = createZoneRow(key, zone);
                refs.copyBtn.addEventListener('click', () =>
                    copyText(`${refs.dateEl.textContent} ${refs.timeEl.textContent}`, refs.copyBtn));
                strip.appendChild(refs.row);
            });

            updateLiveStripTimes();
        }

        function updateLiveStripTimes() {
            const strip = document.getElementById('tzLiveStrip');
            if (!strip) return;
            const now = new Date();
            strip.querySelectorAll('.tz-multizone-row').forEach((row) => {
                const zone = row.dataset.zone;
                const refs = {
                    dateEl: row.querySelector('.tz-multizone-date'),
                    timeEl: row.querySelector('.tz-multizone-time'),
                    offsetEl: row.querySelector('.tz-multizone-offset')
                };
                if (!refs.dateEl || !refs.timeEl || !refs.offsetEl) return;
                fillZoneRow(refs, TimezoneUtils.formatInZone(now, zone), TimezoneUtils.getOffsetLabel(zone, now));
            });
        }

        // ---- Unix -> Date multi-zone comparison list ----
        function renderUnixMultiZone(date) {
            const container = document.getElementById('unixToDateMultiZone');
            if (!container) return;
            container.innerHTML = '';
            if (!date) return;

            const entries = [{ key: 'local', zone: localZone }, ...favoriteZones.map((z) => ({ key: z, zone: z }))];
            entries.forEach(({ key, zone }) => {
                const refs = createZoneRow(key, zone);
                const formatted = TimezoneUtils.formatInZone(date, zone);
                fillZoneRow(refs, formatted, TimezoneUtils.getOffsetLabel(zone, date));
                refs.copyBtn.addEventListener('click', () => copyText(formatted, refs.copyBtn));
                container.appendChild(refs.row);
            });
        }

        // Initialize
        initFlipClock();
        renderFavoritesBar();
        renderLiveStrip();

        // Auto-start timestamp updates
        timestampInterval = setInterval(updateFlipClock, 1000);
        if (startBtn) {
            startBtn.textContent = '运行中';
            startBtn.disabled = true;
        }

        // Copy button
        document.getElementById('timestampCopyBtn')?.addEventListener('click', () => {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            navigator.clipboard.writeText(timestamp).then(() => {
                const btn = document.getElementById('timestampCopyBtn');
                const originalText = btn.textContent;
                btn.textContent = '✅ 已复制';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 1500);
            });
        });

        // Start button
        startBtn?.addEventListener('click', () => {
            if (!timestampInterval) {
                timestampInterval = setInterval(updateFlipClock, 1000);
                startBtn.textContent = '运行中';
                startBtn.disabled = true;
            }
        });

        // Stop button
        stopBtn?.addEventListener('click', () => {
            if (timestampInterval) {
                clearInterval(timestampInterval);
                timestampInterval = null;
                startBtn.textContent = '开始';
                startBtn.disabled = false;
            }
        });

        // Refresh button
        refreshBtn?.addEventListener('click', updateFlipClock);

        // ---- Unix -> Date (target zone selectable, plus multi-zone comparison) ----
        function runUnixToDate() {
            const input = document.getElementById('unixInput')?.value;
            const unit = document.getElementById('unixUnit')?.value;
            const result = document.getElementById('unixToDateResult');

            if (!input || !result) return;

            const num = parseFloat(input);
            if (isNaN(num)) {
                result.value = '无效的时间戳';
                lastUnixResultDate = null;
                renderUnixMultiZone(null);
                return;
            }

            const ms = unit === 'ms' ? num : num * 1000;
            const date = new Date(ms);

            if (date.toString() === 'Invalid Date') {
                result.value = '无效的时间戳';
                lastUnixResultDate = null;
                renderUnixMultiZone(null);
                return;
            }

            lastUnixResultDate = date;
            result.value = TimezoneUtils.formatInZone(date, resolveZone(rowZones.unixResult));
            renderUnixMultiZone(date);
        }
        document.getElementById('unixToDateBtn')?.addEventListener('click', runUnixToDate);

        wireZoneButton('unixResultZoneBtn', rowZones.unixResult, (zone) => {
            rowZones.unixResult = zone;
            Settings.set('timestampUnixResultZone', zone);
            if (lastUnixResultDate) runUnixToDate();
        });

        // ---- Date string -> Unix (input zone selectable) ----
        function runDateStringToUnix() {
            const input = document.getElementById('dateStringInput')?.value;
            const unit = document.getElementById('dateToUnixUnit')?.value;
            const result = document.getElementById('dateToUnixResult');
            const echo = document.getElementById('dateToUnixEcho');

            if (!result) return;

            const parts = parseDateTimeStringToParts(input);
            if (!parts) {
                result.value = '无效的日期格式';
                if (echo) echo.textContent = '';
                return;
            }

            const ms = TimezoneUtils.zonedPartsToUnixMs(parts, resolveZone(rowZones.dateString));
            result.value = (unit === 'ms' ? ms : Math.floor(ms / 1000)).toString();

            if (echo) {
                const date = new Date(ms);
                echo.textContent = `= ${TimezoneUtils.formatInZone(date, localZone)} 本地  |  = ${TimezoneUtils.formatInZone(date, 'UTC')} UTC`;
            }
        }
        document.getElementById('dateToUnixBtn')?.addEventListener('click', runDateStringToUnix);

        wireZoneButton('dateStringZoneBtn', rowZones.dateString, (zone) => {
            rowZones.dateString = zone;
            Settings.set('timestampDateStringZone', zone);
        });

        // ---- Date parts -> Unix (input zone selectable) ----
        function runPartsToUnix() {
            const year = parseInt(document.getElementById('yearInput')?.value) || 2025;
            const month = parseInt(document.getElementById('monthInput')?.value) || 1;
            const day = parseInt(document.getElementById('dayInput')?.value) || 1;
            const hour = parseInt(document.getElementById('hourInput')?.value) || 0;
            const minute = parseInt(document.getElementById('minuteInput')?.value) || 0;
            const second = parseInt(document.getElementById('secondInput')?.value) || 0;
            const unit = document.getElementById('partsToUnixUnit')?.value;
            const result = document.getElementById('partsToUnixResult');
            const echo = document.getElementById('partsToUnixEcho');

            if (!result) return;

            const ms = TimezoneUtils.zonedPartsToUnixMs(
                { year, month, day, hour, minute, second },
                resolveZone(rowZones.parts)
            );
            result.value = (unit === 'ms' ? ms : Math.floor(ms / 1000)).toString();

            if (echo) {
                const date = new Date(ms);
                echo.textContent = `= ${TimezoneUtils.formatInZone(date, localZone)} 本地  |  = ${TimezoneUtils.formatInZone(date, 'UTC')} UTC`;
            }
        }
        document.getElementById('partsToUnixBtn')?.addEventListener('click', runPartsToUnix);

        wireZoneButton('partsZoneBtn', rowZones.parts, (zone) => {
            rowZones.parts = zone;
            Settings.set('timestampPartsZone', zone);
        });

        // ---- Timezone conversion: A zone's wall-clock time -> B zone's wall-clock time ----
        function runZoneConvert() {
            const input = document.getElementById('convertDateTimeInput')?.value;
            const result = document.getElementById('convertZoneResult');
            if (!result) return;

            const parts = parseDateTimeStringToParts(input);
            if (!parts) {
                result.value = '无效的日期格式';
                return;
            }

            const ms = TimezoneUtils.zonedPartsToUnixMs(parts, resolveZone(rowZones.convertFrom));
            const targetZone = resolveZone(rowZones.convertTo);
            result.value = `${TimezoneUtils.formatInZone(new Date(ms), targetZone)} (${TimezoneUtils.getOffsetLabel(targetZone)})`;
        }
        document.getElementById('convertZoneBtn')?.addEventListener('click', runZoneConvert);

        wireZoneButton('convertFromZoneBtn', rowZones.convertFrom, (zone) => {
            rowZones.convertFrom = zone;
            Settings.set('timestampConvertFromZone', zone);
        });
        wireZoneButton('convertToZoneBtn', rowZones.convertTo, (zone) => {
            rowZones.convertTo = zone;
            Settings.set('timestampConvertToZone', zone);
        });

        // ---- Hydrate persisted zone preferences (favorites + per-row zones) ----
        if (typeof Settings !== 'undefined') {
            Settings.load().then((settings) => {
                const savedFavorites = Array.isArray(settings.timestampFavoriteZones)
                    ? settings.timestampFavoriteZones.filter(isValidZoneKey)
                    : null;
                if (savedFavorites) favoriteZones = savedFavorites;

                const zoneSettingMap = {
                    unixResult: 'timestampUnixResultZone',
                    dateString: 'timestampDateStringZone',
                    parts: 'timestampPartsZone',
                    convertFrom: 'timestampConvertFromZone',
                    convertTo: 'timestampConvertToZone'
                };
                const buttonIdMap = {
                    unixResult: 'unixResultZoneBtn',
                    dateString: 'dateStringZoneBtn',
                    parts: 'partsZoneBtn',
                    convertFrom: 'convertFromZoneBtn',
                    convertTo: 'convertToZoneBtn'
                };
                Object.keys(zoneSettingMap).forEach((rowKey) => {
                    const saved = settings[zoneSettingMap[rowKey]];
                    if (saved && isValidZoneKey(saved)) {
                        rowZones[rowKey] = saved;
                        setZoneButtonLabel(document.getElementById(buttonIdMap[rowKey]), saved);
                    }
                });

                renderFavoritesBar();
                renderLiveStrip();
            }).catch(() => {
                // Keep the already-rendered defaults if settings fail to load.
            });
        }
    }

    function formatDate(date) {
        const pad = n => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    // ==================== Base64 Tool ====================
    function codecToast(msg) {
        if (DevKit.App && typeof DevKit.App.showToast === 'function') {
            DevKit.App.showToast(msg);
        }
    }

    function utf8ByteLength(str) {
        try {
            return new TextEncoder().encode(str).length;
        } catch (_) {
            return str.length;
        }
    }

    function initBase64() {
        let mode = 'encode'; // encode | decode

        function chipOn(id) {
            return document.getElementById(id)?.classList.contains('is-on');
        }
        function setChip(id, on) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('is-on', !!on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        function urlSafeOn() {
            return chipOn('base64UrlSafe');
        }
        function noPadOn() {
            return chipOn('base64NoPad');
        }

        function encodeBase64(text) {
            let b64 = btoa(unescape(encodeURIComponent(text)));
            if (urlSafeOn()) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_');
            if (noPadOn()) b64 = b64.replace(/=+$/, '');
            return b64;
        }

        function decodeBase64(text) {
            let s = String(text || '').trim().replace(/\s+/g, '');
            if (!s) return '';
            if (urlSafeOn() || /[-_]/.test(s)) {
                s = s.replace(/-/g, '+').replace(/_/g, '/');
            }
            const pad = s.length % 4;
            if (pad) s += '='.repeat(4 - pad);
            return decodeURIComponent(escape(atob(s)));
        }

        function syncModeUI() {
            document.getElementById('base64ModeEncode')?.classList.toggle('active', mode === 'encode');
            document.getElementById('base64ModeDecode')?.classList.toggle('active', mode === 'decode');
            const run = document.getElementById('base64RunBtn');
            if (run) run.textContent = mode === 'encode' ? '编码' : '解码';
            const padChip = document.getElementById('base64NoPad');
            if (padChip) padChip.hidden = mode !== 'encode';
        }

        function updateMeta() {
            const input = document.getElementById('base64Input')?.value || '';
            const meta = document.getElementById('base64Meta');
            if (meta) {
                meta.textContent = `${input.length} 字符 · ${utf8ByteLength(input)} 字节`;
            }
        }

        function run(showEmptyError) {
            const input = document.getElementById('base64Input')?.value ?? '';
            const output = document.getElementById('base64Output');
            if (!output) return;
            updateMeta();
            if (!input) {
                output.value = '';
                output.classList.remove('is-error');
                if (showEmptyError) codecToast('请先输入内容');
                return;
            }
            try {
                output.value = mode === 'encode' ? encodeBase64(input) : decodeBase64(input);
                output.classList.remove('is-error');
            } catch (e) {
                output.value = mode === 'encode'
                    ? ('编码失败: ' + (e.message || '未知错误'))
                    : '解码失败: 输入不是有效的 Base64';
                output.classList.add('is-error');
            }
        }

        const debouncedRun = debounce(() => run(false), 120);

        async function persist() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('base64Options', {
                mode,
                urlSafe: urlSafeOn(),
                noPad: noPadOn()
            });
        }
        const debouncedPersist = debounce(() => { persist(); }, 400);

        document.querySelectorAll('[data-b64-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                mode = btn.getAttribute('data-b64-mode') === 'decode' ? 'decode' : 'encode';
                syncModeUI();
                run(false);
                debouncedPersist();
            });
        });
        ['base64UrlSafe', 'base64NoPad'].forEach((id) => {
            document.getElementById(id)?.addEventListener('click', () => {
                setChip(id, !chipOn(id));
                run(false);
                debouncedPersist();
            });
        });
        document.getElementById('base64RunBtn')?.addEventListener('click', () => run(true));
        document.getElementById('base64Input')?.addEventListener('input', () => { updateMeta(); debouncedRun(); });
        document.getElementById('base64SwapBtn')?.addEventListener('click', () => {
            const inEl = document.getElementById('base64Input');
            const outEl = document.getElementById('base64Output');
            if (!inEl || !outEl || outEl.classList.contains('is-error')) return;
            const tmp = inEl.value;
            inEl.value = outEl.value;
            outEl.value = tmp;
            mode = mode === 'encode' ? 'decode' : 'encode';
            syncModeUI();
            run(false);
            debouncedPersist();
        });
        document.getElementById('base64CopyBtn')?.addEventListener('click', () => {
            const v = document.getElementById('base64Output')?.value || '';
            if (!v || document.getElementById('base64Output')?.classList.contains('is-error')) {
                codecToast('没有可复制的结果');
                return;
            }
            navigator.clipboard.writeText(v).then(() => codecToast('已复制')).catch(() => codecToast('复制失败'));
        });
        document.getElementById('base64ClearBtn')?.addEventListener('click', () => {
            const inEl = document.getElementById('base64Input');
            const outEl = document.getElementById('base64Output');
            if (inEl) inEl.value = '';
            if (outEl) { outEl.value = ''; outEl.classList.remove('is-error'); }
            updateMeta();
        });

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('base64Options');
                    if (saved && typeof saved === 'object') {
                        mode = saved.mode === 'decode' ? 'decode' : 'encode';
                        setChip('base64UrlSafe', !!saved.urlSafe);
                        setChip('base64NoPad', !!saved.noPad);
                    }
                }
            } catch (_) { /* ignore */ }
            syncModeUI();
            updateMeta();
        })();
    }

    // ==================== URL Tool ====================
    function initUrl() {
        let mode = 'encode';

        function style() {
            return document.getElementById('urlEncodeStyle')?.value === 'uri' ? 'uri' : 'component';
        }

        function syncModeUI() {
            document.getElementById('urlModeEncode')?.classList.toggle('active', mode === 'encode');
            document.getElementById('urlModeDecode')?.classList.toggle('active', mode === 'decode');
            const run = document.getElementById('urlRunBtn');
            if (run) run.textContent = mode === 'encode' ? '编码' : '解码';
        }

        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function renderParse(raw) {
            const card = document.getElementById('urlParseCard');
            const list = document.getElementById('urlParseList');
            if (!card || !list) return;
            let url;
            try {
                url = new URL(raw);
            } catch (_) {
                card.classList.add('hidden');
                list.innerHTML = '';
                return;
            }
            const rows = [
                ['协议', url.protocol.replace(/:$/, '')],
                ['主机', url.host],
                ['路径', url.pathname || '/'],
                ['查询', url.search ? url.search.slice(1) : ''],
                ['哈希', url.hash ? url.hash.slice(1) : '']
            ];
            const params = [];
            url.searchParams.forEach((v, k) => {
                params.push([`参数 ${k}`, v]);
            });
            const all = rows.concat(params).filter(([, v]) => v !== '');
            if (!all.length) {
                card.classList.add('hidden');
                list.innerHTML = '';
                return;
            }
            list.innerHTML = all.map(([k, v], i) => `
                <div class="codec-parse-row">
                    <span class="codec-parse-key">${escapeHtml(k)}</span>
                    <span class="codec-parse-val">${escapeHtml(v)}</span>
                    <button type="button" class="codec-text-btn url-parse-copy" data-idx="${i}">复制</button>
                </div>
            `).join('');
            card.classList.remove('hidden');
            list.querySelectorAll('.url-parse-copy').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const idx = Number(btn.getAttribute('data-idx'));
                    const val = all[idx] && all[idx][1];
                    if (!val) return;
                    navigator.clipboard.writeText(val).then(() => codecToast('已复制')).catch(() => codecToast('复制失败'));
                });
            });
        }

        function run(showEmptyError) {
            const input = document.getElementById('urlInput')?.value ?? '';
            const output = document.getElementById('urlOutput');
            if (!output) return;
            if (!input) {
                output.value = '';
                output.classList.remove('is-error');
                renderParse('');
                if (showEmptyError) codecToast('请先输入内容');
                return;
            }
            try {
                if (mode === 'encode') {
                    output.value = style() === 'uri' ? encodeURI(input) : encodeURIComponent(input);
                } else {
                    output.value = style() === 'uri' ? decodeURI(input) : decodeURIComponent(input);
                }
                output.classList.remove('is-error');
            } catch (e) {
                output.value = '解码失败: 输入不是有效的 URL 编码';
                output.classList.add('is-error');
            }
            renderParse(input);
        }

        const debouncedRun = debounce(() => run(false), 120);

        async function persist() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('urlOptions', { mode, style: style() });
        }
        const debouncedPersist = debounce(() => { persist(); }, 400);

        document.querySelectorAll('[data-url-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                mode = btn.getAttribute('data-url-mode') === 'decode' ? 'decode' : 'encode';
                syncModeUI();
                run(false);
                debouncedPersist();
            });
        });
        document.getElementById('urlEncodeStyle')?.addEventListener('change', () => { run(false); debouncedPersist(); });
        document.getElementById('urlRunBtn')?.addEventListener('click', () => run(true));
        document.getElementById('urlInput')?.addEventListener('input', debouncedRun);
        document.getElementById('urlSwapBtn')?.addEventListener('click', () => {
            const inEl = document.getElementById('urlInput');
            const outEl = document.getElementById('urlOutput');
            if (!inEl || !outEl || outEl.classList.contains('is-error')) return;
            const tmp = inEl.value;
            inEl.value = outEl.value;
            outEl.value = tmp;
            mode = mode === 'encode' ? 'decode' : 'encode';
            syncModeUI();
            run(false);
            debouncedPersist();
        });
        document.getElementById('urlCopyBtn')?.addEventListener('click', () => {
            const v = document.getElementById('urlOutput')?.value || '';
            if (!v || document.getElementById('urlOutput')?.classList.contains('is-error')) {
                codecToast('没有可复制的结果');
                return;
            }
            navigator.clipboard.writeText(v).then(() => codecToast('已复制')).catch(() => codecToast('复制失败'));
        });
        document.getElementById('urlClearBtn')?.addEventListener('click', () => {
            const inEl = document.getElementById('urlInput');
            const outEl = document.getElementById('urlOutput');
            if (inEl) inEl.value = '';
            if (outEl) { outEl.value = ''; outEl.classList.remove('is-error'); }
            renderParse('');
        });

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('urlOptions');
                    if (saved && typeof saved === 'object') {
                        mode = saved.mode === 'decode' ? 'decode' : 'encode';
                        const sel = document.getElementById('urlEncodeStyle');
                        if (sel && (saved.style === 'uri' || saved.style === 'component')) {
                            sel.value = saved.style;
                        }
                    }
                }
            } catch (_) { /* ignore */ }
            syncModeUI();
        })();
    }

    // ==================== JWT Tool ====================
    function initJwt() {
        let lastPayloadJson = '';

        function b64urlToBytes(str) {
            let s = str.replace(/-/g, '+').replace(/_/g, '/');
            const pad = s.length % 4;
            if (pad) s += '='.repeat(4 - pad);
            const bin = atob(s);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }

        function b64urlJson(str) {
            const bytes = b64urlToBytes(str);
            const text = new TextDecoder().decode(bytes);
            return JSON.parse(text);
        }

        function setStatus(text, kind) {
            const el = document.getElementById('jwtStatusBadge');
            if (!el) return;
            el.textContent = text;
            el.classList.remove('is-ok', 'is-error', 'is-warn');
            if (kind) el.classList.add(kind);
        }

        function setVerifyHint(text, kind) {
            const el = document.getElementById('jwtVerifyHint');
            if (!el) return;
            el.textContent = text;
            el.classList.remove('is-ok', 'is-error', 'is-warn');
            if (kind) el.classList.add(kind);
        }

        function relativeTime(date) {
            const diff = date.getTime() - Date.now();
            const abs = Math.abs(diff);
            const mins = Math.round(abs / 60000);
            if (mins < 1) return diff >= 0 ? '即将到期' : '刚刚过期';
            if (mins < 60) return diff >= 0 ? `还剩 ${mins} 分钟` : `已过期 ${mins} 分钟`;
            const hours = Math.round(mins / 60);
            if (hours < 48) return diff >= 0 ? `还剩 ${hours} 小时` : `已过期 ${hours} 小时`;
            const days = Math.round(hours / 24);
            return diff >= 0 ? `还剩 ${days} 天` : `已过期 ${days} 天`;
        }

        function renderSegments(parts) {
            const el = document.getElementById('jwtSegments');
            if (!el) return;
            if (!parts || parts.length !== 3) {
                el.innerHTML = '';
                return;
            }
            el.innerHTML =
                `<span class="jwt-seg-h">${parts[0]}</span>` +
                `<span class="jwt-seg-dot">.</span>` +
                `<span class="jwt-seg-p">${parts[1]}</span>` +
                `<span class="jwt-seg-dot">.</span>` +
                `<span class="jwt-seg-s">${parts[2]}</span>`;
        }

        function renderClaims(payload) {
            const wrap = document.getElementById('jwtClaims');
            const card = document.getElementById('jwtClaimsCard');
            if (!wrap) return;
            const hide = () => {
                wrap.innerHTML = '';
                card?.classList.add('hidden');
            };
            if (!payload || typeof payload !== 'object') {
                hide();
                return;
            }
            const rows = [];
            const push = (k, v, extra) => {
                rows.push(`<div class="jwt-claim-row"><span class="jwt-claim-key">${k}</span><span class="jwt-claim-val">${v}${extra ? `<span class="muted">${extra}</span>` : ''}</span></div>`);
            };
            ['sub', 'iss', 'aud', 'jti'].forEach((k) => {
                if (payload[k] == null) return;
                const v = Array.isArray(payload[k]) ? payload[k].join(', ') : String(payload[k]);
                push(k, v.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
            });
            ['iat', 'nbf', 'exp'].forEach((k) => {
                if (payload[k] == null) return;
                const n = Number(payload[k]);
                if (!Number.isFinite(n)) {
                    push(k, String(payload[k]));
                    return;
                }
                const d = new Date(n * 1000);
                push(k, formatDate(d), relativeTime(d));
            });
            if (!rows.length) {
                hide();
                return;
            }
            wrap.innerHTML = rows.join('');
            card?.classList.remove('hidden');
        }

        async function verifyHmac(token, secret, alg) {
            const hashName = ({ HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' })[alg];
            if (!hashName) throw new Error('不支持的算法: ' + alg);
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('无效 Token');
            const key = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(secret),
                { name: 'HMAC', hash: hashName },
                false,
                ['verify']
            );
            const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
            const sig = b64urlToBytes(parts[2]);
            return crypto.subtle.verify('HMAC', key, sig, data);
        }

        async function parseJwt({ verify } = {}) {
            const input = (document.getElementById('jwtInput')?.value || '').trim();
            const headerOut = document.getElementById('jwtHeader');
            const payloadOut = document.getElementById('jwtPayload');
            lastPayloadJson = '';

            if (!input) {
                if (headerOut) headerOut.value = '';
                if (payloadOut) payloadOut.value = '';
                renderSegments(null);
                renderClaims(null);
                setStatus('等待输入');
                setVerifyHint('未验签，仅本地解码。支持 HS256 / HS384 / HS512。');
                return;
            }

            const parts = input.split('.');
            if (parts.length !== 3 || !parts[0] || !parts[1]) {
                renderSegments(null);
                renderClaims(null);
                if (headerOut) headerOut.value = '';
                if (payloadOut) payloadOut.value = '';
                setStatus('格式无效', 'is-error');
                setVerifyHint('无效的 JWT 格式（需要 header.payload.signature）', 'is-error');
                return;
            }

            renderSegments(parts);

            let header = null;
            let payload = null;
            try {
                header = b64urlJson(parts[0]);
                if (headerOut) headerOut.value = JSON.stringify(header, null, 2);
            } catch (_) {
                if (headerOut) headerOut.value = 'Header 解析失败';
                setStatus('Header 无效', 'is-error');
            }

            try {
                payload = b64urlJson(parts[1]);
                lastPayloadJson = JSON.stringify(payload, null, 2);
                if (payloadOut) payloadOut.value = lastPayloadJson;
                renderClaims(payload);
            } catch (_) {
                if (payloadOut) payloadOut.value = 'Payload 解析失败';
                renderClaims(null);
                setStatus('Payload 无效', 'is-error');
                return;
            }

            let statusKind = 'is-ok';
            let statusText = '已解码';
            if (payload.exp != null) {
                const expDate = new Date(Number(payload.exp) * 1000);
                if (expDate < new Date()) {
                    statusKind = 'is-error';
                    statusText = '已过期';
                } else {
                    statusKind = 'is-ok';
                    statusText = '未过期';
                }
            }
            setStatus(statusText, statusKind);

            const secret = document.getElementById('jwtSecret')?.value || '';
            const alg = (header && header.alg) || '';
            if (!secret) {
                setVerifyHint('未验签，仅本地解码。支持 HS256 / HS384 / HS512。');
                return;
            }
            if (!verify) {
                setVerifyHint('已填写 Secret，点击「验签」进行 HMAC 验证。', 'is-warn');
                return;
            }
            if (!/^HS(256|384|512)$/.test(alg)) {
                setVerifyHint(`算法 ${alg || '未知'} 非 HMAC，本工具仅支持 HS256/384/512 验签。`, 'is-warn');
                return;
            }
            try {
                const ok = await verifyHmac(input, secret, alg);
                if (ok) setVerifyHint(`签名有效（${alg}）`, 'is-ok');
                else setVerifyHint(`签名无效（${alg}）`, 'is-error');
            } catch (e) {
                setVerifyHint('验签失败: ' + (e.message || '未知错误'), 'is-error');
            }
        }

        const debouncedParse = debounce(() => { parseJwt({ verify: false }); }, 140);

        document.getElementById('jwtInput')?.addEventListener('input', debouncedParse);
        document.getElementById('jwtDecodeBtn')?.addEventListener('click', () => parseJwt({ verify: true }));
        document.getElementById('jwtVerifyBtn')?.addEventListener('click', () => parseJwt({ verify: true }));
        document.getElementById('jwtSecret')?.addEventListener('change', () => parseJwt({ verify: true }));
        document.getElementById('jwtCopyTokenBtn')?.addEventListener('click', () => {
            const v = (document.getElementById('jwtInput')?.value || '').trim();
            if (!v) { codecToast('没有可复制的 Token'); return; }
            navigator.clipboard.writeText(v).then(() => codecToast('已复制 Token')).catch(() => codecToast('复制失败'));
        });
        document.getElementById('jwtCopyPayloadBtn')?.addEventListener('click', () => {
            if (!lastPayloadJson) { codecToast('还没有 Payload'); return; }
            navigator.clipboard.writeText(lastPayloadJson).then(() => codecToast('已复制 Payload')).catch(() => codecToast('复制失败'));
        });
        document.getElementById('jwtCopyHeaderBtn')?.addEventListener('click', () => {
            const v = document.getElementById('jwtHeader')?.value || '';
            if (!v || v === 'Header 解析失败') { codecToast('还没有 Header'); return; }
            navigator.clipboard.writeText(v).then(() => codecToast('已复制 Header')).catch(() => codecToast('复制失败'));
        });
        document.getElementById('jwtCopyPayloadJsonBtn')?.addEventListener('click', () => {
            if (!lastPayloadJson) { codecToast('还没有 Payload'); return; }
            navigator.clipboard.writeText(lastPayloadJson).then(() => codecToast('已复制 Payload')).catch(() => codecToast('复制失败'));
        });
        document.getElementById('jwtClearBtn')?.addEventListener('click', () => {
            const ids = ['jwtInput', 'jwtHeader', 'jwtPayload', 'jwtSecret'];
            ids.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            lastPayloadJson = '';
            renderSegments(null);
            renderClaims(null);
            setStatus('等待输入');
            setVerifyHint('未验签，仅本地解码。支持 HS256 / HS384 / HS512。');
        });
    }

    // ==================== Hash Tool ====================
    function initHash() {
        let calcToken = 0;

        function uppercaseOn() {
            return !!document.getElementById('hashUppercase')?.checked;
        }
        function hmacOn() {
            return !!document.getElementById('hashHmac')?.checked;
        }
        function hmacKey() {
            return document.getElementById('hashHmacKey')?.value || '';
        }

        function formatHex(hex) {
            return uppercaseOn() ? hex.toUpperCase() : hex.toLowerCase();
        }

        function setRow(id, value, disabled) {
            const el = document.getElementById(id);
            const row = el?.closest('.hash-result-row');
            if (!el) return;
            el.textContent = value || '—';
            if (row) row.classList.toggle('is-disabled', !!disabled);
        }

        function updateMeta() {
            const input = document.getElementById('hashInput')?.value || '';
            const meta = document.getElementById('hashMeta');
            if (meta) meta.textContent = `${input.length} 字符 · ${utf8ByteLength(input)} 字节`;
        }

        function syncHmacUI() {
            const key = document.getElementById('hashHmacKey');
            if (key) key.disabled = !hmacOn();
        }

        async function hmacHex(algo, key, dataBytes) {
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(key),
                { name: 'HMAC', hash: algo },
                false,
                ['sign']
            );
            const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes);
            return bufferToHex(sig);
        }

        async function calculate() {
            const token = ++calcToken;
            const input = document.getElementById('hashInput')?.value || '';
            updateMeta();
            syncHmacUI();

            if (!input && !hmacOn()) {
                setRow('hashMd5', '—');
                setRow('hashSha1', '—');
                setRow('hashSha256', '—');
                setRow('hashSha512', '—');
                return;
            }

            const data = new TextEncoder().encode(input);
            const useHmac = hmacOn();
            const key = hmacKey();

            if (useHmac) {
                setRow('hashMd5', 'HMAC 不适用', true);
                if (!key) {
                    setRow('hashSha1', '需要 Key', true);
                    setRow('hashSha256', '需要 Key', true);
                    setRow('hashSha512', '需要 Key', true);
                    return;
                }
                try {
                    const [s1, s256, s512] = await Promise.all([
                        hmacHex('SHA-1', key, data),
                        hmacHex('SHA-256', key, data),
                        hmacHex('SHA-512', key, data)
                    ]);
                    if (token !== calcToken) return;
                    setRow('hashSha1', formatHex(s1));
                    setRow('hashSha256', formatHex(s256));
                    setRow('hashSha512', formatHex(s512));
                } catch (e) {
                    if (token !== calcToken) return;
                    setRow('hashSha1', '计算失败', true);
                    setRow('hashSha256', '计算失败', true);
                    setRow('hashSha512', '计算失败', true);
                }
                return;
            }

            setRow('hashMd5', formatHex(md5(input)));
            try {
                const [s1, s256, s512] = await Promise.all([
                    crypto.subtle.digest('SHA-1', data).then(bufferToHex),
                    crypto.subtle.digest('SHA-256', data).then(bufferToHex),
                    crypto.subtle.digest('SHA-512', data).then(bufferToHex)
                ]);
                if (token !== calcToken) return;
                setRow('hashSha1', formatHex(s1));
                setRow('hashSha256', formatHex(s256));
                setRow('hashSha512', formatHex(s512));
            } catch (_) {
                if (token !== calcToken) return;
                setRow('hashSha1', '计算失败', true);
                setRow('hashSha256', '计算失败', true);
                setRow('hashSha512', '计算失败', true);
            }
        }

        const debouncedCalc = debounce(() => { calculate(); }, 120);

        async function persist() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('hashOptions', {
                uppercase: uppercaseOn(),
                hmac: hmacOn()
            });
        }
        const debouncedPersist = debounce(() => { persist(); }, 400);

        document.getElementById('hashInput')?.addEventListener('input', () => {
            updateMeta();
            debouncedCalc();
        });
        document.getElementById('hashCalcBtn')?.addEventListener('click', () => calculate());
        document.getElementById('hashUppercase')?.addEventListener('change', () => {
            calculate();
            debouncedPersist();
        });
        document.getElementById('hashHmac')?.addEventListener('change', () => {
            syncHmacUI();
            calculate();
            debouncedPersist();
        });
        document.getElementById('hashHmacKey')?.addEventListener('input', debouncedCalc);
        document.getElementById('hashClearBtn')?.addEventListener('click', () => {
            const inEl = document.getElementById('hashInput');
            if (inEl) inEl.value = '';
            calculate();
        });

        document.querySelectorAll('.hash-copy-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-target');
                const el = id && document.getElementById(id);
                const v = el?.textContent || '';
                if (!v || v === '—' || v.includes('不适用') || v.includes('需要') || v.includes('失败')) {
                    codecToast('没有可复制的哈希');
                    return;
                }
                navigator.clipboard.writeText(v).then(() => codecToast('已复制')).catch(() => codecToast('复制失败'));
            });
        });

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('hashOptions');
                    if (saved && typeof saved === 'object') {
                        if (document.getElementById('hashUppercase')) {
                            document.getElementById('hashUppercase').checked = !!saved.uppercase;
                        }
                        if (document.getElementById('hashHmac')) {
                            document.getElementById('hashHmac').checked = !!saved.hmac;
                        }
                    }
                }
            } catch (_) { /* ignore */ }
            syncHmacUI();
            updateMeta();
        })();
    }

    function bufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // Simple MD5 implementation
    function md5(string) {
        function md5cycle(x, k) {
            var a = x[0], b = x[1], c = x[2], d = x[3];
            a = ff(a, b, c, d, k[0], 7, -680876936);
            d = ff(d, a, b, c, k[1], 12, -389564586);
            c = ff(c, d, a, b, k[2], 17, 606105819);
            b = ff(b, c, d, a, k[3], 22, -1044525330);
            a = ff(a, b, c, d, k[4], 7, -176418897);
            d = ff(d, a, b, c, k[5], 12, 1200080426);
            c = ff(c, d, a, b, k[6], 17, -1473231341);
            b = ff(b, c, d, a, k[7], 22, -45705983);
            a = ff(a, b, c, d, k[8], 7, 1770035416);
            d = ff(d, a, b, c, k[9], 12, -1958414417);
            c = ff(c, d, a, b, k[10], 17, -42063);
            b = ff(b, c, d, a, k[11], 22, -1990404162);
            a = ff(a, b, c, d, k[12], 7, 1804603682);
            d = ff(d, a, b, c, k[13], 12, -40341101);
            c = ff(c, d, a, b, k[14], 17, -1502002290);
            b = ff(b, c, d, a, k[15], 22, 1236535329);
            a = gg(a, b, c, d, k[1], 5, -165796510);
            d = gg(d, a, b, c, k[6], 9, -1069501632);
            c = gg(c, d, a, b, k[11], 14, 643717713);
            b = gg(b, c, d, a, k[0], 20, -373897302);
            a = gg(a, b, c, d, k[5], 5, -701558691);
            d = gg(d, a, b, c, k[10], 9, 38016083);
            c = gg(c, d, a, b, k[15], 14, -660478335);
            b = gg(b, c, d, a, k[4], 20, -405537848);
            a = gg(a, b, c, d, k[9], 5, 568446438);
            d = gg(d, a, b, c, k[14], 9, -1019803690);
            c = gg(c, d, a, b, k[3], 14, -187363961);
            b = gg(b, c, d, a, k[8], 20, 1163531501);
            a = gg(a, b, c, d, k[13], 5, -1444681467);
            d = gg(d, a, b, c, k[2], 9, -51403784);
            c = gg(c, d, a, b, k[7], 14, 1735328473);
            b = gg(b, c, d, a, k[12], 20, -1926607734);
            a = hh(a, b, c, d, k[5], 4, -378558);
            d = hh(d, a, b, c, k[8], 11, -2022574463);
            c = hh(c, d, a, b, k[11], 16, 1839030562);
            b = hh(b, c, d, a, k[14], 23, -35309556);
            a = hh(a, b, c, d, k[1], 4, -1530992060);
            d = hh(d, a, b, c, k[4], 11, 1272893353);
            c = hh(c, d, a, b, k[7], 16, -155497632);
            b = hh(b, c, d, a, k[10], 23, -1094730640);
            a = hh(a, b, c, d, k[13], 4, 681279174);
            d = hh(d, a, b, c, k[0], 11, -358537222);
            c = hh(c, d, a, b, k[3], 16, -722521979);
            b = hh(b, c, d, a, k[6], 23, 76029189);
            a = hh(a, b, c, d, k[9], 4, -640364487);
            d = hh(d, a, b, c, k[12], 11, -421815835);
            c = hh(c, d, a, b, k[15], 16, 530742520);
            b = hh(b, c, d, a, k[2], 23, -995338651);
            a = ii(a, b, c, d, k[0], 6, -198630844);
            d = ii(d, a, b, c, k[7], 10, 1126891415);
            c = ii(c, d, a, b, k[14], 15, -1416354905);
            b = ii(b, c, d, a, k[5], 21, -57434055);
            a = ii(a, b, c, d, k[12], 6, 1700485571);
            d = ii(d, a, b, c, k[3], 10, -1894986606);
            c = ii(c, d, a, b, k[10], 15, -1051523);
            b = ii(b, c, d, a, k[1], 21, -2054922799);
            a = ii(a, b, c, d, k[8], 6, 1873313359);
            d = ii(d, a, b, c, k[15], 10, -30611744);
            c = ii(c, d, a, b, k[6], 15, -1560198380);
            b = ii(b, c, d, a, k[13], 21, 1309151649);
            a = ii(a, b, c, d, k[4], 6, -145523070);
            d = ii(d, a, b, c, k[11], 10, -1120210379);
            c = ii(c, d, a, b, k[2], 15, 718787259);
            b = ii(b, c, d, a, k[9], 21, -343485551);
            x[0] = add32(a, x[0]);
            x[1] = add32(b, x[1]);
            x[2] = add32(c, x[2]);
            x[3] = add32(d, x[3]);
        }

        function cmn(q, a, b, x, s, t) {
            a = add32(add32(a, q), add32(x, t));
            return add32((a << s) | (a >>> (32 - s)), b);
        }

        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }

        function md51(s) {
            var n = s.length,
                state = [1732584193, -271733879, -1732584194, 271733878], i;
            for (i = 64; i <= s.length; i += 64) {
                md5cycle(state, md5blk(s.substring(i - 64, i)));
            }
            s = s.substring(i - 64);
            var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            for (i = 0; i < s.length; i++)
                tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
            tail[i >> 2] |= 0x80 << ((i % 4) << 3);
            if (i > 55) {
                md5cycle(state, tail);
                for (i = 0; i < 16; i++) tail[i] = 0;
            }
            tail[14] = n * 8;
            md5cycle(state, tail);
            return state;
        }

        function md5blk(s) {
            var md5blks = [], i;
            for (i = 0; i < 64; i += 4) {
                md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) +
                    (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
            }
            return md5blks;
        }

        var hex_chr = '0123456789abcdef'.split('');

        function rhex(n) {
            var s = '', j = 0;
            for (; j < 4; j++)
                s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
            return s;
        }

        function hex(x) {
            for (var i = 0; i < x.length; i++)
                x[i] = rhex(x[i]);
            return x.join('');
        }

        function add32(a, b) {
            return (a + b) & 0xFFFFFFFF;
        }

        return hex(md51(string));
    }

    // ==================== UUID / ID Tool ====================
    function initUuid() {
        let generatedIds = [];
        let currentType = 'uuid';

        const TYPE_DESC = {
            uuid: '加密安全的 UUID v4，适合通用唯一标识。',
            snowflake: '趋势递增的 64-bit 雪花 ID，适合分布式主键。',
            nanoid: '短小 URL 友好的随机 ID，适合公开链接与令牌。'
        };

        const NANO_ALPHABETS = {
            url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
            alnum: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            numeric: '0123456789'
        };

        function toast(msg) {
            if (DevKit.App && typeof DevKit.App.showToast === 'function') {
                DevKit.App.showToast(msg);
            }
        }

        function clamp(n, min, max, fallback) {
            const v = Number.parseInt(n, 10);
            if (!Number.isFinite(v)) return fallback;
            return Math.min(max, Math.max(min, v));
        }

        function randomIndex(maxExclusive) {
            if (maxExclusive <= 0) return 0;
            const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
            const buf = new Uint32Array(1);
            let x;
            do {
                crypto.getRandomValues(buf);
                x = buf[0];
            } while (x >= limit);
            return x % maxExclusive;
        }

        function generateUUIDv4(opts) {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
            let id = opts.uuidHyphen
                ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
                : hex;
            if (opts.uuidUppercase) id = id.toUpperCase();
            return id;
        }

        let snowflakeSequence = 0;
        let snowflakeLastTs = 0;

        function generateSnowflakeId(opts) {
            let timestamp = Date.now();
            if (timestamp === snowflakeLastTs) {
                snowflakeSequence = (snowflakeSequence + 1) & 0xFFF;
                if (snowflakeSequence === 0) {
                    while (timestamp <= snowflakeLastTs) { timestamp = Date.now(); }
                }
            } else {
                snowflakeSequence = 0;
            }
            snowflakeLastTs = timestamp;
            const workerId = BigInt(clamp(opts.snowflakeWorker, 0, 31, 1));
            const datacenterId = BigInt(clamp(opts.snowflakeDatacenter, 0, 31, 1));
            // Twitter layout: timestamp | datacenter(5) | worker(5) | sequence(12)
            return ((BigInt(timestamp) - BigInt(1288834974657)) << BigInt(22) |
                (datacenterId << BigInt(17)) |
                (workerId << BigInt(12)) |
                BigInt(snowflakeSequence)).toString();
        }

        function generateNanoId(opts) {
            const size = clamp(opts.nanoidSize, 8, 64, 21);
            const alphabet = NANO_ALPHABETS[opts.nanoidAlphabet] || NANO_ALPHABETS.url;
            let id = '';
            for (let i = 0; i < size; i++) {
                id += alphabet[randomIndex(alphabet.length)];
            }
            return id;
        }

        function readOptionsFromUI() {
            return {
                type: currentType,
                count: clamp(document.getElementById('idCount')?.value, 1, 50, 5),
                uuidHyphen: !!document.getElementById('idUuidHyphen')?.checked,
                uuidUppercase: !!document.getElementById('idUuidUppercase')?.checked,
                snowflakeWorker: clamp(document.getElementById('idSnowflakeWorker')?.value, 0, 31, 1),
                snowflakeDatacenter: clamp(document.getElementById('idSnowflakeDatacenter')?.value, 0, 31, 1),
                nanoidSize: clamp(document.getElementById('idNanoidSize')?.value, 8, 64, 21),
                nanoidAlphabet: document.getElementById('idNanoidAlphabet')?.value || 'url'
            };
        }

        function applyOptionsToUI(opts) {
            if (!opts) return;
            currentType = ['uuid', 'snowflake', 'nanoid'].includes(opts.type) ? opts.type : 'uuid';
            const countEl = document.getElementById('idCount');
            if (countEl) countEl.value = clamp(opts.count, 1, 50, 5);
            const setChecked = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!v;
            };
            setChecked('idUuidHyphen', opts.uuidHyphen !== false);
            setChecked('idUuidUppercase', !!opts.uuidUppercase);
            const w = document.getElementById('idSnowflakeWorker');
            if (w) w.value = clamp(opts.snowflakeWorker, 0, 31, 1);
            const d = document.getElementById('idSnowflakeDatacenter');
            if (d) d.value = clamp(opts.snowflakeDatacenter, 0, 31, 1);
            const s = document.getElementById('idNanoidSize');
            if (s) s.value = clamp(opts.nanoidSize, 8, 64, 21);
            const a = document.getElementById('idNanoidAlphabet');
            if (a) a.value = NANO_ALPHABETS[opts.nanoidAlphabet] ? opts.nanoidAlphabet : 'url';
            syncTypeUI();
        }

        function syncTypeUI() {
            document.querySelectorAll('.id-type-btn').forEach((btn) => {
                btn.classList.toggle('active', btn.getAttribute('data-id-type') === currentType);
            });
            document.getElementById('idOptionsUuid')?.classList.toggle('hidden', currentType !== 'uuid');
            document.getElementById('idOptionsSnowflake')?.classList.toggle('hidden', currentType !== 'snowflake');
            document.getElementById('idOptionsNanoid')?.classList.toggle('hidden', currentType !== 'nanoid');
            const desc = document.getElementById('idTypeDesc');
            if (desc) desc.textContent = TYPE_DESC[currentType] || TYPE_DESC.uuid;
            const placeholder = document.getElementById('idPlaceholder');
            if (placeholder && generatedIds.length === 0) {
                placeholder.textContent = TYPE_DESC[currentType] || '生成的 ID 将显示在这里';
            }
        }

        async function persistOptions() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('uuidOptions', readOptionsFromUI());
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function copyId(text) {
            navigator.clipboard.writeText(text).then(() => toast('已复制')).catch(() => toast('复制失败'));
        }

        function makeOne(opts) {
            if (currentType === 'snowflake') return generateSnowflakeId(opts);
            if (currentType === 'nanoid') return generateNanoId(opts);
            return generateUUIDv4(opts);
        }

        function renderList(ids) {
            const list = document.getElementById('idOutputList');
            if (!list) return;
            generatedIds = ids;
            list.innerHTML = '';

            if (!ids.length) {
                list.innerHTML = `<div class="id-placeholder" id="idPlaceholder">${escapeHtml(TYPE_DESC[currentType])}</div>`;
                return;
            }

            ids.forEach((id, index) => {
                const row = document.createElement('div');
                row.className = 'id-row';
                row.innerHTML = `
                    <span class="id-index">${index + 1}</span>
                    <span class="id-text" title="点击复制">${escapeHtml(id)}</span>
                    <button type="button" class="id-copy-btn" title="复制">复制</button>
                    <button type="button" class="id-regen-btn" title="重新生成这条">换</button>
                `;
                const textEl = row.querySelector('.id-text');
                const copyBtn = row.querySelector('.id-copy-btn');
                const regenBtn = row.querySelector('.id-regen-btn');
                const copyCurrent = () => copyId(generatedIds[index]);
                textEl.addEventListener('click', copyCurrent);
                copyBtn.addEventListener('click', copyCurrent);
                regenBtn.addEventListener('click', () => {
                    const opts = readOptionsFromUI();
                    const next = makeOne(opts);
                    generatedIds[index] = next;
                    textEl.textContent = next;
                });
                list.appendChild(row);
            });
        }

        function generateAll() {
            const opts = readOptionsFromUI();
            const ids = [];
            for (let i = 0; i < opts.count; i++) {
                ids.push(makeOne(opts));
            }
            renderList(ids);
            persistOptions();
        }

        document.querySelectorAll('.id-type-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                currentType = btn.getAttribute('data-id-type') || 'uuid';
                syncTypeUI();
                persistOptions();
            });
        });

        document.getElementById('idGenerateBtn')?.addEventListener('click', generateAll);
        document.getElementById('idCopyAllBtn')?.addEventListener('click', () => {
            if (!generatedIds.length) {
                toast('还没有 ID');
                return;
            }
            navigator.clipboard.writeText(generatedIds.join('\n'))
                .then(() => toast(`已复制 ${generatedIds.length} 条`))
                .catch(() => toast('复制失败'));
        });

        const optionIds = [
            'idCount', 'idUuidHyphen', 'idUuidUppercase',
            'idSnowflakeWorker', 'idSnowflakeDatacenter',
            'idNanoidSize', 'idNanoidAlphabet'
        ];
        optionIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                persistOptions();
            });
        });

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('uuidOptions');
                    if (saved && typeof saved === 'object') {
                        applyOptionsToUI(saved);
                    } else {
                        syncTypeUI();
                    }
                } else {
                    syncTypeUI();
                }
            } catch (_) {
                syncTypeUI();
            }
        })();
    }

    // ==================== Password Generator ====================
    function initPassword() {
        let generatedPasswords = [];
        let currentMode = 'random';

        const AMBIGUOUS = /[0Ool1I|]/g;
        const DEFAULT_SYMBOL_CHARSET = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const CHAR_SETS = {
            uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            lowercase: 'abcdefghijklmnopqrstuvwxyz',
            numbers: '0123456789',
            symbols: DEFAULT_SYMBOL_CHARSET
        };

        // Keep unique printable non-whitespace symbols; fall back to default if empty.
        function normalizeSymbolCharset(raw) {
            const src = String(raw == null ? '' : raw);
            let out = '';
            const seen = Object.create(null);
            for (const ch of src) {
                const code = ch.codePointAt(0);
                if (code <= 0x20 || code === 0x7f) continue; // skip whitespace / DEL
                if (seen[ch]) continue;
                seen[ch] = true;
                out += ch;
            }
            return out || DEFAULT_SYMBOL_CHARSET;
        }

        function toast(msg) {
            if (DevKit.App && typeof DevKit.App.showToast === 'function') {
                DevKit.App.showToast(msg);
            }
        }

        function clamp(n, min, max, fallback) {
            const v = Number.parseInt(n, 10);
            if (!Number.isFinite(v)) return fallback;
            return Math.min(max, Math.max(min, v));
        }

        // Unbiased index in [0, maxExclusive)
        function randomIndex(maxExclusive) {
            if (maxExclusive <= 0) return 0;
            const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
            const buf = new Uint32Array(1);
            let x;
            do {
                crypto.getRandomValues(buf);
                x = buf[0];
            } while (x >= limit);
            return x % maxExclusive;
        }

        function pickChar(pool) {
            return pool[randomIndex(pool.length)];
        }

        function shuffleInPlace(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = randomIndex(i + 1);
                const tmp = arr[i];
                arr[i] = arr[j];
                arr[j] = tmp;
            }
            return arr;
        }

        function filterAmbiguous(str, exclude) {
            if (!exclude) return str;
            return str.replace(AMBIGUOUS, '');
        }

        function buildPools(options) {
            const pools = [];
            if (options.uppercase) {
                const s = filterAmbiguous(CHAR_SETS.uppercase, options.excludeAmbiguous);
                if (s) pools.push(s);
            }
            if (options.lowercase) {
                const s = filterAmbiguous(CHAR_SETS.lowercase, options.excludeAmbiguous);
                if (s) pools.push(s);
            }
            if (options.numbers) {
                const s = filterAmbiguous(CHAR_SETS.numbers, options.excludeAmbiguous);
                if (s) pools.push(s);
            }
            if (options.symbols) {
                const custom = normalizeSymbolCharset(options.symbolCharset);
                const s = filterAmbiguous(custom, options.excludeAmbiguous);
                if (s) pools.push(s);
            }
            if (pools.length === 0) {
                pools.push(filterAmbiguous(CHAR_SETS.lowercase, options.excludeAmbiguous) || CHAR_SETS.lowercase);
            }
            return pools;
        }

        function generatePassword(length, options) {
            const len = clamp(length, 4, 128, 16);
            const pools = buildPools(options);
            const merged = pools.join('');
            const chars = [];

            // Guarantee at least one from each selected pool (when length allows)
            const guaranteeCount = Math.min(pools.length, len);
            for (let i = 0; i < guaranteeCount; i++) {
                chars.push(pickChar(pools[i]));
            }
            for (let i = guaranteeCount; i < len; i++) {
                chars.push(pickChar(merged));
            }
            return shuffleInPlace(chars).join('');
        }

        function generatePassphrase(options) {
            const wordlist = (DevKit.PASSWORD_WORDLIST && DevKit.PASSWORD_WORDLIST.length)
                ? DevKit.PASSWORD_WORDLIST
                : ['correct', 'horse', 'battery', 'staple', 'orbit', 'lantern', 'meadow', 'silver'];
            const wordCount = clamp(options.wordCount, 3, 10, 4);
            const sep = (options.phraseSeparator != null && String(options.phraseSeparator).length)
                ? String(options.phraseSeparator).slice(0, 3)
                : '-';
            const words = [];
            for (let i = 0; i < wordCount; i++) {
                let w = wordlist[randomIndex(wordlist.length)];
                if (options.phraseCapitalize) {
                    w = w.charAt(0).toUpperCase() + w.slice(1);
                }
                words.push(w);
            }
            let phrase = words.join(sep);
            if (options.phraseNumber) {
                phrase += String(randomIndex(10));
            }
            return phrase;
        }

        function poolSize(options) {
            if (currentMode === 'passphrase') {
                const wl = (DevKit.PASSWORD_WORDLIST && DevKit.PASSWORD_WORDLIST.length) || 2048;
                return wl;
            }
            return buildPools(options).join('').length || 26;
        }

        function estimateEntropyBits(options) {
            if (currentMode === 'passphrase') {
                const words = clamp(options.wordCount, 3, 10, 4);
                const wl = (DevKit.PASSWORD_WORDLIST && DevKit.PASSWORD_WORDLIST.length) || 2048;
                let bits = words * Math.log2(wl);
                if (options.phraseNumber) bits += Math.log2(10);
                return bits;
            }
            const len = clamp(options.length, 4, 128, 16);
            const size = poolSize(options);
            return len * Math.log2(Math.max(2, size));
        }

        function updateStrengthMeter(options) {
            const bits = estimateEntropyBits(options);
            const fill = document.getElementById('pwdStrengthFill');
            const label = document.getElementById('pwdStrengthLabel');
            const wrap = document.getElementById('pwdStrength');
            if (!fill || !label || !wrap) return;

            let level = 'weak';
            let text = '弱';
            let pct = 28;
            if (bits >= 80) {
                level = 'strong';
                text = '强';
                pct = 100;
            } else if (bits >= 50) {
                level = 'medium';
                text = '中';
                pct = 62;
            }
            wrap.dataset.level = level;
            fill.style.width = pct + '%';
            label.textContent = `${text} · 约 ${Math.round(bits)} bit`;
        }

        function readOptionsFromUI() {
            return {
                mode: currentMode,
                length: clamp(document.getElementById('pwdLength')?.value, 4, 128, 16),
                count: clamp(document.getElementById('pwdCount')?.value, 1, 50, 5),
                uppercase: !!document.getElementById('pwdUppercase')?.checked,
                lowercase: !!document.getElementById('pwdLowercase')?.checked,
                numbers: !!document.getElementById('pwdNumbers')?.checked,
                symbols: !!document.getElementById('pwdSymbols')?.checked,
                symbolCharset: normalizeSymbolCharset(document.getElementById('pwdSymbolCharset')?.value),
                excludeAmbiguous: !!document.getElementById('pwdExcludeAmbiguous')?.checked,
                wordCount: clamp(document.getElementById('pwdWordCount')?.value, 3, 10, 4),
                phraseSeparator: document.getElementById('pwdPhraseSeparator')?.value ?? '-',
                phraseCapitalize: !!document.getElementById('pwdPhraseCapitalize')?.checked,
                phraseNumber: !!document.getElementById('pwdPhraseNumber')?.checked
            };
        }

        function applyOptionsToUI(opts) {
            if (!opts) return;
            currentMode = opts.mode === 'passphrase' ? 'passphrase' : 'random';
            const lengthEl = document.getElementById('pwdLength');
            const countEl = document.getElementById('pwdCount');
            if (lengthEl) lengthEl.value = clamp(opts.length, 4, 128, 16);
            if (countEl) countEl.value = clamp(opts.count, 1, 50, 5);
            const setChecked = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!v;
            };
            setChecked('pwdUppercase', opts.uppercase !== false);
            setChecked('pwdLowercase', opts.lowercase !== false);
            setChecked('pwdNumbers', opts.numbers !== false);
            setChecked('pwdSymbols', !!opts.symbols);
            setChecked('pwdExcludeAmbiguous', !!opts.excludeAmbiguous);
            setChecked('pwdPhraseCapitalize', opts.phraseCapitalize !== false);
            setChecked('pwdPhraseNumber', !!opts.phraseNumber);
            const symbolEl = document.getElementById('pwdSymbolCharset');
            if (symbolEl) {
                symbolEl.value = normalizeSymbolCharset(
                    opts.symbolCharset != null ? opts.symbolCharset : DEFAULT_SYMBOL_CHARSET
                );
            }
            const wc = document.getElementById('pwdWordCount');
            if (wc) wc.value = clamp(opts.wordCount, 3, 10, 4);
            const sep = document.getElementById('pwdPhraseSeparator');
            if (sep) sep.value = opts.phraseSeparator != null ? String(opts.phraseSeparator).slice(0, 3) : '-';
            syncModeUI();
            syncSymbolsBlock();
        }

        function syncModeUI() {
            document.getElementById('pwdModeRandom')?.classList.toggle('active', currentMode === 'random');
            document.getElementById('pwdModePassphrase')?.classList.toggle('active', currentMode === 'passphrase');
            document.getElementById('pwdRandomOptions')?.classList.toggle('hidden', currentMode !== 'random');
            document.getElementById('pwdPassphraseOptions')?.classList.toggle('hidden', currentMode !== 'passphrase');
            document.getElementById('pwdPresets')?.classList.toggle('is-passphrase', currentMode === 'passphrase');
        }

        function syncSymbolsBlock() {
            const enabled = !!document.getElementById('pwdSymbols')?.checked;
            const block = document.getElementById('pwdSymbolsBlock');
            if (block) block.classList.toggle('is-disabled', !enabled);
            const input = document.getElementById('pwdSymbolCharset');
            const resetBtn = document.getElementById('pwdResetSymbolsBtn');
            if (input) input.disabled = !enabled;
            if (resetBtn) resetBtn.disabled = !enabled;
        }

        async function persistOptions() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('pwdOptions', readOptionsFromUI());
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function copyPassword(password) {
            navigator.clipboard.writeText(password).then(() => {
                toast('已复制');
            }).catch(() => toast('复制失败'));
        }

        function renderPasswordList(passwords) {
            const listContainer = document.getElementById('pwdOutputList');
            if (!listContainer) return;

            generatedPasswords = passwords;
            listContainer.innerHTML = '';

            if (!passwords.length) {
                listContainer.innerHTML = '<div class="password-placeholder">生成的密码将显示在这里</div>';
                return;
            }

            passwords.forEach((pwd, index) => {
                const row = document.createElement('div');
                row.className = 'password-row';
                row.dataset.index = String(index);
                row.innerHTML = `
                    <span class="password-index">${index + 1}</span>
                    <span class="password-text" title="点击复制">${escapeHtml(pwd)}</span>
                    <button type="button" class="password-copy-btn" title="复制">复制</button>
                    <button type="button" class="password-regen-btn" title="重新生成这条">换</button>
                `;

                const textEl = row.querySelector('.password-text');
                const copyBtn = row.querySelector('.password-copy-btn');
                const regenBtn = row.querySelector('.password-regen-btn');

                const copyCurrent = () => copyPassword(generatedPasswords[index]);
                textEl.addEventListener('click', copyCurrent);
                copyBtn.addEventListener('click', copyCurrent);
                regenBtn.addEventListener('click', () => {
                    const opts = readOptionsFromUI();
                    const next = currentMode === 'passphrase'
                        ? generatePassphrase(opts)
                        : generatePassword(opts.length, opts);
                    generatedPasswords[index] = next;
                    textEl.textContent = next;
                    updateStrengthMeter(opts);
                });

                listContainer.appendChild(row);
            });
        }

        function generateAll() {
            const opts = readOptionsFromUI();
            const count = opts.count;
            const passwords = [];
            for (let i = 0; i < count; i++) {
                passwords.push(
                    currentMode === 'passphrase'
                        ? generatePassphrase(opts)
                        : generatePassword(opts.length, opts)
                );
            }
            renderPasswordList(passwords);
            updateStrengthMeter(opts);
            persistOptions();
        }

        function applyPreset(name) {
            currentMode = 'random';
            const presets = {
                pin: {
                    uppercase: false, lowercase: false, numbers: true, symbols: false,
                    excludeAmbiguous: false, length: 6, count: 5
                },
                readable: {
                    uppercase: true, lowercase: true, numbers: true, symbols: false,
                    excludeAmbiguous: true, length: 14, count: 5
                },
                strong: {
                    uppercase: true, lowercase: true, numbers: true, symbols: true,
                    excludeAmbiguous: false, length: 20, count: 5
                },
                wifi: {
                    uppercase: true, lowercase: true, numbers: true, symbols: true,
                    excludeAmbiguous: true, length: 16, count: 3
                }
            };
            const p = presets[name];
            if (!p) return;
            applyOptionsToUI({ ...readOptionsFromUI(), ...p, mode: 'random' });
            generateAll();
        }

        // Mode buttons
        document.getElementById('pwdModeRandom')?.addEventListener('click', () => {
            currentMode = 'random';
            syncModeUI();
            updateStrengthMeter(readOptionsFromUI());
            persistOptions();
        });
        document.getElementById('pwdModePassphrase')?.addEventListener('click', () => {
            currentMode = 'passphrase';
            syncModeUI();
            updateStrengthMeter(readOptionsFromUI());
            persistOptions();
        });

        document.querySelectorAll('[data-pwd-preset]').forEach((btn) => {
            btn.addEventListener('click', () => applyPreset(btn.getAttribute('data-pwd-preset')));
        });

        document.getElementById('pwdGenerateBtn')?.addEventListener('click', generateAll);

        document.getElementById('pwdCopyAllBtn')?.addEventListener('click', () => {
            if (generatedPasswords.length === 0) {
                toast('还没有密码');
                return;
            }
            navigator.clipboard.writeText(generatedPasswords.join('\n')).then(() => {
                toast(`已复制 ${generatedPasswords.length} 条`);
            }).catch(() => toast('复制失败'));
        });

        document.getElementById('pwdSymbols')?.addEventListener('change', () => {
            syncSymbolsBlock();
        });

        document.getElementById('pwdResetSymbolsBtn')?.addEventListener('click', () => {
            const el = document.getElementById('pwdSymbolCharset');
            if (el) el.value = DEFAULT_SYMBOL_CHARSET;
            updateStrengthMeter(readOptionsFromUI());
            persistOptions();
            toast('已重置符号池');
        });

        const symbolInput = document.getElementById('pwdSymbolCharset');
        symbolInput?.addEventListener('change', () => {
            if (symbolInput) {
                symbolInput.value = normalizeSymbolCharset(symbolInput.value);
            }
            updateStrengthMeter(readOptionsFromUI());
            persistOptions();
        });
        symbolInput?.addEventListener('blur', () => {
            if (symbolInput) {
                symbolInput.value = normalizeSymbolCharset(symbolInput.value);
            }
            persistOptions();
        });

        // Live strength when options change
        const optionIds = [
            'pwdLength', 'pwdCount', 'pwdUppercase', 'pwdLowercase', 'pwdNumbers', 'pwdSymbols',
            'pwdExcludeAmbiguous', 'pwdWordCount', 'pwdPhraseSeparator', 'pwdPhraseCapitalize', 'pwdPhraseNumber'
        ];
        optionIds.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                updateStrengthMeter(readOptionsFromUI());
                persistOptions();
            });
            if (el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'text')) {
                el.addEventListener('input', () => updateStrengthMeter(readOptionsFromUI()));
            }
        });

        // Restore persisted options
        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('pwdOptions');
                    if (saved && typeof saved === 'object') {
                        applyOptionsToUI(saved);
                    } else {
                        syncModeUI();
                        syncSymbolsBlock();
                    }
                } else {
                    syncModeUI();
                    syncSymbolsBlock();
                }
            } catch (_) {
                syncModeUI();
                syncSymbolsBlock();
            }
            updateStrengthMeter(readOptionsFromUI());
        })();
    }

    // ==================== Regex Tester ====================
    function initRegex() {
        const MAX_MATCHES = 500;
        const PRESETS = {
            digits: { pattern: '\\d+', flags: 'g', label: '数字' },
            email: { pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', flags: 'gi', label: '邮箱' },
            url: { pattern: 'https?:\\/\\/[^\\s<>"\']+', flags: 'gi', label: 'URL' },
            ipv4: { pattern: '(?:\\d{1,3}\\.){3}\\d{1,3}', flags: 'g', label: 'IPv4' },
            hex: { pattern: '0x[0-9a-fA-F]+|\\b[0-9a-fA-F]{6,}\\b', flags: 'g', label: '十六进制' },
            blank: { pattern: '^\\s*$', flags: 'gm', label: '空白行' }
        };

        let mode = 'match'; // match | replace
        let lastMatches = [];
        let lastReplaceText = '';
        let lastCopyText = '';
        let flashTimer = 0;

        function toast(msg) {
            if (DevKit.App && typeof DevKit.App.showToast === 'function') {
                DevKit.App.showToast(msg);
            }
        }

        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function getFlags() {
            return Array.from(document.querySelectorAll('.regex-flag-chip.is-on'))
                .map((el) => el.getAttribute('data-flag'))
                .filter(Boolean)
                .join('');
        }

        function setFlags(flags) {
            const set = new Set(String(flags || ''));
            document.querySelectorAll('.regex-flag-chip').forEach((chip) => {
                const on = set.has(chip.getAttribute('data-flag'));
                chip.classList.toggle('is-on', on);
                chip.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
            const readout = document.getElementById('regexFlagsReadout');
            if (readout) readout.textContent = getFlags() || '';
        }

        function syncModeUI() {
            document.getElementById('regexModeMatch')?.classList.toggle('active', mode === 'match');
            document.getElementById('regexModeReplace')?.classList.toggle('active', mode === 'replace');
            document.getElementById('regexReplaceRow')?.classList.toggle('hidden', mode !== 'replace');
            const title = document.getElementById('regexResultTitle');
            if (title) title.textContent = mode === 'replace' ? '替换预览' : '匹配结果';
            const list = document.getElementById('regexMatchList');
            const preview = document.getElementById('regexReplacePreview');
            if (mode === 'replace') {
                list?.classList.add('hidden');
                preview?.classList.remove('hidden');
            } else {
                list?.classList.remove('hidden');
                preview?.classList.add('hidden');
            }
            const run = document.getElementById('regexRunBtn');
            if (run) run.textContent = mode === 'replace' ? '替换' : '测试';
        }

        function setError(msg) {
            const err = document.getElementById('regexError');
            const row = document.querySelector('.regex-pattern-row');
            if (err) {
                if (msg) {
                    err.textContent = msg;
                    err.classList.remove('hidden');
                } else {
                    err.textContent = '';
                    err.classList.add('hidden');
                }
            }
            row?.classList.toggle('is-error', !!msg);
        }

        function collectMatches(regex, text) {
            const matches = [];
            let truncated = false;
            let match;
            if (regex.global) {
                while ((match = regex.exec(text)) !== null) {
                    matches.push({
                        index: match.index,
                        end: match.index + match[0].length,
                        text: match[0],
                        groups: match.slice(1)
                    });
                    if (match.index === regex.lastIndex) regex.lastIndex++;
                    if (matches.length >= MAX_MATCHES) {
                        truncated = true;
                        break;
                    }
                }
            } else {
                match = regex.exec(text);
                if (match) {
                    matches.push({
                        index: match.index,
                        end: match.index + match[0].length,
                        text: match[0],
                        groups: match.slice(1)
                    });
                }
            }
            return { matches, truncated };
        }

        function buildHighlightHtml(text, matches) {
            if (!text) return '';
            if (!matches.length) return escapeHtml(text);
            let html = '';
            let cursor = 0;
            matches.forEach((m, i) => {
                if (m.index > cursor) html += escapeHtml(text.slice(cursor, m.index));
                const cls = `regex-hl regex-hl-${i % 2}${m._flash ? ' is-flash' : ''}`;
                html += `<mark class="${cls}" data-match-i="${i}">${escapeHtml(m.text)}</mark>`;
                cursor = m.end;
            });
            if (cursor < text.length) html += escapeHtml(text.slice(cursor));
            return html;
        }

        function renderMatchList(matches, truncated) {
            const list = document.getElementById('regexMatchList');
            if (!list) return;
            if (!matches.length) {
                list.innerHTML = '<div class="regex-placeholder">无匹配</div>';
                return;
            }
            list.innerHTML = matches.map((m, i) => {
                const groups = (m.groups || []).length
                    ? `<ul class="regex-match-groups">${m.groups.map((g, gi) =>
                        `<li>$${gi + 1}: ${g == null ? '<空>' : escapeHtml(String(g))}</li>`
                    ).join('')}</ul>`
                    : '';
                return `<div class="regex-match-row" data-match-i="${i}" role="button" tabindex="0">
                    <div class="regex-match-top">
                        <span class="regex-match-idx">#${i + 1}</span>
                        <span class="regex-match-range">[${m.index}, ${m.end})</span>
                    </div>
                    <div class="regex-match-text">${escapeHtml(m.text)}</div>
                    ${groups}
                </div>`;
            }).join('') + (truncated
                ? '<div class="regex-placeholder">已截断：最多显示 500 条匹配</div>'
                : '');

            list.querySelectorAll('.regex-match-row').forEach((row) => {
                const activate = () => {
                    const i = Number(row.getAttribute('data-match-i'));
                    flashMatch(i);
                };
                row.addEventListener('click', activate);
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        activate();
                    }
                });
            });
        }

        function flashMatch(index) {
            const list = document.getElementById('regexMatchList');
            list?.querySelectorAll('.regex-match-row').forEach((row) => {
                row.classList.toggle('is-active', Number(row.getAttribute('data-match-i')) === index);
            });
            lastMatches.forEach((m, i) => { m._flash = i === index; });
            const text = document.getElementById('regexTestStr')?.value || '';
            const hl = document.getElementById('regexHighlight');
            if (hl) hl.innerHTML = buildHighlightHtml(text, lastMatches) + '\n';
            const mark = hl?.querySelector(`mark[data-match-i="${index}"]`);
            mark?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            if (flashTimer) clearTimeout(flashTimer);
            flashTimer = setTimeout(() => {
                lastMatches.forEach((m) => { m._flash = false; });
                if (hl) hl.innerHTML = buildHighlightHtml(text, lastMatches) + '\n';
            }, 900);
        }

        function syncScroll() {
            const input = document.getElementById('regexTestStr');
            const hl = document.getElementById('regexHighlight');
            if (!input || !hl) return;
            hl.scrollTop = input.scrollTop;
            hl.scrollLeft = input.scrollLeft;
        }

        function run() {
            const pattern = document.getElementById('regexPattern')?.value ?? '';
            const text = document.getElementById('regexTestStr')?.value ?? '';
            const flags = getFlags();
            const countEl = document.getElementById('regexMatchCount');
            const hl = document.getElementById('regexHighlight');
            const readout = document.getElementById('regexFlagsReadout');
            if (readout) readout.textContent = flags || '';

            lastMatches = [];
            lastReplaceText = '';
            lastCopyText = '';

            if (!pattern) {
                setError('');
                if (hl) hl.innerHTML = escapeHtml(text) + (text ? '\n' : '');
                if (countEl) countEl.textContent = '0 个匹配';
                const list = document.getElementById('regexMatchList');
                if (list && mode === 'match') {
                    list.innerHTML = '<div class="regex-placeholder">输入表达式后自动匹配</div>';
                }
                const preview = document.getElementById('regexReplacePreview');
                if (preview && mode === 'replace') preview.value = '';
                return;
            }

            let regex;
            try {
                regex = new RegExp(pattern, flags);
                setError('');
            } catch (e) {
                setError('正则表达式错误: ' + (e.message || '无效'));
                if (countEl) countEl.textContent = '错误';
                if (hl) hl.innerHTML = escapeHtml(text) + (text ? '\n' : '');
                const list = document.getElementById('regexMatchList');
                if (list && mode === 'match') {
                    list.innerHTML = '<div class="regex-placeholder">表达式无效</div>';
                }
                return;
            }

            if (mode === 'replace') {
                const replaceStr = document.getElementById('regexReplaceStr')?.value ?? '';
                // Highlight uses same flags; without g only first match is replaced/highlighted.
                const { matches, truncated } = collectMatches(new RegExp(pattern, flags), text);
                lastMatches = matches;
                const replaced = text.replace(regex, replaceStr);
                lastReplaceText = replaced;
                lastCopyText = replaced;
                const preview = document.getElementById('regexReplacePreview');
                if (preview) preview.value = replaced;
                if (hl) hl.innerHTML = buildHighlightHtml(text, matches) + (text ? '\n' : '');
                if (countEl) {
                    countEl.textContent = truncated
                        ? `替换约 ${matches.length}+ 处（已截断统计）`
                        : `替换 ${matches.length} 处`;
                }
                syncScroll();
                return;
            }

            const { matches, truncated } = collectMatches(regex, text);
            lastMatches = matches;
            lastCopyText = matches.map((m, i) =>
                `#${i + 1} [${m.index},${m.end}) ${m.text}`
                + (m.groups.length ? ` groups=[${m.groups.map((g) => JSON.stringify(g ?? null)).join(', ')}]` : '')
            ).join('\n');
            if (hl) hl.innerHTML = buildHighlightHtml(text, matches) + (text ? '\n' : '');
            renderMatchList(matches, truncated);
            if (countEl) {
                countEl.textContent = truncated
                    ? `${matches.length}+ 个匹配（已截断）`
                    : `${matches.length} 个匹配`;
            }
            syncScroll();
        }

        const debouncedRun = debounce(() => run(), 120);

        async function persist() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('regexOptions', {
                mode,
                flags: getFlags(),
                pattern: document.getElementById('regexPattern')?.value || '',
                replace: document.getElementById('regexReplaceStr')?.value || ''
            });
        }
        const debouncedPersist = debounce(() => { persist(); }, 400);

        document.querySelectorAll('[data-regex-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                mode = btn.getAttribute('data-regex-mode') === 'replace' ? 'replace' : 'match';
                syncModeUI();
                run();
                debouncedPersist();
            });
        });

        document.querySelectorAll('.regex-flag-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('is-on');
                chip.setAttribute('aria-pressed', chip.classList.contains('is-on') ? 'true' : 'false');
                const readout = document.getElementById('regexFlagsReadout');
                if (readout) readout.textContent = getFlags() || '';
                run();
                debouncedPersist();
            });
        });

        document.querySelectorAll('[data-regex-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-regex-preset');
                const preset = PRESETS[key];
                if (!preset) return;
                const input = document.getElementById('regexPattern');
                if (input) input.value = preset.pattern;
                setFlags(preset.flags);
                document.querySelectorAll('.regex-preset-chip').forEach((c) => {
                    c.classList.toggle('is-active', c === btn);
                });
                run();
                debouncedPersist();
            });
        });

        document.getElementById('regexPattern')?.addEventListener('input', () => {
            document.querySelectorAll('.regex-preset-chip').forEach((c) => c.classList.remove('is-active'));
            debouncedRun();
            debouncedPersist();
        });
        document.getElementById('regexReplaceStr')?.addEventListener('input', () => {
            debouncedRun();
            debouncedPersist();
        });
        document.getElementById('regexTestStr')?.addEventListener('input', () => {
            debouncedRun();
        });
        document.getElementById('regexTestStr')?.addEventListener('scroll', syncScroll);
        document.getElementById('regexRunBtn')?.addEventListener('click', () => run());
        document.getElementById('regexCopyBtn')?.addEventListener('click', () => {
            if (!lastCopyText) {
                toast(mode === 'replace' ? '没有可复制的替换结果' : '没有可复制的匹配');
                return;
            }
            navigator.clipboard.writeText(lastCopyText)
                .then(() => toast('已复制'))
                .catch(() => toast('复制失败'));
        });
        document.getElementById('regexClearBtn')?.addEventListener('click', () => {
            const pattern = document.getElementById('regexPattern');
            const test = document.getElementById('regexTestStr');
            const replace = document.getElementById('regexReplaceStr');
            if (pattern) pattern.value = '';
            if (test) test.value = '';
            if (replace) replace.value = '';
            document.querySelectorAll('.regex-preset-chip').forEach((c) => c.classList.remove('is-active'));
            setError('');
            run();
            debouncedPersist();
        });

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('regexOptions');
                    if (saved && typeof saved === 'object') {
                        mode = saved.mode === 'replace' ? 'replace' : 'match';
                        if (typeof saved.flags === 'string') setFlags(saved.flags);
                        else setFlags('g');
                        if (document.getElementById('regexPattern') && typeof saved.pattern === 'string') {
                            document.getElementById('regexPattern').value = saved.pattern;
                        }
                        if (document.getElementById('regexReplaceStr') && typeof saved.replace === 'string') {
                            document.getElementById('regexReplaceStr').value = saved.replace;
                        }
                    } else {
                        setFlags('g');
                    }
                } else {
                    setFlags('g');
                }
            } catch (_) {
                setFlags('g');
            }
            syncModeUI();
            run();
        })();
    }

    // ==================== Color Converter ====================
    function initColor() {
        const C = typeof ColorUtil !== 'undefined' ? ColorUtil : (DevKit && DevKit.Color);
        if (!C) return;

        const HISTORY_MAX = 16;
        let current = C.parse('#3B82F6') || C.rgba(59, 130, 246, 1);
        let history = [];
        let skipHistory = false;
        let imageObjectUrl = '';

        const inputEl = document.getElementById('colorInput');
        const pickerEl = document.getElementById('colorPicker');
        const hintEl = document.getElementById('colorParseHint');
        const previewEl = document.getElementById('colorPreview');
        const previewLabel = document.getElementById('colorPreviewLabel');
        const chipUpper = document.getElementById('colorOptUppercase');
        const chipModern = document.getElementById('colorOptModern');
        const eyeBtn = document.getElementById('colorEyeDropperBtn');
        const imageBtn = document.getElementById('colorImagePickBtn');
        const imageFile = document.getElementById('colorImageFile');
        const imageArea = document.getElementById('colorImagePickArea');
        const imageCanvas = document.getElementById('colorImageCanvas');
        const imageClose = document.getElementById('colorImagePickClose');
        const clearHistoryBtn = document.getElementById('colorClearHistoryBtn');
        const contrastBgInput = document.getElementById('colorContrastBg');

        function toast(msg) {
            if (DevKit.App && typeof DevKit.App.showToast === 'function') {
                DevKit.App.showToast(msg);
            }
        }

        function chipOn(el) {
            return !!el?.classList.contains('is-on');
        }

        function setChip(el, on) {
            if (!el) return;
            el.classList.toggle('is-on', !!on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }

        function formatOpts() {
            return {
                uppercase: chipOn(chipUpper),
                modernSyntax: chipOn(chipModern)
            };
        }

        async function persistOptions() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('colorOptions', formatOpts());
        }
        const debouncedPersistOptions = debounce(() => { persistOptions(); }, 300);

        async function persistHistory() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('colorHistory', history.slice(0, HISTORY_MAX));
        }
        const debouncedPersistHistory = debounce(() => { persistHistory(); }, 400);

        function pushHistory(color) {
            if (skipHistory) return;
            const key = C.toHex(color, color.a < 0.999, true);
            history = [key, ...history.filter((h) => h.toUpperCase() !== key.toUpperCase())].slice(0, HISTORY_MAX);
            renderHistory();
            debouncedPersistHistory();
        }

        function renderHistory() {
            const host = document.getElementById('colorHistory');
            if (!host) return;
            if (!history.length) {
                host.innerHTML = '<span class="color-history-empty">暂无记录</span>';
                return;
            }
            host.innerHTML = history.map((hex) => {
                const c = C.parse(hex);
                const css = c ? C.cssBackground(c) : hex;
                return `<button type="button" class="color-swatch" role="listitem" data-color="${hex.replace(/"/g, '')}" style="--swatch:${css}" title="${hex}" aria-label="${hex}"></button>`;
            }).join('');
        }

        function renderSwatchRow(hostId, colors, currentKey) {
            const host = document.getElementById(hostId);
            if (!host) return;
            host.innerHTML = colors.map((c) => {
                const hex = C.toHex(c, c.a < 0.999, true);
                const css = C.cssBackground(c);
                const cur = hex.toUpperCase() === currentKey ? ' is-current' : '';
                return `<button type="button" class="color-swatch${cur}" role="listitem" data-color="${hex}" style="--swatch:${css}" title="${hex}" aria-label="${hex}"></button>`;
            }).join('');
        }

        function badgeHtml(report) {
            const items = [
                ['AA', report.aaNormal],
                ['AA大', report.aaLarge],
                ['AAA', report.aaaNormal],
                ['AAA大', report.aaaLarge]
            ];
            return items.map(([label, ok]) => (
                `<span class="color-badge ${ok ? 'pass' : 'fail'}">${label}</span>`
            )).join('');
        }

        function fillContrast(el, fg, bg) {
            if (!el) return;
            const report = C.contrastReport(fg, bg);
            const ratioEl = el.querySelector('[data-role="ratio"]');
            const badgesEl = el.querySelector('[data-role="badges"]');
            if (ratioEl) ratioEl.textContent = `${report.ratio}:1`;
            if (badgesEl) badgesEl.innerHTML = badgeHtml(report);
        }

        function updateContrast(color) {
            fillContrast(document.getElementById('colorContrastWhite'), color, C.WHITE);
            fillContrast(document.getElementById('colorContrastBlack'), color, C.BLACK);
            const customBg = C.parse(contrastBgInput?.value || '') || C.parse('#F8FAFC') || C.WHITE;
            const swatch = document.getElementById('colorContrastCustomSwatch');
            if (swatch) {
                swatch.style.background = C.cssBackground(customBg);
                // Pick readable label color against custom bg
                const onWhite = C.contrastRatio(C.BLACK, customBg) >= C.contrastRatio(C.WHITE, customBg);
                swatch.style.color = onWhite ? '#111' : '#fff';
            }
            fillContrast(document.getElementById('colorContrastCustom'), color, customBg);
        }

        function applyColor(color, options = {}) {
            if (!color) return;
            current = color;
            const opts = formatOpts();
            const fmt = C.format(color, opts);
            const syncInput = options.syncInput !== false;

            const hexEl = document.getElementById('colorHex');
            const hex8El = document.getElementById('colorHex8');
            const rgbEl = document.getElementById('colorRgb');
            const hslEl = document.getElementById('colorHsl');
            const hwbEl = document.getElementById('colorHwb');
            const oklchEl = document.getElementById('colorOklch');

            if (hexEl) hexEl.value = fmt.hex;
            if (hex8El) hex8El.value = fmt.hex8;
            if (rgbEl) rgbEl.value = fmt.rgb;
            if (hslEl) hslEl.value = fmt.hsl;
            if (hwbEl) hwbEl.value = fmt.hwb;
            if (oklchEl) oklchEl.value = fmt.oklch;

            if (previewEl) previewEl.style.setProperty('--swatch', C.cssBackground(color));
            if (previewLabel) previewLabel.textContent = fmt.hex8;
            if (pickerEl) pickerEl.value = C.pickerHex(color);
            if (syncInput && inputEl && document.activeElement !== inputEl) {
                inputEl.value = fmt.hex8;
            } else if (syncInput && inputEl && options.forceInput) {
                inputEl.value = fmt.hex8;
            }
            if (hintEl) hintEl.textContent = '';

            const curKey = fmt.hex8.toUpperCase();
            renderSwatchRow('colorRamp', C.tintShadeRamp(color, 9), curKey);
            const har = C.harmonies(color);
            renderSwatchRow('colorHarmonyComp', har.complementary, curKey);
            renderSwatchRow('colorHarmonyAnalog', har.analogous, curKey);
            renderSwatchRow('colorHarmonyTriad', har.triadic, curKey);
            updateContrast(color);

            if (options.recordHistory !== false) pushHistory(color);
        }

        function applyFromText(text, recordHistory) {
            const parsed = C.parse(text);
            if (!parsed) {
                if (hintEl) hintEl.textContent = text.trim() ? '无法解析该颜色' : '';
                return false;
            }
            applyColor(parsed, {
                syncInput: false,
                recordHistory: recordHistory !== false
            });
            return true;
        }

        const debouncedInput = debounce(() => {
            applyFromText(inputEl?.value || '', true);
        }, 120);

        inputEl?.addEventListener('input', debouncedInput);
        inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') applyFromText(inputEl.value, true);
        });

        pickerEl?.addEventListener('input', () => {
            const parsed = C.parse(pickerEl.value);
            if (!parsed) return;
            // Preserve alpha from current color when using opaque native picker
            parsed.a = current.a;
            applyColor(parsed, { forceInput: true });
        });

        previewEl?.addEventListener('click', () => {
            const v = document.getElementById('colorHex8')?.value || '';
            if (!v) return;
            navigator.clipboard.writeText(v).then(() => toast('已复制 HEX8')).catch(() => toast('复制失败'));
        });

        document.querySelectorAll('#toolPanelColor .color-copy-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-copy');
                const el = id ? document.getElementById(id) : null;
                const v = el?.value || '';
                if (!v) { toast('无可复制内容'); return; }
                navigator.clipboard.writeText(v).then(() => toast('已复制')).catch(() => toast('复制失败'));
            });
        });

        function onSwatchClick(e) {
            const btn = e.target.closest('.color-swatch');
            if (!btn) return;
            const hex = btn.getAttribute('data-color');
            const parsed = C.parse(hex || '');
            if (!parsed) return;
            applyColor(parsed, { forceInput: true });
        }

        ['colorRamp', 'colorHarmonyComp', 'colorHarmonyAnalog', 'colorHarmonyTriad', 'colorHistory'].forEach((id) => {
            document.getElementById(id)?.addEventListener('click', onSwatchClick);
        });

        chipUpper?.addEventListener('click', () => {
            setChip(chipUpper, !chipOn(chipUpper));
            applyColor(current, { syncInput: false, recordHistory: false });
            debouncedPersistOptions();
        });
        chipModern?.addEventListener('click', () => {
            setChip(chipModern, !chipOn(chipModern));
            applyColor(current, { syncInput: false, recordHistory: false });
            debouncedPersistOptions();
        });

        contrastBgInput?.addEventListener('input', debounce(() => {
            updateContrast(current);
        }, 120));

        // EyeDropper (Chrome)
        if (!window.EyeDropper) {
            eyeBtn?.classList.add('hidden');
        } else {
            eyeBtn?.addEventListener('click', async () => {
                try {
                    const dropper = new window.EyeDropper();
                    const result = await dropper.open();
                    const parsed = C.parse(result.sRGBHex);
                    if (parsed) applyColor(parsed, { forceInput: true });
                } catch (err) {
                    if (err && err.name !== 'AbortError') toast('取色失败');
                }
            });
        }

        function closeImagePick() {
            imageArea?.classList.add('hidden');
            if (imageObjectUrl) {
                URL.revokeObjectURL(imageObjectUrl);
                imageObjectUrl = '';
            }
            if (imageFile) imageFile.value = '';
        }

        imageBtn?.addEventListener('click', () => imageFile?.click());
        imageClose?.addEventListener('click', closeImagePick);

        imageFile?.addEventListener('change', async () => {
            const file = imageFile.files && imageFile.files[0];
            if (!file || !imageCanvas) return;
            if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
            imageObjectUrl = URL.createObjectURL(file);
            try {
                const bmp = await createImageBitmap(file);
                const maxW = 640;
                const scale = Math.min(1, maxW / bmp.width);
                const w = Math.max(1, Math.round(bmp.width * scale));
                const h = Math.max(1, Math.round(bmp.height * scale));
                imageCanvas.width = w;
                imageCanvas.height = h;
                const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                ctx.clearRect(0, 0, w, h);
                ctx.drawImage(bmp, 0, 0, w, h);
                bmp.close?.();
                imageArea?.classList.remove('hidden');
            } catch (_) {
                toast('无法读取图片');
                closeImagePick();
            }
        });

        imageCanvas?.addEventListener('click', (e) => {
            const rect = imageCanvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) * (imageCanvas.width / rect.width));
            const y = Math.floor((e.clientY - rect.top) * (imageCanvas.height / rect.height));
            const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            const data = ctx.getImageData(clamp(x, 0, imageCanvas.width - 1), clamp(y, 0, imageCanvas.height - 1), 1, 1).data;
            applyColor(C.rgba(data[0], data[1], data[2], data[3] / 255), { forceInput: true });
        });

        function clamp(n, min, max) {
            return Math.min(max, Math.max(min, n));
        }

        clearHistoryBtn?.addEventListener('click', () => {
            history = [];
            renderHistory();
            persistHistory();
            toast('已清空历史');
        });

        (async () => {
            skipHistory = true;
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const opts = await Settings.get('colorOptions');
                    if (opts && typeof opts === 'object') {
                        setChip(chipUpper, opts.uppercase !== false);
                        setChip(chipModern, !!opts.modernSyntax);
                    }
                    const saved = await Settings.get('colorHistory');
                    if (Array.isArray(saved)) {
                        history = saved.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX);
                    }
                }
            } catch (_) { /* ignore */ }
            renderHistory();
            applyColor(current, { forceInput: true, recordHistory: false });
            skipHistory = false;
        })();
    }

    // ==================== Cron Expression Parser ====================
    function initCron() {
        let currentMode = 'expr';
        let lastRunsText = '';
        let syncingFromBuilder = false;
        let lastParsed = null;
        let parseRaf = 0;
        let parseToken = 0;

        const FIELD_META_5 = [
            { key: 'minute', label: '分', min: 0, max: 59 },
            { key: 'hour', label: '时', min: 0, max: 23 },
            { key: 'dom', label: '日', min: 1, max: 31 },
            { key: 'month', label: '月', min: 1, max: 12 },
            { key: 'dow', label: '周', min: 0, max: 7 }
        ];
        const FIELD_META_6 = [
            { key: 'second', label: '秒', min: 0, max: 59 },
            ...FIELD_META_5
        ];

        function toast(msg) {
            if (DevKit.App && typeof DevKit.App.showToast === 'function') {
                DevKit.App.showToast(msg);
            }
        }

        function withSeconds() {
            return !!document.getElementById('cronWithSeconds')?.checked;
        }

        function nextCount() {
            const v = parseInt(document.getElementById('cronNextCount')?.value, 10);
            return [5, 10, 20].includes(v) ? v : 10;
        }

        function getExpr() {
            return (document.getElementById('cronInput')?.value || '').trim();
        }

        function setExpr(expr, { fromBuilder = false } = {}) {
            const input = document.getElementById('cronInput');
            if (!input) return;
            if (fromBuilder) syncingFromBuilder = true;
            input.value = expr;
            if (fromBuilder) {
                setTimeout(() => { syncingFromBuilder = false; }, 0);
            }
        }

        function escapeCronText(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        // Paint checkbox/select first, then run parse on next frame.
        function scheduleParse(expr) {
            const target = expr != null ? expr : getExpr();
            const token = ++parseToken;
            if (parseRaf) cancelAnimationFrame(parseRaf);
            parseRaf = requestAnimationFrame(() => {
                parseRaf = 0;
                if (token !== parseToken) return;
                parseCron(target);
            });
        }

        function syncModeUI() {
            document.getElementById('cronModeExpr')?.classList.toggle('active', currentMode === 'expr');
            document.getElementById('cronModeBuilder')?.classList.toggle('active', currentMode === 'builder');
            document.getElementById('cronExprPanel')?.classList.toggle('hidden', currentMode !== 'expr');
            document.getElementById('cronBuilderPanel')?.classList.toggle('hidden', currentMode !== 'builder');
        }

        function updateTzNote() {
            const el = document.getElementById('cronTzNote');
            if (!el) return;
            let name = '本地时间';
            try {
                name = Intl.DateTimeFormat().resolvedOptions().timeZone || name;
            } catch (_) { /* ignore */ }
            el.textContent = `时区：${name}`;
        }

        function validateFieldToken(token, meta) {
            if (!token) return false;
            if (token === '*' || token === '?') return true;
            const parts = token.split(',');
            return parts.every((part) => {
                const p = part.trim();
                if (!p) return false;
                let range = p;
                let step = null;
                if (p.includes('/')) {
                    const [left, right] = p.split('/');
                    range = left;
                    step = Number(right);
                    if (!Number.isFinite(step) || step <= 0) return false;
                }
                if (range === '*') return true;
                if (range.includes('-')) {
                    const [lo, hi] = range.split('-').map(Number);
                    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
                    if (lo > hi) return false;
                    if (lo < meta.min || hi > meta.max) return false;
                    return true;
                }
                const n = Number(range);
                if (!Number.isFinite(n)) return false;
                // dow allows 0-7
                return n >= meta.min && n <= meta.max;
            });
        }

        function parseExpression(expr) {
            if (!expr) {
                return { ok: false, error: '请输入 Cron 表达式' };
            }
            const parts = expr.split(/\s+/).filter(Boolean);
            const want6 = withSeconds();
            let second = '0';
            let minute, hour, dom, month, dow;

            if (want6) {
                if (parts.length === 6) {
                    [second, minute, hour, dom, month, dow] = parts;
                } else if (parts.length === 5) {
                    // allow pasting 5-field while toggle on: treat seconds as 0
                    [minute, hour, dom, month, dow] = parts;
                    second = '0';
                } else if (parts.length === 7) {
                    [second, minute, hour, dom, month, dow] = parts;
                } else {
                    return { ok: false, error: '含秒模式需要 5~6 个字段（分 时 日 月 周，或 秒 分 时 日 月 周）' };
                }
            } else if (parts.length === 5) {
                [minute, hour, dom, month, dow] = parts;
            } else if (parts.length === 6) {
                [second, minute, hour, dom, month, dow] = parts;
            } else if (parts.length === 7) {
                [second, minute, hour, dom, month, dow] = parts;
            } else {
                return { ok: false, error: '无效表达式：标准 Cron 需要 5 个字段（分 时 日 月 周）' };
            }

            const fields = want6 || parts.length >= 6
                ? [
                    { ...FIELD_META_6[0], value: second },
                    { ...FIELD_META_5[0], value: minute },
                    { ...FIELD_META_5[1], value: hour },
                    { ...FIELD_META_5[2], value: dom },
                    { ...FIELD_META_5[3], value: month },
                    { ...FIELD_META_5[4], value: dow }
                ]
                : [
                    { ...FIELD_META_5[0], value: minute },
                    { ...FIELD_META_5[1], value: hour },
                    { ...FIELD_META_5[2], value: dom },
                    { ...FIELD_META_5[3], value: month },
                    { ...FIELD_META_5[4], value: dow }
                ];

            const invalid = fields.filter((f) => !validateFieldToken(f.value, f));
            if (invalid.length) {
                return {
                    ok: false,
                    error: `字段无效：${invalid.map((f) => f.label).join('、')}`,
                    fields
                };
            }

            return {
                ok: true,
                fields,
                second,
                minute,
                hour,
                dom,
                month,
                dow,
                useSeconds: want6 || parts.length >= 6
            };
        }

        function describeField(value, unit, mapFn) {
            if (value === '*' || value === '?') return null;
            if (value.includes('/')) {
                const [left, step] = value.split('/');
                if (left === '*' || left === '0') return `每${step}${unit}`;
                if (left.includes('-')) {
                    const [lo, hi] = left.split('-');
                    const a = mapFn ? mapFn(lo) : lo;
                    const b = mapFn ? mapFn(hi) : hi;
                    return `${a}–${b}${unit}每隔${step}`;
                }
                const base = mapFn ? mapFn(left) : left;
                return `从${base}${unit}起每隔${step}`;
            }
            if (value.includes(',')) {
                const items = value.split(',').map((v) => (mapFn ? mapFn(v.trim()) : v.trim()));
                return `${items.join('、')}${unit}`;
            }
            if (value.includes('-')) {
                const [lo, hi] = value.split('-');
                const a = mapFn ? mapFn(lo) : lo;
                const b = mapFn ? mapFn(hi) : hi;
                return `${a}–${b}${unit}`;
            }
            return `${mapFn ? mapFn(value) : value}${unit}`;
        }

        function describeCron(minute, hour, dom, month, dow, second, useSeconds) {
            const dowMap = { 0: '日', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };
            const mapDow = (d) => dowMap[String(d)] != null ? dowMap[String(d)] : d;
            const chunks = [];

            if (useSeconds && second && second !== '0' && second !== '*') {
                const s = describeField(second, '秒');
                if (s) chunks.push(s);
            }

            const dowPart = describeField(dow, '', mapDow);
            if (dowPart) chunks.push(`周${dowPart}`);

            const monPart = describeField(month, '月');
            if (monPart) chunks.push(monPart);

            const domPart = describeField(dom, '号');
            if (domPart) chunks.push(domPart);

            const hourPart = describeField(hour, '时');
            if (hourPart) chunks.push(hourPart);
            else if (hour === '*') chunks.push('每小时');

            const minPart = describeField(minute, '分');
            if (minPart) chunks.push(minPart);
            else if (minute === '*') chunks.push('每分钟');

            if (!chunks.length) return '每分钟执行一次';
            return '执行时间：' + chunks.join('，');
        }

        function matchesCronField(value, field) {
            if (field === '*' || field === '?') return true;
            if (field.includes(',')) {
                return field.split(',').some((v) => matchesCronField(value, v.trim()));
            }
            let rangePart = field;
            let step = 1;
            if (field.includes('/')) {
                const [left, right] = field.split('/');
                rangePart = left;
                step = Number(right);
                if (!Number.isFinite(step) || step <= 0) return false;
            }
            if (rangePart === '*') {
                return value % step === 0;
            }
            if (rangePart.includes('-')) {
                const [lo, hi] = rangePart.split('-').map(Number);
                if (!Number.isFinite(lo) || !Number.isFinite(hi)) return false;
                if (value < lo || value > hi) return false;
                return (value - lo) % step === 0;
            }
            const base = Number(rangePart);
            if (!Number.isFinite(base)) return false;
            if (step === 1) return value === base;
            return value >= base && (value - base) % step === 0;
        }

        function matchesCronDow(value, field) {
            if (field === '*' || field === '?') return true;
            const norm = field.replace(/\b7\b/g, '0');
            return matchesCronField(value, norm);
        }

        // Expand a cron field into sorted unique integers (no per-tick scanning).
        function expandCronField(field, min, max, { isDow = false } = {}) {
            const values = new Set();
            const add = (n) => {
                if (!Number.isFinite(n)) return;
                if (isDow && n === 7) n = 0;
                if (n < min || n > max) return;
                if (isDow && n > 6) return;
                values.add(n);
            };

            const pushRange = (lo, hi, step) => {
                if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(step) || step <= 0) return;
                if (lo > hi) return;
                for (let v = lo; v <= hi; v += step) add(v);
            };

            const parts = String(field || '*').split(',');
            for (const raw of parts) {
                let token = raw.trim();
                if (!token) continue;
                let step = 1;
                if (token.includes('/')) {
                    const [left, right] = token.split('/');
                    token = left;
                    step = Number(right);
                    if (!Number.isFinite(step) || step <= 0) continue;
                }
                if (token === '*' || token === '?') {
                    pushRange(min, isDow ? 6 : max, step);
                    continue;
                }
                if (token.includes('-')) {
                    const [lo, hi] = token.split('-').map(Number);
                    pushRange(lo, hi, step);
                    continue;
                }
                const base = Number(token);
                if (!Number.isFinite(base)) continue;
                if (step === 1) {
                    add(base);
                } else {
                    pushRange(base, isDow ? 6 : max, step);
                }
            }
            return Array.from(values).sort((a, b) => a - b);
        }

        function dayMatchesDate(date, domField, dowField) {
            const okDom = matchesCronField(date.getDate(), domField);
            const okDow = matchesCronDow(date.getDay(), dowField);
            if (domField !== '*' && domField !== '?' && dowField !== '*' && dowField !== '?') {
                return okDom || okDow;
            }
            return okDom && okDow;
        }

        function lowerBound(arr, value) {
            let lo = 0;
            let hi = arr.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (arr[mid] < value) lo = mid + 1;
                else hi = mid;
            }
            return lo;
        }

        function getNextCronRuns(fields, count, useSeconds) {
            const map = Object.fromEntries(fields.map((f) => [f.key, f.value]));
            const seconds = useSeconds ? expandCronField(map.second || '0', 0, 59) : [0];
            const minutes = expandCronField(map.minute, 0, 59);
            const hours = expandCronField(map.hour, 0, 23);
            const months = new Set(expandCronField(map.month, 1, 12));

            if (!seconds.length || !minutes.length || !hours.length || !months.size) {
                return [];
            }

            const now = new Date();
            const runs = [];
            // Start strictly after "now" at the configured granularity.
            const start = new Date(now.getTime());
            start.setMilliseconds(0);
            if (useSeconds) {
                start.setSeconds(start.getSeconds() + 1);
            } else {
                start.setSeconds(0, 0);
                start.setMinutes(start.getMinutes() + 1);
            }

            const startH = start.getHours();
            const startM = start.getMinutes();
            const startS = start.getSeconds();

            // Walk calendar days; for each valid day jump into allowed h/m/s via lowerBound.
            const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const maxDays = 400;
            for (let d = 0; d < maxDays && runs.length < count; d++) {
                const y = day.getFullYear();
                const monthIdx = day.getMonth();
                const m = monthIdx + 1;
                const dateNum = day.getDate();
                if (months.has(m) && dayMatchesDate(day, map.dom, map.dow)) {
                    const sameDay = d === 0;
                    let hi = sameDay ? lowerBound(hours, startH) : 0;
                    for (; hi < hours.length && runs.length < count; hi++) {
                        const hour = hours[hi];
                        let mi = (sameDay && hour === startH) ? lowerBound(minutes, startM) : 0;
                        for (; mi < minutes.length && runs.length < count; mi++) {
                            const minute = minutes[mi];
                            let si = (sameDay && hour === startH && minute === startM)
                                ? lowerBound(seconds, startS)
                                : 0;
                            for (; si < seconds.length && runs.length < count; si++) {
                                runs.push(new Date(y, monthIdx, dateNum, hour, minute, seconds[si], 0));
                            }
                        }
                    }
                }
                day.setDate(day.getDate() + 1);
            }
            return runs;
        }

        function renderFields(fields, invalidKeys = []) {
            const wrap = document.getElementById('cronFields');
            if (!wrap) return;
            if (!fields || !fields.length) {
                wrap.innerHTML = '';
                return;
            }
            wrap.innerHTML = fields.map((f) => {
                const bad = invalidKeys.includes(f.key) || invalidKeys.includes(f.label);
                return `<div class="cron-field-pill${bad ? ' is-invalid' : ''}"><span class="cron-field-name">${f.label}</span><span class="cron-field-value">${escapeCronText(f.value)}</span></div>`;
            }).join('');
        }

        function renderNextRuns(runs, error) {
            const list = document.getElementById('cronNextList');
            if (!list) return;
            if (error) {
                lastRunsText = '';
                list.innerHTML = `<div class="cron-placeholder is-error">${escapeCronText(error)}</div>`;
                return;
            }
            if (!runs || !runs.length) {
                lastRunsText = '';
                list.innerHTML = '<div class="cron-placeholder">一年内没有匹配到执行时间</div>';
                return;
            }
            const lines = new Array(runs.length);
            const rows = new Array(runs.length);
            for (let i = 0; i < runs.length; i++) {
                const text = formatDate(runs[i]);
                lines[i] = `${i + 1}. ${text}`;
                rows[i] = `<div class="cron-next-row"><span class="cron-next-index">${i + 1}</span><span class="cron-next-time">${text}</span></div>`;
            }
            lastRunsText = lines.join('\n');
            list.innerHTML = rows.join('');
        }

        function refreshNextRunsOnly() {
            if (!lastParsed || !lastParsed.ok) {
                scheduleParse();
                return;
            }
            try {
                renderNextRuns(getNextCronRuns(lastParsed.fields, nextCount(), lastParsed.useSeconds));
            } catch (e) {
                renderNextRuns([], '无法计算执行时间: ' + e.message);
            }
            debouncedPersist();
        }

        function parseCron(expr) {
            const descEl = document.getElementById('cronDescText');
            const parsed = parseExpression(expr);

            if (!parsed.ok) {
                lastParsed = null;
                if (descEl) {
                    descEl.textContent = parsed.error;
                    descEl.classList.add('is-error');
                }
                renderFields(parsed.fields || [], (parsed.fields || []).filter((f) => !validateFieldToken(f.value, f)).map((f) => f.key));
                renderNextRuns([], parsed.error);
                return;
            }

            lastParsed = parsed;
            if (descEl) {
                descEl.classList.remove('is-error');
                descEl.textContent = describeCron(
                    parsed.minute, parsed.hour, parsed.dom, parsed.month, parsed.dow,
                    parsed.second, parsed.useSeconds
                );
            }
            renderFields(parsed.fields);

            try {
                renderNextRuns(getNextCronRuns(parsed.fields, nextCount(), parsed.useSeconds));
            } catch (e) {
                renderNextRuns([], '无法计算执行时间: ' + e.message);
            }

            debouncedPersist();
        }

        const debouncedParse = debounce(() => scheduleParse(), 100);
        const debouncedPersist = debounce(() => { persistOptions(); }, 600);

        function buildFromVisualizer() {
            const minute = document.getElementById('cronBuildMinute')?.value || '*';
            const hour = document.getElementById('cronBuildHour')?.value || '*';
            const dom = document.getElementById('cronBuildDom')?.value || '*';
            const month = document.getElementById('cronBuildMonth')?.value || '*';
            const dow = document.getElementById('cronBuildDow')?.value || '*';
            const expr = withSeconds()
                ? `0 ${minute} ${hour} ${dom} ${month} ${dow}`
                : `${minute} ${hour} ${dom} ${month} ${dow}`;
            setExpr(expr, { fromBuilder: true });
            scheduleParse(expr);
        }

        function applyExprToBuilder(expr) {
            const parsed = parseExpression(expr);
            if (!parsed.ok) return;
            const setVal = (id, v) => {
                const el = document.getElementById(id);
                if (!el) return;
                const opt = Array.from(el.options).find((o) => o.value === v);
                if (opt) el.value = v;
            };
            setVal('cronBuildMinute', parsed.minute);
            setVal('cronBuildHour', parsed.hour);
            setVal('cronBuildDom', parsed.dom);
            setVal('cronBuildMonth', parsed.month);
            setVal('cronBuildDow', parsed.dow);
        }

        async function persistOptions() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('cronOptions', {
                mode: currentMode,
                expression: getExpr(),
                withSeconds: withSeconds(),
                nextCount: nextCount()
            });
        }

        function setActivePreset(expr) {
            document.querySelectorAll('.cron-preset').forEach((btn) => {
                btn.classList.toggle('is-active', (btn.dataset.cron || '') === expr);
            });
        }

        function normalizeExprForSecondsToggle() {
            const expr = getExpr();
            const parts = expr.split(/\s+/).filter(Boolean);
            const input = document.getElementById('cronInput');
            if (withSeconds()) {
                if (input) input.placeholder = '秒 分 时 日 月 周 ，如 0 */5 * * * *';
                if (parts.length === 5) {
                    setExpr(`0 ${expr}`);
                    return getExpr();
                }
            } else {
                if (input) input.placeholder = '分 时 日 月 周 ，如 0 9 * * 1-5';
                if (parts.length === 6) {
                    setExpr(parts.slice(1).join(' '));
                    return getExpr();
                }
                if (parts.length === 7) {
                    setExpr(parts.slice(1, 6).join(' '));
                    return getExpr();
                }
            }
            return expr;
        }

        // Mode switch
        document.getElementById('cronModeExpr')?.addEventListener('click', () => {
            currentMode = 'expr';
            syncModeUI();
            debouncedPersist();
        });
        document.getElementById('cronModeBuilder')?.addEventListener('click', () => {
            currentMode = 'builder';
            applyExprToBuilder(getExpr());
            syncModeUI();
            debouncedPersist();
        });

        document.getElementById('cronParseBtn')?.addEventListener('click', () => scheduleParse());
        document.getElementById('cronInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') scheduleParse(e.target.value);
        });
        document.getElementById('cronInput')?.addEventListener('input', () => {
            if (!syncingFromBuilder) debouncedParse();
        });

        document.getElementById('cronWithSeconds')?.addEventListener('change', () => {
            const expr = normalizeExprForSecondsToggle();
            const parts = expr.split(/\s+/).filter(Boolean);
            setActivePreset(parts.length === 6 ? parts.slice(1).join(' ') : expr);
            scheduleParse(expr);
        });
        document.getElementById('cronNextCount')?.addEventListener('change', () => {
            // Count-only change: skip full re-parse / field rebuild.
            requestAnimationFrame(() => refreshNextRunsOnly());
        });

        document.querySelectorAll('.cron-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                let expr = btn.dataset.cron || '';
                if (withSeconds()) {
                    const parts = expr.split(/\s+/).filter(Boolean);
                    if (parts.length === 5) expr = `0 ${expr}`;
                }
                currentMode = 'expr';
                syncModeUI();
                setExpr(expr);
                setActivePreset(btn.dataset.cron || '');
                scheduleParse(expr);
            });
        });

        ['cronBuildMinute', 'cronBuildHour', 'cronBuildDom', 'cronBuildMonth', 'cronBuildDow'].forEach((id) => {
            document.getElementById(id)?.addEventListener('change', buildFromVisualizer);
        });

        document.getElementById('cronCopyExprBtn')?.addEventListener('click', () => {
            const expr = getExpr();
            if (!expr) { toast('没有可复制的表达式'); return; }
            navigator.clipboard.writeText(expr).then(() => toast('已复制表达式')).catch(() => toast('复制失败'));
        });
        document.getElementById('cronCopyNextBtn')?.addEventListener('click', () => {
            if (!lastRunsText) { toast('还没有执行列表'); return; }
            navigator.clipboard.writeText(lastRunsText).then(() => toast('已复制执行列表')).catch(() => toast('复制失败'));
        });

        updateTzNote();
        syncModeUI();

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('cronOptions');
                    if (saved && typeof saved === 'object') {
                        currentMode = saved.mode === 'builder' ? 'builder' : 'expr';
                        if (document.getElementById('cronWithSeconds')) {
                            document.getElementById('cronWithSeconds').checked = !!saved.withSeconds;
                        }
                        if (document.getElementById('cronNextCount') && [5, 10, 20].includes(Number(saved.nextCount))) {
                            document.getElementById('cronNextCount').value = String(saved.nextCount);
                        }
                        if (saved.expression) setExpr(saved.expression);
                        syncModeUI();
                        if (currentMode === 'builder') applyExprToBuilder(getExpr());
                    }
                }
            } catch (_) { /* ignore */ }
            if (!getExpr()) setExpr('0 9 * * 1-5');
            const boot = getExpr();
            const parts = boot.split(/\s+/).filter(Boolean);
            setActivePreset(parts.length === 6 ? parts.slice(1).join(' ') : boot);
            scheduleParse(boot);
        })();
    }

    // ==================== Code Diff (CodeMirror side-by-side) ====================
    let diffHunks = [];
    let diffHunkIdx = -1;
    let codeDiffEditors = null;
    let codeDiffUpdating = false;
    let codeDiffLang = 'auto';
    let codeDiffDetected = 'plain';
    let runCodeDiffDebounced = null;

    function codeDiffSyncScrollOn() {
        return document.getElementById('codeDiffSyncScroll')?.classList.contains('is-on');
    }

    function resolveCodeDiffTheme() {
        const ref = editorManager.get('jsonCompareA') || editorManager.get('inputArea');
        return ref?.getOption('theme') || editorManager.commonOptions.theme;
    }

    // CodeMirror cannot measure inside a display:none panel, so editors are created on first show.
    function ensureCodeDiffEditors() {
        if (codeDiffEditors) return codeDiffEditors;
        if (typeof editorManager === 'undefined' || typeof CodeMirror === 'undefined') return null;

        const opts = {
            theme: resolveCodeDiffTheme(),
            lineWrapping: false,
            foldGutter: false,
            gutters: ['CodeMirror-linenumbers']
        };
        const a = editorManager.initFromTextArea('codeDiffA', null, opts);
        const b = editorManager.initFromTextArea('codeDiffB', null, opts);
        if (!a || !b) return null;
        codeDiffEditors = { a, b };

        const onChange = () => {
            if (!codeDiffUpdating) runCodeDiffDebounced?.();
        };
        a.on('change', onChange);
        b.on('change', onChange);

        if (typeof CmDiff !== 'undefined') {
            CmDiff.linkScrollPair(a, b, null, null, { isEnabled: codeDiffSyncScrollOn });
        }

        applyCodeDiffMode();
        runCodeDiff();
        return codeDiffEditors;
    }

    function setCodeDiffValues(valueA, valueB) {
        const eds = ensureCodeDiffEditors();
        if (!eds) return;
        codeDiffUpdating = true;
        eds.a.setValue(valueA);
        eds.b.setValue(valueB);
        codeDiffUpdating = false;
        runCodeDiff();
    }

    function setEditorMode(editor, mode) {
        // Performance mode parks the real mode in _savedMode; update that instead.
        if (editor._savedMode !== undefined && editor._savedMode !== null) {
            editor._savedMode = mode;
        } else if (editor.getOption('mode') !== mode) {
            editor.setOption('mode', mode);
        }
    }

    function applyCodeDiffMode() {
        if (!codeDiffEditors || typeof CodeLang === 'undefined') return;
        const lang = codeDiffLang === 'auto' ? codeDiffDetected : codeDiffLang;
        const mode = CodeLang.getMode(lang);
        setEditorMode(codeDiffEditors.a, mode);
        setEditorMode(codeDiffEditors.b, mode);

        const detectedEl = document.getElementById('codeDiffLangDetected');
        if (detectedEl) {
            const hasText = codeDiffEditors.a.getValue() || codeDiffEditors.b.getValue();
            detectedEl.textContent = codeDiffLang === 'auto' && hasText ? `识别为 ${CodeLang.getLabel(codeDiffDetected)}` : '';
        }
    }

    function initCodeDiff() {
        const panel = document.getElementById('toolPanelCodeDiff');
        const langSelect = document.getElementById('codeDiffLang');

        function toast(msg) {
            if (DevKit.App && typeof DevKit.App.showToast === 'function') {
                DevKit.App.showToast(msg);
            }
        }

        function chipOn(id) {
            return document.getElementById(id)?.classList.contains('is-on');
        }

        function setChip(id, on) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.toggle('is-on', !!on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }

        function getValues() {
            const eds = ensureCodeDiffEditors();
            return eds ? { a: eds.a.getValue(), b: eds.b.getValue() } : { a: '', b: '' };
        }

        async function persist() {
            if (typeof Settings === 'undefined' || !Settings.set) return;
            await Settings.set('codeDiffOptions', {
                ignoreWhitespace: chipOn('codeDiffIgnoreWhitespace'),
                ignoreCase: chipOn('codeDiffIgnoreCase'),
                syncScroll: chipOn('codeDiffSyncScroll'),
                lang: codeDiffLang
            });
        }
        const debouncedPersist = debounce(() => { persist(); }, 400);

        runCodeDiffDebounced = debounce(runCodeDiff, 220);

        if (langSelect && typeof CodeLang !== 'undefined') {
            Object.keys(CodeLang.LANGS).forEach((id) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = CodeLang.LANGS[id].label;
                langSelect.appendChild(opt);
            });
            langSelect.addEventListener('change', () => {
                codeDiffLang = langSelect.value;
                applyCodeDiffMode();
                debouncedPersist();
            });
        }

        ['codeDiffIgnoreWhitespace', 'codeDiffIgnoreCase', 'codeDiffSyncScroll'].forEach((id) => {
            document.getElementById(id)?.addEventListener('click', () => {
                setChip(id, !chipOn(id));
                if (id !== 'codeDiffSyncScroll') runCodeDiff();
                debouncedPersist();
            });
        });

        document.getElementById('codeDiffSwapBtn')?.addEventListener('click', () => {
            const { a, b } = getValues();
            setCodeDiffValues(b, a);
        });

        document.getElementById('codeDiffCopyABtn')?.addEventListener('click', () => {
            const v = getValues().a;
            if (!v) { toast('A 侧为空'); return; }
            navigator.clipboard.writeText(v).then(() => toast('已复制 A')).catch(() => toast('复制失败'));
        });
        document.getElementById('codeDiffCopyBBtn')?.addEventListener('click', () => {
            const v = getValues().b;
            if (!v) { toast('B 侧为空'); return; }
            navigator.clipboard.writeText(v).then(() => toast('已复制 B')).catch(() => toast('复制失败'));
        });

        document.getElementById('codeDiffClearBtn')?.addEventListener('click', () => {
            setCodeDiffValues('', '');
        });

        document.getElementById('codeDiffPrevBtn')?.addEventListener('click', () => navigateDiff(-1));
        document.getElementById('codeDiffNextBtn')?.addEventListener('click', () => navigateDiff(1));

        panel?.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
                if (!(e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                navigateDiff(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                navigateDiff(1);
            }
        });

        const fsBtn = document.getElementById('codeDiffFullscreenBtn');
        if (fsBtn && panel) {
            fsBtn.addEventListener('click', () => {
                if (document.fullscreenElement) document.exitFullscreen();
                else panel.requestFullscreen();
            });
            document.addEventListener('fullscreenchange', () => {
                const isFs = document.fullscreenElement === panel;
                const expand = fsBtn.querySelector('.cdiff-icon-expand');
                const collapse = fsBtn.querySelector('.cdiff-icon-collapse');
                if (expand) expand.style.display = isFs ? 'none' : '';
                if (collapse) collapse.style.display = isFs ? '' : 'none';
                if (codeDiffEditors) {
                    codeDiffEditors.a.refresh();
                    codeDiffEditors.b.refresh();
                }
            });
        }

        (async () => {
            try {
                if (typeof Settings !== 'undefined' && Settings.get) {
                    const saved = await Settings.get('codeDiffOptions');
                    if (saved && typeof saved === 'object') {
                        setChip('codeDiffIgnoreWhitespace', !!saved.ignoreWhitespace);
                        setChip('codeDiffIgnoreCase', !!saved.ignoreCase);
                        setChip('codeDiffSyncScroll', saved.syncScroll !== false);
                        if (saved.lang && (saved.lang === 'auto' || CodeLang?.LANGS?.[saved.lang])) {
                            codeDiffLang = saved.lang;
                        }
                    }
                }
            } catch (_) { /* ignore */ }
            if (langSelect) langSelect.value = codeDiffLang;
            applyCodeDiffMode();
            runCodeDiff();
        })();
    }

    function onCodeDiffShown() {
        const eds = ensureCodeDiffEditors();
        if (!eds) return;
        setTimeout(() => {
            eds.a.refresh();
            eds.b.refresh();
        }, 0);
    }

    function navigateDiff(direction) {
        if (diffHunks.length === 0 || !codeDiffEditors) return;
        diffHunkIdx += direction;
        if (diffHunkIdx < 0) diffHunkIdx = diffHunks.length - 1;
        if (diffHunkIdx >= diffHunks.length) diffHunkIdx = 0;
        updateNavPos();

        const hunk = diffHunks[diffHunkIdx];
        const editor = hunk.side === 'a' ? codeDiffEditors.a : codeDiffEditors.b;
        if (typeof CmDiff === 'undefined') return;
        CmDiff.scrollEditorToLine(editor, hunk.line);
        CmDiff.flashLine(editor, hunk.line);
    }

    function updateNavPos() {
        const posEl = document.getElementById('codeDiffNavPos');
        if (posEl) {
            posEl.textContent = diffHunks.length > 0 ? `${diffHunkIdx + 1}/${diffHunks.length}` : '';
        }
    }

    function resetCodeDiffResult() {
        if (codeDiffEditors && typeof CmDiff !== 'undefined') {
            CmDiff.clearEditor(codeDiffEditors.a);
            CmDiff.clearEditor(codeDiffEditors.b);
        }
        const statsEl = document.getElementById('codeDiffStats');
        if (statsEl) statsEl.textContent = '';
        const note = document.getElementById('codeDiffTruncateNote');
        if (note) {
            note.textContent = '';
            note.classList.add('hidden');
        }
        diffHunks = [];
        diffHunkIdx = -1;
        updateNavPos();
    }

    function runCodeDiff() {
        if (!codeDiffEditors) return;
        const { a: editorA, b: editorB } = codeDiffEditors;
        const aStr = editorA.getValue();
        const bStr = editorB.getValue();

        const rawA = aStr ? aStr.split('\n') : [];
        const rawB = bStr ? bStr.split('\n') : [];
        const metaA = document.getElementById('codeDiffMetaA');
        const metaB = document.getElementById('codeDiffMetaB');
        if (metaA) metaA.textContent = `${rawA.length} 行`;
        if (metaB) metaB.textContent = `${rawB.length} 行`;

        if (typeof CodeLang !== 'undefined') {
            codeDiffDetected = CodeLang.detect(`${aStr}\n${bStr}`);
        }

        if (typeof DiffLines === 'undefined' || typeof CmDiff === 'undefined') return;

        const tooLarge = rawA.length > DiffLines.MAX_LINES || rawB.length > DiffLines.MAX_LINES;
        editorManager.setPerformanceMode('codeDiffA', tooLarge);
        editorManager.setPerformanceMode('codeDiffB', tooLarge);
        applyCodeDiffMode();

        if (!aStr && !bStr) {
            resetCodeDiffResult();
            return;
        }

        const ignoreWs = document.getElementById('codeDiffIgnoreWhitespace')?.classList.contains('is-on');
        const ignoreCase = document.getElementById('codeDiffIgnoreCase')?.classList.contains('is-on');

        const truncA = DiffLines.truncateLines(rawA, DiffLines.MAX_LINES);
        const truncB = DiffLines.truncateLines(rawB, DiffLines.MAX_LINES);

        const note = document.getElementById('codeDiffTruncateNote');
        if (note) {
            if (truncA.truncated || truncB.truncated) {
                note.textContent = `文本过大，已截断对比并关闭语法高亮（每侧最多 ${DiffLines.MAX_LINES} 行；A ${truncA.originalCount} 行 / B ${truncB.originalCount} 行）`;
                note.classList.remove('hidden');
            } else {
                note.textContent = '';
                note.classList.add('hidden');
            }
        }

        const lineDiff = DiffLines.computeLineDiff(truncA.lines, truncB.lines, {
            ignoreWhitespace: ignoreWs,
            ignoreCase
        });

        CmDiff.applyLineStatus(editorA, lineDiff.statusA);
        CmDiff.applyLineStatus(editorB, lineDiff.statusB);
        CmDiff.applyWordMarks(editorA, lineDiff.wordsA);
        CmDiff.applyWordMarks(editorB, lineDiff.wordsB);

        diffHunks = DiffLines.mergeHunks(
            DiffLines.buildHunks(lineDiff.statusA, 'a'),
            DiffLines.buildHunks(lineDiff.statusB, 'b')
        );
        diffHunkIdx = -1;
        updateNavPos();

        const statsEl = document.getElementById('codeDiffStats');
        if (statsEl) {
            statsEl.innerHTML = DiffLines.formatStatsHtml(lineDiff.stats);
        }
    }

    function onShown() {
        if (currentTool === 'codeDiff' && codeDiffEditors) onCodeDiffShown();
    }

    DevKit.ToolboxController = { init, switchTool, onShown };
})();
