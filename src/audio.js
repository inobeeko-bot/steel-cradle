// ===================================================================
// STEEL CRADLE / 音
//
// 仕様書9.1:「警報は音で区別可能に設計。熟練者は音だけで状況がわかる」
// 仕様書11.2:「フリー素材+Web Audio API合成」
//
// 音の素材ファイルは使わず、Web Audio API で波形をその場で合成する。
//
// 【音の設計方針】
// 全体を低音寄りに振ってある。重い金属の塊を操っている手触りを優先し、
// 音色も square / sawtooth を中心にして「ビー」「ブー」と濁らせている。
//
// そのうえで、熟練者が音だけで状況を判断できるよう役割ごとに高さを離す。
// 低いほど深刻、という順番になっている。
//   撃墜・シャットダウン … 最も低い(22〜130Hz)。腹に来る音
//   被弾・被捕捉警報     … 低い(58〜340Hz)
//   照準の捕捉           … 中(360Hz)。間隔が詰まって「ビビビ」になる
//   操作の手応え         … やや高い(400〜560Hz)。短く軽い
//   自機の発射           … ノイズ主体の「シュン」(音程は薄い)
// ===================================================================

const AUDIO = {
  MASTER: 0.35,            // 全体の音量(0〜1)。うるさければここを下げる

  // ★ 全体を低音寄りに設計してある。
  //   高い電子音は目立つが「軽く」聞こえるため、重い金属の塊を操っている
  //   手触りを優先して低く振ってある。
  //   個別に上げたい音があれば、その *_FREQ だけ上げればよい。

  // --- 敵を照準に捉えている間の「ビー」---
  // 間隔を詰めて鳴らすと「ビビビ」と加速して聞こえる(間隔は main.js が決める)
  CAPTURE_FREQ:    360,    // 低めのブザー
  CAPTURE_DUR_MAX: 0.19,   // 捉えた直後の1回の長さ(秒)
  CAPTURE_DUR_MIN: 0.050,  // 最も速くなったときの長さ
  CAPTURE_GAIN:    0.22,
  CAPTURE_WAVE: 'sawtooth',

  // --- 敵に狙われた警告(相手の発射予告と同時)---
  WARN_FREQ:  165, WARN_DUR: 0.38, WARN_GAIN: 0.32, WARN_WAVE: 'square',

  // --- 自機のビーム発射「シュン」---
  // 音程よりノイズ(空気が抜ける音)を主役にする
  FIRE_FREQ_START: 400, FIRE_FREQ_END: 85,
  FIRE_DUR: 0.19, FIRE_GAIN: 0.11, FIRE_WAVE: 'sawtooth',
  FIRE_NOISE_DUR: 0.21, FIRE_NOISE_GAIN: 0.24,
  FIRE_NOISE_FROM: 2300, FIRE_NOISE_TO: 260,   // ノイズの色。高→低へ抜ける

  // --- 敵への命中・撃墜 ---
  HIT_FREQ: 520, HIT_DUR: 0.08, HIT_GAIN: 0.22,
  KILL_DUR: 0.95, KILL_GAIN: 0.44,

  // --- 自機の被弾 ---
  SHIELD_HIT_FREQ_START: 340, SHIELD_HIT_FREQ_END: 145,
  SHIELD_HIT_DUR: 0.24, SHIELD_HIT_GAIN: 0.30,
  HULL_HIT_DUR: 0.60, HULL_HIT_GAIN: 0.46, HULL_THUD_FREQ: 58,

  // --- 熱の警告と強制シャットダウン ---
  OVERHEAT_FREQ: 430, OVERHEAT_DUR: 0.11, OVERHEAT_GAIN: 0.26,
  OVERHEAT_INTERVAL: 0.55,   // 熱が危険域の間、この間隔で鳴らす
  // 電源が落ちる音。ゲーム中でいちばん低く、いちばん長い音にしてある
  SHUTDOWN_FREQ_START: 300, SHUTDOWN_FREQ_END: 22,
  SHUTDOWN_DUR: 1.60, SHUTDOWN_GAIN: 0.38,
  REBOOT_FREQ_START: 70, REBOOT_FREQ_END: 380,
  REBOOT_DUR: 0.70, REBOOT_GAIN: 0.26,

  // --- 操作の手応え ---
  BURST_DUR: 0.32, BURST_GAIN: 0.30,          // 回避バースト(噴射)
  RADIATOR_GAIN: 0.22,                         // ラジエーター開閉
  CLICK_FREQ: 560, CLICK_DUR: 0.032, CLICK_GAIN: 0.11,   // 電力配分
  PRESET_GAIN: 0.17,                           // プリセット切替
  DENIED_FREQ: 95, DENIED_DUR: 0.24, DENIED_GAIN: 0.28,  // 推進剤切れ

  // --- ミッションの節目 ---
  JINGLE_GAIN: 0.24,
  TIME_WARN_FREQ: 480, TIME_WARN_GAIN: 0.28,

  // --- エンジンの駆動音(鳴りっぱなし)---
  ENGINE_FREQ_MIN:   40,   // エンジン配分0%のときの高さ(Hz)
  ENGINE_FREQ_MAX:  102,   // 配分100%のときの高さ
  ENGINE_CUTOFF_MIN: 260,  // こもり具合。低いほど遠くでうなる感じ
  ENGINE_CUTOFF_MAX: 1150,
  ENGINE_GAIN:      0.15,
  ENGINE_DRIFT:     0.22,  // ドリフト中(推力カット)の音量倍率
  ENGINE_SMOOTH:    0.18,  // 音の変化のなめらかさ(秒)
};

