// ===================================================================
// STEEL CRADLE / フェーズ0:電力配分システム
//
// 仕様書 9.3:発電量100%を「武器/シールド/エンジン/センサー」の4系統に手動配分。
//            合計100%を超えられない。
// 仕様書 9.6:↑武器 ←シールド →エンジン ↓センサー に +10%
//            (他系統から自動で均等に吸う)
// ===================================================================

// --- ビルド番号 -----------------------------------------------------
// 画面右上と F12 のコンソールに出す。
// ブラウザは古いJSを溜め込む(キャッシュ)ことがあり、直したはずの不具合が
// 直っていないように見える原因になる。この番号が想定と違えば古い版が動いている。
// 中身を変えたらこの数字も上げること。
const BUILD = 'p1-06 drift';

// --- 系統の定義 -----------------------------------------------------
// 配列(リスト)で4系統を並べておく。順番はそのまま「均等に差し引く」順にもなる。
// hue(色相)は 0〜360 の数字で色を表す指定。0=赤 / 60=黄 / 200=水色 / 120=緑
const SYSTEMS = [
  { key: 'weapon', hue:   8 },  // 武器 … 赤
  { key: 'shield', hue: 200 },  // シールド … 水色
  { key: 'engine', hue:  42 },  // エンジン … 橙
  { key: 'sensor', hue: 140 },  // センサー … 緑
];

// --- 現在の配分値(この1つのオブジェクトがゲームの「状態」)-------------
// キー名: 数値 の形。合計が常に 100 になるように操作する。
const power = {
  weapon: 25,
  shield: 25,
  engine: 25,
  sensor: 25,
};

// --- 熱(HEAT)の設定値(仕様書9.3の中核リソース2)-------------------
// ここの数字を変えるだけでゲームバランスを調整できるよう、まとめて置いておく。
const HEAT = {
  MAX:            100,   // 限界。ここを超えると強制シャットダウン
  WARN:            80,   // 警告域。ゲージの赤線の位置
  PER_WEAPON:     0.35,  // 武器配分1%につき、毎秒たまる熱の量(武器50%なら 17.5/秒)
  VENT_BASE:      6.0,   // 自然放熱。真空なので「遅い」のがこのゲームの肝(仕様書9.3)
  VENT_RADIATOR: 22.0,   // ラジエーター展開中に上乗せされる放熱量
  VENT_SHUTDOWN: 30.0,   // 強制シャットダウン中の冷却量
  SHUTDOWN_SEC:   4.0,   // 無防備になる秒数

  // ドリフト中は自然放熱が何倍になるか。
  // 推力を切った慣性航行=エンジンを吹かしていない静かな機体、という演出。
  DRIFT_VENT_MULT: 2.0,
};

// --- 推進剤(PROPELLANT)の設定値(仕様書9.3の中核リソース3)---------
// 「電力と別枠──電気があっても燃料切れなら動けない」
const PROP = {
  MAX:         100,   // 満タン
  BURST_COST:    8,   // 回避バースト1回の消費量(=12回で空)
  BURST_HEAT:    6,   // 仕様書9.3「武器発射・高出力機動で蓄積」に基づく熱の跳ね上がり
  LOW:          20,   // この値を下回ると数値が赤くなる
};

// --- シールド強度の設定値(仕様書9.3の防御1段目)---------------------
// 「電力配分で回復速度が変化」
const SHIELD = {
  MAX:              100,   // 最大値
  REGEN_PER_POWER: 0.12,   // シールド配分1%につき、毎秒回復する量(配分25%なら 3.0/秒)
  TEST_DAMAGE:       20,   // Hキーの被弾テストで減る量
  LOW:               30,   // この値を下回ると数値が赤くなる
};

// ===================================================================
// オプション設定
//
// 将来この中身をオプション画面から書き換えられるようにする。
// 値を1つ変えるだけで挙動が変わる形にしておくと、設定画面はこの表に
// チェックボックスを並べるだけで済む。
// ===================================================================
const OPTIONS = {
  // ピッチ反転。
  //   true  … フライトスティック式(スターフォックス式)
  //           S=手前に引く=機首上げ / W=前に押す=機首下げ
  //   false … 直感式:W=機首上げ / S=機首下げ
  invertPitch: true,
};

