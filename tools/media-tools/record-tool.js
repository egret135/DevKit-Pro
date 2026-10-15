// Media Tools - Screen / Camera Recording (Layout A)
// getDisplayMedia / getUserMedia + MediaRecorder + WebAudio mix.
// Source/device, quality chips, level meter, shortcuts, history, Settings.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const HISTORY_MAX = 8;
    const BITRATE = { high: 8_000_000, mid: 4_000_000, low: 1_500_000 };
    const RES_MAP = {
        0: null,
        1080: { width: 1920, height: 1080 },
        720: { width: 1280, height: 720 },
        480: { width: 854, height: 480 }
    };

    function pickMimeType() {
        const candidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ];
        return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    }

    function initRecord() {
        const panel = document.getElementById('mediaPanelRecord');
        if (!panel) return;

        const $ = (id) => document.getElementById(id);
        const sourceHidden = $('mediaRecSource');
        const sourceSeg = $('mediaRecSourceSeg');
        const cameraField = $('mediaRecCameraField');
        const cameraSelect = $('mediaRecCamera');
        const cameraHint = $('mediaRecCameraHint');
        const micCheck = $('mediaRecMic');
        const sysAudioWrap = $('mediaRecSysAudioWrap');
        const sysAudioCheck = $('mediaRecSysAudio');
        const meterFill = $('mediaRecMeterFill');
        const meterHint = $('mediaRecMeterHint');
        const resRoot = $('mediaRecRes');
        const fpsRoot = $('mediaRecFps');
        const brRoot = $('mediaRecBitrate');
        const prefixInput = $('mediaRecPrefix');
        const startBtn = $('mediaRecStartBtn');
        const pauseBtn = $('mediaRecPauseBtn');
        const stopBtn = $('mediaRecStopBtn');
        const downloadBtn = $('mediaRecDownloadBtn');
        const againBtn = $('mediaRecAgainBtn');
        const liveBadge = $('mediaRecLiveBadge');
        const timerEl = $('mediaRecTimer');
        const pauseMask = $('mediaRecPauseMask');
        const emptyEl = $('mediaRecEmpty');
        const meta = $('mediaRecMeta');
        const preview = $('mediaRecPreview');
        const playback = $('mediaRecPlayback');
        const historyEl = $('mediaRecHistory');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        const state = {
            source: defaults.mediaRecSource || 'screen',
            mic: !!defaults.mediaRecMic,
            sysAudio: !!defaults.mediaRecSysAudio,
            maxRes: Number.isFinite(defaults.mediaRecMaxRes) ? defaults.mediaRecMaxRes : 0,
            fps: defaults.mediaRecFps || 30,
            bitrate: defaults.mediaRecBitrate || 'mid',
            prefix: defaults.mediaRecFilenamePrefix || 'recording',
            cameraId: ''
        };

        let recorder = null;
        let captureStream = null;
        let extraStreams = [];
        let audioCtx = null;
        let analyser = null;
        let meterRaf = 0;
        let silentFrames = 0;
        let chunks = [];
        let timerInterval = null;
        let startTime = 0;
        let pausedTotal = 0;
        let pauseStart = 0;
        let resultBlob = null;
        let resultUrl = '';
        let resultMeta = null;
        let history = []; // { id, blob, url, name, duration, size, width, height, at }

        function persist(key, value) {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        }

        function setChipGroup(root, attr, value) {
            root?.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
                const on = String(btn.dataset[attr]) === String(value);
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        }

        function syncSourceUi() {
            const isScreen = state.source === 'screen';
            sourceSeg?.querySelectorAll('[data-source]').forEach((btn) => {
                const on = btn.dataset.source === state.source;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-checked', on ? 'true' : 'false');
            });
            if (sourceHidden) sourceHidden.value = state.source;
            sysAudioWrap?.classList.toggle('hidden', !isScreen);
            cameraField?.classList.toggle('hidden', isScreen);
        }

        function syncFormFromState() {
            syncSourceUi();
            if (micCheck) micCheck.checked = state.mic;
            if (sysAudioCheck) sysAudioCheck.checked = state.sysAudio;
            if (prefixInput) prefixInput.value = state.prefix;
            setChipGroup(resRoot, 'res', state.maxRes);
            setChipGroup(fpsRoot, 'fps', state.fps);
            setChipGroup(brRoot, 'br', state.bitrate);
        }

        // Soft preferences only — hard max constraints often make getDisplayMedia
        // fail right after the user picks a tab/window (OverconstrainedError).
        function videoConstraints(forDisplay) {
            const res = RES_MAP[state.maxRes];
            const base = {
                frameRate: { ideal: state.fps }
            };
            if (res) {
                base.width = { ideal: res.width };
                base.height = { ideal: res.height };
            }
            if (!forDisplay && state.source === 'camera' && state.cameraId) {
                base.deviceId = { exact: state.cameraId };
            }
            return base;
        }

        async function preferTrackSettings(stream) {
            const track = stream.getVideoTracks()[0];
            if (!track?.applyConstraints) return;
            try {
                await track.applyConstraints(videoConstraints(state.source === 'screen'));
            } catch (_) {
                // Browser may ignore preferred size/fps for display media — non-fatal.
            }
        }

        function createRecorder(stream) {
            const mimeType = pickMimeType();
            const bits = BITRATE[state.bitrate] || BITRATE.mid;
            const attempts = [
                mimeType ? { mimeType, videoBitsPerSecond: bits } : { videoBitsPerSecond: bits },
                mimeType ? { mimeType } : undefined,
                undefined
            ];
            let lastErr = null;
            for (const opts of attempts) {
                try {
                    return opts ? new MediaRecorder(stream, opts) : new MediaRecorder(stream);
                } catch (e) {
                    lastErr = e;
                }
            }
            throw lastErr || new Error('无法创建 MediaRecorder');
        }

        async function attachPreview(stream) {
            preview.srcObject = stream;
            preview.classList.remove('hidden');
            try {
                await preview.play();
            } catch (_) {
                // Autoplay can be blocked briefly; muted+playsinline usually recovers.
            }
        }

        async function refreshCameras() {
            if (!navigator.mediaDevices?.enumerateDevices) return;
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cams = devices.filter((d) => d.kind === 'videoinput');
                if (!cameraSelect) return;
                const prev = state.cameraId;
                cameraSelect.innerHTML = '';
                if (!cams.length) {
                    cameraSelect.innerHTML = '<option value="">未检测到摄像头</option>';
                    if (cameraHint) cameraHint.textContent = '未检测到视频输入设备';
                    return;
                }
                const labeled = cams.some((c) => c.label);
                if (!labeled && cameraHint) {
                    cameraHint.textContent = '授权摄像头后可显示设备名称';
                } else if (cameraHint) {
                    cameraHint.textContent = `共 ${cams.length} 个设备`;
                }
                cams.forEach((c, i) => {
                    const opt = document.createElement('option');
                    opt.value = c.deviceId;
                    opt.textContent = c.label || `摄像头 ${i + 1}`;
                    cameraSelect.appendChild(opt);
                });
                if (prev && cams.some((c) => c.deviceId === prev)) {
                    cameraSelect.value = prev;
                    state.cameraId = prev;
                } else {
                    state.cameraId = cams[0].deviceId;
                    cameraSelect.value = state.cameraId;
                }
            } catch (_) {
                if (cameraHint) cameraHint.textContent = '无法枚举设备';
            }
        }

        function stopMeter() {
            if (meterRaf) cancelAnimationFrame(meterRaf);
            meterRaf = 0;
            silentFrames = 0;
            if (meterFill) meterFill.style.width = '0%';
            if (meterHint) meterHint.textContent = '录制中显示电平';
            analyser = null;
        }

        function startMeter(stream) {
            stopMeter();
            const audioTracks = stream.getAudioTracks();
            if (!audioTracks.length) {
                if (meterHint) meterHint.textContent = '当前无音轨';
                return;
            }
            try {
                if (!audioCtx) audioCtx = new AudioContext();
                const source = audioCtx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                const data = new Uint8Array(analyser.frequencyBinCount);
                const tick = () => {
                    if (!analyser) return;
                    analyser.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const v = (data[i] - 128) / 128;
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    const pct = Math.min(100, Math.round(rms * 280));
                    if (meterFill) meterFill.style.width = pct + '%';
                    if (pct < 2) {
                        silentFrames += 1;
                        if (silentFrames > 90 && meterHint) {
                            meterHint.textContent = '近乎静音，请检查麦克风 / 系统声';
                        }
                    } else {
                        silentFrames = 0;
                        if (meterHint) meterHint.textContent = '电平正常';
                    }
                    meterRaf = requestAnimationFrame(tick);
                };
                meterRaf = requestAnimationFrame(tick);
            } catch (_) {
                if (meterHint) meterHint.textContent = '电平监测不可用';
            }
        }

        function updateTimer() {
            const elapsed = (Date.now() - startTime - pausedTotal) / 1000;
            if (timerEl) timerEl.textContent = MediaUtils.formatDuration(elapsed);
        }

        function buildRecordingStream(videoStream, allAudioTracks) {
            const videoTracks = videoStream.getVideoTracks();
            if (allAudioTracks.length <= 1) {
                return new MediaStream([...videoTracks, ...allAudioTracks]);
            }
            audioCtx = audioCtx || new AudioContext();
            const destination = audioCtx.createMediaStreamDestination();
            allAudioTracks.forEach((track) => {
                const source = audioCtx.createMediaStreamSource(new MediaStream([track]));
                source.connect(destination);
            });
            return new MediaStream([...videoTracks, ...destination.stream.getAudioTracks()]);
        }

        function cleanupStreams() {
            stopMeter();
            if (captureStream) captureStream.getTracks().forEach((t) => t.stop());
            extraStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
            captureStream = null;
            extraStreams = [];
            if (audioCtx) {
                audioCtx.close().catch(() => {});
                audioCtx = null;
            }
        }

        // Only show buttons that apply to the current phase.
        // idle: 开始 | recording: 暂停+停止 | done: 下载+重新录制
        function syncActionButtons(phase) {
            const show = (el, on) => {
                if (!el) return;
                el.classList.toggle('hidden', !on);
                el.disabled = !on;
            };
            if (phase === 'recording') {
                show(startBtn, false);
                show(pauseBtn, true);
                show(stopBtn, true);
                show(downloadBtn, false);
                show(againBtn, false);
                if (pauseBtn) pauseBtn.textContent = '暂停';
            } else if (phase === 'done') {
                show(startBtn, false);
                show(pauseBtn, false);
                show(stopBtn, false);
                show(downloadBtn, true);
                show(againBtn, true);
                if (pauseBtn) pauseBtn.textContent = '暂停';
            } else {
                show(startBtn, true);
                show(pauseBtn, false);
                show(stopBtn, false);
                show(downloadBtn, false);
                show(againBtn, false);
                if (pauseBtn) pauseBtn.textContent = '暂停';
            }
        }

        function setIdleUi(message) {
            liveBadge?.classList.add('hidden');
            pauseMask?.classList.add('hidden');
            preview.classList.add('hidden');
            preview.srcObject = null;
            if (!resultBlob) {
                playback.classList.add('hidden');
                playback.removeAttribute('src');
                emptyEl?.classList.remove('hidden');
            }
            if (meta) meta.textContent = message || '待机';
            syncActionButtons(resultBlob ? 'done' : 'idle');
            sourceSeg?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
            if (cameraSelect) cameraSelect.disabled = false;
        }

        function setRecordingUi() {
            emptyEl?.classList.add('hidden');
            playback.classList.add('hidden');
            preview.classList.remove('hidden');
            liveBadge?.classList.remove('hidden');
            liveBadge?.classList.remove('paused');
            pauseMask?.classList.add('hidden');
            syncActionButtons('recording');
            sourceSeg?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
            if (cameraSelect) cameraSelect.disabled = true;
            if (meta) meta.textContent = '录制中…';
        }

        function trackSettings(stream) {
            const vt = stream.getVideoTracks()[0];
            const s = vt?.getSettings?.() || {};
            return {
                width: s.width || 0,
                height: s.height || 0
            };
        }

        function renderHistory() {
            if (!historyEl) return;
            historyEl.innerHTML = '';
            if (!history.length) {
                const note = document.createElement('span');
                note.className = 'cvt-note';
                note.textContent = '录制完成后显示在此（刷新即清空）';
                historyEl.appendChild(note);
                return;
            }
            history.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'rec-history-item';
                const info = document.createElement('div');
                info.className = 'rec-history-info';
                const title = document.createElement('strong');
                title.textContent = item.name;
                const sub = document.createElement('span');
                const dim = item.width && item.height ? ` · ${item.width}×${item.height}` : '';
                sub.textContent = `${MediaUtils.formatDuration(item.duration)} · ${ImageUtils.formatFileSize(item.size)}${dim}`;
                info.append(title, sub);

                const actions = document.createElement('div');
                actions.className = 'rec-history-actions';
                const playBtn = document.createElement('button');
                playBtn.type = 'button';
                playBtn.className = 'tool-btn-action tech-btn';
                playBtn.textContent = '回放';
                playBtn.addEventListener('click', () => playHistoryItem(item));
                const dlBtn = document.createElement('button');
                dlBtn.type = 'button';
                dlBtn.className = 'tool-btn-action tech-btn';
                dlBtn.textContent = '下载';
                dlBtn.addEventListener('click', () => ImageUtils.downloadBlob(item.blob, item.name));
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'tool-btn-action tech-btn';
                delBtn.textContent = '删除';
                delBtn.addEventListener('click', () => removeHistory(item.id));
                actions.append(playBtn, dlBtn, delBtn);
                row.append(info, actions);
                historyEl.appendChild(row);
            });
        }

        function playHistoryItem(item) {
            resultBlob = item.blob;
            if (resultUrl && !history.some((h) => h.url === resultUrl)) {
                URL.revokeObjectURL(resultUrl);
            }
            resultUrl = item.url;
            resultMeta = item;
            emptyEl?.classList.add('hidden');
            preview.classList.add('hidden');
            preview.srcObject = null;
            playback.src = item.url;
            playback.classList.remove('hidden');
            syncActionButtons('done');
            if (meta) {
                const dim = item.width && item.height ? ` · ${item.width}×${item.height}` : '';
                meta.textContent = `历史回放 · ${MediaUtils.formatDuration(item.duration)} · ${ImageUtils.formatFileSize(item.size)}${dim}`;
            }
        }

        function removeHistory(id) {
            const idx = history.findIndex((h) => h.id === id);
            if (idx < 0) return;
            const [item] = history.splice(idx, 1);
            if (item.url && item.url !== resultUrl) URL.revokeObjectURL(item.url);
            if (resultUrl === item.url) {
                resultBlob = null;
                resultUrl = '';
                resultMeta = null;
                playback.classList.add('hidden');
                playback.removeAttribute('src');
                emptyEl?.classList.remove('hidden');
                syncActionButtons('idle');
                if (meta) meta.textContent = '待机';
            }
            renderHistory();
        }

        function pushHistory(entry) {
            history.unshift(entry);
            while (history.length > HISTORY_MAX) {
                const old = history.pop();
                if (old?.url && old.url !== resultUrl) URL.revokeObjectURL(old.url);
            }
            renderHistory();
        }

        async function start() {
            if (recorder && recorder.state !== 'inactive') return;
            if (startBtn) startBtn.disabled = true;
            if (meta) meta.textContent = '请求权限…';
            try {
                const wantMic = state.mic;
                const audioTracks = [];
                let dims = { width: 0, height: 0 };

                if (state.source === 'screen') {
                    // Use video:true first — preferred size/fps applied afterwards.
                    // Strict constraints here often fail after the picker closes.
                    try {
                        captureStream = await navigator.mediaDevices.getDisplayMedia({
                            video: true,
                            audio: !!state.sysAudio
                        });
                    } catch (e) {
                        if (e.name === 'NotAllowedError' || e.name === 'AbortError') throw e;
                        captureStream = await navigator.mediaDevices.getDisplayMedia({
                            video: videoConstraints(true),
                            audio: !!state.sysAudio
                        });
                    }
                    await preferTrackSettings(captureStream);
                    audioTracks.push(...captureStream.getAudioTracks());
                    if (wantMic) {
                        try {
                            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            extraStreams.push(micStream);
                            audioTracks.push(...micStream.getAudioTracks());
                        } catch (micErr) {
                            if (meta) meta.textContent = '已开始画面采集，麦克风未授权';
                        }
                    }
                } else {
                    try {
                        captureStream = await navigator.mediaDevices.getUserMedia({
                            video: videoConstraints(false),
                            audio: wantMic
                        });
                    } catch (e) {
                        if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
                            captureStream = await navigator.mediaDevices.getUserMedia({
                                video: state.cameraId ? { deviceId: { ideal: state.cameraId } } : true,
                                audio: wantMic
                            });
                        } else {
                            throw e;
                        }
                    }
                    await preferTrackSettings(captureStream);
                    audioTracks.push(...captureStream.getAudioTracks());
                    await refreshCameras();
                }

                if (!captureStream.getVideoTracks().length) {
                    throw new Error('未获得视频轨道，请重新选择窗口或标签');
                }

                // Show live preview immediately so the picker → UI gap isn't blank.
                await attachPreview(captureStream);
                emptyEl?.classList.add('hidden');
                playback.classList.add('hidden');
                if (meta) meta.textContent = '正在启动录制…';

                dims = trackSettings(captureStream);
                const recordingStream = buildRecordingStream(captureStream, audioTracks);
                recorder = createRecorder(recordingStream);
                chunks = [];
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size) chunks.push(e.data);
                };
                recorder.onstop = () => finalize(dims);
                recorder.onerror = (ev) => {
                    if (meta) meta.textContent = '录制出错: ' + (ev.error?.message || '未知错误');
                };
                recorder.start(1000);

                const videoTrack = captureStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.addEventListener('ended', () => {
                        if (recorder && recorder.state !== 'inactive') stop();
                    }, { once: true });
                }

                setRecordingUi();
                startMeter(recordingStream);
                if (audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume().catch(() => {});
                }

                startTime = Date.now();
                pausedTotal = 0;
                if (timerEl) timerEl.textContent = '00:00';
                clearInterval(timerInterval);
                timerInterval = setInterval(updateTimer, 250);
            } catch (e) {
                cleanupStreams();
                preview.srcObject = null;
                preview.classList.add('hidden');
                const msg = e.name === 'NotAllowedError' || e.name === 'AbortError'
                    ? '已取消或未授权录制'
                    : `录制失败: ${e.message || e.name || '未知错误'}`;
                setIdleUi(msg);
            }
        }

        function togglePause() {
            if (!recorder) return;
            if (recorder.state === 'recording') {
                recorder.pause();
                pauseStart = Date.now();
                liveBadge?.classList.add('paused');
                pauseMask?.classList.remove('hidden');
                pauseBtn.textContent = '继续';
                if (meta) meta.textContent = '已暂停';
            } else if (recorder.state === 'paused') {
                recorder.resume();
                pausedTotal += Date.now() - pauseStart;
                liveBadge?.classList.remove('paused');
                pauseMask?.classList.add('hidden');
                pauseBtn.textContent = '暂停';
                if (meta) meta.textContent = '录制中…';
            }
        }

        function stop() {
            if (recorder && recorder.state !== 'inactive') recorder.stop();
        }

        function finalize(dims) {
            clearInterval(timerInterval);
            const duration = (Date.now() - startTime - pausedTotal) / 1000;
            cleanupStreams();

            resultBlob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
            chunks = [];
            if (resultUrl && !history.some((h) => h.url === resultUrl)) {
                URL.revokeObjectURL(resultUrl);
            }
            resultUrl = URL.createObjectURL(resultBlob);
            const prefix = (prefixInput?.value || state.prefix || 'recording').trim() || 'recording';
            const name = ImageUtils.generateFilename(prefix, 'webm');
            resultMeta = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                blob: resultBlob,
                url: resultUrl,
                name,
                duration,
                size: resultBlob.size,
                width: dims?.width || 0,
                height: dims?.height || 0,
                at: Date.now()
            };
            pushHistory(resultMeta);

            preview.srcObject = null;
            preview.classList.add('hidden');
            emptyEl?.classList.add('hidden');
            playback.src = resultUrl;
            playback.classList.remove('hidden');
            liveBadge?.classList.add('hidden');
            pauseMask?.classList.add('hidden');

            const dim = resultMeta.width && resultMeta.height
                ? ` · ${resultMeta.width}×${resultMeta.height}`
                : '';
            if (meta) {
                meta.textContent = `录制完成 · ${MediaUtils.formatDuration(duration)} · ${ImageUtils.formatFileSize(resultBlob.size)}${dim}`;
            }

            recorder = null;
            syncActionButtons('done');
            sourceSeg?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
            if (cameraSelect) cameraSelect.disabled = false;
        }

        function resetResult() {
            if (resultUrl && !history.some((h) => h.url === resultUrl)) {
                URL.revokeObjectURL(resultUrl);
            }
            resultBlob = null;
            resultUrl = '';
            resultMeta = null;
            playback.classList.add('hidden');
            playback.removeAttribute('src');
            emptyEl?.classList.remove('hidden');
            syncActionButtons('idle');
            if (meta) meta.textContent = '待机';
        }

        // --- bindings ---
        sourceSeg?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-source]');
            if (!btn || btn.disabled) return;
            state.source = btn.dataset.source === 'camera' ? 'camera' : 'screen';
            persist('mediaRecSource', state.source);
            syncSourceUi();
            if (state.source === 'camera') refreshCameras();
        });

        cameraSelect?.addEventListener('change', () => {
            state.cameraId = cameraSelect.value || '';
        });

        micCheck?.addEventListener('change', () => {
            state.mic = micCheck.checked;
            persist('mediaRecMic', state.mic);
        });
        sysAudioCheck?.addEventListener('change', () => {
            state.sysAudio = sysAudioCheck.checked;
            persist('mediaRecSysAudio', state.sysAudio);
        });

        resRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-res]');
            if (!btn) return;
            state.maxRes = Number(btn.dataset.res) || 0;
            persist('mediaRecMaxRes', state.maxRes);
            setChipGroup(resRoot, 'res', state.maxRes);
        });
        fpsRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-fps]');
            if (!btn) return;
            state.fps = Number(btn.dataset.fps) || 30;
            persist('mediaRecFps', state.fps);
            setChipGroup(fpsRoot, 'fps', state.fps);
        });
        brRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-br]');
            if (!btn) return;
            state.bitrate = btn.dataset.br || 'mid';
            persist('mediaRecBitrate', state.bitrate);
            setChipGroup(brRoot, 'br', state.bitrate);
        });

        prefixInput?.addEventListener('input', () => {
            state.prefix = prefixInput.value;
            persist('mediaRecFilenamePrefix', state.prefix);
        });

        startBtn.addEventListener('click', start);
        pauseBtn.addEventListener('click', togglePause);
        stopBtn.addEventListener('click', stop);
        downloadBtn.addEventListener('click', () => {
            if (!resultBlob) return;
            const name = resultMeta?.name
                || ImageUtils.generateFilename(prefixInput?.value || 'recording', 'webm');
            ImageUtils.downloadBlob(resultBlob, name);
        });
        againBtn.addEventListener('click', () => {
            resetResult();
        });

        panel.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
                    togglePause();
                }
            } else if (e.code === 'Escape') {
                if (recorder && recorder.state !== 'inactive') {
                    e.preventDefault();
                    stop();
                }
            }
        });

        async function loadSettings() {
            if (typeof Settings === 'undefined') return;
            try {
                const s = await Settings.load();
                if (s.mediaRecSource === 'camera' || s.mediaRecSource === 'screen') state.source = s.mediaRecSource;
                if (typeof s.mediaRecMic === 'boolean') state.mic = s.mediaRecMic;
                if (typeof s.mediaRecSysAudio === 'boolean') state.sysAudio = s.mediaRecSysAudio;
                if (Number.isFinite(s.mediaRecMaxRes)) state.maxRes = s.mediaRecMaxRes;
                if (Number.isFinite(s.mediaRecFps)) state.fps = s.mediaRecFps;
                if (s.mediaRecBitrate) state.bitrate = s.mediaRecBitrate;
                if (typeof s.mediaRecFilenamePrefix === 'string') state.prefix = s.mediaRecFilenamePrefix;
            } catch (_) { /* ignore */ }
        }

        loadSettings().then(() => {
            syncFormFromState();
            renderHistory();
            if (state.source === 'camera') refreshCameras();
        });
    }

    DevKit.MediaTools.record = { init: initRecord };
})();