let audioCtx    = null;
let masterGain  = null;
let noiseBuffer = null;   // 爆発などに使う雑音。1回作って使い回す
let engineNodes = null;   // エンジン音は鳴りっぱなしなので部品を持っておく

// ===================================================================
// 初期化。起動時に1回呼ぶ。
// ブラウザは「ユーザーが操作するまで音を鳴らしてはいけない」規則なので、
// 作った直後は停止状態。最初のキー入力で resumeAudio() が動かす。
// ===================================================================
function initAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;

    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = AUDIO.MASTER;
    masterGain.connect(audioCtx.destination);

    // 白色雑音を2秒ぶん作っておく。爆発・噴射・破壊音の材料になる。
    const len = audioCtx.sampleRate * 2;
    noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    console.log('AUDIO READY ― ' + audioCtx.state);
    return true;
  } catch (e) {
    console.warn('音を初期化できませんでした', e);
    return false;
  }
}

function resumeAudio() {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  startEngineSound();
}

const audioReady = () => audioCtx && audioCtx.state === 'running';

// ===================================================================
// 音を作る土台となる3つの関数
// ===================================================================

// 高さが一定の短い音。「ピッ」「ビー」「ブー」
function playTone(freq, duration, gain, wave, delay) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime + (delay || 0);

  const osc = audioCtx.createOscillator();
  osc.type = wave || 'square';
  osc.frequency.value = freq;

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.005);            // 立ち上がり
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);  // 減衰

  osc.connect(env); env.connect(masterGain);
  osc.start(now); osc.stop(now + duration + 0.02);
}

// 高さが滑る音。「ピュン」(下降)「ヒュン」(上昇)
function playSweep(freqStart, freqEnd, duration, gain, wave, delay) {
  if (!audioReady()) return;
  const now = audioCtx.currentTime + (delay || 0);

  const osc = audioCtx.createOscillator();
  osc.type = wave || 'sawtooth';
  osc.frequency.setValueAtTime(freqStart, now);
  // exponentialRamp は0にできないので下限を取る
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), now + duration);

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(env); env.connect(masterGain);
  osc.start(now); osc.stop(now + duration + 0.02);
}