// --- 主兵装の設定(仕様書9.6:F=主兵装発射)-------------------------
const WEAPON = {
  HEAT_PER_SHOT: 8,   // 1発ごとに上がる熱。仕様書9.3「武器発射で熱が蓄積」
};

// --- 各リソースの現在値 ---------------------------------------------
let heat = 0;               // 現在の熱量(0〜100)
let radiatorOpen = false;   // ラジエーターを展開しているか
let shutdownLeft = 0;       // 強制シャットダウンの残り秒数(0 なら通常状態)

let propellant = PROP.MAX;  // 推進剤の残量
let shieldHp   = SHIELD.MAX;// シールド強度の残量

// 演出用:一瞬だけゲージを光らせるための残り秒数(0.2秒ほどで消える)
let burstFlash  = 0;   // 回避バーストを撃った瞬間
let damageFlash = 0;   // 被弾した瞬間

// ドリフト(Shift長押し)入力の状態。
// 3D側(scene.js)にも drifting という変数があるが、あちらは「3Dの飛行状態」。
// クラシックスクリプトは名前空間を共有するため、同じ名前を使うと衝突する。
let driftInput = false;

// --- プリセット(仕様書9.6:キー 1/2/3 = 攻撃/防御/巡航)-------------
// 将来「格納庫でカスタム可」にする部分。今は固定値で持っておく。
// どれも合計がちょうど100になるように作ること。
const PRESETS = {
  '1': { name: 'ASSAULT / 攻撃', values: { weapon: 50, shield: 15, engine: 20, sensor: 15 } },
  '2': { name: 'GUARD / 防御',   values: { weapon: 15, shield: 50, engine: 20, sensor: 15 } },
  '3': { name: 'CRUISE / 巡航',  values: { weapon: 15, shield: 20, engine: 35, sensor: 30 } },
};

// --- 画面のHTML要素を、あらかじめ探しておく -------------------------
// 毎回探すと無駄なので、起動時に1回だけ集めて表に入れておく。
// gaugeEls.weapon.bar のように取り出せる形にする。
const gaugeEls = {};
for (const system of SYSTEMS) {
  // [data-system="weapon"] = HTML側で data-system="weapon" と書いた要素、という意味
  const root = document.querySelector(`[data-system="${system.key}"]`);
  gaugeEls[system.key] = {
    bar:   root.querySelector('.gauge-bar'),    // 伸び縮みする棒
    value: root.querySelector('.gauge-value'),  // 数値のかたまり(色を変える用)
    num:   root.querySelector('.num'),          // 数字そのもの(文字を書き換える用)
  };
}
const totalEl    = document.getElementById('total');
const presetEl   = document.getElementById('preset');
const consoleEl  = document.getElementById('console');
const heatPanel  = document.getElementById('heat-panel');
const heatBar    = document.getElementById('heat-bar');
const heatNum    = document.getElementById('heat-num');
const heatRateEl = document.getElementById('heat-rate');
const radEl      = document.getElementById('rad');
const timerEl    = document.getElementById('shutdown-timer');

const propBar    = document.getElementById('prop-bar');
const propNum    = document.getElementById('prop-num');
const propValue  = document.getElementById('prop-value');
const shieldBar  = document.getElementById('shield-bar');
const shieldNum  = document.getElementById('shield-num');
const shieldValue= document.getElementById('shield-value');
const shieldRegenEl = document.getElementById('shield-regen');

const killCountEl = document.getElementById('kill-count');
const combatLogEl = document.getElementById('combat-log');
const speedEl     = document.getElementById('speed');

