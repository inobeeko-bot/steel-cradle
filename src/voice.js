// ===================================================================
// STEEL CRADLE / コックピット音声
//
// F-16の警告音声「ビッチング・ベティ」風の読み上げ。
// 仕様書9.1「熟練者は音だけで状況がわかる」の言語版にあたる。
//
// 効果音(audio.js)とは仕組みが違い、こちらはブラウザ内蔵の読み上げ機能
// (speechSynthesis)を使う。音声ファイルは不要。
//
// 【実機の文法】
//   切迫しているほど反復する … "WARNING. WARNING. OVERHEAT."
//   平板で機械的に読む       … 演技的な抑揚をつけない
//   危険は状態通知に割り込む … 「撃墜した」より「撃たれる」が先
// ===================================================================

const VOICE = {
  ENABLED: true,
  LANG:   'en-US',
  PITCH:   1.15,   // やや高め。1.0が標準
  RATE:    1.15,   // 速め。切迫感が出る
  VOLUME:  1.0,

  COOLDOWN:  10,   // 同じ文言を再び言うまでの秒数
  QUEUE_MAX:  2,   // 待たせておける文言の数

  // 優先度。2 = 危険警告(割り込む) / 1 = 状態通知(割り込まれる)
  PRIORITY_ALERT:  2,
  PRIORITY_STATUS: 1,

  // --- 全文言。ここを書き換えれば読み上げ内容が変わる ---
  LINES: {
    // 危険警告(高優先・割り込みあり)
    OVERHEAT:        { text: 'WARNING. WARNING. OVERHEAT.',  priority: 2 },
    SHIELD_FAILURE:  { text: 'WARNING. SHIELD FAILURE.',     priority: 2 },
    INCOMING:        { text: 'INCOMING. INCOMING.',          priority: 2 },
    MISSILE_INBOUND: { text: 'MISSILE. MISSILE.', priority: 2, cooldown: 5 },
    CRITICAL_DAMAGE: { text: 'WARNING. CRITICAL DAMAGE.',    priority: 2 },
    POWER_FAILURE:   { text: 'POWER FAILURE.',               priority: 2 },
    SYSTEMS_DOWN:    { text: 'WARNING. SYSTEMS DOWN.', priority: 2, cooldown: 6 },

    // 状態通知(低優先・割り込まれる側)
    TARGET_ACQUIRED:  { text: 'TARGET ACQUIRED.',            priority: 1 },
    TARGET_DESTROYED: { text: 'TARGET DESTROYED.',           priority: 1 },
    SHIELD_FIFTY:     { text: 'SHIELD FIFTY PERCENT.',       priority: 1 },
    ONE_MINUTE:       { text: 'ONE MINUTE.',                 priority: 1 },
    FUEL_LOW:         { text: 'FUEL LOW.',                   priority: 1 },
    AMMO_DEPLETED:    { text: 'AMMO DEPLETED.',              priority: 1 },
    LOCK:             { text: 'LOCK.',           priority: 1, cooldown: 4 },
    MISSILE_AWAY:     { text: 'MISSILE AWAY.',   priority: 1, cooldown: 2 },
    NO_LOCK:          { text: 'NO LOCK.',        priority: 1, cooldown: 4 },
    FLARES_OUT:       { text: 'FLARES OUT.',     priority: 1, cooldown: 6 },
    TARGET_OVERHEAT:  { text: 'TARGET OVERHEAT.', priority: 1, cooldown: 5 },
    FLARE_INEFFECTIVE:{ text: 'HEAT TOO HIGH.',  priority: 1, cooldown: 6 },
  },
};

// 女声を選ぶための手がかり。名前にこれらが含まれる音声を優先する。
// (Windowsなら Zira、Macなら Samantha が代表的な英語女声)
const VOICE_FEMALE_HINTS = [
  'female', 'zira', 'samantha', 'victoria', 'karen', 'moira', 'tessa',
  'aria', 'jenny', 'michelle', 'susan', 'linda', 'heera', 'catherine',
  'google us english',
];

let selectedVoice = null;
let voiceReady    = false;

let currentUtterance = null;   // 今しゃべっている文
let currentPriority  = 0;
let voiceQueue       = [];     // 待たせている文言 [{key, line, seq}]
let voiceSeq         = 0;      // 待ち行列に入った順番(古い/新しいの判断に使う)
let lastSpokenAt     = {};     // 文言ごとの最後に言った時刻
let voiceClock       = 0;      // ゲーム内の経過秒(main.js が進める)

