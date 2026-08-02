// ===================================================================
// STEEL CRADLE / フェーズ0:電力配分システム
//
// 仕様書 9.3:発電量100%を「武器/シールド/エンジン/センサー」の4系統に手動配分。
//            合計100%を超えられない。
// 仕様書 9.6:↑武器 ←シールド →エンジン ↓センサー に +10%
//            (他系統から自動で均等に吸う)
// ===================================================================

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

// --- 各リソースの現在値 ---------------------------------------------
let heat = 0;               // 現在の熱量(0〜100)
let radiatorOpen = false;   // ラジエーターを展開しているか
let shutdownLeft = 0;       // 強制シャットダウンの残り秒数(0 なら通常状態)

let propellant = PROP.MAX;  // 推進剤の残量
let shieldHp   = SHIELD.MAX;// シールド強度の残量

// 演出用:一瞬だけゲージを光らせるための残り秒数(0.2秒ほどで消える)
let burstFlash  = 0;   // 回避バーストを撃った瞬間
let damageFlash = 0;   // 被弾した瞬間

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
  const gain = power.weapon * HEAT.PER_WEAPON;                        // 武器配分に比例して発熱
  const vent = HEAT.VENT_BASE + (radiatorOpen ? HEAT.VENT_RADIATOR : 0);
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
// キー名 → 系統 の対応表(仕様書9.6)
const KEY_TO_SYSTEM = {
  ArrowUp:    'weapon',
  ArrowLeft:  'shield',
  ArrowRight: 'engine',
  ArrowDown:  'sensor',
};

// addEventListener = 「キーが押されたら、この関数を呼んでくれ」という予約
window.addEventListener('keydown', (event) => {
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
});

// ===================================================================
// ゲームループ ― 毎秒の時間経過を処理する心臓部
//
// requestAnimationFrame は「次の画面更新のタイミングで、この関数をもう一度呼んで」
// とブラウザに頼む命令。これを関数の最後で自分自身に対して行うことで、
// 毎秒およそ60回ぐるぐる回り続ける。フェーズ1の3D戦闘もこの上に載る。
// ===================================================================
let lastTime = 0;

function tick(now) {
  // now はページを開いてからの経過ミリ秒。前回との差＝この1コマの長さ(秒)を出す。
  // Math.min(..., 0.1) は、別タブに移って戻ったときに時間が飛ぶのを防ぐための上限。
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dt);
  renderHeat();
  renderStatus();

  requestAnimationFrame(tick);   // 次のコマを予約(これで無限に回り続ける)
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
render();                        // 電力ゲージの初期表示
requestAnimationFrame((t) => {   // ループ開始。1回目は dt=0 になるよう時刻を合わせる
  lastTime = t;
  tick(t);
});
console.log('POWER DISTRIBUTION ONLINE');