// 雑音。「ザッ」「ドン」。フィルターの高さを動かすと質感が変わる。
//   cutoffStart が高い→鋭い破裂音 / 低い→こもった爆発音
function playNoise(duration, gain, cutoffStart, cutoffEnd, type, delay) {
  if (!audioReady() || !noiseBuffer) return;
  const now = audioCtx.currentTime + (delay || 0);

  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = type || 'lowpass';
  filter.frequency.setValueAtTime(cutoffStart, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(cutoffEnd, 30), now + duration);
  filter.Q.value = 1.0;

  const env = audioCtx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  src.connect(filter); filter.connect(env); env.connect(masterGain);
  src.start(now); src.stop(now + duration + 0.02);
}

// ===================================================================
// 個別の音 ― 照準と戦闘
// ===================================================================

// 敵を捉えている間の「ビー」。progress 0〜1 が大きいほど短く鋭くなる
function playCaptureBeep(progress) {
  const p = Math.max(0, Math.min(progress || 0, 1));
  const dur = AUDIO.CAPTURE_DUR_MAX + (AUDIO.CAPTURE_DUR_MIN - AUDIO.CAPTURE_DUR_MAX) * p;
  playTone(AUDIO.CAPTURE_FREQ * (1 + p * 0.22), dur, AUDIO.CAPTURE_GAIN, AUDIO.CAPTURE_WAVE);
}

// 敵に狙われた(相手が発射予告に入った)
function playLockWarning() {
  playTone(AUDIO.WARN_FREQ, AUDIO.WARN_DUR, AUDIO.WARN_GAIN, AUDIO.WARN_WAVE);
  playTone(AUDIO.WARN_FREQ * 0.66, AUDIO.WARN_DUR, AUDIO.WARN_GAIN * 0.7, 'square', 0.13);
}

// 自機のビーム発射
function playFireSound() {
  // 「シュン」= 空気が鋭く抜ける音。ノイズを主役にし、音程は下に薄く添えるだけ。
  // bandpass(ある高さの帯だけ通す)を高→低へ動かすと、抜けていく感じが出る。
  playNoise(AUDIO.FIRE_NOISE_DUR, AUDIO.FIRE_NOISE_GAIN,
            AUDIO.FIRE_NOISE_FROM, AUDIO.FIRE_NOISE_TO, 'bandpass');
  playSweep(AUDIO.FIRE_FREQ_START, AUDIO.FIRE_FREQ_END,
            AUDIO.FIRE_DUR, AUDIO.FIRE_GAIN, AUDIO.FIRE_WAVE);
}

// 敵に当たった
function playEnemyHit() {
  playTone(AUDIO.HIT_FREQ, AUDIO.HIT_DUR, AUDIO.HIT_GAIN, 'square');
  playNoise(0.10, 0.16, 1600, 380);
}

// 敵を撃墜した(低い轟音 + ノイズ)
function playExplosion() {
  playNoise(AUDIO.KILL_DUR, AUDIO.KILL_GAIN, 1700, 55);
  playSweep(130, 28, AUDIO.KILL_DUR * 0.85, 0.32, 'sawtooth');
  playTone(78, 0.36, 0.24, 'square');
}

// ===================================================================
// 個別の音 ― 自機の被弾
// ===================================================================

// シールドで受けた(弾かれる金属音)
function playShieldHit() {
  playSweep(AUDIO.SHIELD_HIT_FREQ_START, AUDIO.SHIELD_HIT_FREQ_END,
            AUDIO.SHIELD_HIT_DUR, AUDIO.SHIELD_HIT_GAIN, 'square');
  playNoise(0.18, 0.18, 2400, 520, 'bandpass');
}

// シールドが割れた
function playShieldDown() {
  playSweep(300, 62, 0.60, 0.32, 'sawtooth');
  playNoise(0.45, 0.24, 1100, 130);
}

// HULL損傷(重い破壊音)
function playHullDamage() {
  playNoise(AUDIO.HULL_HIT_DUR, AUDIO.HULL_HIT_GAIN, 1000, 70);
  playTone(AUDIO.HULL_THUD_FREQ, 0.45, 0.36, 'square');
  playSweep(190, 48, 0.40, 0.22, 'sawtooth');
}

