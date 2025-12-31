// Toolbox - Developer Tools Collection
// Handles all toolbox functionality with new UI layout

const ToolboxController = (function () {
    'use strict';

    let currentTool = 'timestamp';
    let timestampInterval = null;

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
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function generateSnowflakeId() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        return (BigInt(timestamp) << BigInt(22) | BigInt(random)).toString();
    }

    function generateNanoId(size = 21) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let id = '';
        for (let i = 0; i < size; i++) {
            id += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return id;
    }

    // Public API
    return {
        init,
        switchTool
    };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    ToolboxController.init();
});
