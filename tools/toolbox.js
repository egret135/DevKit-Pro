// Toolbox - Developer Tools Collection
// Handles all toolbox functionality with new UI layout

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};

    let currentTool = 'timestamp';
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

        // Initialize timestamp tool
        initTimestamp();
        initBase64();
        initUrl();
        initJwt();
        initHash();
        initUuid();
        initPassword();
        initRegex();
        initJsonDiff();
        initColor();
        initCron();
        initCodeDiff();
    }

    function switchTool(tool) {
        currentTool = tool;

        // Update tab states
        document.querySelectorAll('.toolbox-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.toolbox-tab[data-tool="${tool}"]`)?.classList.add('active');

        // Show corresponding panel
        document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
        const panelId = 'toolPanel' + tool.charAt(0).toUpperCase() + tool.slice(1);
        document.getElementById(panelId)?.classList.add('active');
    }

    // ==================== Timestamp Tool ====================
    let prevDigits = [];

    function initTimestamp() {
        const currentTs = document.getElementById('currentTimestamp');
        const flipContainer = document.getElementById('flipClockContainer');
        const startBtn = document.getElementById('timestampStartBtn');
        const stopBtn = document.getElementById('timestampStopBtn');
        const refreshBtn = document.getElementById('timestampRefreshBtn');

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
        }

        // Initialize
        initFlipClock();

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

        // Unix to Date
        document.getElementById('unixToDateBtn')?.addEventListener('click', () => {
            const input = document.getElementById('unixInput')?.value;
            const unit = document.getElementById('unixUnit')?.value;
            const result = document.getElementById('unixToDateResult');

            if (!input || !result) return;

            const num = parseFloat(input);
            if (isNaN(num)) {
                result.value = '无效的时间戳';
                return;
            }

            const ms = unit === 'ms' ? num : num * 1000;
            const date = new Date(ms);

            if (date.toString() === 'Invalid Date') {
                result.value = '无效的时间戳';
            } else {
                result.value = formatDate(date);
            }
        });

        // Date to Unix
        document.getElementById('dateToUnixBtn')?.addEventListener('click', () => {
            const input = document.getElementById('dateStringInput')?.value;
            const unit = document.getElementById('dateToUnixUnit')?.value;
            const result = document.getElementById('dateToUnixResult');

            if (!input || !result) return;

            const date = new Date(input);
            if (date.toString() === 'Invalid Date') {
                result.value = '无效的日期格式';
            } else {
                const ts = unit === 'ms' ? date.getTime() : Math.floor(date.getTime() / 1000);
                result.value = ts.toString();
            }
        });

        // Parts to Unix
        document.getElementById('partsToUnixBtn')?.addEventListener('click', () => {
            const year = parseInt(document.getElementById('yearInput')?.value) || 2025;
            const month = parseInt(document.getElementById('monthInput')?.value) || 1;
            const day = parseInt(document.getElementById('dayInput')?.value) || 1;
            const hour = parseInt(document.getElementById('hourInput')?.value) || 0;
            const minute = parseInt(document.getElementById('minuteInput')?.value) || 0;
            const second = parseInt(document.getElementById('secondInput')?.value) || 0;
            const unit = document.getElementById('partsToUnixUnit')?.value;
            const result = document.getElementById('partsToUnixResult');

            if (!result) return;

            const date = new Date(year, month - 1, day, hour, minute, second);
            const ts = unit === 'ms' ? date.getTime() : Math.floor(date.getTime() / 1000);
            result.value = ts.toString();
        });
    }

    function formatDate(date) {
        const pad = n => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
            `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    // ==================== Base64 Tool ====================
    function initBase64() {
        document.getElementById('base64EncodeBtn')?.addEventListener('click', () => {
            const input = document.getElementById('base64Input')?.value || '';
            const output = document.getElementById('base64Output');
            if (!output) return;

            try {
                output.value = btoa(unescape(encodeURIComponent(input)));
            } catch (e) {
                output.value = '编码失败: ' + e.message;
            }
        });

        document.getElementById('base64DecodeBtn')?.addEventListener('click', () => {
            const input = document.getElementById('base64Input')?.value || '';
            const output = document.getElementById('base64Output');
            if (!output) return;

            try {
                output.value = decodeURIComponent(escape(atob(input)));
            } catch (e) {
                output.value = '解码失败: 输入不是有效的 Base64';
            }
        });
    }

    // ==================== URL Tool ====================
    function initUrl() {
        document.getElementById('urlEncodeBtn')?.addEventListener('click', () => {
            const input = document.getElementById('urlInput')?.value || '';
            const output = document.getElementById('urlOutput');
            if (output) output.value = encodeURIComponent(input);
        });

        document.getElementById('urlDecodeBtn')?.addEventListener('click', () => {
            const input = document.getElementById('urlInput')?.value || '';
            const output = document.getElementById('urlOutput');
            if (!output) return;

            try {
                output.value = decodeURIComponent(input);
            } catch (e) {
                output.value = '解码失败: 输入不是有效的 URL 编码';
            }
        });
    }

    // ==================== JWT Tool ====================
    function initJwt() {
        document.getElementById('jwtDecodeBtn')?.addEventListener('click', () => {
            const input = document.getElementById('jwtInput')?.value?.trim() || '';
            const headerOut = document.getElementById('jwtHeader');
            const payloadOut = document.getElementById('jwtPayload');
            const statusOut = document.getElementById('jwtStatus');

            const parts = input.split('.');
            if (parts.length !== 3) {
                if (statusOut) statusOut.value = '无效的 JWT 格式 (应包含3个部分)';
                return;
            }

            try {
                const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
                if (headerOut) headerOut.value = JSON.stringify(header, null, 2);
            } catch (e) {
                if (headerOut) headerOut.value = '解析失败';
            }

            try {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                if (payloadOut) payloadOut.value = JSON.stringify(payload, null, 2);

                if (statusOut) {
                    if (payload.exp) {
                        const expDate = new Date(payload.exp * 1000);
                        const isExpired = expDate < new Date();
                        statusOut.value = isExpired
                            ? `已过期 (${formatDate(expDate)})`
                            : `有效 (过期时间: ${formatDate(expDate)})`;
                    } else {
                        statusOut.value = '无过期时间';
                    }
                }
            } catch (e) {
                if (payloadOut) payloadOut.value = '解析失败';
                if (statusOut) statusOut.value = 'Payload 解析失败';
            }
        });
    }

    // ==================== Hash Tool ====================
    function initHash() {
        document.getElementById('hashCalcBtn')?.addEventListener('click', async () => {
            const input = document.getElementById('hashInput')?.value || '';

            // MD5
            const md5Out = document.getElementById('hashMd5');
            if (md5Out) md5Out.value = md5(input);

            const encoder = new TextEncoder();
            const data = encoder.encode(input);

            // SHA-1
            try {
                const sha1Buffer = await crypto.subtle.digest('SHA-1', data);
                const sha1Out = document.getElementById('hashSha1');
                if (sha1Out) sha1Out.value = bufferToHex(sha1Buffer);
            } catch (e) { }

            // SHA-256
            try {
                const sha256Buffer = await crypto.subtle.digest('SHA-256', data);
                const sha256Out = document.getElementById('hashSha256');
                if (sha256Out) sha256Out.value = bufferToHex(sha256Buffer);
            } catch (e) { }

            // SHA-512
            try {
                const sha512Buffer = await crypto.subtle.digest('SHA-512', data);
                const sha512Out = document.getElementById('hashSha512');
                if (sha512Out) sha512Out.value = bufferToHex(sha512Buffer);
            } catch (e) { }
        });

        // 点击复制哈希值功能
        const hashFields = ['hashMd5', 'hashSha1', 'hashSha256', 'hashSha512'];
        hashFields.forEach(fieldId => {
            document.getElementById(fieldId)?.addEventListener('click', function () {
                const value = this.value;
                if (!value) return;

                navigator.clipboard.writeText(value).then(() => {
                    const originalPlaceholder = this.placeholder;
                    const originalValue = this.value;
                    this.value = '✅ 已复制!';
                    this.style.color = '#10b981';
                    setTimeout(() => {
                        this.value = originalValue;
                        this.style.color = '';
                    }, 1000);
                });
            });
        });
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

    // ==================== UUID Tool ====================
    function initUuid() {
        // 更新行号列
        function updateLineNumbers(count) {
            const lineNumbers = document.getElementById('uuidLineNumbers');
            if (!lineNumbers) return;

            const lines = [];
            for (let i = 1; i <= count; i++) {
                lines.push(i + '.');
            }
            lineNumbers.innerHTML = lines.join('<br>');
        }

        document.getElementById('uuidGenerateBtn')?.addEventListener('click', () => {
            const count = parseInt(document.getElementById('uuidCount')?.value) || 5;
            const output = document.getElementById('uuidOutput');
            if (!output) return;

            const uuids = [];
            for (let i = 0; i < count; i++) {
                uuids.push(generateUUIDv4());
            }
            output.value = uuids.join('\n');
            updateLineNumbers(count);
        });

        document.getElementById('snowflakeGenerateBtn')?.addEventListener('click', () => {
            const count = parseInt(document.getElementById('uuidCount')?.value) || 5;
            const output = document.getElementById('uuidOutput');
            if (!output) return;

            const ids = [];
            for (let i = 0; i < count; i++) {
                ids.push(generateSnowflakeId());
            }
            output.value = ids.join('\n');
            updateLineNumbers(count);
        });

        document.getElementById('nanoidGenerateBtn')?.addEventListener('click', () => {
            const count = parseInt(document.getElementById('uuidCount')?.value) || 5;
            const output = document.getElementById('uuidOutput');
            if (!output) return;

            const ids = [];
            for (let i = 0; i < count; i++) {
                ids.push(generateNanoId());
            }
            output.value = ids.join('\n');
            updateLineNumbers(count);
        });

        // 同步滚动行号列与输出框
        const uuidOutput = document.getElementById('uuidOutput');
        const lineNumbers = document.getElementById('uuidLineNumbers');
        if (uuidOutput && lineNumbers) {
            uuidOutput.addEventListener('scroll', () => {
                lineNumbers.scrollTop = uuidOutput.scrollTop;
            });
        }
    }

    function generateUUIDv4() {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }

    let snowflakeSequence = 0;
    let snowflakeLastTs = 0;

    function generateSnowflakeId() {
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
        const workerId = BigInt(1);
        return ((BigInt(timestamp) - BigInt(1288834974657)) << BigInt(22) |
            (workerId << BigInt(12)) |
            BigInt(snowflakeSequence)).toString();
    }

    function generateNanoId(size = 21) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        const randomValues = new Uint32Array(size);
        crypto.getRandomValues(randomValues);
        let id = '';
        for (let i = 0; i < size; i++) {
            id += alphabet[randomValues[i] % alphabet.length];
        }
        return id;
    }

    // ==================== Password Generator ====================
    function initPassword() {
        let generatedPasswords = []; // 存储生成的密码

        // 安全的随机密码生成
        function generatePassword(length, options) {
            const charSets = {
                uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                lowercase: 'abcdefghijklmnopqrstuvwxyz',
                numbers: '0123456789',
                symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
            };

            let chars = '';
            if (options.uppercase) chars += charSets.uppercase;
            if (options.lowercase) chars += charSets.lowercase;
            if (options.numbers) chars += charSets.numbers;
            if (options.symbols) chars += charSets.symbols;

            if (chars.length === 0) {
                chars = charSets.lowercase; // 默认使用小写字母
            }

            // 使用 crypto.getRandomValues 生成安全随机数
            const array = new Uint32Array(length);
            crypto.getRandomValues(array);

            let password = '';
            for (let i = 0; i < length; i++) {
                password += chars[array[i] % chars.length];
            }
            return password;
        }

        // 复制单个密码
        function copyPassword(password, rowElement) {
            navigator.clipboard.writeText(password).then(() => {
                const originalText = rowElement.querySelector('.password-text').textContent;
                rowElement.querySelector('.password-text').textContent = '✅ 已复制!';
                rowElement.querySelector('.password-text').style.color = '#10b981';
                setTimeout(() => {
                    rowElement.querySelector('.password-text').textContent = originalText;
                    rowElement.querySelector('.password-text').style.color = '';
                }, 1000);
            });
        }

        // 渲染密码列表
        function renderPasswordList(passwords) {
            const listContainer = document.getElementById('pwdOutputList');
            if (!listContainer) return;

            generatedPasswords = passwords;
            listContainer.innerHTML = '';

            // HTML转义函数，防止特殊字符被解析为HTML
            function escapeHtml(text) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            }

            passwords.forEach((pwd, index) => {
                const row = document.createElement('div');
                row.className = 'password-row';
                row.innerHTML = `
                    <span class="password-index">${index + 1}.</span>
                    <span class="password-text">${escapeHtml(pwd)}</span>
                    <button class="password-copy-btn" title="复制此密码">📋</button>
                `;

                // 点击密码文本复制
                row.querySelector('.password-text').addEventListener('click', () => {
                    copyPassword(pwd, row);
                });

                // 点击复制按钮
                row.querySelector('.password-copy-btn').addEventListener('click', () => {
                    copyPassword(pwd, row);
                });

                listContainer.appendChild(row);
            });
        }

        // 生成密码按钮
        document.getElementById('pwdGenerateBtn')?.addEventListener('click', () => {
            const length = parseInt(document.getElementById('pwdLength')?.value) || 16;
            const count = parseInt(document.getElementById('pwdCount')?.value) || 5;

            const options = {
                uppercase: document.getElementById('pwdUppercase')?.checked,
                lowercase: document.getElementById('pwdLowercase')?.checked,
                numbers: document.getElementById('pwdNumbers')?.checked,
                symbols: document.getElementById('pwdSymbols')?.checked
            };

            const passwords = [];
            for (let i = 0; i < count; i++) {
                passwords.push(generatePassword(length, options));
            }
            renderPasswordList(passwords);
        });

        // 复制全部按钮
        document.getElementById('pwdCopyAllBtn')?.addEventListener('click', () => {
            if (generatedPasswords.length === 0) return;

            const allPasswords = generatedPasswords.join('\n');
            navigator.clipboard.writeText(allPasswords).then(() => {
                const btn = document.getElementById('pwdCopyAllBtn');
                const originalText = btn.textContent;
                btn.textContent = '✅ 已复制全部!';
                btn.style.background = '#10b981';
                btn.style.color = '#fff';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                    btn.style.color = '';
                }, 1000);
            });
        });
    }

    // ==================== Regex Tester ====================
    function initRegex() {
        document.getElementById('regexTestBtn')?.addEventListener('click', () => {
            const pattern = document.getElementById('regexPattern')?.value;
            const flags = document.getElementById('regexFlags')?.value || '';
            const testStr = document.getElementById('regexTestStr')?.value || '';
            const resultEl = document.getElementById('regexResult');
            const countEl = document.getElementById('regexMatchCount');
            if (!pattern || !resultEl) return;

            try {
                const regex = new RegExp(pattern, flags);
                const matches = [];
                let match;

                if (flags.includes('g')) {
                    while ((match = regex.exec(testStr)) !== null) {
                        matches.push(`匹配 ${matches.length + 1}: "${match[0]}"  位置: ${match.index}`
                            + (match.length > 1 ? `  分组: [${match.slice(1).map(g => `"${g || ''}"`).join(', ')}]` : ''));
                        if (match.index === regex.lastIndex) regex.lastIndex++;
                    }
                } else {
                    match = regex.exec(testStr);
                    if (match) {
                        matches.push(`匹配: "${match[0]}"  位置: ${match.index}`
                            + (match.length > 1 ? `  分组: [${match.slice(1).map(g => `"${g || ''}"`).join(', ')}]` : ''));
                    }
                }

                if (countEl) countEl.value = `${matches.length} 个匹配`;
                resultEl.value = matches.length ? matches.join('\n') : '无匹配';
            } catch (e) {
                if (countEl) countEl.value = '错误';
                resultEl.value = '正则表达式错误: ' + e.message;
            }
        });

        document.getElementById('regexReplaceBtn')?.addEventListener('click', () => {
            const pattern = document.getElementById('regexPattern')?.value;
            const flags = document.getElementById('regexFlags')?.value || '';
            const testStr = document.getElementById('regexTestStr')?.value || '';
            const replaceStr = document.getElementById('regexReplaceStr')?.value || '';
            const resultEl = document.getElementById('regexResult');
            const countEl = document.getElementById('regexMatchCount');
            if (!pattern || !resultEl) return;

            try {
                const regex = new RegExp(pattern, flags);
                const result = testStr.replace(regex, replaceStr);
                if (countEl) countEl.value = '已替换';
                resultEl.value = result;
            } catch (e) {
                if (countEl) countEl.value = '错误';
                resultEl.value = '正则表达式错误: ' + e.message;
            }
        });
    }

    // ==================== JSON Diff ====================
    function initJsonDiff() {
        document.getElementById('jsonDiffBtn')?.addEventListener('click', () => {
            const aStr = document.getElementById('jsonDiffA')?.value || '';
            const bStr = document.getElementById('jsonDiffB')?.value || '';
            const resultEl = document.getElementById('jsonDiffResult');
            if (!resultEl) return;

            if (typeof jsonDiffEngine === 'undefined') {
                resultEl.innerHTML = '<span class="diff-removed">JSON Diff 引擎未加载</span>';
                return;
            }

            const result = jsonDiffEngine.diffFromText(aStr, bStr, { sortKeys: true });
            if (!result.ok) {
                resultEl.innerHTML = `<span class="diff-removed">${escapeHtmlStr(result.error)}</span>`;
                return;
            }

            resultEl.innerHTML = result.lines.length
                ? result.lines.join('\n')
                : '<span class="diff-unchanged">两个 JSON 完全相同</span>';
        });

        document.getElementById('jsonDiffSwapBtn')?.addEventListener('click', () => {
            const aEl = document.getElementById('jsonDiffA');
            const bEl = document.getElementById('jsonDiffB');
            if (aEl && bEl) {
                const tmp = aEl.value;
                aEl.value = bEl.value;
                bEl.value = tmp;
            }
        });

        document.getElementById('jsonDiffOpenToolBtn')?.addEventListener('click', async () => {
            const aStr = document.getElementById('jsonDiffA')?.value || '';
            const bStr = document.getElementById('jsonDiffB')?.value || '';
            if (DevKit.App && DevKit.JsonController) {
                await DevKit.App.switchMode('json');
                editorManager.setValue('jsonCompareA', aStr);
                editorManager.setValue('jsonCompareB', bStr);
                DevKit.JsonController.switchSubView('compare');
                DevKit.JsonController.handleCompare();
            }
        });
    }

    function escapeHtmlStr(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    // ==================== Color Converter ====================
    function initColor() {
        const colorInput = document.getElementById('colorInput');
        const colorPicker = document.getElementById('colorPicker');

        document.getElementById('colorConvertBtn')?.addEventListener('click', () => {
            convertColor(colorInput?.value || '');
        });

        colorPicker?.addEventListener('input', () => {
            if (colorInput) colorInput.value = colorPicker.value;
            convertColor(colorPicker.value);
        });

        colorInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') convertColor(colorInput.value);
        });
    }

    function convertColor(input) {
        input = input.trim();
        const preview = document.getElementById('colorPreview');
        const hexEl = document.getElementById('colorHex');
        const rgbEl = document.getElementById('colorRgb');
        const hslEl = document.getElementById('colorHsl');
        const picker = document.getElementById('colorPicker');
        if (!hexEl || !rgbEl || !hslEl) return;

        let r, g, b;

        // Parse HEX
        let m = input.match(/^#?([0-9a-f]{3,8})$/i);
        if (m) {
            let hex = m[1];
            if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
            if (hex.length >= 6) {
                r = parseInt(hex.substring(0,2), 16);
                g = parseInt(hex.substring(2,4), 16);
                b = parseInt(hex.substring(4,6), 16);
            }
        }

        // Parse rgb(r, g, b)
        if (r === undefined) {
            m = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
        }

        // Parse hsl(h, s%, l%)
        if (r === undefined) {
            m = input.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
            if (m) {
                const rgb = hslToRgb(+m[1], +m[2], +m[3]);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            }
        }

        if (r === undefined) {
            hexEl.value = '无法解析';
            rgbEl.value = '';
            hslEl.value = '';
            return;
        }

        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));

        const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
        const hsl = rgbToHsl(r, g, b);

        hexEl.value = hex.toUpperCase();
        rgbEl.value = `rgb(${r}, ${g}, ${b})`;
        hslEl.value = `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`;
        if (preview) preview.style.background = hex;
        if (picker) picker.value = hex;
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        let h, s, l = (max+min)/2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d/(2-max-min) : d/(max+min);
            switch(max) {
                case r: h = ((g-b)/d + (g<b?6:0))/6; break;
                case g: h = ((b-r)/d + 2)/6; break;
                case b: h = ((r-g)/d + 4)/6; break;
            }
        }
        return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
    }

    function hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1/6) return p + (q-p)*6*t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q-p)*(2/3-t)*6;
                return p;
            };
            const q = l < 0.5 ? l*(1+s) : l+s-l*s;
            const p = 2*l - q;
            r = hue2rgb(p, q, h+1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h-1/3);
        }
        return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
    }

    // ==================== Cron Expression Parser ====================
    function initCron() {
        document.getElementById('cronParseBtn')?.addEventListener('click', () => {
            parseCron(document.getElementById('cronInput')?.value || '');
        });

        document.getElementById('cronInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') parseCron(e.target.value);
        });

        // Preset buttons
        document.querySelectorAll('.cron-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('cronInput');
                if (input) input.value = btn.dataset.cron;
                parseCron(btn.dataset.cron);
            });
        });
    }

    function parseCron(expr) {
        const descEl = document.getElementById('cronDesc');
        const nextEl = document.getElementById('cronNextRuns');
        if (!descEl || !nextEl) return;

        expr = expr.trim();
        if (!expr) { descEl.value = ''; nextEl.value = ''; return; }

        // Support both 5-field and 6-field (with seconds) cron
        const parts = expr.split(/\s+/);
        let minute, hour, dayOfMonth, month, dayOfWeek;

        if (parts.length === 5) {
            [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        } else if (parts.length === 6) {
            // seconds field ignored for description
            [, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        } else if (parts.length === 7) {
            [, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
        } else {
            descEl.value = '无效的 Cron 表达式 (需要 5~7 个字段)';
            nextEl.value = '';
            return;
        }

        // Build description
        const desc = describeCron(minute, hour, dayOfMonth, month, dayOfWeek);
        descEl.value = desc;

        // Calculate next N runs
        try {
            const runs = getNextCronRuns(minute, hour, dayOfMonth, month, dayOfWeek, 10);
            nextEl.value = runs.map((d, i) => `${i+1}.  ${formatDate(d)}`).join('\n');
        } catch (e) {
            nextEl.value = '无法计算执行时间: ' + e.message;
        }
    }

    function describeCron(min, hour, dom, mon, dow) {
        const parts = [];

        // Day of week
        const dowMap = { '0':'日','1':'一','2':'二','3':'三','4':'四','5':'五','6':'六','7':'日' };
        if (dow !== '*' && dow !== '?') {
            const range = dow.replace(/\d/g, d => dowMap[d] || d);
            parts.push(`周${range}`);
        }

        // Month
        if (mon !== '*' && mon !== '?') parts.push(`${mon}月`);

        // Day of month
        if (dom !== '*' && dom !== '?') parts.push(`${dom}号`);

        // Hour
        if (hour === '*') {
            parts.push('每小时');
        } else if (hour.includes('/')) {
            parts.push(`每${hour.split('/')[1]}小时`);
        } else if (hour !== '?') {
            parts.push(`${hour}时`);
        }

        // Minute
        if (min === '*') {
            parts.push('每分钟');
        } else if (min.includes('/')) {
            parts.push(`每${min.split('/')[1]}分钟`);
        } else if (min !== '?') {
            parts.push(`${min}分`);
        }

        return parts.length ? '执行时间: ' + parts.join(' ') : '每分钟执行';
    }

    function getNextCronRuns(min, hour, dom, mon, dow, count) {
        const runs = [];
        const now = new Date();
        let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

        const maxIter = 525960; // ~1 year of minutes
        let iter = 0;

        while (runs.length < count && iter < maxIter) {
            iter++;
            if (matchesCronField(cursor.getMonth() + 1, mon) &&
                matchesCronField(cursor.getDate(), dom) &&
                matchesCronDow(cursor.getDay(), dow) &&
                matchesCronField(cursor.getHours(), hour) &&
                matchesCronField(cursor.getMinutes(), min)) {
                runs.push(new Date(cursor));
            }
            cursor = new Date(cursor.getTime() + 60000);
        }
        return runs;
    }

    function matchesCronField(value, field) {
        if (field === '*' || field === '?') return true;
        // Handle step: */5 or 0/5
        if (field.includes('/')) {
            const [start, step] = field.split('/').map(Number);
            const base = isNaN(start) ? 0 : start;
            return (value - base) >= 0 && (value - base) % step === 0;
        }
        // Handle range: 1-5
        if (field.includes('-') && !field.includes(',')) {
            const [lo, hi] = field.split('-').map(Number);
            return value >= lo && value <= hi;
        }
        // Handle list: 1,3,5
        if (field.includes(',')) {
            return field.split(',').some(v => matchesCronField(value, v.trim()));
        }
        return value === Number(field);
    }

    function matchesCronDow(value, field) {
        if (field === '*' || field === '?') return true;
        // Normalize: 7 → 0 (Sunday), word boundary to avoid replacing 17→10
        const norm = f => f.replace(/\b7\b/g, '0');
        return matchesCronField(value, norm(field));
    }

    // ==================== Code Diff (IDE-style side-by-side) ====================
    let diffHunks = [];   // each hunk = first line index (0-based) of a group of consecutive changed lines in A
    let diffHunkIdx = -1; // current navigation position

    function initCodeDiff() {
        const aEl = document.getElementById('codeDiffA');
        const bEl = document.getElementById('codeDiffB');

        // Auto-diff on input
        const debouncedDiff = debounce(runCodeDiff, 300);
        aEl?.addEventListener('input', debouncedDiff);
        bEl?.addEventListener('input', debouncedDiff);

        // Scroll sync: textarea -> its own gutter & backdrop
        setupPaneScroll('codeDiffA', 'codeDiffGutterA', 'codeDiffBackdropA');
        setupPaneScroll('codeDiffB', 'codeDiffGutterB', 'codeDiffBackdropB');

        document.getElementById('codeDiffSwapBtn')?.addEventListener('click', () => {
            if (aEl && bEl) {
                const tmp = aEl.value;
                aEl.value = bEl.value;
                bEl.value = tmp;
                runCodeDiff();
            }
        });

        // Options also re-trigger diff
        document.getElementById('codeDiffIgnoreWhitespace')?.addEventListener('change', runCodeDiff);
        document.getElementById('codeDiffIgnoreCase')?.addEventListener('change', runCodeDiff);

        document.getElementById('codeDiffClearBtn')?.addEventListener('click', () => {
            if (aEl) aEl.value = '';
            if (bEl) bEl.value = '';
            clearDiffOverlays();
        });

        // Diff navigation
        document.getElementById('codeDiffPrevBtn')?.addEventListener('click', () => navigateDiff(-1));
        document.getElementById('codeDiffNextBtn')?.addEventListener('click', () => navigateDiff(1));

        // Fullscreen toggle
        const fsBtn = document.getElementById('codeDiffFullscreenBtn');
        const panel = document.getElementById('toolPanelCodeDiff');
        if (fsBtn && panel) {
            fsBtn.addEventListener('click', () => {
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    panel.requestFullscreen();
                }
            });
            document.addEventListener('fullscreenchange', () => {
                const isFs = document.fullscreenElement === panel;
                fsBtn.querySelector('.cdiff-icon-expand').style.display = isFs ? 'none' : '';
                fsBtn.querySelector('.cdiff-icon-collapse').style.display = isFs ? '' : 'none';
            });
        }
    }

    function navigateDiff(direction) {
        if (diffHunks.length === 0) return;
        diffHunkIdx += direction;
        if (diffHunkIdx < 0) diffHunkIdx = diffHunks.length - 1;
        if (diffHunkIdx >= diffHunks.length) diffHunkIdx = 0;
        updateNavPos();

        const hunk = diffHunks[diffHunkIdx];
        const lineHeight = 20;
        const textarea = document.getElementById(hunk.side === 'a' ? 'codeDiffA' : 'codeDiffB');
        if (!textarea) return;

        const targetScroll = hunk.line * lineHeight - textarea.clientHeight / 3;
        textarea.scrollTop = Math.max(0, targetScroll);
        // Sync the other side to the same position
        const otherTextarea = document.getElementById(hunk.side === 'a' ? 'codeDiffB' : 'codeDiffA');
        if (otherTextarea) otherTextarea.scrollTop = textarea.scrollTop;
        // Trigger scroll event to sync gutter/backdrop
        textarea.dispatchEvent(new Event('scroll'));
        otherTextarea?.dispatchEvent(new Event('scroll'));
    }

    function updateNavPos() {
        const posEl = document.getElementById('codeDiffNavPos');
        if (posEl) {
            posEl.textContent = diffHunks.length > 0 ? `${diffHunkIdx + 1}/${diffHunks.length}` : '';
        }
    }

    function setupPaneScroll(textareaId, gutterId, backdropId) {
        const textarea = document.getElementById(textareaId);
        const gutter = document.getElementById(gutterId);
        const backdrop = document.getElementById(backdropId);
        if (!textarea) return;
        textarea.addEventListener('scroll', () => {
            if (gutter) gutter.scrollTop = textarea.scrollTop;
            if (backdrop) backdrop.scrollTop = textarea.scrollTop;
        });
    }

    function clearDiffOverlays() {
        const ids = ['codeDiffGutterA', 'codeDiffGutterB', 'codeDiffBackdropA', 'codeDiffBackdropB'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
        const statsEl = document.getElementById('codeDiffStats');
        if (statsEl) statsEl.textContent = '';
        diffHunks = [];
        diffHunkIdx = -1;
        updateNavPos();
    }

    function runCodeDiff() {
        const aStr = document.getElementById('codeDiffA')?.value || '';
        const bStr = document.getElementById('codeDiffB')?.value || '';

        if (!aStr && !bStr) {
            clearDiffOverlays();
            return;
        }

        const ignoreWs = document.getElementById('codeDiffIgnoreWhitespace')?.checked || false;
        const ignoreCase = document.getElementById('codeDiffIgnoreCase')?.checked || false;

        const linesA = aStr.split('\n');
        const linesB = bStr.split('\n');
        const lineDiff = DiffLines.computeLineDiff(linesA, linesB, {
            ignoreWhitespace: ignoreWs,
            ignoreCase
        });

        DiffLines.renderOverlay('codeDiffGutterA', 'codeDiffBackdropA', linesA.length, lineDiff.statusA);
        DiffLines.renderOverlay('codeDiffGutterB', 'codeDiffBackdropB', linesB.length, lineDiff.statusB);

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

    DevKit.ToolboxController = { init, switchTool };
})();
