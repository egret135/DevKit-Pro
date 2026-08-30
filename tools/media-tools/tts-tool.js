// Media Tools - Text To Speech
// Thin UI over the Web Speech API (speechSynthesis): voice picker plus
// rate/pitch/volume sliders. Playback only - the API offers no audio export.

(function () {
    'use strict';
    const DevKit = window.DevKit = window.DevKit || {};
    DevKit.MediaTools = DevKit.MediaTools || {};

    function initTts() {
        const textInput = document.getElementById('mediaTtsText');
        if (!textInput) return;
        const voiceSelect = document.getElementById('mediaTtsVoice');
        const rateInput = document.getElementById('mediaTtsRate');
        const rateValue = document.getElementById('mediaTtsRateValue');
        const pitchInput = document.getElementById('mediaTtsPitch');
        const pitchValue = document.getElementById('mediaTtsPitchValue');
        const volumeInput = document.getElementById('mediaTtsVolume');
        const volumeValue = document.getElementById('mediaTtsVolumeValue');
        const playBtn = document.getElementById('mediaTtsPlayBtn');
        const pauseBtn = document.getElementById('mediaTtsPauseBtn');
        const stopBtn = document.getElementById('mediaTtsStopBtn');
        const status = document.getElementById('mediaTtsStatus');

        let voices = [];

        function loadVoices() {
            voices = speechSynthesis.getVoices();
            if (!voices.length) return;
            // Chinese voices first, then the rest alphabetically by language.
            voices.sort((a, b) => {
                const aZh = a.lang.startsWith('zh') ? 0 : 1;
                const bZh = b.lang.startsWith('zh') ? 0 : 1;
                return aZh - bZh || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name);
            });
            voiceSelect.innerHTML = voices
                .map((v, i) => `<option value="${i}">${v.name} (${v.lang})${v.localService ? '' : ' · 在线'}</option>`)
                .join('');
        }
        loadVoices();
        speechSynthesis.addEventListener('voiceschanged', loadVoices);

        rateInput.addEventListener('input', () => { rateValue.textContent = `${Number(rateInput.value).toFixed(1)}x`; });
        pitchInput.addEventListener('input', () => { pitchValue.textContent = Number(pitchInput.value).toFixed(1); });
        volumeInput.addEventListener('input', () => { volumeValue.textContent = `${Math.round(volumeInput.value * 100)}%`; });

        function resetUi() {
            playBtn.disabled = false;
            pauseBtn.disabled = true;
            pauseBtn.textContent = '暂停';
            stopBtn.disabled = true;
            status.textContent = '';
        }

        playBtn.addEventListener('click', () => {
            const text = textInput.value.trim();
            if (!text) {
                status.textContent = '请输入要朗读的文本';
                return;
            }
            speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            const voice = voices[Number(voiceSelect.value)];
            if (voice) utterance.voice = voice;
            utterance.rate = Number(rateInput.value);
            utterance.pitch = Number(pitchInput.value);
            utterance.volume = Number(volumeInput.value);
            utterance.onend = resetUi;
            utterance.onerror = (e) => {
                if (e.error !== 'canceled' && e.error !== 'interrupted') {
                    status.textContent = `朗读失败: ${e.error}`;
                }
                resetUi();
            };
            speechSynthesis.speak(utterance);
            playBtn.disabled = true;
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
            status.textContent = '朗读中…';
        });

        pauseBtn.addEventListener('click', () => {
            if (speechSynthesis.paused) {
                speechSynthesis.resume();
                pauseBtn.textContent = '暂停';
                status.textContent = '朗读中…';
            } else {
                speechSynthesis.pause();
                pauseBtn.textContent = '继续';
                status.textContent = '已暂停';
            }
        });

        stopBtn.addEventListener('click', () => {
            speechSynthesis.cancel();
            resetUi();
        });
    }

    DevKit.MediaTools.tts = { init: initTts };
})();