// ===================================================================
// 描画:今の power の中身を、そのまま画面に書き出す
// ※「状態を変える」処理と「画面に描く」処理を分けるのがコツ。
//    値をいじったら最後に render() を呼ぶ、と決めておけば混乱しない。
// ===================================================================
function render() {
  let total = 0;

  for (const system of SYSTEMS) {
    const value = power[system.key];   // 例:38
    const el = gaugeEls[system.key];
    total += value;

    // 棒の高さ。筒の高さに対する割合なので「38%」と文字列で指定する
    el.bar.style.height = value + '%';

    // 色。hsl(色相, 鮮やかさ, 明るさ) の形式で指定する。
    // 配分値が大きいほど「明るさ」と「鮮やかさ」を上げて、電気が通っている感を出す。
    // Math.min(a, b) は「aとbの小さいほう」。上限を決めて白飛びを防いでいる。
    const light = Math.min(20 + value * 0.75, 72);   // 0%→暗い / 70%以上→最大の明るさ
    const sat   = Math.min(45 + value * 1.2,  95);   // 低配分ほどくすんだ色になる
    el.bar.style.backgroundColor = `hsl(${system.hue}, ${sat}%, ${light}%)`;

    // 棒の上端から漏れる光。配分が高いほど強く光る(計器のバックライト表現)
    const glow = Math.min(value / 60, 1);            // 0〜1 に収めた光の強さ
    el.bar.style.boxShadow = `0 0 ${8 + glow * 14}px hsla(${system.hue}, 100%, 60%, ${glow * 0.65})`;

    // 数値の文字も同じ色調で明滅させる
    el.value.style.color = `hsl(${system.hue}, ${sat}%, ${Math.min(45 + value * 0.6, 80)}%)`;

    // 数字だけを書き換える(毎フレーム呼ばれるので、作り直しではなく差し替え)
    el.num.textContent = value;
  }

  totalEl.textContent = total;   // 合計。常に100になっているかの確認用
}

// ===================================================================
// 熱ゲージの描画
// ===================================================================
function renderHeat() {
  const ratio = heat / HEAT.MAX;   // 0〜1

  heatBar.style.height = ratio * 100 + '%';

  // 色相 30(橙)→ 0(赤)。熱いほど赤へ寄り、明るく燃える
  const hue   = 30 - 30 * ratio;
  const light = 22 + 40 * ratio;
  heatBar.style.backgroundColor = `hsl(${hue}, 90%, ${light}%)`;
  heatBar.style.boxShadow = `0 0 ${6 + ratio * 20}px hsla(${hue}, 100%, 55%, ${ratio * 0.8})`;

  heatNum.textContent = Math.round(heat);
  heatNum.style.color = `hsl(${hue}, 90%, ${45 + 30 * ratio}%)`;

  // 危険域に入ったらパネルの枠を明滅させる(classList = CSSのクラスを付け外しする道具)
  heatPanel.classList.toggle('warn', heat >= HEAT.WARN && shutdownLeft <= 0);

  // ラジエーターの状態表示
  radEl.textContent = radiatorOpen ? 'RAD OPEN' : 'RAD CLOSED';
  radEl.classList.toggle('open', radiatorOpen);

  // 速度計。3D側が持っている今の速さを表示する
  speedEl.textContent = Math.round(currentSpeed());

  // 今この瞬間、熱が毎秒いくつ増減しているか(プラスなら増加中)
  const rate = currentHeatRate();
  heatRateEl.textContent = (rate >= 0 ? '+' : '') + rate.toFixed(1);
  heatRateEl.style.color = rate > 0 ? '#ff8a6a' : '#8fd8ff';

  // シャットダウン中の表示切替
  consoleEl.classList.toggle('shutdown', shutdownLeft > 0);
  if (shutdownLeft > 0) timerEl.textContent = shutdownLeft.toFixed(1);
}

