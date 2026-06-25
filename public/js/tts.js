'use strict';

/**
 * Thin wrapper over the Web Speech API for Kannada (kn-IN).
 * On Android Chrome this uses Google's kn-IN voice. Where no Kannada voice
 * exists (e.g. some iOS), speak() is a no-op and hasKannadaVoice() is false.
 * Audio files will later replace this (DESIGN.md §1); call sites stay the same.
 */
const TTS = (() => {
  const synth = window.speechSynthesis;
  let kannadaVoice = null;

  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    kannadaVoice =
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('kn')) || null;
  }

  if (synth) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice); // voices load async
  }

  function hasKannadaVoice() {
    return !!kannadaVoice;
  }

  function speak(text) {
    if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'kn-IN';
    if (kannadaVoice) u.voice = kannadaVoice;
    u.rate = 0.85;
    synth.speak(u);
  }

  return { speak, hasKannadaVoice };
})();
