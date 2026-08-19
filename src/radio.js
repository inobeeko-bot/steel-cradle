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
  MIN_GAP:      2.0,     // 次の一言までの最短間隔(秒)
  // ★ 喋る頻度。11〜19秒 → 6〜11秒 → いまは4〜8秒。
  //   四機で飛んでいるのだから、これくらい賑やかでよい。
  //   ただし MIN_GAP(2.0秒)と「同じ人が続けて喋らない」規則があるので、
  //   実際に詰まって聞こえることはない。
  CHATTER_MIN:    4,     // ひとりでに喋りだす間隔(秒)
  CHATTER_MAX:    8,
};

// --- 位置から作る一言 -------------------------------------------------
// ★ 決め打ちの台詞と違い、こちらは実際の座標を見て作る。
//   「三時の方向」「後方に二機」が本当にそうなっているから意味がある ―
//   でたらめを言う無線は、一度嘘だと気付かれたらもう読まれない。
const _rInv = new THREE.Quaternion();
const _rTo  = new THREE.Vector3();

// ある機体から見て、相手がどの時計方向にいるか(12 = 正面、3 = 右)
function clockOf(fromObj, targetPos) {
  _rInv.copy(fromObj.quaternion).invert();
  _rTo.copy(targetPos).sub(fromObj.position).applyQuaternion(_rInv);
  // 機体の座標は 前が −Z・右が +X。atan2(x, −z) で 0 が正面、+が右回り
  let deg = Math.atan2(_rTo.x, -_rTo.z) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  let c = Math.round(deg / 30);
  if (c === 0 || c === 12) c = 12;
  return c;
}

// ある機体の後方(真後ろ90度の扇)にいる敵の数
function enemiesBehind(obj, range) {
  if (typeof enemies === 'undefined') return 0;
  let n = 0;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.group.position.distanceTo(obj.position) > range) continue;
    const c = clockOf(obj, e.group.position);
    if (c >= 5 && c <= 7) n++;      // 5時〜7時 = 後ろ
  }
  return n;
}

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
  ['wing.n3', '全機! 訓練どおり ― フォーメーションA'],
  ['wing.n1', '一番機、位置につく'],
  ['wing.n2', '二番機、左を見てる'],
  ['wing.n3', '三番機、右そのまま'],
  ['wing.n1', '弾道が見えた。低い'],
  ['wing.n2', 'カイト、離れすぎるな'],
  ['wing.n3', '数が合わない。三機で持たせるぞ'],
];

// --- 戦況を見て選ぶ一言 ---------------------------------------------
// ★ 雑談との違いは「いま画面で起きていることを指しているか」。
//   意味のない相槌が続くと、無線そのものが背景音になって読まれなくなる。
//   条件に合ったものがあれば、雑談より先にそれを出す。
// ★ 作り方を変えた。
//   前は「上から順に、条件に合った最初のもの」を返していたので、
//   ずっと成り立っている条件(砲撃機が村を撃っている)が毎回勝ち、
//   同じ一言が延々と繰り返された ― 実測で60秒に9回。
//   いまは「いま言えること」を全部集めてから、
//   直近に使った種類を外して選ぶ。話題が自然に回る。
let recentKinds = [];

function pickSituationLine() {
  const alive = (typeof wingmen !== 'undefined')
    ? wingmen.filter(function (w) { return !w.dead; }) : [];
  if (!alive.length) return null;
  const who = function (i) { return alive[Math.min(i, alive.length - 1)].def.numKey; };

  const st = (typeof defenceStatus === 'function') ? defenceStatus() : null;
  const cands = [];
  const add = function (kind, whoKey, text) { cands.push([kind, whoKey, text]); };

  // --- 位置から作る警告(毎回変わるので、いちばん無線らしい)---------
  if (typeof enemies !== 'undefined' && typeof playerShip !== 'undefined' && playerShip) {
    // 自機の後ろに付かれている
    const back = enemiesBehind(playerShip, 260);
    if (back >= 2) add('behind', who(0), t('r.behind').replace('%s', String(back)));

    // 自機に近い敵の時計方向。正面(11〜1時)は自分で見えているので言わない
    let near = null, nearD = 300;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.group.position.distanceTo(playerShip.position);
      if (d < nearD) { nearD = d; near = e; }
    }
    if (near) {
      const c = clockOf(playerShip, near.group.position);
      if (c >= 2 && c <= 10) add('clock', who(1), t('r.clock').replace('%s', String(c)));
    }

    // 僚機の後ろに付かれている ― 呼び寄せ(H)を使う判断の材料になる
    for (const w of alive) {
      const n = enemiesBehind(w.group, 240);
      if (n >= 2) {
        const other = alive.find(function (o) { return o !== w; }) || w;
        add('behindW', other.def.numKey,
            t('r.behindW').replace('%s', t(w.def.numKey)).replace('%s', String(n)));
        break;
      }
    }

    // 隊形が散りすぎている
    if (alive.length >= 2) {
      let far = 0;
      for (const w of alive) {
        if (w.group.position.distanceTo(playerShip.position) > 420) far++;
      }
      if (far >= 2) add('form', who(0), t('r.formBreak'));
    }
  }

  // --- 戦況の説明。ずっと成り立つので、上の警告と同じ重みでは出さない ---
  if (st) {
    let bombers = 0;
    if (typeof enemies !== 'undefined') {
      for (const e of enemies) if (e.alive && e.bombards) bombers++;
    }
    if (st.burn >= 60) {
      add('burn', who(0), ['村が見えない ― 煙で', 'まだ人がいるんだぞ、あそこには'][Math.random()<.5?0:1]);
    }
    if (bombers >= 3) add('bomber', who(0), '砲撃機が ' + bombers + '機 ― 村を向いてる');
    else if (bombers >= 1) add('bomber', who(1), 'こっちを見てない機がいる。畑を撃ってる');
    if (st.holdLeft <= 45) add('last', who(0), 'あと少しだ ― 保たせろ');
  }

  if (alive.length === 1) {
    add('alone', who(0), ['……こっちは俺だけだ', 'カイト、まだ生きてるか'][Math.random()<.5?0:1]);
  } else if (alive.length === 2) {
    add('two', who(1), '二機になった。詰めるぞ');
  }
  if (typeof hullDamage === 'number' && hullDamage >= 3) {
    add('hull', who(0), 'カイト、機体が保ってない。無理をするな');
  }
  if (typeof enemies !== 'undefined') {
    const n = enemies.filter(function (e) { return e.alive; }).length;
    if (n >= 5) add('many', who(1), t('r.tooMany'));
  }

  if (!cands.length) return null;

  // 直近3種類は外す。全部外れてしまうときだけ、元の全部から選ぶ
  const fresh = cands.filter(function (c) { return recentKinds.indexOf(c[0]) < 0; });
  const pool = fresh.length ? fresh : cands;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  recentKinds.push(pick[0]);
  while (recentKinds.length > 3) recentKinds.shift();
  return [pick[1], pick[2]];
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
  recentKinds = [];
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
  // 発艦の移動中は、決まった順の無線(defence.js の RUN_LINES)だけを流す。
  // ひとりでの雑談まで混ぜると、4.8秒に何人も喋って聞き取れなくなる
  if (typeof defenceLocked === 'function' && defenceLocked()
      && (typeof defencePullingBack !== 'function' || !defencePullingBack())) return;
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
