// Media Tools - Shared Utilities
// Helpers used by the "音视频工具" (Media Tools) sub-tools: media file loading,
// audio decoding, WAV encoding, and duration formatting. Dropzones, downloads
// and file-size formatting are reused from utils/image-utils.js (ImageUtils).

const MediaUtils = {
    /**
     * Load a video File into a detached <video> element (metadata ready).
     * The returned object URL stays alive until revokeObjectURL is called.
     * @param {File} file
     * @returns {Promise<{ url: string, width: number, height: number, duration: number }>}
     */
    loadVideoFile(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                resolve({
                    url,
                    width: video.videoWidth,
                    height: video.videoHeight,
                    duration: video.duration
                });
            };
            video.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('视频加载失败，浏览器可能不支持该格式'));
            };
            video.src = url;
        });
    },

    /**
     * Decode an audio File into an AudioBuffer (any browser-decodable format).
     * @param {File} file
     * @returns {Promise<AudioBuffer>}
     */
    async decodeAudioFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = new AudioContext();
        try {
            return await ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            throw new Error('音频解码失败，浏览器可能不支持该格式');
        } finally {
            ctx.close();
        }
    },

    /**
     * Encode (a slice of) an AudioBuffer as a 16-bit PCM WAV Blob.
     * @param {AudioBuffer} buffer
     * @param {number} [startSec=0]
     * @param {number} [endSec=buffer.duration]
     * @returns {Blob}
     */
    audioBufferToWavBlob(buffer, startSec = 0, endSec = buffer.duration) {
        const sampleRate = buffer.sampleRate;
        const channels = buffer.numberOfChannels;
        const startFrame = Math.max(0, Math.floor(startSec * sampleRate));
        const endFrame = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
        const frameCount = Math.max(0, endFrame - startFrame);

        const bytesPerSample = 2;
        const blockAlign = channels * bytesPerSample;
        const dataSize = frameCount * blockAlign;
        const arrayBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(arrayBuffer);

        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        const channelData = [];
        for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch));

        let offset = 44;
        for (let i = startFrame; i < endFrame; i++) {
            for (let ch = 0; ch < channels; ch++) {
                const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    },

    /**
     * Extract a mono/stereo slice of an AudioBuffer as Float32Array channels.
     * Used by MP3 encoding (lamejs works on raw PCM channel data).
     * @param {AudioBuffer} buffer
     * @param {number} [startSec=0]
     * @param {number} [endSec=buffer.duration]
     * @returns {{ channels: Float32Array[], sampleRate: number }}
     */
    sliceAudioBuffer(buffer, startSec = 0, endSec = buffer.duration) {
        const sampleRate = buffer.sampleRate;
        const startFrame = Math.max(0, Math.floor(startSec * sampleRate));
        const endFrame = Math.min(buffer.length, Math.ceil(endSec * sampleRate));
        const channels = [];
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            channels.push(buffer.getChannelData(ch).slice(startFrame, endFrame));
        }
        return { channels, sampleRate };
    },

    /**
     * Encode (a slice of) an AudioBuffer as an MP3 Blob via lamejs.
     * @param {AudioBuffer} buffer
     * @param {number} [startSec=0]
     * @param {number} [endSec=buffer.duration]
     * @param {number} [kbps=192]
     * @returns {Blob}
     */
    audioBufferToMp3Blob(buffer, startSec = 0, endSec = buffer.duration, kbps = 192) {
        if (typeof lamejs === 'undefined') {
            throw new Error('MP3 编码库未加载');
        }
        const { channels, sampleRate } = this.sliceAudioBuffer(buffer, startSec, endSec);
        const channelCount = Math.min(2, channels.length);

        const toInt16 = (float32) => {
            const out = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            return out;
        };

        const left = toInt16(channels[0]);
        const right = channelCount === 2 ? toInt16(channels[1]) : null;

        const encoder = new lamejs.Mp3Encoder(channelCount, sampleRate, kbps);
        const blockSize = 1152;
        const parts = [];
        for (let i = 0; i < left.length; i += blockSize) {
            const leftChunk = left.subarray(i, i + blockSize);
            const chunk = right
                ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
                : encoder.encodeBuffer(leftChunk);
            if (chunk.length) parts.push(chunk);
        }
        const tail = encoder.flush();
        if (tail.length) parts.push(tail);

        return new Blob(parts, { type: 'audio/mpeg' });
    },

    /**
     * Format seconds as "mm:ss" (or "hh:mm:ss" past an hour).
     * @param {number} seconds
     * @param {boolean} [withMillis=false] - append .mmm
     * @returns {string}
     */
    formatDuration(seconds, withMillis = false) {
        if (!Number.isFinite(seconds) || seconds < 0) return '-';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const pad = (n) => String(n).padStart(2, '0');
        let out = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
        if (withMillis) {
            const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
            out += `.${String(ms).padStart(3, '0')}`;
        }
        return out;
    }
};

if (typeof window !== 'undefined') {
    window.MediaUtils = MediaUtils;
}
