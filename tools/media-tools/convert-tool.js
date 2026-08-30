// Media Tools - Audio Format Conversion
// Decodes any browser-supported audio format via decodeAudioData and re-encodes
// it as WAV (16-bit PCM, built-in encoder) or MP3 (lamejs, vendored locally).

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    function initConvert() {
        const dropzone = document.getElementById('mediaConvDropzone');
        if (!dropzone) return;
        const hintSub = dropzone.querySelector('.img-dropzone-hint-sub');
        const work = document.getElementById('mediaConvWork');
        const meta = document.getElementById('mediaConvMeta');
        const formatSelect = document.getElementById('mediaConvFormat');
        const bitrateWrap = document.getElementById('mediaConvBitrateWrap');
        const bitrateSelect = document.getElementById('mediaConvBitrate');
        const runBtn = document.getElementById('mediaConvRunBtn');
        const status = document.getElementById('mediaConvStatus');
        const resultAudio = document.getElementById('mediaConvResultAudio');
        const resultMeta = document.getElementById('mediaConvResultMeta');
        const downloadBtn = document.getElementById('mediaConvDownloadBtn');

        let audioBuffer = null;
        let srcSize = 0;
        let resultBlob = null;
        let resultUrl = '';

        function resetResult() {
            resultBlob = null;
            resultAudio.classList.add('hidden');
            resultMeta.classList.add('hidden');
            downloadBtn.classList.add('hidden');
            status.textContent = '';
        }

        ImageUtils.createDropZone(dropzone, {
            accept: 'audio/*',
            enablePaste: false,
            onFile: async (file) => {
                try {
                    audioBuffer = await MediaUtils.decodeAudioFile(file);
                    srcSize = file.size;
                    work.classList.remove('hidden');
                    hintSub.textContent = `已加载: ${file.name} · 可再次点击更换音频`;
                    meta.textContent = [
                        MediaUtils.formatDuration(audioBuffer.duration, true),
                        `${audioBuffer.sampleRate} Hz`,
                        `${audioBuffer.numberOfChannels} 声道`,
                        ImageUtils.formatFileSize(file.size)
                    ].join(' · ');
                    resetResult();
                } catch (e) {
                    hintSub.textContent = e.message;
                }
            }
        });

        function syncBitrateVisibility() {
            bitrateWrap.classList.toggle('hidden', formatSelect.value !== 'mp3');
        }
        formatSelect.addEventListener('change', syncBitrateVisibility);
        syncBitrateVisibility();

        runBtn.addEventListener('click', async () => {
            if (!audioBuffer) return;
            const format = formatSelect.value;
            runBtn.disabled = true;
            status.textContent = '转换中…';
            // Yield a frame so the status text paints before the synchronous
            // (potentially long) encode blocks the main thread.
            await new Promise(r => setTimeout(r, 30));

            try {
                resultBlob = format === 'mp3'
                    ? MediaUtils.audioBufferToMp3Blob(audioBuffer, 0, audioBuffer.duration, Number(bitrateSelect.value))
                    : MediaUtils.audioBufferToWavBlob(audioBuffer);

                if (resultUrl) URL.revokeObjectURL(resultUrl);
                resultUrl = URL.createObjectURL(resultBlob);
                resultAudio.src = resultUrl;
                resultAudio.classList.remove('hidden');

                const delta = srcSize > 0
                    ? `（原文件 ${ImageUtils.formatFileSize(srcSize)}）`
                    : '';
                resultMeta.textContent = `${format.toUpperCase()} · ${ImageUtils.formatFileSize(resultBlob.size)} ${delta}`;
                resultMeta.classList.remove('hidden');
                downloadBtn.classList.remove('hidden');
                status.textContent = '完成';
            } catch (e) {
                status.textContent = '转换失败: ' + e.message;
            } finally {
                runBtn.disabled = false;
            }
        });

        downloadBtn.addEventListener('click', () => {
            if (!resultBlob) return;
            const ext = formatSelect.value === 'mp3' ? 'mp3' : 'wav';
            ImageUtils.downloadBlob(resultBlob, ImageUtils.generateFilename('audio', ext));
        });
    }

    DevKit.MediaTools.convert = { init: initConvert };
})();