// ===================================================================
// 個別の音 ― 熱とシステム
// ===================================================================

// 熱が危険域(警告の連打)
function playOverheatWarn() {
  playTone(AUDIO.OVERHEAT_FREQ, AUDIO.OVERHEAT_DUR, AUDIO.OVERHEAT_GAIN, 'square');
  playTone(AUDIO.OVERHEAT_FREQ, AUDIO.OVERHEAT_DUR, AUDIO.OVERHEAT_GAIN, 'square', 0.13);
}

// 強制シャットダウン(電源が落ちていく音)
function playShutdown() {
  // 電源が抜けて回転が落ちていく音。ゲーム中でいちばん低く、いちばん長い。
  playSweep(AUDIO.SHUTDOWN_FREQ_START, AUDIO.SHUTDOWN_FREQ_END,
            AUDIO.SHUTDOWN_DUR, AUDIO.SHUTDOWN_GAIN, 'sawtooth');
  // 少し遅らせてもう1本、さらに1オクターブ下に重ねると「ずしん」と沈む
  playSweep(AUDIO.SHUTDOWN_FREQ_START * 0.5, AUDIO.SHUTDOWN_FREQ_END * 0.7,
            AUDIO.SHUTDOWN_DUR * 1.1, AUDIO.SHUTDOWN_GAIN * 0.8, 'square', 0.06);
  playNoise(0.75, 0.22, 700, 45);
}

// 復帰(立ち上がる音)
function playReboot() {
  playSweep(AUDIO.REBOOT_FREQ_START, AUDIO.REBOOT_FREQ_END,
            AUDIO.REBOOT_DUR, AUDIO.REBOOT_GAIN, 'sawtooth');
  playTone(520, 0.10, 0.17, 'square', AUDIO.REBOOT_DUR);
}

// ===================================================================
// 個別の音 ― 操作の手応え
// ===================================================================

// 回避バースト(噴射)
function playBurst() {
  playNoise(AUDIO.BURST_DUR, AUDIO.BURST_GAIN, 380, 1500, 'bandpass');
  playSweep(85, 240, 0.24, 0.16, 'sawtooth');
}

// 推進剤切れで撃てない(拒否音)
function playDenied() {
  playTone(AUDIO.DENIED_FREQ, AUDIO.DENIED_DUR, AUDIO.DENIED_GAIN, 'square');
}

// ラジエーター展開/収納(機械の作動音)
function playRadiator(opening) {
  if (opening) {
    playNoise(0.30, AUDIO.RADIATOR_GAIN, 480, 1300, 'bandpass');
    playSweep(120, 290, 0.28, 0.15, 'square');
  } else {
    playNoise(0.24, AUDIO.RADIATOR_GAIN * 0.9, 1200, 380, 'bandpass');
    playSweep(290, 110, 0.24, 0.15, 'square');
  }
}

// 電力配分を動かした(小さなクリック)
function playPowerClick() {
  playTone(AUDIO.CLICK_FREQ, AUDIO.CLICK_DUR, AUDIO.CLICK_GAIN, 'square');
}

// プリセット切替(2音の確定音)
function playPresetConfirm() {
  playTone(300, 0.055, AUDIO.PRESET_GAIN, 'square');
  playTone(450, 0.075, AUDIO.PRESET_GAIN, 'square', 0.060);
}

// ドリフト入切
function playDriftToggle(on) {
  if (on) playSweep(280, 120, 0.20, 0.16, 'sawtooth');
  else    playSweep(120, 280, 0.20, 0.16, 'sawtooth');
}

// 視点切替(そっけないクリック)
function playViewClick() {
  playTone(400, 0.040, 0.11, 'square');
}

// ===================================================================
// 個別の音 ― ミッションの節目
// ===================================================================

// 残り1分
function playTimeWarning() {
  for (let i = 0; i < 3; i++) {
    playTone(AUDIO.TIME_WARN_FREQ, 0.10, AUDIO.TIME_WARN_GAIN, 'square', i * 0.17);
  }
}