// ===================================================================
// 推進剤・シールドの描画
// ===================================================================
function renderStatus() {
  // --- 推進剤(紫。電力とは別系統だと一目で分かる色にする)---
  const pRatio = propellant / PROP.MAX;
  propBar.style.height = pRatio * 100 + '%';
  // burstFlash が残っている間だけ明るく光らせる(撃った手応えの演出)
  const pLight = 22 + 38 * pRatio + burstFlash * 90;
  propBar.style.backgroundColor = `hsl(275, 70%, ${Math.min(pLight, 85)}%)`;
  propBar.style.boxShadow = `0 0 ${6 + pRatio * 12 + burstFlash * 60}px hsla(275, 100%, 70%, ${0.25 + pRatio * 0.4})`;
  propNum.textContent = Math.round(propellant);
  // classList.toggle(名前, 条件) = 条件が真ならクラスを付け、偽なら外す
  propValue.classList.toggle('low', propellant < PROP.LOW);

  // --- シールド強度(電力のシールド系統と同じ水色で揃える)---
  const sRatio = shieldHp / SHIELD.MAX;
  shieldBar.style.height = sRatio * 100 + '%';
  // 被弾直後は赤く光らせる(色相 200=水色 → 0=赤 へ一瞬ふれる)
  const sHue = 200 - 200 * damageFlash;
  shieldBar.style.backgroundColor = `hsl(${sHue}, 75%, ${22 + 38 * sRatio + damageFlash * 40}%)`;
  shieldBar.style.boxShadow = `0 0 ${6 + sRatio * 14 + damageFlash * 50}px hsla(${sHue}, 100%, 65%, ${0.25 + sRatio * 0.4})`;
  shieldNum.textContent = Math.round(shieldHp);
  shieldValue.classList.toggle('low', shieldHp < SHIELD.LOW);

  // 今の毎秒回復量。シャットダウン中と満タン時は 0
  const regen = currentShieldRegen();
  shieldRegenEl.textContent = '+' + regen.toFixed(1) + '/s';
  shieldRegenEl.style.color = regen > 0 ? '#8fd8ff' : '';
}

// シールドの毎秒回復量(仕様書9.3:電力配分で回復速度が変化)
function currentShieldRegen() {
  if (shutdownLeft > 0) return 0;              // 停止中は回復しない(＝無防備)
  if (shieldHp >= SHIELD.MAX) return 0;        // 満タンなら回復不要
  return power.shield * SHIELD.REGEN_PER_POWER;
}

// 現在の毎秒の熱収支を計算して返す(発熱 − 放熱)
function currentHeatRate() {
  if (shutdownLeft > 0) return -HEAT.VENT_SHUTDOWN;

  const gain = power.weapon * HEAT.PER_WEAPON;   // 武器配分に比例して発熱

  // 自然放熱。ドリフト中(推力カット)は2倍に増える。
  // ラジエーターぶんは倍率の対象外(こちらは機械的な強制放熱なので)
  const naturalVent = HEAT.VENT_BASE * (driftInput ? HEAT.DRIFT_VENT_MULT : 1);
  const vent = naturalVent + (radiatorOpen ? HEAT.VENT_RADIATOR : 0);

  return gain - vent;
}

// ===================================================================
// 配分操作:指定した系統に +10%。その分を他の3系統から均等に差し引く
// ===================================================================
function boost(targetKey, amount = 10) {
  // 対象以外の3系統を集める
  const others = SYSTEMS.map(s => s.key).filter(key => key !== targetKey);

  let rest = amount;   // まだ差し引けていない残り
  let taken = 0;       // 実際に差し引けた合計

  // 1ポイントずつ順番に回って引く、を必要な回数くり返す。
  // こうすると自動的に「均等」になり、0%になった系統は自然と飛ばされる。
  while (rest > 0) {
    // まだ引ける(残量が1以上ある)系統だけを対象にする
    const available = others.filter(key => power[key] > 0);
    if (available.length === 0) break;   // 全部0%。もう引けないので終了

    for (const key of available) {
      if (rest === 0) break;
      power[key] -= 1;
      rest -= 1;
      taken += 1;
    }
  }

  // 他から引けた分だけ増やす。これで合計は必ず100のまま保たれる
  power[targetKey] += taken;

  presetEl.textContent = 'MANUAL';   // 手動で動かしたのでプリセット表示を解除
  render();
}

// ===================================================================
// プリセット適用:あらかじめ決めた配分に一気に切り替える
// ===================================================================
function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) return;   // 定義のないキーなら何もしない

  // power の中身を、プリセットの値で上書きする
  for (const system of SYSTEMS) {
    power[system.key] = preset.values[system.key];
  }

  presetEl.textContent = preset.name;
  render();
}

