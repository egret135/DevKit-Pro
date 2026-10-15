// Minimal ZIP writer (STORE method, no compression).
// Images are already compressed, so deflating them again would gain little;
// storing keeps this dependency-free and fast. File names are UTF-8 (flag bit 11).

const ZipWriter = (() => {
    let crcTable = null;

    function getCrcTable() {
        if (crcTable) return crcTable;
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            crcTable[n] = c >>> 0;
        }
        return crcTable;
    }

    /** CRC-32 (IEEE) of a Uint8Array. */
    function crc32(bytes) {
        const table = getCrcTable();
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function dosDateTime(date) {
        const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
        const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        return { time, day };
    }

    /** Appends -1, -2 ... before the extension when a name is already taken. */
    function uniqueName(name, used) {
        if (!used.has(name)) { used.add(name); return name; }
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let i = 1;
        while (used.has(`${base}-${i}${ext}`)) i++;
        const result = `${base}-${i}${ext}`;
        used.add(result);
        return result;
    }

    /**
     * @param {Array<{name: string, data: Uint8Array}>} files
     * @param {Date} [date]
     * @returns {Uint8Array[]} parts of the archive, in order
     */
    function buildParts(files, date = new Date()) {
        const encoder = new TextEncoder();
        const { time, day } = dosDateTime(date);
        const used = new Set();
        const parts = [];
        const central = [];
        let offset = 0;

        files.forEach(file => {
            const nameBytes = encoder.encode(uniqueName(file.name, used));
            const data = file.data;
            const crc = crc32(data);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034B50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);
            local.setUint16(8, 0, true);
            local.setUint16(10, time, true);
            local.setUint16(12, day, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, data.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, nameBytes.length, true);
            local.setUint16(28, 0, true);
            parts.push(new Uint8Array(local.buffer), nameBytes, data);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014B50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint16(8, 0x0800, true);
            entry.setUint16(10, 0, true);
            entry.setUint16(12, time, true);
            entry.setUint16(14, day, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, data.length, true);
            entry.setUint32(24, data.length, true);
            entry.setUint16(28, nameBytes.length, true);
            entry.setUint32(42, offset, true);
            central.push(new Uint8Array(entry.buffer), nameBytes);

            offset += 30 + nameBytes.length + data.length;
        });

        const centralSize = central.reduce((n, p) => n + p.length, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054B50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, centralSize, true);
        end.setUint32(16, offset, true);

        return parts.concat(central, [new Uint8Array(end.buffer)]);
    }

    /**
     * @param {Array<{name: string, blob: Blob}>} entries
     * @returns {Promise<Blob>} application/zip
     */
    async function build(entries) {
        const files = [];
        for (const entry of entries) {
            files.push({ name: entry.name, data: new Uint8Array(await entry.blob.arrayBuffer()) });
        }
        return new Blob(buildParts(files), { type: 'application/zip' });
    }

    return { crc32, uniqueName, buildParts, build };
})();

if (typeof window !== 'undefined') {
    window.ZipWriter = ZipWriter;
}
