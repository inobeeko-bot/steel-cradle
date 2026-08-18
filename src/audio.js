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
  BURST_GAIN: 0.30,                           // 回避バースト(噴射)の音量。
                                              // 長さは playBurst の中で組み立てている
  RADIATOR_GAIN: 0.22,                         // ラジエーター開閉
  CLICK_FREQ: 560, CLICK_DUR: 0.032, CLICK_GAIN: 0.11,   // 電力配分
  PRESET_GAIN: 0.17,                           // プリセット切替
  DENIED_FREQ: 95, DENIED_DUR: 0.24, DENIED_GAIN: 0.28,  // 推進剤切れ
  DRYFIRE_GAIN: 0.20,                          // 弾切れの空撃ち「カチカチ」

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

// ===================================================================
// ロックオン(切り札を撃てる状態)
//
// 捕捉の「ビビビ」から、はっきり別物の音に切り替わることが大事。
// ここだけ音を高く張り、下に低い唸りを重ねて緊張感を作っている。
// ===================================================================

// ロックが満ちた瞬間。
// 3段で組む:機械が噛み合う打音 → 駆け上がり → 張りついた高音。
// 打音を頭に置くと「決まった」感じが一段強くなる。
function playLockTone() {
  // 1. 噛み合う打音。短く硬いノイズ
  playNoise(0.05, 0.34, 4200, 1200, 'bandpass');
  playTone(210, 0.06, 0.28, 'square');

  // 2. 一気に駆け上がる
  playSweep(380, 1560, 0.22, 0.30, 'square', 0.04);

  // 3. 張りついた高音を2つ重ねる。わずかにずらすとうなりが出て耳に刺さる
  playTone(1560, 0.70, 0.22, 'square', 0.24);
  playTone(1572, 0.70, 0.12, 'square', 0.24);

  // 4. 下に低い唸り。高音だけだと軽く、これがあると腹に来る
  playSweep(165, 88, 0.85, 0.30, 'sawtooth');
  playTone(58, 0.90, 0.24, 'square', 0.05);
}

// ロック継続中の「ピー」。高く、ほぼ途切れずに鳴り続ける
function playLockedBeep() {
  playTone(1560, 0.20, 0.15, 'square');
  playTone(1040, 0.20, 0.07, 'square');   // 少し厚みを足す
  playTone(78, 0.20, 0.10, 'square');     // 低い脈。緊張感はここから出る
}

// ミサイル発射。噴射の吹き出しと低い突き上げ
function playMissileLaunch() {
  playNoise(0.55, 0.34, 1800, 240, 'bandpass');
  playSweep(180, 60, 0.40, 0.26, 'sawtooth');
}

// フレア投下。ポンと弾け出る音
function playFlare() {
  playNoise(0.34, 0.26, 900, 2600, 'bandpass');
  playSweep(120, 300, 0.18, 0.16, 'square');
}

// 敵に狙われた(相手が発射予告に入った)
function playLockWarning() {
  playTone(AUDIO.WARN_FREQ, AUDIO.WARN_DUR, AUDIO.WARN_GAIN, AUDIO.WARN_WAVE);
  playTone(AUDIO.WARN_FREQ * 0.66, AUDIO.WARN_DUR, AUDIO.WARN_GAIN * 0.7, 'square', 0.13);
}