// ===================================================================
// 回避バースト(Space)
// 仕様書9.3:「急機動(回避バースト)で消費。電力と別枠──
//             電気があっても燃料切れなら動けない」
// ===================================================================
function burst() {
  // 残量が足りなければ発動しない。ここが「燃料切れなら動けない」の実装
  if (propellant < PROP.BURST_COST) {
    console.log('PROPELLANT EMPTY ― バースト不能');
    return;
  }

  propellant -= PROP.BURST_COST;
  heat = Math.min(heat + PROP.BURST_HEAT, HEAT.MAX);   // 高出力機動なので熱も跳ねる
  burstFlash = 0.22;                                   // 演出:一瞬光らせる
}

// ===================================================================
// 被弾テスト(H)― 本番では敵の攻撃がこれを呼ぶ
// ===================================================================
function takeDamage(amount) {
  shieldHp = Math.max(shieldHp - amount, 0);
  damageFlash = 0.3;
  // シールドが0になったら、本来はここからHULL(機体構造)が削られる。
  // HULLはフェーズ1で追加する。
  if (shieldHp <= 0) console.log('SHIELD DOWN ― 以降の被弾はHULLへ');
}

// ===================================================================
// キーボード入力
// ===================================================================
// 今どのキーが「押しっぱなし」かを覚えておく入れ物。
// 電力配分は「1回押して1段階」だが、操縦(W/A/S/D)は押している間ずっと動かすため、
// 押した/離したの両方を記録する必要がある。
// Set = 同じものを重複して入れない集合。has()で「入っているか」を調べられる。
const keysHeld = new Set();

// キー名 → 系統 の対応表(仕様書9.6)
const KEY_TO_SYSTEM = {
  ArrowUp:    'weapon',
  ArrowLeft:  'shield',
  ArrowRight: 'engine',
  ArrowDown:  'sensor',
};

// addEventListener = 「キーが押されたら、この関数を呼んでくれ」という予約
window.addEventListener('keydown', (event) => {
  keysHeld.add(event.key.toLowerCase());   // 押しっぱなし判定用に記録

  // H キー … 被弾テスト(テスト用。フェーズ1で敵の攻撃に置き換える)
  // これは「自分の操作」ではなく「敵にやられること」なので、
  // シャットダウン判定より前に置く ― 停止中こそ被弾するのが「無防備」の意味。
  if (event.key.toLowerCase() === 'h') {
    takeDamage(SHIELD.TEST_DAMAGE);
    return;
  }

  // 強制シャットダウン中は自分の操作をいっさい受け付けない(＝無防備。仕様書9.3)
  // 回避バーストも当然使えない ― これが「無防備」の中身
  if (shutdownLeft > 0) {
    if (KEY_TO_SYSTEM[event.key] || event.key === ' ') event.preventDefault();
    return;
  }

  const system = KEY_TO_SYSTEM[event.key];
  if (system) {
    event.preventDefault();   // 矢印キーで画面がスクロールするのを止める
    boost(system);
    return;
  }

  // 1 / 2 / 3 キー … プリセット切替
  if (PRESETS[event.key]) {
    applyPreset(event.key);
    return;
  }

  // V キー … ラジエーター展開/収納
  // toLowerCase() で、Shiftを押していても大文字/小文字どちらでも反応するようにする
  if (event.key.toLowerCase() === 'v') {
    radiatorOpen = !radiatorOpen;   // ! は「逆にする」。true↔false が入れ替わる
    return;
  }

  // Space キー … 回避バースト
  if (event.key === ' ') {
    event.preventDefault();   // Spaceで画面がスクロールするのを止める
    if (!event.repeat) burst();   // 押しっぱなしの連射は無効(1回押して1回)
    return;
  }

  // F キー … 主兵装発射(仕様書9.6)
  // 押しっぱなしでは連射しない。撃つ回数=熱の上がり方をプレイヤーが自分で決める形にする。
  // 仕様書9.3「攻撃的なプレイヤーほどリスクを背負う」を、この1行が担っている。
  if (event.key.toLowerCase() === 'f' && !event.repeat) {
    fire();
    return;
  }
});

