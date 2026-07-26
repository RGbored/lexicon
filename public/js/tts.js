'use strict';

/**
 * Thin wrapper over the Web Speech API supporting Kannada (kn-IN), Japanese (ja-JP), and German (de-DE).
 * Automatically selects the appropriate voice based on target language.
 */
const TTS = (() => {
  const synth = window.speechSynthesis;
  let voices = [];

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices();
  }

  if (synth) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices); // voices load async
  }

  function getVoiceForLang(langCode) {
    if (!langCode) return null;
    return voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(langCode.toLowerCase())) || null;
  }

  function speak(text) {
    if (!synth || !text) return;
    synth.cancel();
    
    const activeLang = Data.progressData()?.settings?.targetLang || 'kn';
    const u = new SpeechSynthesisUtterance(text);
    
    let voiceLang = 'kn-IN';
    if (activeLang === 'ja') voiceLang = 'ja-JP';
    else if (activeLang === 'de') voiceLang = 'de-DE';
    
    u.lang = voiceLang;
    const voice = getVoiceForLang(activeLang);
    if (voice) u.voice = voice;
    
    u.rate = activeLang === 'kn' ? 0.85 : 0.95;
    synth.speak(u);
  }

  return { speak };
})();
