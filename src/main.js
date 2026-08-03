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
const BUILD = 'p1-28 weapons';

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

// --- 機体構造(HULL)の設定値(仕様書9.3の防御2段目)-----------------
// 「戦闘中回復不可。計器破損で表現──『どこを壊されたか』が数字より重い」
const HULL = {
  MAX_DAMAGE:        5,   // これだけ食らうとミッション失敗
};

// --- ミッションの枠組み(仕様書9.1「1ゲーム最長10分の短期決戦」)-------
const MISSION = {
  DURATION:   600,   // 制限時間(秒)= 10分
  KILL_GOAL:   10,   // 勝利条件:この数だけ撃墜する
  WARN_SEC:    60,   // 残りこの秒数を切ったら、タイマーを赤く点滅させる
};

// --- 敵の攻撃を受けたときの設定 -------------------------------------
const INCOMING = {
  SHIELD_DAMAGE:    15,   // 敵弾1発でシールドが減る量
  SHAKE_STRENGTH: 0.55,   // 画面の揺れの強さ
  SHAKE_HULL:     1.30,   // HULL損傷時はもっと大きく揺らす
  SHAKE_SEC:      0.35,   // 揺れが収まるまでの秒数
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

  // 起動時の視点。'third' = 三人称 / 'cockpit' = コックピット
  // ゲーム中は X キーでいつでも切り替えられる。
  startView: 'third',
};

// --- コックピット音声を出す条件 -------------------------------------
// 「言い終わる前に手遅れになる」警告を防ぐため、熱だけは予測でも出す。
const VOICE_TRIGGER = {
  OVERHEAT_PCT:   90,    // 熱がこの値を超えたら警告
  OVERHEAT_LEAD: 2.6,    // 限界まで残りこの秒数を切っても警告(読み上げの長さぶん)
  SHIELD_PCT:     50,    // シールドがこの値を下回ったら通知
  FUEL_PCT:       20,    // 推進剤がこの値を下回ったら通知
};

// 一度言った警告は、状態が戻るまで言い直さない(そのための記録)
let saidOverheat = false;
let saidShieldHalf = false;
let saidShieldFail = false;
let saidCritical = false;
let saidFuelLow = false;

// --- 照準の捕捉フィードバック ---------------------------------------
const CAPTURE = {
  BEEP_START: 0.52,   // 捉えた直後の鳴動間隔(秒)
  BEEP_END:   0.085,  // 捉え続けたときの最短の間隔
  RAMP_SEC:   2.6,    // この秒数かけて「ビー」から「ビビビ」へ詰まる
};

// ===================================================================
// 兵装(仕様書9.3の7パラメーター最後のひとつ「弾数/チャージ」)
//
// 「実体弾系=弾数制でリロード不可、ビーム系=無限だが電力と熱を大食い。
//   『無限だが管理が重い』vs『軽いが有限』の武器哲学の対立」
//
// この対立を数字にすると:
//   ビーム … 弾は無限。ただし熱が重く、武器へ電力を回していないと撃てない
//   実体弾 … 熱は軽く電力もいらない。ただし弾は有限で、戦闘中は補充できない
// ===================================================================
const WEAPONS = [
  {
    key: 'BEAM',
    label: 'BEAM',        // ビーム砲
    jp: 'ビーム砲',
    heat: 8,              // 1発ごとに上がる熱(重い)
    ammo: Infinity,       // 弾数無限。撃ち放題
    minPower: 15,         // 武器への電力配分がこれ未満だと撃てない
    auto: false,          // 押しっぱなしでは連射しない
    interval: 0,
    boltColor: 0x9fe1cb,
  },
  {
    key: 'CANNON',
    label: 'CANNON',      // 機関砲
    jp: '機関砲',
    heat: 0.5,            // ほぼ熱を出さない。ビームの16分の1
                          //   = 撃ってもレーダーに映りにくい隠密武器の下地
    ammo: 120,            // 有限。戦闘中は補充できない(リロード不可)
    minPower: 0,          // 電力を必要としない
    auto: true,           // Fを押しっぱなしで連射できる
    interval: 0.09,       // 連射の間隔(秒)。毎秒約11発
    boltColor: 0xffcf6a,
  },
];

let weaponIndex = 0;                  // 今選んでいる兵装
let ammo = [Infinity, WEAPONS[1].ammo];   // 兵装ごとの残弾
let fireCooldown = 0;                 // 次に撃てるようになるまでの残り秒
let saidAmmoOut = false;              // 弾切れ音声を言ったか(1回だけ)

// 今の兵装を取り出す短縮形
const currentWeapon = () => WEAPONS[weaponIndex];

// --- 各リソースの現在値 ---------------------------------------------
let heat = 0;               // 現在の熱量(0〜100)
let radiatorOpen = false;   // ラジエーターを展開しているか
let shutdownLeft = 0;       // 強制シャットダウンの残り秒数(0 なら通常状態)

