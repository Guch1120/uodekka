// frontend/audio/audio_manager.js
// BGM（画面/コースごとの切替・クロスフェード）とSE（コイン取得・スター発動）の再生を一元管理する。
// 音声ファイルは music/ 配下（このリポジトリ直下）を参照する。
// 音量・ミュート設定はlocalStorageに保存し、設定画面（SettingsModal）から変更できる。

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

const DEFAULT_BGM_VOLUME = 0.45;
const DEFAULT_SFX_VOLUME = 0.7;
const FADE_MS = 400;

const STORAGE_KEYS = {
  bgmVolume: 'kart_bgm_volume',
  sfxVolume: 'kart_sfx_volume',
  bgmMuted: 'kart_bgm_muted',
  sfxMuted: 'kart_sfx_muted'
};

function readVolume(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const val = parseFloat(raw);
    return Number.isFinite(val) ? Math.min(1, Math.max(0, val)) : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
}

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

  _bgmVolume: readVolume(STORAGE_KEYS.bgmVolume, DEFAULT_BGM_VOLUME),
  _sfxVolume: readVolume(STORAGE_KEYS.sfxVolume, DEFAULT_SFX_VOLUME),
  _bgmMuted: readBool(STORAGE_KEYS.bgmMuted, false),
  _sfxMuted: readBool(STORAGE_KEYS.sfxMuted, false),

  get effectiveBgmVolume() {
    return this._bgmMuted ? 0 : this._bgmVolume;
  },
  get effectiveSfxVolume() {
    return this._sfxMuted ? 0 : this._sfxVolume;
  },

  getSettings() {
    return {
      bgmVolume: this._bgmVolume,
      sfxVolume: this._sfxVolume,
      bgmMuted: this._bgmMuted,
      sfxMuted: this._sfxMuted
    };
  },

  setBgmVolume(value) {
    this._bgmVolume = Math.min(1, Math.max(0, value));
    try { localStorage.setItem(STORAGE_KEYS.bgmVolume, String(this._bgmVolume)); } catch {}
    if (this._bgmAudio) this._bgmAudio.volume = this.effectiveBgmVolume;
  },

  setSfxVolume(value) {
    this._sfxVolume = Math.min(1, Math.max(0, value));
    try { localStorage.setItem(STORAGE_KEYS.sfxVolume, String(this._sfxVolume)); } catch {}
  },

  setBgmMuted(muted) {
    this._bgmMuted = !!muted;
    try { localStorage.setItem(STORAGE_KEYS.bgmMuted, String(this._bgmMuted)); } catch {}
    if (this._bgmAudio) this._bgmAudio.volume = this.effectiveBgmVolume;
  },

  setSfxMuted(muted) {
    this._sfxMuted = !!muted;
    try { localStorage.setItem(STORAGE_KEYS.sfxMuted, String(this._sfxMuted)); } catch {}
  },

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
    await fade(audio, 0, this.effectiveBgmVolume, FADE_MS);
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
    if (this._sfxMuted) return;
    const src = SFX_SOURCES[key];
    if (!src) return;
    const audio = new Audio(src);
    audio.volume = this.effectiveSfxVolume;
    audio.play().catch(() => {});
    if (maxDurationMs) {
      setTimeout(() => {
        audio.pause();
      }, maxDurationMs);
    }
    return audio;
  }
};