// キーを離したら記録から消す
window.addEventListener('keyup', (event) => {
  keysHeld.delete(event.key.toLowerCase());
});

// 別のウィンドウに切り替えたときは全部離した扱いにする。
// これをしないと「押したまま画面を離れた」キーが押されっぱなしで固まる。
window.addEventListener('blur', () => keysHeld.clear());

// ===================================================================
// 戦果の表示 ― scene.js の命中判定から呼ばれる
//
// 3D側は「当たった」ことだけを知らせ、画面にどう出すかは main.js が決める。
// こうしておくと、後で表示を変えたくなったときに3Dのコードを触らずに済む。
// ===================================================================
let killCount = 0;   // 撃墜数

// 命中したとき。remainingHp = 敵機の残りHP
function onHit(remainingHp) {
  addCombatLog('HIT', 'hit');
  console.log('HIT ― 敵機の残りHP: ' + remainingHp);
}

// 撃墜したとき
function onKill() {
  killCount += 1;
  killCountEl.textContent = killCount;
  addCombatLog('★ KILL', 'kill');
  console.log('KILL ― 累計撃墜数: ' + killCount);
}

// 画面下のログに1行足す。時間が経つとCSSのアニメーションで自然に消える
function addCombatLog(text, kind) {
  const line = document.createElement('div');   // 新しい行を作る
  line.className = 'log-line ' + kind;
  line.textContent = text;
  combatLogEl.appendChild(line);

  // 薄れきったら要素そのものを取り除く。
  // これをしないと、見えない行が延々と溜まり続けてしまう。
  line.addEventListener('animationend', () => line.remove());

  // 一度に表示するのは4行まで。古いものから消す
  while (combatLogEl.children.length > 4) {
    combatLogEl.removeChild(combatLogEl.firstChild);
  }
}

// ===================================================================
// 発射:熱を上げて、3D空間にビームを撃つ
// ===================================================================
function fire() {
  heat = Math.min(heat + WEAPON.HEAT_PER_SHOT, HEAT.MAX);
  fireBolt();   // scene.js:見た目のビームを飛ばす

  // 発射で限界を超えたら、その場でシャットダウン
  if (heat >= HEAT.MAX) {
    heat = HEAT.MAX;
    shutdownLeft = HEAT.SHUTDOWN_SEC;
    console.log('OVERHEAT ― 強制シャットダウン(発射熱)');
  }
}

// ===================================================================
// ゲームループ ― 毎秒の時間経過を処理する心臓部
//
// requestAnimationFrame は「次の画面更新のタイミングで、この関数をもう一度呼んで」
// とブラウザに頼む命令。これを関数の最後で自分自身に対して行うことで、
// 毎秒およそ60回ぐるぐる回り続ける。フェーズ1の3D戦闘もこの上に載る。
// ===================================================================
let lastTime = 0;
let elapsed  = 0;   // 起動からの累計秒数(3D側の動きに使う)

function tick(now) {
  // now はページを開いてからの経過ミリ秒。前回との差＝この1コマの長さ(秒)を出す。
  // Math.min(..., 0.1) は、別タブに移って戻ったときに時間が飛ぶのを防ぐための上限。
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  elapsed += dt;

  updateDrift();                    // Shift の押し具合を見る(update より先。熱の計算に効く)
  update(dt);                       // 7パラメーターの時間経過
  updateView(dt);                   // W/A/S/D による機首操作
  updateFlight(dt, power.engine);   // 自機の前進(速度はエンジンの電力配分に比例)
  updateScene(dt, elapsed);         // 敵機・弾・破片の更新と描画(scene.js)
  renderHeat();        // 計器の描画
  renderStatus();

  requestAnimationFrame(tick);   // 次のコマを予約(これで無限に回り続ける)
}