let propellant = PROP.MAX;  // 推進剤の残量
let shieldHp   = SHIELD.MAX;// シールド強度の残量

// 演出用:一瞬だけゲージを光らせるための残り秒数(0.2秒ほどで消える)
let burstFlash  = 0;   // 回避バーストを撃った瞬間
let damageFlash = 0;   // 被弾した瞬間

// ===================================================================
// 計器の破損と機能喪失(仕様書9.3)
//
// 「被弾表現は数値バーではなく計器の破損。センサー被弾でレーダーにノイズ、
//   武器系被弾で発射不可等、『どこを壊されたか』が数字より重い」
//
// 壊れた計器は見た目が乱れるだけでなく、その計器が司る機能を失う。
// どこを壊されたかで、その後の戦い方を変えざるを得なくなるのが狙い。
// ===================================================================
const BREAKAGE = {
  weapon:     { label: '武器',     lost: '発射不能' },
  shield:     { label: 'シールド', lost: '再生停止' },
  engine:     { label: 'エンジン', lost: '推力固定' },
  sensor:     { label: 'センサー', lost: '索敵半減' },
  heat:       { label: '熱',       lost: '冷却不能' },
  propellant: { label: '推進剤',   lost: 'バースト不能' },
  shieldhp:   { label: 'シールド強度', lost: '表示不正確' },
};

// 壊れた系統の名前を入れておく集合。has() で「壊れているか」を調べる
const brokenSystems = new Set();
const isBroken = (key) => brokenSystems.has(key);

// --- 被弾・ミッション状態 -------------------------------------------
let hullDamage    = 0;       // これまでに受けたHULL損傷の回数
let hitsTaken     = 0;       // 被弾した回数(リザルト用)

// ミッションの進行状態。
//   'active'   … 戦闘中
//   'complete' … 勝利(規定数を撃墜した)
//   'failed'   … 敗北(HULL損傷が限界)
//   'timeup'   … 敗北(時間切れ)
let missionState  = 'active';
let missionTime   = MISSION.DURATION;   // 残り秒数

let shakeLeft     = 0;       // 画面の揺れの残り秒数
let shakeStrength = 0;       // 揺れの強さ
let hitVignette   = 0;       // 被弾した瞬間に強く光る赤の残り時間

// 照準の捕捉音のための状態
let lastAimState = 'CLEAR';   // 前のコマの照準状態(変わった瞬間を知るため)
let beepTimer = 0;            // 次の「ビー」までの残り秒
let overheatTimer = 0;        // 熱の警告音を鳴らす間隔の残り秒
let lastTimeWarned = false;   // 残り1分の警告をもう鳴らしたか

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
const aiStateEl   = document.getElementById('ai-state');
const hullEl      = document.getElementById('hull');
const vignetteEl  = document.getElementById('damage-vignette');

const radarEl       = document.getElementById('radar');
const radarRangeEl  = document.getElementById('radar-range');
const radarSensorEl = document.getElementById('radar-sensor');
const markerLayer   = document.getElementById('marker-layer');
const crosshairEl   = document.querySelector('.crosshair');
const viewModeEl    = document.getElementById('view-mode');
const weaponPanelEl = document.getElementById('weapon-panel');
const weaponNameEl  = document.getElementById('wp-name');
const weaponAmmoEl  = document.getElementById('wp-ammo');
const weaponHeatEl  = document.getElementById('wp-heat');
const weaponJpEl    = document.getElementById('wp-jp');

const timerElMission = document.getElementById('mission-timer');
const resultPanel    = document.getElementById('result-panel');
const resultTitleEl  = document.getElementById('result-title');
const resultReasonEl = document.getElementById('result-reason');
const rKillsEl       = document.getElementById('r-kills');
const rHitsEl        = document.getElementById('r-hits');
const rTimeEl        = document.getElementById('r-time');

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

  // --- HULL残量と赤いビネット ---
  const hullLeft = HULL.MAX_DAMAGE - hullDamage;
  hullEl.textContent = hullLeft;
  hullEl.style.color = hullLeft <= 2 ? '#ff5a3c' : '';

  // 損傷が進むほど常時うっすら赤くなり、被弾の瞬間だけ強く光る
  const baseRed = (hullDamage / HULL.MAX_DAMAGE) * 0.55;
  const flashRed = hitVignette / 0.45;
  vignetteEl.style.opacity = Math.min(baseRed + flashRed * 0.75, 1);

  // 敵AIの状態(接近/攻撃/発射/回避)。動作確認しやすいよう計器に出しておく
  const aiState = currentEnemyState();
  aiStateEl.textContent = aiState;
  aiStateEl.style.color = (aiState === 'FIRING') ? '#ff6a4d'
                        : (aiState === 'EVADE')  ? '#ffcf6a' : '';

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
  // シールド強度の計器が壊れていると、表示だけが揺らいで信用できなくなる
  //(実際の値は正しく動いている。「計器が壊れた」のであって装甲が壊れたのではない)
  const shownShield = isBroken('shieldhp')
    ? Math.max(0, Math.round(shieldHp + (Math.random() - 0.5) * 26))
    : Math.round(shieldHp);
  shieldNum.textContent = shownShield;
  shieldValue.classList.toggle('low', shieldHp < SHIELD.LOW);

  // 今の毎秒回復量。シャットダウン中と満タン時は 0
  const regen = currentShieldRegen();
  shieldRegenEl.textContent = '+' + regen.toFixed(1) + '/s';
  shieldRegenEl.style.color = regen > 0 ? '#8fd8ff' : '';
}

