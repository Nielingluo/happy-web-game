/** Simple audio manager — unlocks on first user gesture. */
(() => {
  "use strict";

  const BASE = "../assets/audio";

  const TRACKS = {
    bgm: { file: "bgm.mp3", loop: true, volume: 0.28 },
    catch: { file: "catch.mp3", volume: 0.55 },
    catchSpecial: { file: "catch_special.mp3", volume: 0.65 },
    miss: { file: "miss_cry.mp3", volume: 0.5 },
    gameover: { file: "gameover.mp3", volume: 0.45 },
    pop: { file: "pop.mp3", volume: 0.35 },
    bark: { file: "bark.mp3", volume: 0.85 },
    hop: { file: "hop.mp3", volume: 0.8 },
    ouch: { file: "ouch.mp3", volume: 0.75 },
    tap: { file: "tap.mp3", volume: 0.3 },
  };

  const pool = {};
  let unlocked = false;
  let muted = false;
  let bgmNode = null;

  function build(key) {
    const cfg = TRACKS[key];
    const audio = new Audio(`${BASE}/${cfg.file}`);
    audio.preload = "auto";
    audio.loop = !!cfg.loop;
    audio.volume = cfg.volume;
    pool[key] = audio;
    return audio;
  }

  function ensure(key) {
    return pool[key] || build(key);
  }

  function preloadAll() {
    Object.keys(TRACKS).forEach(ensure);
  }

  function unlock() {
    unlocked = true;
  }

  function play(key) {
    if (muted || !TRACKS[key]) return null;
    const src = ensure(key);
    if (src.loop) {
      src.currentTime = 0;
      src.play().catch(() => {});
      return src;
    }
    const node = src.cloneNode();
    node.volume = src.volume;
    node.play().catch(() => {});
    return node;
  }

  function playFromGesture(key) {
    if (muted || !TRACKS[key]) return null;
    unlocked = true;
    return play(key);
  }

  function startBgm() {
    if (muted || !unlocked) return;
    stopBgm();
    bgmNode = ensure("bgm");
    bgmNode.currentTime = 0;
    bgmNode.play().catch(() => {});
  }

  function stopBgm() {
    if (bgmNode) {
      bgmNode.pause();
      bgmNode.currentTime = 0;
      bgmNode = null;
    }
  }

  function setMuted(value) {
    muted = value;
    if (muted) stopBgm();
    else if (unlocked && bgmNode) startBgm();
  }

  function isMuted() {
    return muted;
  }

  preloadAll();

  window.GameAudio = { unlock, play, playFromGesture, startBgm, stopBgm, setMuted, isMuted };
})();
