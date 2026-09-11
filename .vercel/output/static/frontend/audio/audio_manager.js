// frontend/audio/audio_manager.js
// BGM（画面/コースごとの切替・クロスフェード）とSE（コイン取得・スター発動）の再生を一元管理する。
// 音声ファイルは music/ 配下（このリポジトリ直下）を参照する。

const BGM_SOURCES = {
  menu: 'music/BGM_menu.mp3',
  editor: 'music/BGM_editor.mp3',
  course1: 'music/BGM_1st_course.mp3',
  final_lap: 'music/BGM_final_lap.mp3',
  goal_finish: 'music/BGM_goal_finish.mp3'
};

const SFX_SOURCES = {
  coin: 'music/SE_get_coin.wav',
  star: 'music/SE_star.mp3'
};

const BGM_VOLUME = 0.45;
const SFX_VOLUME = 0.7;
const FADE_MS = 400;

function fade(audio, from, to, ms) {
  return new Promise(resolve => {
    const steps = Math.max(1, Math.round(ms / 50));
    let step = 0;
    audio.volume = from;
    const timer = setInterval(() => {
      step += 1;
      audio.volume = from + (to - from) * (step / steps);
      if (step >= steps) {
        clearInterval(timer);
        audio.volume = to;
        resolve();
      }
    }, ms / steps);
  });
}

export const AudioManager = {
  _bgmAudio: null,
  _bgmKey: null,
  _fadeToken: 0,

  // レース中のコースBGM等、明示的に呼ばれない限り自動再生しない（各UIの表示イベントから呼び出す想定）。
  async playBgm(key) {
    const src = BGM_SOURCES[key];
    if (!src) return;
    if (this._bgmKey === key && this._bgmAudio && !this._bgmAudio.paused) return; // 既に再生中なら何もしない

    const token = ++this._fadeToken;
    const prevAudio = this._bgmAudio;
    if (prevAudio) {
      await fade(prevAudio, prevAudio.volume, 0, FADE_MS);
      if (token !== this._fadeToken) return; // 別のBGM切替が割り込んだ場合は中断
      prevAudio.pause();
    }

    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0;
    this._bgmAudio = audio;
    this._bgmKey = key;
    audio.play().catch(() => {}); // 自動再生ポリシーで拒否されても無視（ユーザー操作後の呼び出しのみ想定）
    await fade(audio, 0, BGM_VOLUME, FADE_MS);
  },

  async stopBgm() {
    const token = ++this._fadeToken;
    const audio = this._bgmAudio;
    if (!audio) return;
    await fade(audio, audio.volume, 0, FADE_MS);
    if (token !== this._fadeToken) return;
    audio.pause();
    this._bgmAudio = null;
    this._bgmKey = null;
  },

  // 効果音は重複再生（連続コイン取得など）に対応するため、呼び出しごとに新しいAudioインスタンスを使う。
  playSfx(key, { maxDurationMs } = {}) {
    const src = SFX_SOURCES[key];
    if (!src) return;
    const audio = new Audio(src);
    audio.volume = SFX_VOLUME;
    audio.play().catch(() => {});
    if (maxDurationMs) {
      setTimeout(() => {
        audio.pause();
      }, maxDurationMs);
    }
    return audio;
  }
};
