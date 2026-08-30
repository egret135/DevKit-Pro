// Media Tools - Screen / Camera Recording
// getDisplayMedia (screen) or getUserMedia (camera) captured with MediaRecorder
// into a WebM blob. Multiple audio sources (system audio + microphone) are
// mixed through a WebAudio MediaStreamDestination, because MediaRecorder only
// records the first audio track of a stream.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    function pickMimeType() {
        const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
        return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
    }

    function initRecord() {
        const sourceSelect = document.getElementById('mediaRecSource');
        if (!sourceSelect) return;
        const micCheck = document.getElementById('mediaRecMic');
        const sysAudioWrap = document.getElementById('mediaRecSysAudioWrap');
        const sysAudioCheck = document.getElementById('mediaRecSysAudio');
        const startBtn = document.getElementById('mediaRecStartBtn');
        const pauseBtn = document.getElementById('mediaRecPauseBtn');
        const stopBtn = document.getElementById('mediaRecStopBtn');
        const status = document.getElementById('mediaRecStatus');
        const timerEl = document.getElementById('mediaRecTimer');
        const meta = document.getElementById('mediaRecMeta');
        const preview = document.getElementById('mediaRecPreview');
        const playback = document.getElementById('mediaRecPlayback');
        const downloadBtn = document.getElementById('mediaRecDownloadBtn');

        let recorder = null;
        let captureStream = null;   // raw source stream(s), for stopping tracks
        let extraStreams = [];      // e.g. separate mic stream
        let audioCtx = null;        // mixer context when >1 audio source
        let chunks = [];
        let timerInterval = null;
        let startTime = 0;
        let pausedTotal = 0;
        let pauseStart = 0;
        let resultBlob = null;
        let resultUrl = '';

        function syncSourceOptions() {
            const isScreen = sourceSelect.value === 'screen';
            sysAudioWrap.classList.toggle('hidden', !isScreen);
        }
        sourceSelect.addEventListener('change', syncSourceOptions);
        syncSourceOptions();

        function updateTimer() {
            const elapsed = (Date.now() - startTime - pausedTotal) / 1000;
            timerEl.textContent = MediaUtils.formatDuration(elapsed);
        }

        function buildRecordingStream(videoStream, allAudioTracks) {
            const videoTracks = videoStream.getVideoTracks();
            if (allAudioTracks.length <= 1) {
                return new MediaStream([...videoTracks, ...allAudioTracks]);
            }
            // Mix multiple audio sources (system + mic) down to one track.
            audioCtx = new AudioContext();
            const destination = audioCtx.createMediaStreamDestination();
            allAudioTracks.forEach(track => {
                const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
                source.connect(destination);
            });
            return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()]);
        }

        async function start() {
            meta.textContent = '';
            try {
                const wantMic = micCheck.checked;
                const audioTracks = [];

                if (sourceSelect.value === 'screen') {
                    captureStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true,
                        audio: sysAudioCheck.checked
                    });
                    audioTracks.push(...captureStream.getAudioTracks());
                    if (wantMic) {
                        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        extraStreams.push(micStream);
                        audioTracks.push(...micStream.getAudioTracks());
                    }
                } else {
                    captureStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: wantMic
                    });
                    audioTracks.push(...captureStream.getAudioTracks());
                }

                const recordingStream = buildRecordingStream(captureStream, audioTracks);
                const mimeType = pickMimeType();
                recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
                chunks = [];
                recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
                recorder.onstop = finalize;
                recorder.start(1000);

                // Stop automatically when the user ends screen sharing from
                // the browser's own UI.
                const videoTrack = captureStream.getVideoTracks()[0];
                if (videoTrack) videoTrack.addEventListener('ended', stop, { once: true });

                preview.srcObject = captureStream;
                preview.classList.remove('hidden');
                playback.classList.add('hidden');
                downloadBtn.classList.add('hidden');

                startTime = Date.now();
                pausedTotal = 0;
                status.classList.remove('hidden', 'paused');
                timerEl.textContent = '00:00';
                timerInterval = setInterval(updateTimer, 250);

                startBtn.disabled = true;
                pauseBtn.disabled = false;
                pauseBtn.textContent = '暂停';
                stopBtn.disabled = false;
                sourceSelect.disabled = true;
            } catch (e) {
                cleanupStreams();
                meta.textContent = e.name === 'NotAllowedError'
                    ? '已取消或未授权录制'
                    : `录制失败: ${e.message}`;
            }
        }

        function togglePause() {
            if (!recorder) return;
            if (recorder.state === 'recording') {
                recorder.pause();
                pauseStart = Date.now();
                status.classList.add('paused');
                pauseBtn.textContent = '继续';
            } else if (recorder.state === 'paused') {
                recorder.resume();
                pausedTotal += Date.now() - pauseStart;
                status.classList.remove('paused');
                pauseBtn.textContent = '暂停';
            }
        }

        function stop() {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
        }

        function cleanupStreams() {
            if (captureStream) captureStream.getTracks().forEach(t => t.stop());
            extraStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
            captureStream = null;
            extraStreams = [];
            if (audioCtx) {
                audioCtx.close();
                audioCtx = null;
            }
        }

        function finalize() {
            clearInterval(timerInterval);
            const duration = (Date.now() - startTime - pausedTotal) / 1000;
            cleanupStreams();

            resultBlob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
            chunks = [];
            if (resultUrl) URL.revokeObjectURL(resultUrl);
            resultUrl = URL.createObjectURL(resultBlob);

            preview.srcObject = null;
            preview.classList.add('hidden');
            playback.src = resultUrl;
            playback.classList.remove('hidden');
            downloadBtn.classList.remove('hidden');
            status.classList.add('hidden');
            meta.textContent = `录制完成 · ${MediaUtils.formatDuration(duration)} · ${ImageUtils.formatFileSize(resultBlob.size)}`;

            recorder = null;
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            pauseBtn.textContent = '暂停';
            stopBtn.disabled = true;
            sourceSelect.disabled = false;
        }

        startBtn.addEventListener('click', start);
        pauseBtn.addEventListener('click', togglePause);
        stopBtn.addEventListener('click', stop);
        downloadBtn.addEventListener('click', () => {
            if (!resultBlob) return;
            ImageUtils.downloadBlob(resultBlob, ImageUtils.generateFilename('recording', 'webm'));
        });
    }

    DevKit.MediaTools.record = { init: initRecord };
})();