// ===================================================================
// 操縦入力 → 視点の向き(仕様書9.6:左手=操縦士)
// 押されているキーを見て「上下にいくつ」「左右にいくつ」を -1〜+1 で決め、
// 実際にカメラを回すのは scene.js の turnView() に任せる。
// ===================================================================
// ===================================================================
// ドリフト入力(Shift長押し)
//
// 押している間だけ推力を切る。押しっぱなしを見るので、1回押して1回ではなく
// 毎コマ「今押されているか」を確かめる形にする。
// ===================================================================
function updateDrift() {
  // シャットダウン中は自分では推力を制御できない
  driftInput = (shutdownLeft <= 0) && keysHeld.has('shift');

  // 3D側へ「推力を止めるか」を伝える。
  // シャットダウン中は電力が落ちているのでエンジンも吹かない = 慣性で流される。
  // (自分の意思のドリフトではないので、下の DRIFT 表示は点けない)
  setDrift(driftInput || shutdownLeft > 0);

  // 画面の見た目(青い枠と DRIFT 表示)を切り替える
  consoleEl.classList.toggle('drift', driftInput);
}

function updateView(dt) {
  // シャットダウン中は機首も動かせない(＝無防備)
  if (shutdownLeft > 0) return;

  // まず「直感式」で向きを決める。W=上 / S=下。両方押されていたら 0(打ち消し合う)
  // pitchDir は +1 で機首上げ、-1 で機首下げ。
  let pitchDir = 0;
  if (keysHeld.has('w')) pitchDir += 1;
  if (keysHeld.has('s')) pitchDir -= 1;

  // オプションが有効なら、ここで上下をひっくり返してスティック式にする。
  // 反転の処理はこの1行だけ。設定画面からは OPTIONS.invertPitch を書き換えればよい。
  if (OPTIONS.invertPitch) pitchDir = -pitchDir;

  // A=左を向く / D=右を向く(左右は反転設定の対象外)
  let yawDir = 0;
  if (keysHeld.has('a')) yawDir += 1;
  if (keysHeld.has('d')) yawDir -= 1;

  turnView(dt, pitchDir, yawDir);
}

// 1コマぶんの状態更新。dt = 経過秒数
function update(dt) {
  // 演出用の光を時間とともに消していく(0未満にはしない)
  burstFlash  = Math.max(burstFlash  - dt, 0);
  damageFlash = Math.max(damageFlash - dt, 0);

  if (shutdownLeft > 0) {
    // --- 停止中:強制冷却しながらカウントダウン。シールドは回復しない ---
    shutdownLeft -= dt;
    heat = Math.max(heat - HEAT.VENT_SHUTDOWN * dt, 0);
    if (shutdownLeft <= 0) {
      shutdownLeft = 0;
      console.log('SYSTEM REBOOT ― 復帰');
    }
    return;   // 停止中は通常の発熱・回復処理をしない
  }

  // --- 通常時:発熱 − 放熱 ---
  heat += currentHeatRate() * dt;
  heat = Math.max(heat, 0);   // 0未満にはしない

  // --- シールド回復(シールド系統の配分に比例)---
  shieldHp = Math.min(shieldHp + currentShieldRegen() * dt, SHIELD.MAX);

  // 推進剤は自然回復しない(仕様書9.4:補給は旗艦ドッキングで行う)

  // 限界突破 → 強制シャットダウン(数秒間、無防備)
  if (heat >= HEAT.MAX) {
    heat = HEAT.MAX;
    shutdownLeft = HEAT.SHUTDOWN_SEC;
    console.log('OVERHEAT ― 強制シャットダウン');
  }
}

// --- 起動 -----------------------------------------------------------
document.getElementById('build').textContent = BUILD;   // 画面に版数を出す
console.log('STEEL CRADLE build: ' + BUILD);

initScene();                     // 3D空間の準備(scene.js)。失敗しても計器は動く
render();                        // 電力ゲージの初期表示
requestAnimationFrame((t) => {   // ループ開始。1回目は dt=0 になるよう時刻を合わせる
  lastTime = t;
  tick(t);
});
console.log('POWER DISTRIBUTION ONLINE');