// ===================================================================
// ミサイルにロックされた(被ロック警報)
//
// 実機の警報と同じで、鳴りやまない断続音にする。
// 「鳴った」ではなく「鳴り続けている」ことが、
// フレアを切るかどうかの判断を急かす圧力になる。
// 撃たれるかどうかは分からないまま、この音だけが続く。
// ===================================================================
function playMissileLockWarn() {
  // 二重の警報音。少しずらした2音でうなりを作り、耳につく音にする
  playTone(880, 0.16, 0.24, 'square');
  playTone(892, 0.16, 0.16, 'square');
  playTone(1320, 0.16, 0.10, 'square');
  // 下支え。腹に来る低音があると「重い警報」に聞こえる
  playTone(74, 0.20, 0.20, 'square');
  playNoise(0.10, 0.10, 2600, 900, 'bandpass');
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

// ===================================================================
// 範囲攻撃(ボム/EMP)
// ===================================================================

// 投下音。ボムは「ポン」と押し出す音、EMPは充電が抜ける高めの音
function playOrdnanceLaunch(isEmp) {
  if (isEmp) {
    playSweep(210, 620, 0.22, 0.20, 'square');
    playNoise(0.14, 0.10, 900, 2600, 'bandpass');
  } else {
    playNoise(0.16, 0.20, 700, 180);
    playTone(96, 0.16, 0.22, 'square');
  }
}

// 炸裂音。ボムは低い轟音、EMPは「ボンッ…ジジ」という放電の感じ
function playBlast(isEmp) {
  if (isEmp) {
    playSweep(520, 44, 0.42, 0.30, 'square');
    playNoise(0.50, 0.20, 3200, 240, 'bandpass');
    playTone(58, 0.30, 0.20, 'square', 0.05);
  } else {
    playNoise(0.62, 0.34, 1900, 45);
    playSweep(110, 24, 0.55, 0.34, 'sawtooth');
    playTone(64, 0.42, 0.26, 'square');
  }
}

// 自分のEMPを浴びた(系統が落ちる低い唸り)
function playEmpHit() {
  playSweep(340, 40, 0.70, 0.30, 'sawtooth');
  playNoise(0.55, 0.16, 2400, 200, 'bandpass');
  playTone(46, 0.55, 0.22, 'square', 0.08);
}

// 敵に当たった
function playEnemyHit() {
  playTone(AUDIO.HIT_FREQ, AUDIO.HIT_DUR, AUDIO.HIT_GAIN, 'square');
  playNoise(0.10, 0.16, 1600, 380);
}

// ===================================================================
// 爆発
//
// 爆発音は1つの音ではなく、時間差で重なる何層かでできている。
//   1. 破裂の瞬間 … ごく短く鋭い。これが無いと「ボワッ」と気の抜けた音になる
//   2. 本体      … 広く開いた帯域が一気に低いほうへ落ちる「ドゥン」
//   3. 腹の低音   … 音程を下へ滑らせる。体に来る重さはここ
//   4. 破片      … 少し遅らせて散らす
//   5. 余韻      … いちばん長く、低く残る
// 順番と遅らせ方が音の印象を決めるので、数字は時間の並びとして読むこと。
// ===================================================================

// 敵を撃墜した
function playExplosion() {
  playNoise(0.06, 0.42, 6000, 1800, 'bandpass');        // 1. 破裂
  playNoise(0.85, 0.44, 5200, 40);                      // 2. 本体
  playSweep(120, 22, 0.80, 0.40, 'sawtooth');           // 3. 腹の低音
  playTone(46, 0.70, 0.30, 'square', 0.02);
  playNoise(0.55, 0.20, 2600, 320, 'bandpass', 0.09);   // 4. 破片
  playNoise(0.90, 0.13, 900, 90, 'lowpass', 0.22);      // 5. 余韻
}

// 自機が撃墜された。敵より一段大きく、長く尾を引かせる
function playPlayerExplosion() {
  playNoise(0.09, 0.48, 7000, 2000, 'bandpass');        // 1. 破裂
  playNoise(1.40, 0.50, 6000, 28);                      // 2. 本体
  playSweep(140, 16, 1.30, 0.46, 'sawtooth');           // 3. 腹の低音
  playTone(38, 1.20, 0.34, 'square', 0.02);
  playSweep(700, 90, 0.60, 0.16, 'square', 0.05);       //    金属が裂ける音
  playNoise(0.80, 0.24, 3000, 260, 'bandpass', 0.10);   // 4. 破片
  playNoise(1.70, 0.18, 800, 55, 'lowpass', 0.30);      // 5. 余韻
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

// バレルロール中にビームを弾いた。
// 被弾(シールド音)と取り違えられては困るので、性格を逆にしてある ―
// あちらは下へ落ちる音、こちらは上へ跳ね上がる短い金属音。
// 連続で弾くとチャリチャリと鳴って「効いている」ことが耳で分かる。
function playDeflect() {
  playSweep(900, 1900, 0.070, 0.13, 'square');
  playNoise(0.055, 0.10, 3600, 1800, 'bandpass');
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

// ===================================================================
// 回避バースト(噴射)― 「びゅーーーー いーーーーん」
//
// 推力が続く約2秒に合わせて、音も2秒鳴らす。3層でできている:
//   1. びゅーーー … 長いノイズ。帯域を低→高へ動かすと空気が吹き上がって聞こえる
//   2. いーーーん … 高い唸り。立ち上がって伸び、最後に少し下がって「ん」で終わる
//   3. 下支え     … 低い推力音。これがないと軽く聞こえる
// ===================================================================
function playBurst() {
  // 1. びゅーーー(吹き上がり → 抜けていく)
  playNoise(0.55, AUDIO.BURST_GAIN, 240, 2100, 'bandpass');
  playNoise(1.30, AUDIO.BURST_GAIN * 0.55, 2100, 700, 'bandpass', 0.50);

  // 2. いーーーん(立ち上がり → 伸び → 収まる)
  playSweep(260, 900, 0.34, 0.17, 'sawtooth', 0.10);
  playTone(900, 1.05, 0.13, 'sawtooth', 0.44);
  playTone(1350, 1.05, 0.05, 'sawtooth', 0.44);        // 上に薄く重ねて唸りを作る
  playSweep(900, 430, 0.55, 0.12, 'sawtooth', 1.48);   // 最後の「ん」

  // 3. 下支えの低い推力音
  playSweep(80, 170, 0.40, 0.24, 'square');
  playTone(150, 1.45, 0.13, 'square', 0.38);
  playSweep(150, 92, 0.45, 0.12, 'square', 1.55);
}

// 弾切れの空撃ち。撃鉄だけが落ちる「カチ、カチ」
// ごく短いノイズを2回鳴らすと、金属が空を打つ音に聞こえる
function playDryFire() {
  playNoise(0.030, AUDIO.DRYFIRE_GAIN, 3200, 900, 'bandpass');
  playNoise(0.030, AUDIO.DRYFIRE_GAIN * 0.8, 2600, 700, 'bandpass', 0.075);
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

// 残骸から機材を回収した(salvage.js)。
// 上がっていく3音。プリセット確定音と同じ「square の階段」で機械の系譜に揃えつつ、
// 音数と上がり幅を変えて「取り込んだ」と分かるようにしてある。
function playSalvage() {
  playTone(420, 0.050, 0.13, 'square');
  playTone(560, 0.055, 0.13, 'square', 0.055);
  playTone(760, 0.090, 0.12, 'square', 0.115);
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

// 任務失敗(落ちていく3音)。
// delay で鳴り始めを遅らせられる ― 自機の爆発音と重ならないようにするため。
function playMissionFailed(delay) {
  const g = AUDIO.JINGLE_GAIN;
  const d = delay || 0;
  playTone(196, 0.20, g, 'sawtooth', d + 0.00);
  playTone(155, 0.20, g, 'sawtooth', d + 0.22);
  playTone(117, 0.85, g, 'sawtooth', d + 0.44);
  playNoise(1.0, 0.18, 550, 45, 'lowpass', d + 0.44);
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
// 個別の音 ― ストーリー(ADVパート)
//
// ★ ここだけ音の設計方針が違う。
//   コックピットの音は「重い機械を操っている」手触りを出すために低く・強く
//   振ってある。ADVパートは村を歩いて人と話す場面なので、同じ強さで鳴らすと
//   場面の温度が壊れる。全体に小さく、短く、角を丸めてある
//   (STORY_GAIN で一括して下げられるようにしてある)。
//
//   足音だけは毎歩鳴るので、いちばん耳につく。わずかに音程を散らして
//   同じ音の連打に聞こえないようにしてある。
// ===================================================================

const STORY_GAIN = 0.75;   // ADVパート全体の音量。うるさければここを下げる

// 0 を中心に ±amount で散らす。足音を機械的に聞こえなくするために使う。
function jitter(amount) {
  return 1 + (Math.random() * 2 - 1) * amount;
}

// 足音。地面の種類で音を変える。
//   'grass' … 土と草。丸い「サッ」。シーン1・2
//   'metal' … 格納庫の鉄板。硬い「カツ」。シーン3
function playStoryStep(surface) {
  const g = STORY_GAIN;
  if (surface === 'metal') {
    playNoise(0.045, 0.075 * g, 2600 * jitter(0.12), 700, 'bandpass');
    playTone(196 * jitter(0.06), 0.055, 0.055 * g, 'square');
  } else {
    playNoise(0.070, 0.070 * g, 1100 * jitter(0.15), 240, 'lowpass');
    playTone(104 * jitter(0.08), 0.045, 0.035 * g, 'sine');
  }
}

// 文字が出ている間の、ごく小さなチッ。
// ★ 1文字ごとに鳴らしてはいけない。毎秒45文字なので機関銃になる。
//   数文字に1回だけ、しかも聞こえるか聞こえないかの音量にする。
function playStoryType() {
  playTone(1180 * jitter(0.05), 0.014, 0.030 * STORY_GAIN, 'square');
}

// 次の行へ送る
function playStoryAdvance() {
  playTone(560, 0.032, 0.085 * STORY_GAIN, 'square');
}

// 物を調べる / 人に話しかける(2音で「開いた」感じを出す)
function playStoryExamine() {
  const g = STORY_GAIN;
  playTone(392, 0.038, 0.090 * g, 'square');
  playTone(523, 0.055, 0.075 * g, 'square', 0.042);
}

// 出口が開いた。上がっていく3音 ―― 回収音(playSalvage)と同じ形にして
// 「先へ進める」合図だと分かるようにしつつ、低めに取って場面を壊さない。
function playStoryUnlock() {
  const g = STORY_GAIN;
  playTone(330, 0.055, 0.105 * g, 'square');
  playTone(440, 0.060, 0.100 * g, 'square', 0.065);
  playTone(587, 0.110, 0.090 * g, 'square', 0.135);
}

// シーンの開幕。暗転から明けるのに合わせて、下から立ち上がる
function playStorySceneIn() {
  playSweep(48, 132, 1.05, 0.085 * STORY_GAIN, 'sine');
  playNoise(0.90, 0.030 * STORY_GAIN, 260, 900, 'lowpass', 0.05);
}

// 場面転換。暗転していくのに合わせて、下へ落ちる
function playStorySceneOut() {
  playSweep(140, 34, 0.75, 0.130 * STORY_GAIN, 'sine');
  playNoise(0.60, 0.045 * STORY_GAIN, 700, 90, 'lowpass');
}

// 次のシーンの題が出る
function playStoryTitle() {
  const g = STORY_GAIN;
  playTone(147, 0.55, 0.090 * g, 'sine');
  playTone(220, 0.45, 0.055 * g, 'sine', 0.03);
}

// --- 場面ごとの音(台詞の se: で指定する)-----------------------------

// 剪定鋏。硬い金属が2度こすれて閉じる「シャキッ」
function playStorySnip() {
  const g = STORY_GAIN;
  playNoise(0.022, 0.130 * g, 5200, 2600, 'bandpass');
  playNoise(0.030, 0.110 * g, 4200, 1500, 'bandpass', 0.045);
  playTone(2400, 0.030, 0.045 * g, 'square', 0.045);
}

// 収穫祭の夜に鳴る警報。
// ★ この音は物語の折り返し点で1度だけ鳴る。ADVパートの他の音より意図的に
//   強く・長く取ってある。ここだけは場面の温度を壊してよい ―― 壊すのが仕事。
function playStoryAlarm() {
  for (let i = 0; i < 4; i++) {
    const d = i * 0.62;
    playTone(622, 0.30, 0.190, 'square', d);
    playTone(311, 0.30, 0.130, 'square', d);          // 1オクターブ下で厚みを出す
    playTone(466, 0.28, 0.170, 'square', d + 0.31);
    playTone(233, 0.28, 0.120, 'square', d + 0.31);
  }
}

// 壁の無線が入る。搬送波の雑音 → 事務的な通告 → 切れる
function playStoryRadio() {
  const g = STORY_GAIN;
  playNoise(0.16, 0.100 * g, 3400, 1100, 'bandpass');        // 回線が開く
  playTone(1046, 0.045, 0.070 * g, 'square', 0.10);
  playNoise(1.20, 0.035 * g, 1800, 900, 'bandpass', 0.18);   // 搬送波のざらつき
  playTone(84, 0.90, 0.045 * g, 'square', 0.20);             // 低い唸り
  playNoise(0.10, 0.080 * g, 2600, 600, 'bandpass', 1.40);   // 切れる
}

// 台詞の se: から名前で呼ぶための窓口。
// 知らない名前が来ても落とさない ―― 音が鳴らないだけで、話は進む。
const STORY_SE = {
  snip:  playStorySnip,
  alarm: playStoryAlarm,
  radio: playStoryRadio,
};

function playStorySe(name) {
  const fn = STORY_SE[name];
  if (fn) fn();
  else if (name) console.warn('知らない効果音: ' + name);
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

// ===================================================================
// BGM
//
// ここだけは音声ファイルを読む。効果音は上のとおり全部その場で合成しているが、
// 数十秒の楽曲は合成では作れないので、あらかじめ作った MP3 を鳴らす。
// 素材は development_aids/oto_kobo(音工房)で生成し、assets/bgm/ に置く。
//
// 曲は「1周ぶんちょうど」に切り出してある(24小節など小節の整数倍)。
// だから loop = true にするだけで、継ぎ目なく延々と回る。
// フェードは掛けていない ― ループ曲に掛けると繰り返すたび音量が凹むため。
// ===================================================================

const BGM = {
  GAIN:      0.30,   // BGM の音量。効果音(AUDIO.MASTER)とは別に持つ
  FADE_IN:   1.20,   // 鳴り始めの立ち上がり(秒)
  FADE_OUT:  0.80,   // 止めるときの引き際(秒)

  // 曲の一覧。名前 → ファイル
  TRACKS: {
    training: 'assets/bgm/training.mp3',   // 訓練飛行「Proving Ground」176BPM
  },
};

let bgmGain    = null;   // BGM 専用の音量つまみ
let bgmSource  = null;   // いま鳴っている音源
let bgmName    = null;   // いま鳴っている曲の名前
let bgmBuffers = {};     // 一度読んだ曲は使い回す(読み直さない)
let bgmLoading = {};     // 読み込み中の約束。二重に取りに行かないため

// BGM 用の音量つまみを用意する(初回だけ作る)
function ensureBgmGain() {
  if (!audioCtx) return null;
  if (!bgmGain) {
    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0;          // 無音から始めて、鳴らすときに上げる
    bgmGain.connect(masterGain);     // 全体の音量つまみの下にぶら下げる
  }
  return bgmGain;
}

// 曲を読み込む。すでに読んであれば何もしない。
function loadBgm(name) {
  const url = BGM.TRACKS[name];
  if (!url) return Promise.reject(new Error('知らない曲: ' + name));
  if (bgmBuffers[name]) return Promise.resolve(bgmBuffers[name]);
  if (bgmLoading[name]) return bgmLoading[name];

  bgmLoading[name] = fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error(url + ' が読めません (' + res.status + ')');
      return res.arrayBuffer();
    })
    // decodeAudioData = MP3 を波形に戻す。時間がかかるので1回だけやって覚えておく
    .then(function (buf) { return audioCtx.decodeAudioData(buf); })
    .then(function (decoded) {
      bgmBuffers[name] = decoded;
      delete bgmLoading[name];
      return decoded;
    })
    .catch(function (e) {
      delete bgmLoading[name];
      console.warn('BGM を読めませんでした:', name, e);
      throw e;
    });
  return bgmLoading[name];
}

// 曲を鳴らす。同じ曲がすでに鳴っていれば何もしない。
function playBgm(name) {
  if (!audioCtx) return;
  if (bgmName === name && bgmSource) return;   // 二重に鳴らさない

  stopBgm(0.25);          // 別の曲が鳴っていれば手短に引っ込める

  loadBgm(name).then(function (buffer) {
    if (!audioCtx) return;
    const gain = ensureBgmGain();
    if (!gain) return;

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;      // ★ 1周ぶんちょうどなので、これだけで継ぎ目なく回る
    src.connect(gain);

    const now = audioCtx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(BGM.GAIN, now + BGM.FADE_IN);
    src.start(now);

    bgmSource = src;
    bgmName = name;
  }).catch(function () { /* 読めなくてもゲームは続く */ });
}

// 曲を止める。fade を渡すとその秒数で引く。
function stopBgm(fade) {
  if (!audioCtx || !bgmSource) { bgmName = null; return; }

  const src = bgmSource;
  const gain = bgmGain;
  const sec = (fade === undefined) ? BGM.FADE_OUT : fade;
  const now = audioCtx.currentTime;

  bgmSource = null;
  bgmName = null;

  if (gain) {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + sec);
  }
  // 音量が0になってから止める。いきなり止めるとプツッと鳴る
  try { src.stop(now + sec + 0.05); } catch (e) { /* もう止まっている */ }
}

// 一時停止中など、消さずに音量だけ落としたいとき(0〜1の倍率)
function duckBgm(ratio) {
  if (!bgmGain || !audioCtx) return;
  const now = audioCtx.currentTime;
  const target = BGM.GAIN * Math.max(0, Math.min(ratio, 1));
  bgmGain.gain.cancelScheduledValues(now);
  bgmGain.gain.setTargetAtTime(target, now, 0.15);
}
