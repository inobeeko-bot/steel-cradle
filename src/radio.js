// ===================================================================
// STEEL CRADLE / 戦闘中の無線
//
// 僚機の声を画面へ出す。物語と戦闘をつなぐ細い線。
//
// 【守っていること】
//   1. 操縦の邪魔をしない
//      画面の左下に置く。中央(照準)と計器を避ける。
//      pointer-events: none なので、絶対に操作を奪わない。
//   2. すぐ消える
//      読めなくても操縦は続く。読ませるために止まる必要のある情報は、
//      ここではなく戦闘ログ(addCombatLog)へ出す。
//   3. 喋りすぎない
//      間隔を空け、同じ相手が続けて喋らないようにする。
//      無線がうるさいと、肝心なときの一言が埋もれる。
// ===================================================================

const RADIO = {
  MAX_LINES:      3,     // 画面に同時に出す行数
  LIFE_SEC:     4.2,     // 消えるまで(CSS の animation と合わせてある)
  MIN_GAP:      2.2,     // 次の一言までの最短間隔(秒)
  // ★ 喋る頻度。前は11〜19秒で、戦況が動いても黙っていた。
  //   6〜11秒へ詰めたうえで、下の「戦況を見た一言」を優先して選ぶ。
  CHATTER_MIN:    6,     // ひとりでに喋りだす間隔(秒)
  CHATTER_MAX:   11,
};

let radioEl        = null;
let radioLast      = 0;    // 最後に喋った時刻
let radioLastWho   = '';   // 最後に喋った相手(同じ人が続かないように)
let radioChatterAt = 0;    // 次に自発的に喋る時刻

// --- ひとりでに流れる雑談 -------------------------------------------
// 状況に合っていればよく、意味を運ぶ必要はない。
// 「まだ生きている人がいる」ことが伝わればそれで足りる。
const RADIO_CHATTER = [
  ['wing.n3', '編隊 崩れてるぞ'],
  ['wing.n2', '見えてる。右から来てる'],
  ['wing.n1', '一番機 交戦中'],
  ['wing.n3', '村を背にしろ。抜かせるな'],
  ['wing.n2', 'こんなに来るなんて聞いてない'],
  ['wing.n1', '弾が…… ビームしか無いんだった'],
  ['wing.n3', '無駄撃ちするな。炉が持たん'],
  ['wing.n2', 'ねえ、下は? 下はどうなってる'],
  ['wing.n3', '下は見るな'],
  ['wing.n1', '訓練どおりだ。訓練どおり'],
  ['wing.n2', '訓練で撃たれたことないでしょ'],
];

// --- 戦況を見て選ぶ一言 ---------------------------------------------
// ★ 雑談との違いは「いま画面で起きていることを指しているか」。
//   意味のない相槌が続くと、無線そのものが背景音になって読まれなくなる。
//   条件に合ったものがあれば、雑談より先にそれを出す。
function pickSituationLine() {
  const alive = (typeof wingmen !== 'undefined')
    ? wingmen.filter(function (w) { return !w.dead; }) : [];
  if (!alive.length) return null;
  const who = function (i) { return alive[Math.min(i, alive.length - 1)].def.numKey; };

  const st = (typeof defenceStatus === 'function') ? defenceStatus() : null;

  // ★ この戦闘でいちばん言うべきことは「畑が焼かれている」。
  //   不文律を知っているのは大人たちで、カイトはまだ知らない ―
  //   だから説明ではなく、信じられないという反応で出す。
  if (st) {
    // コロニーを撃っている敵が何機いるか。この戦闘の「異常さ」そのもの
    let bombers = 0;
    if (typeof enemies !== 'undefined') {
      for (const e of enemies) if (e.alive && e.bombards) bombers++;
    }
    if (st.burn >= 60) {
      return [who(0), ['村が見えない ― 煙で', 'まだ人がいるんだぞ、あそこには'][Math.random()<.5?0:1]];
    }
    if (bombers >= 3) return [who(0), '砲撃機が ' + bombers + '機 ― 村を向いてる'];
    if (bombers >= 1) return [who(1), 'こっちを見てない機がいる。畑を撃ってる'];
    if (st.holdLeft <= 45) return [who(0), 'あと少しだ ― 保たせろ'];
  }

  if (alive.length === 1) {
    return [who(0), ['……こっちは俺だけだ', 'カイト、まだ生きてるか'][Math.random()<.5?0:1]];
  }
  if (alive.length === 2) return [who(1), '二機になった。詰めるぞ'];

  // 自機が傷んでいる
  if (typeof hullDamage === 'number' && hullDamage >= 3) {
    return [who(0), 'カイト、機体が保ってない。無理をするな'];
  }
  // 敵がまだ多い
  if (typeof enemies !== 'undefined') {
    const n = enemies.filter(function (e) { return e.alive; }).length;
    if (n >= 5) return [who(1), 'まだ来る。減った気がしない'];
  }
  return null;
}