// シールドの毎秒回復量(仕様書9.3:電力配分で回復速度が変化)
function currentShieldRegen() {
  if (isBroken('shield')) return 0;            // シールド系が壊れていると再生しない
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
  // 仕様書9.6「電力系被弾→十字の一方向グレーアウト(対応キーも無効化)」
  if (isBroken(targetKey)) {
    addCombatLog(BREAKAGE[targetKey].label + '系 損傷', 'hull');
    playDenied();
    return;
  }

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
  playPowerClick();
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
  playPresetConfirm();
  render();
}

// ===================================================================
// 回避バースト(Space)
// 仕様書9.3:「急機動(回避バースト)で消費。電力と別枠──
//             電気があっても燃料切れなら動けない」
// ===================================================================
function burst() {
  // 推進剤系が壊れていると噴射できない
  if (isBroken('propellant')) {
    addCombatLog('推進剤系 損傷', 'hull');
    playDenied();
    return;
  }

  // 残量が足りなければ発動しない。ここが「燃料切れなら動けない」の実装
  if (propellant < PROP.BURST_COST) {
    console.log('PROPELLANT EMPTY ― バースト不能');
    playDenied();
    return;
  }

  propellant -= PROP.BURST_COST;
  heat = Math.min(heat + PROP.BURST_HEAT, HEAT.MAX);   // 高出力機動なので熱も跳ねる
  burstFlash = 0.22;                                   // 演出:一瞬光らせる
  playBurst();
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
  resumeAudio();   // ブラウザの規則で、最初のキー入力があるまで音は鳴らせない

  // X キー … 三人称 ⇄ コックピット の切り替え
  // 視点は「今どちらか」を scene.js だけが持っている。
  // 同じ状態を2か所で持つとズレる原因になるので、ここでは尋ねて反転させるだけ。
  if (event.key.toLowerCase() === 'x') {
    applyViewMode(!isCockpitView());
    return;
  }

  // Enter キー … リザルト表示中の再出撃
  // (仕様書9.6でRは武器切替と決まっているため、再出撃は別のキーへ移した)
  if (event.key === 'Enter') {
    if (missionState !== 'active') restartMission();
    return;
  }

  // R キー … 武器切替(仕様書9.6)
  if (event.key.toLowerCase() === 'r') {
    if (missionState === 'active') switchWeapon();
    return;
  }

  // ミッションが終わっている間は、以下の操作を受け付けない
  if (missionState !== 'active') return;

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
    // 熱系の計器が壊れているとラジエーターを動かせない
    if (isBroken('heat')) { addCombatLog('冷却系 損傷', 'hull'); playDenied(); return; }
    radiatorOpen = !radiatorOpen;   // ! は「逆にする」。true↔false が入れ替わる
    playRadiator(radiatorOpen);
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
    // 連射武器も最初の1発はここで撃つ。以降は updateAutoFire が続ける
    if (fireCooldown <= 0) fire();
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
// 視点の切り替えを、3D側とHTML側の両方に反映する
//
// 3D側 … カメラ位置と内装の表示(scene.js の setViewMode)
// HTML側 … 計器の配置。コックピットでは計器台に組み込まれた並びに変える
// ===================================================================
function applyViewMode(isCockpit) {
  const nowCockpit = setViewMode(isCockpit);
  playViewClick();
  viewModeEl.textContent = nowCockpit ? 'COCKPIT' : '3RD';
  consoleEl.classList.toggle('cockpit', nowCockpit);
  return nowCockpit;
}

// 敵が発射予告に入った(＝こちらが狙われた)。scene.js から呼ばれる
function onIncomingLock() {
  if (missionState !== 'active') return;
  playLockWarning();
  speakVoice('INCOMING');
}

// ===================================================================
// コックピット音声の監視
//
// 「状態が境目をまたいだ瞬間」にだけ言わせる。毎コマ条件を見て
// 言い続けると、うるさいうえに言葉が重なって聞き取れない。
// 一度言ったら、状態が戻るまでフラグで止める。
// ===================================================================
function updateVoiceAlerts(dt) {
  voiceTick(dt);
  if (missionState !== 'active') return;

  // --- 熱 ---
  // 「90%を超えた」か「このままだと数秒で限界」のどちらかで警告する。
  // 予測を入れないと、武器配分が高いときに言い終わる前に落ちてしまう。
  const rate = currentHeatRate();
  const secondsToMax = (rate > 0) ? (HEAT.MAX - heat) / rate : Infinity;
  const overheatNear = (heat >= VOICE_TRIGGER.OVERHEAT_PCT) ||
                       (secondsToMax <= VOICE_TRIGGER.OVERHEAT_LEAD);

  if (overheatNear && !saidOverheat && shutdownLeft <= 0) {
    speakVoice('OVERHEAT');
    saidOverheat = true;
  } else if (heat < HEAT.WARN) {
    saidOverheat = false;   // 危険域を抜けたら、また言えるようにする
  }

  // --- シールド ---
  if (shieldHp <= 0 && !saidShieldFail) {
    speakVoice('SHIELD_FAILURE');
    saidShieldFail = true;
  } else if (shieldHp > 0) {
    saidShieldFail = false;
  }

  if (shieldHp > 0 && shieldHp <= VOICE_TRIGGER.SHIELD_PCT && !saidShieldHalf) {
    speakVoice('SHIELD_FIFTY');
    saidShieldHalf = true;
  } else if (shieldHp > VOICE_TRIGGER.SHIELD_PCT) {
    saidShieldHalf = false;
  }

  // --- HULL 残り1 ---
  const hullLeft = HULL.MAX_DAMAGE - hullDamage;
  if (hullLeft === 1 && !saidCritical) {
    speakVoice('CRITICAL_DAMAGE');
    saidCritical = true;
  } else if (hullLeft > 1) {
    saidCritical = false;
  }

  // --- 推進剤 ---
  if (propellant <= VOICE_TRIGGER.FUEL_PCT && !saidFuelLow) {
    speakVoice('FUEL_LOW');
    saidFuelLow = true;
  } else if (propellant > VOICE_TRIGGER.FUEL_PCT) {
    saidFuelLow = false;
  }
}

// ===================================================================
// 照準の捕捉フィードバック
//
// 判定そのものは3D側(scene.js の updateAim)。ここは音の担当。
// 捉えた瞬間に1回鳴らし、捉えている間は一定間隔で鳴らし続ける。
// ===================================================================
function updateAimFeedback(dt) {
  const state = updateAim(dt);

  if (state !== 'CLEAR') {
    // 捉え続けた時間に応じて 0→1 へ。1に近いほど間隔が詰まる
    const progress = Math.min(currentAimHold() / CAPTURE.RAMP_SEC, 1);
    const interval = CAPTURE.BEEP_START +
                     (CAPTURE.BEEP_END - CAPTURE.BEEP_START) * progress;

    if (lastAimState === 'CLEAR') {
      speakVoice('TARGET_ACQUIRED');
      playCaptureBeep(progress);   // 捉えた瞬間にすぐ1回
      beepTimer = interval;
    } else {
      beepTimer -= dt;
      if (beepTimer <= 0) {
        playCaptureBeep(progress);
        beepTimer = interval;
      }
    }
  } else {
    beepTimer = 0;   // 外したら次に捉えたとき即座に鳴るようにしておく
  }

  lastAimState = state;
}

// ===================================================================
// レーダースコープと敵マーカー(仕様書9.6の下段左 + 中央HUD)
//
// 輝点とマーカーは敵の数だけ必要なので、起動時にまとめて作っておき、
// 毎コマ「使う/使わない」を切り替える。毎回作り直すと重くなる。
// ===================================================================
const radarBlips   = [];   // レーダーの輝点
const enemyMarkers = [];   // 3D画面に重ねる敵マーカー

function setupRadar() {
  const count = (typeof enemyCount === 'function') ? enemyCount() : 0;

  for (let i = 0; i < count; i++) {
    const blip = document.createElement('div');
    blip.className = 'radar-blip';
    radarEl.appendChild(blip);
    radarBlips.push(blip);

    const marker = document.createElement('div');
    marker.className = 'enemy-marker';
    // 四隅の括弧4つ + 距離の文字
    marker.innerHTML = '<span></span><span></span><span></span><span></span>' +
                       '<span class="dist"></span>';
    markerLayer.appendChild(marker);
    enemyMarkers.push(marker);
  }
}

// カメラが機首より遅れて追うようになったため、照準は画面中央に固定できない。
// 機首の正面(=弾が飛ぶ方向)を画面へ投影した位置へ毎コマ動かす。
function renderCrosshair() {
  // コックピットでは光像式照準器のレティクルが照準の役目を果たすので、
  // HTMLの十字は消す(仕様:視点で照準の方式が変わる)
  if (isCockpitView()) {
    crosshairEl.style.display = 'none';
    return;
  }

  const aim = getAimNdc();
  if (!aim || !aim.visible) {
    crosshairEl.style.display = 'none';
    return;
  }
  crosshairEl.style.display = '';
  crosshairEl.style.left = ((aim.x * 0.5 + 0.5) * 100) + '%';
  crosshairEl.style.top  = ((-aim.y * 0.5 + 0.5) * 100) + '%';
}

function renderRadar() {
  // センサー系が壊れていると索敵半径が半分になる(仕様書9.3)
  const sensorPct = isBroken('sensor') ? power.sensor * 0.5 : power.sensor;
  const range = sensorRange(sensorPct);
  radarRangeEl.textContent = Math.round(range);
  radarSensorEl.textContent = power.sensor;
  radarEl.classList.toggle('noisy', isBroken('sensor'));   // レーダーにノイズを出す

  // 索敵範囲内の敵だけが返ってくる。範囲外の敵はここに含まれない
  const contacts = getContacts(sensorPct);

  for (let i = 0; i < radarBlips.length; i++) {
    const blip = radarBlips[i];
    const marker = enemyMarkers[i];
    const c = contacts[i];

    if (!c) {
      // 捕捉できていないので、輝点もマーカーも消す
      blip.style.display = 'none';
      marker.style.display = 'none';
      continue;
    }

    // --- レーダーの輝点 ---
    // 自機から見た左右(localX)と前後(localZ)を、そのまま画面の横と縦に使う。
    // localZ がマイナス=前方 → 画面の上、になるので座標の向きがそのまま合う。
    let nx = c.localX / range;
    let ny = c.localZ / range;

    // 熱ボーナスで範囲外の敵が映るときは、円からはみ出すので縁に貼り付ける
    const r = Math.hypot(nx, ny);
    if (r > 0.94) { nx = (nx / r) * 0.94; ny = (ny / r) * 0.94; }

    blip.style.display = 'block';
    blip.style.left = (50 + nx * 50) + '%';
    blip.style.top  = (50 + ny * 50) + '%';
    blip.classList.toggle('hot', c.hot);

    // --- 3D画面の敵マーカー ---
    // 画面の後ろにいる敵にはマーカーを出さない(出すと変な位置に現れる)
    if (c.inFront) {
      marker.style.display = 'block';
      // ndc(-1〜+1)を画面の割合(0〜100%)に直す。縦は上下が逆なので符号を反転
      marker.style.left = ((c.ndcX * 0.5 + 0.5) * 100) + '%';
      marker.style.top  = ((-c.ndcY * 0.5 + 0.5) * 100) + '%';

      // 枠の大きさを距離に合わせる。近いほど敵が大きく映るので、枠も大きくする。
      // そうしないと近距離で枠が機体に埋もれて見えなくなる。
      const size = Math.max(26, Math.min(3600 / Math.max(c.dist, 1), 150));
      marker.style.width  = size + 'px';
      marker.style.height = size + 'px';

      marker.classList.toggle('hot', c.hot);
      marker.querySelector('.dist').textContent = Math.round(c.dist);
    } else {
      marker.style.display = 'none';
    }
  }
}

// 兵装を切り替える(仕様書9.6:R)
function switchWeapon() {
  weaponIndex = (weaponIndex + 1) % WEAPONS.length;
  fireCooldown = 0;
  saidAmmoOut = false;   // 別の武器に替えたので、また弾切れを知らせてよい
  playPresetConfirm();
  addCombatLog(currentWeapon().jp, 'warn');
  renderWeapon();
}

// 兵装パネルの表示(仕様書9.6「下段右=兵装パネル(弾数・神器コア状態)」)
function renderWeapon() {
  const w = currentWeapon();
  const left = ammo[weaponIndex];

  weaponNameEl.textContent = w.label;
  weaponJpEl.textContent = w.jp;
  weaponAmmoEl.textContent = (left === Infinity) ? '\u221e' : left;   // ∞
  weaponHeatEl.textContent = '+' + w.heat;

  // 残りが少ない、または電力不足で撃てないときは赤くする
  const low = (left !== Infinity && left <= 10);
  const noPower = (power.weapon < w.minPower);
  weaponPanelEl.classList.toggle('low', low || noPower);
  weaponPanelEl.classList.toggle('beam', w.key === 'BEAM');
}

// ===================================================================
// 戦果の表示 ― scene.js の命中判定から呼ばれる
//
// 3D側は「当たった」ことだけを知らせ、画面にどう出すかは main.js が決める。
// こうしておくと、後で表示を変えたくなったときに3Dのコードを触らずに済む。
// ===================================================================
let killCount = 0;   // 撃墜数

// 命中したとき。remainingHp = 敵機の残りHP
function onHit(remainingHp) {
  playEnemyHit();
  addCombatLog('HIT', 'hit');
  console.log('HIT ― 敵機の残りHP: ' + remainingHp);
}

// 撃墜したとき
function onKill() {
  playExplosion();
  speakVoice('TARGET_DESTROYED');
  killCount += 1;
  killCountEl.textContent = killCount;
  addCombatLog('★ KILL', 'kill');
  console.log('KILL ― 累計撃墜数: ' + killCount);

  // 勝利条件:制限時間内に規定数を撃墜する
  if (killCount >= MISSION.KILL_GOAL) endMission('complete');
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
// 自機が敵弾を受けた ― scene.js の命中判定から呼ばれる
//
// 仕様書9.3の2段構えの防御をそのまま実装する。
//   1段目:シールド強度が肩代わりする(電力配分で回復するので立て直せる)
//   2段目:シールドが割れていたらHULL(機体構造)が削れる。こちらは戦闘中回復しない
// ===================================================================
function onPlayerHit() {
  if (missionState !== 'active') return;   // リザルト表示中はもう減らさない

  hitsTaken += 1;              // リザルトに出す被弾回数
  hitVignette = 0.45;          // 画面端が一瞬強く赤く光る

  if (shieldHp > 0) {
    // --- シールドで受けた ---
    shieldHp = Math.max(shieldHp - INCOMING.SHIELD_DAMAGE, 0);
    damageFlash = 0.3;         // シールドゲージが赤く光る(既存の演出を流用)
    startShake(INCOMING.SHAKE_STRENGTH);
    addCombatLog('SHIELD −' + INCOMING.SHIELD_DAMAGE, 'warn');
    playShieldHit();

    if (shieldHp <= 0) { addCombatLog('SHIELD DOWN', 'hull'); playShieldDown(); }

  } else {
    // --- シールドが割れている:HULL損傷 ---
    hullDamage += 1;
    startShake(INCOMING.SHAKE_HULL);

    playHullDamage();
    const brokenName = breakRandomInstrument();
    addCombatLog('HULL DAMAGE ' + hullDamage + '/' + HULL.MAX_DAMAGE, 'hull');
    if (brokenName) addCombatLog(brokenName + ' 損傷', 'hull');

    if (hullDamage >= HULL.MAX_DAMAGE) endMission('failed');
  }
}

// ===================================================================
// 計器の破損(仕様書9.3「被弾表現=計器の破損」)
// まだ壊れていない計器の中からランダムに1つ選び、ノイズと明滅を出す。
// 機能そのものは止めない(見た目だけ)。壊した計器の名前を返す。
// ===================================================================
function breakRandomInstrument() {
  // 画面上のゲージをすべて集め、まだ無事なものだけを残す
  const all = Array.from(document.querySelectorAll('.gauge[data-system]'));
  const intact = all.filter((g) => !g.classList.contains('broken'));
  if (intact.length === 0) return null;   // もう全部壊れている

  const picked = intact[Math.floor(Math.random() * intact.length)];
  picked.classList.add('broken');

  const key = picked.dataset.system;
  brokenSystems.add(key);   // ここから機能が失われる

  const info = BREAKAGE[key];
  return info ? (info.label + ' ' + info.lost) : null;
}

// ===================================================================
// 画面の揺れ
// 強さを指定して呼ぶと、そこから SHAKE_SEC 秒かけて収まる。
// ===================================================================
function startShake(strength) {
  shakeStrength = Math.max(shakeStrength, strength);   // 連続被弾では強いほうを採用
  shakeLeft = INCOMING.SHAKE_SEC;
}

function updateShake(dt) {
  if (shakeLeft > 0) {
    shakeLeft -= dt;
    // 残り時間の割合を掛けて、だんだん小さくする
    const amp = shakeStrength * Math.max(shakeLeft / INCOMING.SHAKE_SEC, 0);
    const x = (Math.random() - 0.5) * amp;
    const y = (Math.random() - 0.5) * amp;

    setCameraShake(x, y);                 // 3D側のカメラを揺らす
    consoleEl.style.transform = `translate(${x * 7}px, ${y * 7}px)`;   // 計器も揺らす

    if (shakeLeft <= 0) shakeStrength = 0;
  } else {
    setCameraShake(0, 0);
    consoleEl.style.transform = '';
  }
}

// ===================================================================
// ミッション失敗と再出撃
// ===================================================================
// 秒数を「MM:SS」の形に整える。padStart(2,'0') は「2桁になるまで0で埋める」
function formatTime(seconds) {
  const s = Math.max(Math.ceil(seconds), 0);
  const m = Math.floor(s / 60);
  return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ミッション終了。result は 'complete' / 'failed' / 'timeup'
function endMission(result) {
  if (missionState !== 'active') return;   // 二重に終わらせない

  missionState = result;
  setCombatFrozen(true);          // 敵AIと敵弾を止める
  consoleEl.classList.add('failed');   // リザルト画面を表示するクラス

  // 見出しと理由。同じ枠を色違いで使い回す
  resultPanel.classList.remove('win', 'timeup');
  if (result === 'complete') {
    resultPanel.classList.add('win');
    resultTitleEl.textContent = 'MISSION COMPLETE';
    resultReasonEl.textContent = '規定数撃墜 ― 任務達成';
    playMissionComplete();
  } else if (result === 'timeup') {
    playTimeUp();
    resultPanel.classList.add('timeup');
    resultTitleEl.textContent = 'TIME UP';
    resultReasonEl.textContent = '制限時間到達 ― 任務失敗';
  } else {
    playMissionFailed();
    resultTitleEl.textContent = 'MISSION FAILED';
    resultReasonEl.textContent = '機体構造 崩壊';
  }

  // 戦果
  rKillsEl.textContent = killCount;
  rHitsEl.textContent  = hitsTaken;
  rTimeEl.textContent  = formatTime(missionTime);

  console.log('MISSION ' + result.toUpperCase() +
              ' ― 撃墜' + killCount + ' / 被弾' + hitsTaken +
              ' / 残り' + formatTime(missionTime));
}

function restartMission() {
  missionState = 'active';
  missionTime = MISSION.DURATION;
  hitsTaken = 0;
  lastTimeWarned = false;
  saidOverheat = false; saidShieldHalf = false; saidShieldFail = false;
  saidCritical = false; saidFuelLow = false;
  resetVoice();
  consoleEl.classList.remove('failed');
  resultPanel.classList.remove('win', 'timeup');
  timerElMission.classList.remove('warn');
  timerElMission.textContent = formatTime(missionTime);   // 表示も即座に戻す
  setCombatFrozen(false);

  // --- 7パラメーターを初期状態へ ---
  power.weapon = 25; power.shield = 25; power.engine = 25; power.sensor = 25;
  presetEl.textContent = 'MANUAL';
  heat = 0;
  radiatorOpen = false;
  shutdownLeft = 0;
  propellant = PROP.MAX;
  shieldHp = SHIELD.MAX;
  weaponIndex = 0;
  ammo = [Infinity, WEAPONS[1].ammo];   // 弾を積み直す
  fireCooldown = 0;
  saidAmmoOut = false;

  // --- 損傷を消す ---
  hullDamage = 0;
  hitVignette = 0;
  for (const gauge of document.querySelectorAll('.gauge.broken')) {
    gauge.classList.remove('broken');
  }
  brokenSystems.clear();

  // --- 戦果とログを消す ---
  killCount = 0;
  killCountEl.textContent = '0';
  combatLogEl.innerHTML = '';

  resetFlight();   // 3D側:自機の位置・速度・敵をやり直す
  render();
  addCombatLog('SORTIE', 'warn');
  playSortie();
  console.log('RESTART ― 再出撃');
}

// ===================================================================
// 発射:熱を上げて、3D空間にビームを撃つ
// ===================================================================
function fire() {
  const w = currentWeapon();

  // --- 撃てるかどうかの確認 ---
  // 武器計器が壊れていると発射できない(仕様書9.3「武器系被弾で発射不可」)
  if (isBroken('weapon')) {
    addCombatLog('武器系 損傷', 'hull');
    playDenied();
    return;
  }
  // ビームは武器へ電力が回っていないと撃てない(=電力を大食いする表現)
  if (power.weapon < w.minPower) {
    addCombatLog('出力不足', 'hull');
    playDenied();
    return;
  }
  // 機関砲は弾切れで撃てない(戦闘中の補充なし)
  if (ammo[weaponIndex] <= 0) {
    addCombatLog('AMMO OUT', 'hull');
    playDryFire();                 // 撃鉄だけが落ちる「カチカチ」
    if (!saidAmmoOut) { speakVoice('AMMO_DEPLETED'); saidAmmoOut = true; }
    return;
  }

  if (ammo[weaponIndex] !== Infinity) ammo[weaponIndex] -= 1;

  heat = Math.min(heat + w.heat, HEAT.MAX);
  fireBolt(w.boltColor);   // scene.js:見た目のビームを飛ばす
  playFireSound();

  fireCooldown = w.interval;

  // 撃った手応え。被弾(0.55)よりずっと弱い、ごく小さな振動
  startShake(FEEL.SHAKE_FIRE);

  // 発射で限界を超えたら、その場でシャットダウン
  if (heat >= HEAT.MAX) {
    heat = HEAT.MAX;
    shutdownLeft = HEAT.SHUTDOWN_SEC;
    playShutdown();
    speakVoice('POWER_FAILURE');
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

  if (missionState !== 'active') {
    // --- リザルト表示中:操作も戦闘も止める。R キー待ち ---
    updateShake(dt);
    updateScene(dt, elapsed);   // 破片などは動き続ける
    renderHeat();
    renderStatus();
    requestAnimationFrame(tick);
    return;
  }

  // --- 制限時間のカウントダウン(仕様書9.1)---
  missionTime -= dt;
  timerElMission.textContent = formatTime(missionTime);
  // 残り1分を切ったら赤く点滅させる(音の代わりの警告)
  timerElMission.classList.toggle('warn', missionTime <= MISSION.WARN_SEC);
  // 残り1分を切った瞬間に1回だけ警告を鳴らす
  if (missionTime <= MISSION.WARN_SEC && !lastTimeWarned) {
    playTimeWarning();
    speakVoice('ONE_MINUTE');
    lastTimeWarned = true;
  }
  if (missionTime <= 0) {
    missionTime = 0;
    endMission('timeup');
  }

  updateAutoFire(dt);               // 機関砲の連射
  updateDrift();                    // Shift の押し具合を見る(update より先。熱の計算に効く)
  update(dt);                       // 7パラメーターの時間経過
  updateView(dt);                   // W/A/S/D による機首操作
  updateShake(dt);                  // 被弾の揺れ(カメラを置く前に決めておく)
  // エンジン系が壊れていると推力を制御できず、最低出力に張り付く
  updateFlight(dt, isBroken('engine') ? 0 : power.engine);
  updateAimFeedback(dt);            // 照準の捕捉判定と、捕捉音
  updateVoiceAlerts(dt);            // コックピット音声
  updateScene(dt, elapsed);         // 敵機・弾・破片の更新と描画(scene.js)
  renderHeat();        // 計器の描画
  renderStatus();
  renderRadar();       // レーダーと敵マーカー
  renderWeapon();      // 兵装パネル(残弾)
  renderCrosshair();   // 照準(弾道の向きに合わせる)

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
// ===================================================================
// 連射(仕様書v1:機関砲は連射可能)
//
// ビーム砲は1回押して1発。機関砲は押しっぱなしで撃ち続けられる。
// 武器ごとの interval で間隔を決めるので、将来の武器も同じ形で足せる。
// ===================================================================
function updateAutoFire(dt) {
  if (fireCooldown > 0) fireCooldown -= dt;
  if (missionState !== 'active' || shutdownLeft > 0) return;

  const w = currentWeapon();
  if (!w.auto) return;
  if (!keysHeld.has('f')) return;
  if (fireCooldown > 0) return;

  fire();
}

function updateDrift() {
  // シャットダウン中は自分では推力を制御できない
  const wasDrifting = driftInput;
  driftInput = (shutdownLeft <= 0) && keysHeld.has('shift');
  if (driftInput !== wasDrifting) playDriftToggle(driftInput);

  // エンジンの駆動音。配分が高いほど高く大きく、ドリフト中は静かになる
  setEngineLevel(power.engine / 100, driftInput || shutdownLeft > 0);

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
  hitVignette = Math.max(hitVignette - dt, 0);

  if (shutdownLeft > 0) {
    // --- 停止中:強制冷却しながらカウントダウン。シールドは回復しない ---
    shutdownLeft -= dt;
    heat = Math.max(heat - HEAT.VENT_SHUTDOWN * dt, 0);
    if (shutdownLeft <= 0) {
      shutdownLeft = 0;
      playReboot();
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
    playShutdown();
    speakVoice('POWER_FAILURE');
    console.log('OVERHEAT ― 強制シャットダウン');
  }

  // --- 熱が危険域のあいだ、一定間隔で警告音を鳴らす ---
  if (heat >= HEAT.WARN && shutdownLeft <= 0) {
    overheatTimer -= dt;
    if (overheatTimer <= 0) {
      playOverheatWarn();
      overheatTimer = AUDIO.OVERHEAT_INTERVAL;
    }
  } else {
    overheatTimer = 0;
  }
}

// --- 起動 -----------------------------------------------------------
document.getElementById('build').textContent = BUILD;   // 画面に版数を出す
console.log('STEEL CRADLE build: ' + BUILD);

initAudio();                     // 音の準備(audio.js)。最初のキー入力で鳴り始める
initVoice();                     // コックピット音声の準備(voice.js)
initScene();                     // 3D空間の準備(scene.js)。失敗しても計器は動く
setupRadar();                    // 敵の数だけ輝点とマーカーを用意する(initScene のあと)

// 起動時の視点をオプションから決める
applyViewMode(OPTIONS.startView === 'cockpit');
render();                        // 電力ゲージの初期表示
renderWeapon();                  // 兵装パネルの初期表示
requestAnimationFrame((t) => {   // ループ開始。1回目は dt=0 になるよう時刻を合わせる
  lastTime = t;
  tick(t);
});
console.log('POWER DISTRIBUTION ONLINE');
