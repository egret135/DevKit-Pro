// Media Tools - Media Info Viewer (Layout A)
// Deep track details come from mediainfo.js in a sandboxed iframe (MV3 CSP).
// Parent keeps the File and serves byte chunks on demand via postMessage.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    const SKIP_FIELDS = new Set([
        '@type', 'extra', 'UniqueID', 'ID', 'StreamOrder', 'Count', 'StreamCount',
        'VideoCount', 'AudioCount', 'TextCount', 'MenuCount', 'ImageCount'
    ]);

    const TRACK_TYPE_LABELS = {
        General: '容器',
        Video: '视频轨',
        Audio: '音频轨',
        Text: '字幕轨',
        Image: '图像',
        Menu: '章节',
        Other: '其他'
    };

    const PRIMARY_TYPES = new Set(['General', 'Video', 'Audio', 'Text']);

    const FIELD_LABELS = {
        Format: '格式',
        'Format/Info': '格式说明',
        'Format_Commercial': '商业名称',
        Format_Profile: '格式配置',
        Format_Level: '格式级别',
        CodecID: '编解码 ID',
        'CodecID/Info': '编解码说明',
        Duration: '时长',
        BitRate: '码率',
        'OverallBitRate': '总码率',
        'BitRate_Mode': '码率模式',
        Width: '宽度',
        Height: '高度',
        'DisplayAspectRatio': '显示比例',
        FrameRate: '帧率',
        FrameRate_Mode: '帧率模式',
        FrameCount: '帧数',
        'Channel(s)': '声道',
        ChannelLayout: '声道布局',
        SamplingRate: '采样率',
        BitDepth: '位深',
        StreamSize: '流大小',
        FileSize: '文件大小',
        Encoded_Date: '编码日期',
        Tagged_Date: '标记日期',
        Encoded_Application: '编码应用',
        Encoded_Library: '编码库',
        Language: '语言',
        Title: '标题',
        Album: '专辑',
        Performer: '表演者',
        Track: '曲目',
        Recorded_Date: '录制日期',
        ColorSpace: '色彩空间',
        ChromaSubsampling: '色度抽样',
        ScanType: '扫描类型',
        Rotation: '旋转',
        Delay: '延迟',
        'Video_Delay': '视频延迟',
        Compression_Mode: '压缩模式',
        'InternetMediaType': 'MIME 类型',
        FileExtension: '扩展名',
        File_Modified_Date: '修改日期',
        'File_Modified_Date_Local': '本地修改日期'
    };

    // ---- Sandbox bridge ----
    let sandboxReadyPromise = null;
    let analyzeSeq = 0;
    let currentFile = null;
    const pendingAnalyses = new Map();

    function initSandboxBridge() {
        if (sandboxReadyPromise) return sandboxReadyPromise;
        const iframe = document.getElementById('mediaInfoSandbox');

        sandboxReadyPromise = new Promise((resolve, reject) => {
            let settled = false;

            window.addEventListener('message', async (event) => {
                if (!iframe.contentWindow || event.source !== iframe.contentWindow) return;
                const msg = event.data;
                if (!msg || typeof msg !== 'object') return;

                if (msg.type === 'mi-ready') {
                    if (settled) return;
                    settled = true;
                    try {
                        const resp = await fetch('lib/mediainfo/MediaInfoModule.wasm');
                        const buf = await resp.arrayBuffer();
                        iframe.contentWindow.postMessage({ type: 'mi-init', wasmBuffer: buf }, '*', [buf]);
                        resolve(iframe.contentWindow);
                    } catch (e) {
                        reject(new Error('加载 MediaInfo WASM 失败: ' + e.message));
                    }
                } else if (msg.type === 'mi-read') {
                    if (!currentFile) return;
                    try {
                        const buf = await currentFile
                            .slice(msg.offset, msg.offset + msg.size)
                            .arrayBuffer();
                        iframe.contentWindow.postMessage(
                            { type: 'mi-chunk', requestId: msg.requestId, buffer: buf }, '*', [buf]
                        );
                    } catch (e) {
                        iframe.contentWindow.postMessage(
                            { type: 'mi-chunk', requestId: msg.requestId, error: e.message }, '*'
                        );
                    }
                } else if (msg.type === 'mi-result' || msg.type === 'mi-error') {
                    const pending = pendingAnalyses.get(msg.id);
                    if (!pending) return;
                    pendingAnalyses.delete(msg.id);
                    if (msg.type === 'mi-result') pending.resolve(msg.result);
                    else pending.reject(new Error(msg.message));
                }
            });

            const pingTimer = setInterval(() => {
                if (settled) {
                    clearInterval(pingTimer);
                    return;
                }
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'mi-ping' }, '*');
                }
            }, 200);
            setTimeout(() => {
                clearInterval(pingTimer);
                if (!settled) {
                    settled = true;
                    reject(new Error('MediaInfo 沙箱初始化超时'));
                }
            }, 10000);
        });
        return sandboxReadyPromise;
    }

    async function analyzeDeep(file) {
        const sandboxWindow = await initSandboxBridge();
        currentFile = file;
        const id = ++analyzeSeq;
        return new Promise((resolve, reject) => {
            pendingAnalyses.set(id, { resolve, reject });
            sandboxWindow.postMessage({ type: 'mi-analyze', id, size: file.size }, '*');
        });
    }

    // ---- Helpers ----
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function fieldLabel(key) {
        return FIELD_LABELS[key] || key;
    }

    function trackBucket(type) {
        if (PRIMARY_TYPES.has(type)) return type;
        return 'Other';
    }

    function firstTrack(tracks, type) {
        return (tracks || []).find((t) => t && t['@type'] === type) || null;
    }

    function pick(track, keys) {
        if (!track) return '';
        for (const k of keys) {
            const v = track[k];
            if (v != null && v !== '' && typeof v !== 'object') return String(v);
        }
        return '';
    }

    function buildSummaryItems(tracks, file) {
        const general = firstTrack(tracks, 'General');
        const video = firstTrack(tracks, 'Video');
        const audio = firstTrack(tracks, 'Audio');
        const items = [];

        const push = (label, value) => {
            if (value) items.push({ label, value });
        };

        push('文件', file ? ImageUtils.formatFileSize(file.size) : '');
        push('时长', pick(general, ['Duration']) || pick(video, ['Duration']) || pick(audio, ['Duration']));
        push('容器', pick(general, ['Format', 'Format/Info']));
        if (video) {
            const w = pick(video, ['Width']);
            const h = pick(video, ['Height']);
            push('分辨率', w && h ? `${w}×${h}` : (w || h));
            push('帧率', pick(video, ['FrameRate']));
            push('视频编码', pick(video, ['Format', 'CodecID']));
            push('视频码率', pick(video, ['BitRate']));
        }
        if (audio) {
            push('音频编码', pick(audio, ['Format', 'CodecID']));
            push('采样率', pick(audio, ['SamplingRate']));
            push('声道', pick(audio, ['Channel(s)', 'ChannelLayout']));
            push('音频码率', pick(audio, ['BitRate']));
        }
        push('总码率', pick(general, ['OverallBitRate', 'BitRate']));
        return items;
    }

    function summaryText(items, file) {
        const lines = [];
        if (file) {
            lines.push(`文件: ${file.name}`);
            lines.push(`大小: ${ImageUtils.formatFileSize(file.size)}`);
            if (file.type) lines.push(`类型: ${file.type}`);
        }
        items.forEach((it) => lines.push(`${it.label}: ${it.value}`));
        return lines.join('\n');
    }

    function trackFields(track) {
        const out = [];
        Object.keys(track).forEach((key) => {
            if (SKIP_FIELDS.has(key)) return;
            const value = track[key];
            if (value === null || value === undefined || typeof value === 'object') return;
            out.push({ key, label: fieldLabel(key), value: String(value) });
        });
        return out;
    }

    function matchesQuery(field, q) {
        if (!q) return true;
        const needle = q.toLowerCase();
        return (
            field.label.toLowerCase().includes(needle) ||
            field.key.toLowerCase().includes(needle) ||
            field.value.toLowerCase().includes(needle)
        );
    }

    function filterTracks(tracks, filter) {
        if (!filter || filter === 'all') return tracks.slice();
        return tracks.filter((t) => trackBucket(t['@type']) === filter);
    }

    function setChipGroup(root, attr, value) {
        root?.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
            const on = String(btn.dataset[attr]) === String(value);
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
        });
    }

    async function copyText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    // ---- UI ----
    function initInfo() {
        const panel = document.getElementById('mediaPanelInfo');
        const dropzone = document.getElementById('mediaInfoDropzone');
        if (!panel || !dropzone) return;

        const $ = (id) => document.getElementById(id);
        const status = $('mediaMiStatus');
        const work = $('mediaMiWork');
        const videoEl = $('mediaMiVideo');
        const audioEl = $('mediaMiAudio');
        const previewEmpty = $('mediaMiPreviewEmpty');
        const srcMeta = $('mediaMiSrcMeta');
        const empty = $('mediaMiEmpty');
        const result = $('mediaMiResult');
        const summaryEl = $('mediaMiSummary');
        const progressWrap = $('mediaMiProgress');
        const progressText = $('mediaMiProgressText');
        const trackFilterRoot = $('mediaMiTrackFilter');
        const searchInput = $('mediaMiSearch');
        const table = $('mediaInfoTable');
        const detailMeta = $('mediaMiDetailMeta');
        const copySummaryBtn = $('mediaMiCopySummaryBtn');
        const copyJsonBtn = $('mediaMiCopyJsonBtn');
        const clearBtn = $('mediaMiClearBtn');
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');

        const defaults = (typeof Settings !== 'undefined' && Settings.defaults) ? Settings.defaults : {};
        let trackFilter = defaults.mediaMiTrackFilter || 'all';
        if (!['all', 'General', 'Video', 'Audio', 'Text', 'Other'].includes(trackFilter)) {
            trackFilter = 'all';
        }

        let latestFileToken = 0;
        let srcFile = null;
        let previewUrl = '';
        let lastResult = null;
        let lastTracks = [];
        let lastSummaryItems = [];
        let searchQuery = '';

        function persist(key, value) {
            if (typeof Settings !== 'undefined') Settings.set(key, value);
        }

        function revokePreview() {
            if (videoEl) {
                try { videoEl.pause(); } catch (_) { /* ignore */ }
                videoEl.removeAttribute('src');
                videoEl.load?.();
                videoEl.classList.add('hidden');
            }
            if (audioEl) {
                try { audioEl.pause(); } catch (_) { /* ignore */ }
                audioEl.removeAttribute('src');
                audioEl.load?.();
                audioEl.classList.add('hidden');
            }
            if (previewUrl) {
                try { URL.revokeObjectURL(previewUrl); } catch (_) { /* ignore */ }
                previewUrl = '';
            }
            previewEmpty?.classList.remove('hidden');
        }

        function showPreview(file) {
            revokePreview();
            work?.classList.remove('hidden');
            const type = file.type || '';
            previewUrl = URL.createObjectURL(file);
            let shown = false;
            if (type.startsWith('video/') && videoEl) {
                videoEl.src = previewUrl;
                videoEl.classList.remove('hidden');
                previewEmpty?.classList.add('hidden');
                shown = true;
            } else if (type.startsWith('audio/') && audioEl) {
                audioEl.src = previewUrl;
                audioEl.classList.remove('hidden');
                previewEmpty?.classList.add('hidden');
                shown = true;
            }
            if (!shown) previewEmpty?.classList.remove('hidden');
            if (srcMeta) {
                srcMeta.textContent = `${file.name} · ${file.type || '未知类型'} · ${ImageUtils.formatFileSize(file.size)}`;
            }
        }

        function setAnalyzing(on, text) {
            if (!progressWrap) return;
            progressWrap.classList.toggle('hidden', !on);
            if (progressText) progressText.textContent = text || '解析中…';
        }

        function renderSummary(items) {
            if (!summaryEl) return;
            if (!items.length) {
                summaryEl.innerHTML = '';
                summaryEl.classList.add('hidden');
                return;
            }
            summaryEl.classList.remove('hidden');
            summaryEl.innerHTML = items.map((it) => (
                `<div class="mi-stat"><span class="mi-stat-label">${escapeHtml(it.label)}</span>` +
                `<span class="mi-stat-value">${escapeHtml(it.value)}</span></div>`
            )).join('');
        }

        function renderTable() {
            if (!table) return;
            const filtered = filterTracks(lastTracks, trackFilter);
            const rows = [];
            let fieldCount = 0;

            filtered.forEach((track) => {
                const type = track['@type'] || 'Other';
                const fields = trackFields(track).filter((f) => matchesQuery(f, searchQuery));
                if (!fields.length && searchQuery) return;
                const label = TRACK_TYPE_LABELS[type] || TRACK_TYPE_LABELS[trackBucket(type)] || type;
                rows.push(`<tr class="mi-track-head"><td colspan="2">${escapeHtml(label)}</td></tr>`);
                if (!fields.length) {
                    rows.push('<tr><td colspan="2" class="mi-table-muted">无字段</td></tr>');
                    return;
                }
                fields.forEach((f) => {
                    fieldCount += 1;
                    rows.push(
                        `<tr><td title="${escapeHtml(f.key)}">${escapeHtml(f.label)}</td>` +
                        `<td>${escapeHtml(f.value)}</td></tr>`
                    );
                });
            });

            if (!rows.length) {
                table.innerHTML = `<tr><td colspan="2" class="mi-table-muted">${
                    searchQuery ? '无匹配字段' : '未解析出媒体轨道信息'
                }</td></tr>`;
            } else {
                table.innerHTML = rows.join('');
            }

            if (detailMeta) {
                detailMeta.textContent = lastTracks.length
                    ? `${lastTracks.length} 轨 · ${fieldCount} 字段`
                    : '尚未解析';
            }
        }

        function showResultUi(hasData) {
            empty?.classList.toggle('hidden', hasData);
            result?.classList.toggle('hidden', !hasData);
        }

        function resetUi() {
            latestFileToken += 1;
            srcFile = null;
            lastResult = null;
            lastTracks = [];
            lastSummaryItems = [];
            currentFile = null;
            revokePreview();
            work?.classList.add('hidden');
            dropzone.classList.remove('has-file');
            if (hintSub) hintSub.textContent = '查看时长、分辨率、编码、码率、声道等';
            if (status) status.textContent = '拖入音视频文件';
            if (searchInput) searchInput.value = '';
            searchQuery = '';
            setAnalyzing(false);
            renderSummary([]);
            if (table) table.innerHTML = '';
            if (detailMeta) detailMeta.textContent = '尚未解析';
            showResultUi(false);
        }

        function flashStatus(msg) {
            if (!status) return;
            const prev = status.textContent;
            status.textContent = msg;
            setTimeout(() => {
                if (status.textContent === msg) status.textContent = prev;
            }, 1600);
        }

        setChipGroup(trackFilterRoot, 'track', trackFilter);

        trackFilterRoot?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-track]');
            if (!btn) return;
            trackFilter = btn.dataset.track || 'all';
            setChipGroup(trackFilterRoot, 'track', trackFilter);
            persist('mediaMiTrackFilter', trackFilter);
            renderTable();
        });

        searchInput?.addEventListener('input', () => {
            searchQuery = (searchInput.value || '').trim();
            renderTable();
        });

        copySummaryBtn?.addEventListener('click', async () => {
            if (!lastSummaryItems.length && !srcFile) {
                flashStatus('暂无摘要可复制');
                return;
            }
            try {
                await copyText(summaryText(lastSummaryItems, srcFile));
                flashStatus('摘要已复制');
            } catch (_) {
                flashStatus('复制失败');
            }
        });

        copyJsonBtn?.addEventListener('click', async () => {
            if (!lastResult) {
                flashStatus('暂无 JSON 可复制');
                return;
            }
            try {
                await copyText(JSON.stringify(lastResult, null, 2));
                flashStatus('JSON 已复制');
            } catch (_) {
                flashStatus('复制失败');
            }
        });

        clearBtn?.addEventListener('click', () => resetUi());

        ImageUtils.createDropZone(dropzone, {
            accept: 'video/*,audio/*',
            enablePaste: false,
            onFile: async (file) => {
                if (!file) return;
                const token = ++latestFileToken;
                srcFile = file;
                dropzone.classList.add('has-file');
                if (hintSub) hintSub.textContent = `已加载: ${file.name}`;
                if (status) status.textContent = '解析中…';
                showPreview(file);
                showResultUi(true);
                lastResult = null;
                lastTracks = [];
                lastSummaryItems = [];
                renderSummary([]);
                if (table) table.innerHTML = '<tr><td colspan="2" class="mi-table-muted">解析中…</td></tr>';
                if (detailMeta) detailMeta.textContent = '解析中…';
                setAnalyzing(true, '解析中…');

                try {
                    const data = await analyzeDeep(file);
                    if (token !== latestFileToken) return;
                    lastResult = data;
                    lastTracks = (data && data.media && data.media.track) || [];
                    if (!Array.isArray(lastTracks)) lastTracks = lastTracks ? [lastTracks] : [];
                    lastSummaryItems = buildSummaryItems(lastTracks, file);
                    renderSummary(lastSummaryItems);
                    renderTable();
                    setAnalyzing(false);
                    if (status) status.textContent = lastTracks.length ? '解析完成' : '无轨道信息';
                } catch (e) {
                    if (token !== latestFileToken) return;
                    setAnalyzing(false);
                    lastTracks = [];
                    lastSummaryItems = [];
                    renderSummary([]);
                    if (table) {
                        table.innerHTML = `<tr><td colspan="2">解析失败: ${escapeHtml(e.message)}</td></tr>`;
                    }
                    if (detailMeta) detailMeta.textContent = '解析失败';
                    if (status) status.textContent = '解析失败';
                }
            }
        });

        if (typeof Settings !== 'undefined') {
            Settings.load().then((s) => {
                if (!s) return;
                if (['all', 'General', 'Video', 'Audio', 'Text', 'Other'].includes(s.mediaMiTrackFilter)) {
                    trackFilter = s.mediaMiTrackFilter;
                    setChipGroup(trackFilterRoot, 'track', trackFilter);
                    renderTable();
                }
            }).catch(() => {});
        }

        DevKit.MediaTools.info.deactivate = () => {
            if (videoEl && !videoEl.paused) {
                try { videoEl.pause(); } catch (_) { /* ignore */ }
            }
            if (audioEl && !audioEl.paused) {
                try { audioEl.pause(); } catch (_) { /* ignore */ }
            }
        };
    }

    DevKit.MediaTools.info = { init: initInfo, deactivate() {} };
})();
