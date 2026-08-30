// Media Tools - Audio Waveform Trim
// Decodes an audio file to an AudioBuffer, renders its waveform on a canvas,
// and lets the user drag a selection window (handles to resize, body to move)
// to audition and export a slice as WAV or MP3.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    function initTrim() {
        const dropzone = document.getElementById('mediaTrimDropzone');
        if (!dropzone) return;
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');
        const work = document.getElementById('mediaTrimWork');
        const meta = document.getElementById('mediaTrimMeta');
        const waveWrap = document.getElementById('mediaTrimWaveWrap');
        const waveCanvas = document.getElementById('mediaTrimWave');
        const selection = document.getElementById('mediaTrimSelection');
        const startInput = document.getElementById('mediaTrimStart');
        const endInput = document.getElementById('mediaTrimEnd');
        const playBtn = document.getElementById('mediaTrimPlayBtn');
        const stopBtn = document.getElementById('mediaTrimStopBtn');
        const wavBtn = document.getElementById('mediaTrimWavBtn');
        const mp3Btn = document.getElementById('mediaTrimMp3Btn');

        let audioBuffer = null;
        let selStart = 0;
        let selEnd = 0;
        let drag = null;
        let playCtx = null;
        let playSource = null;

        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

        function drawWave() {
            if (!audioBuffer || !waveWrap.clientWidth) return;
            const dpr = window.devicePixelRatio || 1;
            const width = waveWrap.clientWidth;
            const height = waveWrap.clientHeight;
            waveCanvas.width = width * dpr;
            waveCanvas.height = height * dpr;
            const ctx = waveCanvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            const data = audioBuffer.getChannelData(0);
            const samplesPerPx = Math.max(1, Math.floor(data.length / width));
            const mid = height / 2;

            ctx.strokeStyle = getComputedStyle(document.documentElement)
                .getPropertyValue('--color-accent').trim() || '#3b82f6';
            ctx.globalAlpha = 0.75;
            ctx.beginPath();
            for (let x = 0; x < width; x++) {
                let min = 1, max = -1;
                const base = x * samplesPerPx;
                for (let i = 0; i < samplesPerPx; i += Math.max(1, Math.floor(samplesPerPx / 50))) {
                    const v = data[base + i];
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
                ctx.moveTo(x + 0.5, mid + min * mid * 0.92);
                ctx.lineTo(x + 0.5, mid + max * mid * 0.92);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        function syncSelection() {
            if (!audioBuffer) return;
            const duration = audioBuffer.duration;
            selection.style.left = `${(selStart / duration) * 100}%`;
            selection.style.width = `${((selEnd - selStart) / duration) * 100}%`;
            startInput.value = selStart.toFixed(2);
            endInput.value = selEnd.toFixed(2);
        }

        ImageUtils.createDropZone(dropzone, {
            accept: 'audio/*',
            enablePaste: false,
            onFile: async (file) => {
                try {
                    stopPlayback();
                    audioBuffer = await MediaUtils.decodeAudioFile(file);
                    selStart = 0;
                    selEnd = audioBuffer.duration;
                    work.classList.remove('hidden');
                    hintSub.textContent = `已加载: ${file.name} · 可再次点击更换音频`;
                    meta.textContent = [
                        MediaUtils.formatDuration(audioBuffer.duration, true),
                        `${audioBuffer.sampleRate} Hz`,
                        `${audioBuffer.numberOfChannels} 声道`,
                        ImageUtils.formatFileSize(file.size)
                    ].join(' · ');
                    // Wait a frame so the newly-shown wrap has a measurable width.
                    requestAnimationFrame(() => {
                        drawWave();
                        syncSelection();
                    });
                } catch (e) {
                    hintSub.textContent = e.message;
                }
            }
        });

        // ---- Selection dragging (handles resize, body moves) ----
        selection.addEventListener('mousedown', (e) => {
            if (!audioBuffer) return;
            e.preventDefault();
            const handle = e.target.closest('.media-wave-handle');
            drag = {
                type: handle ? handle.dataset.handle : 'move',
                startX: e.clientX,
                origStart: selStart,
                origEnd: selEnd
            };
        });

        document.addEventListener('mousemove', (e) => {
            if (!drag || !audioBuffer) return;
            const rect = waveWrap.getBoundingClientRect();
            const duration = audioBuffer.duration;
            const dt = ((e.clientX - drag.startX) / rect.width) * duration;
            const minLen = 0.01;

            if (drag.type === 'move') {
                const len = drag.origEnd - drag.origStart;
                selStart = clamp(drag.origStart + dt, 0, duration - len);
                selEnd = selStart + len;
            } else if (drag.type === 'start') {
                selStart = clamp(drag.origStart + dt, 0, drag.origEnd - minLen);
            } else {
                selEnd = clamp(drag.origEnd + dt, drag.origStart + minLen, duration);
            }
            syncSelection();
        });

        document.addEventListener('mouseup', () => { drag = null; });

        // Click on empty waveform area: jump the nearest selection edge there.
        waveWrap.addEventListener('mousedown', (e) => {
            if (!audioBuffer || e.target.closest('.media-wave-selection')) return;
            const rect = waveWrap.getBoundingClientRect();
            const t = clamp(((e.clientX - rect.left) / rect.width) * audioBuffer.duration, 0, audioBuffer.duration);
            if (Math.abs(t - selStart) <= Math.abs(t - selEnd)) selStart = Math.min(t, selEnd - 0.01);
            else selEnd = Math.max(t, selStart + 0.01);
            syncSelection();
        });

        function syncFromInputs() {
            if (!audioBuffer) return;
            const duration = audioBuffer.duration;
            selStart = clamp(Number(startInput.value) || 0, 0, duration - 0.01);
            selEnd = clamp(Number(endInput.value) || duration, selStart + 0.01, duration);
            syncSelection();
        }
        startInput.addEventListener('change', syncFromInputs);
        endInput.addEventListener('change', syncFromInputs);

        window.addEventListener('resize', () => {
            if (audioBuffer && waveWrap.clientWidth) {
                drawWave();
            }
        });

        // ---- Playback ----
        function stopPlayback() {
            if (playSource) {
                try { playSource.stop(); } catch (e) { /* already stopped */ }
                playSource = null;
            }
            if (playCtx) {
                playCtx.close();
                playCtx = null;
            }
            stopBtn.disabled = true;
            playBtn.disabled = false;
        }

        playBtn.addEventListener('click', () => {
            if (!audioBuffer) return;
            stopPlayback();
            playCtx = new AudioContext();
            playSource = playCtx.createBufferSource();
            playSource.buffer = audioBuffer;
            playSource.connect(playCtx.destination);
            playSource.onended = stopPlayback;
            playSource.start(0, selStart, Math.max(0.01, selEnd - selStart));
            stopBtn.disabled = false;
            playBtn.disabled = true;
        });

        stopBtn.addEventListener('click', stopPlayback);

        // ---- Export ----
        wavBtn.addEventListener('click', () => {
            if (!audioBuffer) return;
            const blob = MediaUtils.audioBufferToWavBlob(audioBuffer, selStart, selEnd);
            ImageUtils.downloadBlob(blob, ImageUtils.generateFilename('trim', 'wav'));
        });

        mp3Btn.addEventListener('click', () => {
            if (!audioBuffer) return;
            try {
                const blob = MediaUtils.audioBufferToMp3Blob(audioBuffer, selStart, selEnd, 192);
                ImageUtils.downloadBlob(blob, ImageUtils.generateFilename('trim', 'mp3'));
            } catch (e) {
                meta.textContent = e.message;
            }
        });
    }

    DevKit.MediaTools.trim = { init: initTrim };
})();