// 撃墜したときに一言。main.js の onKill から呼ぶ
function radioOnKill(killCount) {
  const alive = (typeof wingmen !== 'undefined')
    ? wingmen.filter(function (w) { return !w.dead; }) : [];
  if (!alive.length) return;
  const lines = ['いまの、カイトか', '一機 落ちた', 'よし ― その調子だ', '当たってる。続けろ'];
  if (Math.random() < 0.55) {
    radioSay(alive[Math.floor(Math.random() * alive.length)].def.numKey,
             lines[Math.floor(Math.random() * lines.length)]);
  }
}

// 被弾したときに一言
function radioOnHullHit(left) {
  const alive = (typeof wingmen !== 'undefined')
    ? wingmen.filter(function (w) { return !w.dead; }) : [];
  if (!alive.length) return;
  const text = (left <= 1) ? 'カイト、離脱しろ! 死ぬぞ!' : 'カイト! 被弾したか';
  radioSay(alive[0].def.numKey, text, left <= 1);
}

function initRadio() {
  radioEl = document.getElementById('radio');
  radioLast = 0;
  radioLastWho = '';
  radioChatterAt = 0;
  clearRadio();
}

function clearRadio() {
  if (radioEl) radioEl.innerHTML = '';
}

// 一言を出す。force を立てると、間隔の制限を無視して必ず出す
// (射出や撃墜など、埋もれてはいけない一言のため)
function radioSay(whoKey, text, force) {
  if (!radioEl) initRadio();
  if (!radioEl) return;

  const now = (typeof elapsed === 'number') ? elapsed : (performance.now() / 1000);
  if (!force) {
    if (now - radioLast < RADIO.MIN_GAP) return;
    if (whoKey === radioLastWho) return;      // 同じ人が続けて喋らない
  }
  radioLast = now;
  radioLastWho = whoKey;

  const line = document.createElement('div');
  line.className = 'radio-line';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = (typeof t === 'function' ? t(whoKey) : whoKey) + ' ›';
  line.appendChild(who);
  line.appendChild(document.createTextNode(text));
  radioEl.appendChild(line);

  // 古い行から捨てる。CSS のフェードが終わる前でも、数が増えたら押し出す
  while (radioEl.children.length > RADIO.MAX_LINES) {
    radioEl.removeChild(radioEl.firstChild);
  }
  // フェードが終わったころに DOM からも消す(残しておく意味がない)
  setTimeout(function () {
    if (line.parentNode) line.parentNode.removeChild(line);
  }, RADIO.LIFE_SEC * 1000);

  if (typeof playRadioOpen === 'function') playRadioOpen();
}

// --- 毎コマ:ひとりでに喋らせる ---------------------------------------
function updateRadio(dt) {
  if (!radioEl) return;
  if (typeof missionState !== 'undefined' && missionState !== 'active') return;
  // 僚機が全員落ちたら、無線は静かになる。それが今の状況そのもの
  if (typeof wingmen === 'undefined') return;
  const alive = wingmen.filter(function (w) { return !w.dead; });
  if (!alive.length) return;

  const now = (typeof elapsed === 'number') ? elapsed : (performance.now() / 1000);
  if (radioChatterAt === 0) {
    radioChatterAt = now + RADIO.CHATTER_MIN;
    return;
  }
  if (now < radioChatterAt) return;

  // ★ まず戦況を見る。指せるものがあれば、雑談より先にそれを言う
  const sit = pickSituationLine();
  if (sit) {
    radioSay(sit[0], sit[1]);
  } else {
    // 生きている僚機の言葉だけを選ぶ ― 落ちた機から声が来ては困る
    const keys = alive.map(function (w) { return w.def.numKey; });
    const pool = RADIO_CHATTER.filter(function (c) { return keys.indexOf(c[0]) >= 0; });
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      radioSay(pick[0], pick[1]);
    }
  }
  radioChatterAt = now + RADIO.CHATTER_MIN
    + Math.random() * (RADIO.CHATTER_MAX - RADIO.CHATTER_MIN);
}
