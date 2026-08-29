// Minimal ICO container writer.
// Wraps one or more embedded PNGs into a valid multi-size Windows .ico file
// (ICONDIR + ICONDIRENTRY array, each entry pointing at a raw PNG payload -
// this "PNG-in-ICO" format has been supported by Windows/browsers since Vista).
// Used only by the favicon tool, isolated here since it's a binary-format
// concern rather than a general image utility.

const IcoEncoder = {
    /**
     * @param {Array<{ size: number, blob: Blob }>} entries - Square PNG blobs, each <= 256px per side.
     * @returns {Promise<Blob>} A Blob with MIME type 'image/x-icon'.
     */
    async encode(entries) {
        if (!entries || !entries.length) {
            throw new Error('encode() requires at least one { size, blob } entry');
        }

        const buffers = await Promise.all(entries.map(e => e.blob.arrayBuffer()));

        const count = entries.length;
        const headerSize = 6 + 16 * count;
        const header = new ArrayBuffer(headerSize);
        const view = new DataView(header);

        // ICONDIR
        view.setUint16(0, 0, true);      // reserved, must be 0
        view.setUint16(2, 1, true);      // type: 1 = icon
        view.setUint16(4, count, true);  // number of images

        let dataOffset = headerSize;
        let entryOffset = 6;
        buffers.forEach((buf, i) => {
            const size = entries[i].size;
            if (size > 256) {
                throw new Error(`ICO 条目尺寸不能超过 256px（收到 ${size}px）`);
            }
            const dim = size === 256 ? 0 : size; // 0 encodes 256 per the ICO spec

            view.setUint8(entryOffset + 0, dim);           // width
            view.setUint8(entryOffset + 1, dim);           // height
            view.setUint8(entryOffset + 2, 0);              // color count (0 = no palette)
            view.setUint8(entryOffset + 3, 0);              // reserved
            view.setUint16(entryOffset + 4, 1, true);       // color planes
            view.setUint16(entryOffset + 6, 32, true);      // bits per pixel
            view.setUint32(entryOffset + 8, buf.byteLength, true);  // image data size
            view.setUint32(entryOffset + 12, dataOffset, true);     // offset from file start

            dataOffset += buf.byteLength;
            entryOffset += 16;
        });

        return new Blob([header, ...buffers], { type: 'image/x-icon' });
    }
};

if (typeof window !== 'undefined') {
    window.IcoEncoder = IcoEncoder;
}