// ===================================================================
// 初期化。起動時に1回呼ぶ。
//
// 音声一覧はブラウザが非同期に用意するため、起動直後は空のことがある。
// そのため voiceschanged(用意できた合図)でも選び直す。
// ===================================================================
function initVoice() {
  if (!('speechSynthesis' in window)) {
    console.warn('このブラウザは読み上げに対応していません');
    VOICE.ENABLED = false;
    return false;
  }

  pickVoice();
  window.speechSynthesis.onvoiceschanged = pickVoice;
  return true;
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  let best = null;
  let bestScore = -1;

  for (const v of voices) {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase();

    let score = 0;
    if (lang.startsWith('en-us')) score += 10;
    else if (lang.startsWith('en')) score += 5;
    else continue;                       // 英語以外は使わない

    for (const hint of VOICE_FEMALE_HINTS) {
      if (name.indexOf(hint) >= 0) { score += 20; break; }
    }

    if (score > bestScore) { bestScore = score; best = v; }
  }

  if (best) {
    selectedVoice = best;
    voiceReady = true;
    console.log('VOICE READY ― ' + best.name + ' (' + best.lang + ')');
  }
}

// ===================================================================
// 読み上げの依頼
//
// key は VOICE.LINES のキー名(例 'OVERHEAT')。
// 優先度とクールダウンを見て、割り込む・待たせる・捨てるを決める。
// ===================================================================
function speakVoice(key) {
  if (!VOICE.ENABLED || !('speechSynthesis' in window)) return;

  const line = VOICE.LINES[key];
  if (!line) return;

  // --- クールダウン。同じ文言を連呼させない ---
  const last = lastSpokenAt[key];
  const cooldown = (line.cooldown !== undefined) ? line.cooldown : VOICE.COOLDOWN;
  if (last !== undefined && voiceClock - last < cooldown) return;

  const entry = { key: key, line: line };

  if (currentUtterance) {
    if (line.priority > currentPriority) {
      // --- 危険警告が状態通知に割り込む ---
      // 待っていた低優先の文言も、もう意味がないので捨てる
      voiceQueue = voiceQueue.filter((q) => q.line.priority >= line.priority);
      window.speechSynthesis.cancel();
      currentUtterance = null;
      currentPriority = 0;
      speakNow(entry);
    } else {
      // --- 待たせる ---
      entry.seq = voiceSeq++;   // 何番目に入ったか。新旧の判断に使う
      voiceQueue.push(entry);

      // しゃべる順は「優先度の高い順、同じなら入った順」
      voiceQueue.sort((a, b) => (b.line.priority - a.line.priority) || (a.seq - b.seq));

      // 溢れたら「いちばん優先度が低く、いちばん古いもの」を捨てる。
      // 警報は新しいほど今の状況を表しているので、古いものから消すのが正しい。
      while (voiceQueue.length > VOICE.QUEUE_MAX) {
        let worst = 0;
        for (let i = 1; i < voiceQueue.length; i++) {
          const a = voiceQueue[i], b = voiceQueue[worst];
          if (a.line.priority < b.line.priority ||
             (a.line.priority === b.line.priority && a.seq < b.seq)) worst = i;
        }
        voiceQueue.splice(worst, 1);
      }
    }
  } else {
    speakNow(entry);
  }
}

function speakNow(entry) {
  const u = new SpeechSynthesisUtterance(entry.line.text);
  u.lang   = VOICE.LANG;
  u.pitch  = VOICE.PITCH;
  u.rate   = VOICE.RATE;
  u.volume = VOICE.VOLUME;
  if (selectedVoice) u.voice = selectedVoice;

  // 読み終わり(または中断)で次を出す。
  // 割り込みで捨てられた古い文の onend は無視したいので、
  // 「今しゃべっている文と同じか」を確かめてから次へ進む。
  const done = () => {
    if (u !== currentUtterance) return;
    currentUtterance = null;
    currentPriority = 0;
    drainVoiceQueue();
  };
  u.onend = done;
  u.onerror = done;

  currentUtterance = u;
  currentPriority = entry.line.priority;
  lastSpokenAt[entry.key] = voiceClock;

  window.speechSynthesis.speak(u);
}

function drainVoiceQueue() {
  if (currentUtterance || voiceQueue.length === 0) return;
  speakNow(voiceQueue.shift());
}

// 毎コマ呼ぶ。クールダウンを数えるための時計を進める。
function voiceTick(dt) {
  voiceClock += dt;
}

// 再出撃などで、言いかけを全部止めてやり直す
function resetVoice() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  currentUtterance = null;
  currentPriority = 0;
  voiceQueue = [];
  voiceSeq = 0;
  lastSpokenAt = {};
}

// 今しゃべっているか(検証用)
function voiceStatus() {
  return {
    ready: voiceReady,
    voice: selectedVoice ? selectedVoice.name : null,
    speaking: currentUtterance ? currentUtterance.text : null,
    priority: currentPriority,
    queue: voiceQueue.map((q) => q.key),
  };
}