// 任務達成(上がっていく3音)
function playMissionComplete() {
  const g = AUDIO.JINGLE_GAIN;
  playTone(262, 0.15, g, 'square', 0.00);   // ド(1オクターブ下げた)
  playTone(330, 0.15, g, 'square', 0.16);   // ミ
  playTone(392, 0.45, g, 'square', 0.32);   // ソ
  playTone(131, 0.60, g * 0.8, 'sawtooth', 0.32);   // さらに下で土台を作る
}

// 任務失敗(落ちていく3音)
function playMissionFailed() {
  const g = AUDIO.JINGLE_GAIN;
  playTone(196, 0.20, g, 'sawtooth', 0.00);
  playTone(155, 0.20, g, 'sawtooth', 0.22);
  playTone(117, 0.85, g, 'sawtooth', 0.44);
  playNoise(1.0, 0.18, 550, 45, 'lowpass', 0.44);
}

// 時間切れ
function playTimeUp() {
  const g = AUDIO.JINGLE_GAIN;
  playTone(220, 0.24, g, 'square', 0.00);
  playTone(165, 0.65, g, 'square', 0.26);
}

// 再出撃
function playSortie() {
  playSweep(90, 360, 0.50, 0.24, 'sawtooth');
  playTone(523, 0.12, 0.17, 'square', 0.50);
}

// ===================================================================
// エンジンの駆動音
//
// 単発の音と違い、止めずに鳴らし続け、高さと音量だけを変える。
// のこぎり波を2本わずかにずらして重ねるとうなりが出て厚みが増し、
// lowpass(低い音だけ通すフィルター)を通すとこもった駆動音になる。
// ===================================================================
function startEngineSound() {
  if (!audioReady() || engineNodes) return;

  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  osc1.type = 'sawtooth';
  osc2.type = 'sawtooth';
  osc1.frequency.value = AUDIO.ENGINE_FREQ_MIN;
  osc2.frequency.value = AUDIO.ENGINE_FREQ_MIN * 1.006;   // ごくわずかにずらす

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = AUDIO.ENGINE_CUTOFF_MIN;
  filter.Q.value = 0.7;

  const gain = audioCtx.createGain();
  gain.gain.value = 0;   // 無音から始めて setEngineLevel で上げる

  osc1.connect(filter); osc2.connect(filter);
  filter.connect(gain); gain.connect(masterGain);
  osc1.start(); osc2.start();

  engineNodes = { osc1: osc1, osc2: osc2, filter: filter, gain: gain };
  console.log('ENGINE SOUND ONLINE');
}

// 毎コマ呼ぶ。ratio = 0〜1(エンジン配分)、cut = true でドリフト中
function setEngineLevel(ratio, cut) {
  if (!engineNodes || !audioCtx) return;

  const r = Math.max(0, Math.min(ratio || 0, 1));
  const now = audioCtx.currentTime;
  const smooth = AUDIO.ENGINE_SMOOTH;

  const freq = AUDIO.ENGINE_FREQ_MIN + r * (AUDIO.ENGINE_FREQ_MAX - AUDIO.ENGINE_FREQ_MIN);
  // setTargetAtTime = 目標値へなめらかに寄せる。急に変えるとプツッと鳴る
  engineNodes.osc1.frequency.setTargetAtTime(freq, now, smooth);
  engineNodes.osc2.frequency.setTargetAtTime(freq * 1.006, now, smooth);

  const cutoff = AUDIO.ENGINE_CUTOFF_MIN + r * (AUDIO.ENGINE_CUTOFF_MAX - AUDIO.ENGINE_CUTOFF_MIN);
  engineNodes.filter.frequency.setTargetAtTime(cutoff, now, smooth);

  let vol = AUDIO.ENGINE_GAIN * (0.35 + r * 0.65);
  if (cut) vol *= AUDIO.ENGINE_DRIFT;
  engineNodes.gain.gain.setTargetAtTime(vol, now, smooth);
}
