/**
 * ANORAK - Voice & Speech Recognition Module
 * Captura rápida de áudio e transcrição de ideias direto no HUD
 */

export class AnorakVoice {
  constructor() {
    this.recognition = null;
    this.isRecording = false;
    this.onTranscriptCallback = null;
    this.onErrorCallback = null;
    this.onStateChangeCallback = null;

    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'pt-BR';

      this.recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        if (this.onTranscriptCallback) {
          this.onTranscriptCallback(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Erro de reconhecimento de voz:', event.error);
        if (this.onErrorCallback) {
          this.onErrorCallback(event.error);
        }
        this.stop();
      };

      this.recognition.onend = () => {
        this.isRecording = false;
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback(false);
        }
      };
    } else {
      console.warn('Web Speech API não suportada neste navegador.');
    }
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  start(onTranscript, onError, onStateChange) {
    if (!this.isSupported()) {
      if (onError) onError('Reconhecimento de voz não suportado neste navegador. Use digitação direta.');
      return false;
    }

    this.onTranscriptCallback = onTranscript;
    this.onErrorCallback = onError;
    this.onStateChangeCallback = onStateChange;

    try {
      this.recognition.start();
      this.isRecording = true;
      if (this.onStateChangeCallback) this.onStateChangeCallback(true);
      return true;
    } catch (e) {
      console.error('Falha ao iniciar microfone:', e);
      return false;
    }
  }

  stop() {
    if (this.recognition && this.isRecording) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignora erro se já parou
      }
    }
    this.isRecording = false;
    if (this.onStateChangeCallback) this.onStateChangeCallback(false);
  }

  toggle(onTranscript, onError, onStateChange) {
    if (this.isRecording) {
      this.stop();
      return false;
    } else {
      return this.start(onTranscript, onError, onStateChange);
    }
  }
}

export const voiceRecorder = new AnorakVoice();
