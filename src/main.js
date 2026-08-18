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
const BUILD = 'p2-04 language';

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

  // エンジン配分1%につき、毎秒たまる熱の量。
  //
  // ねらいは「武器の1/4程度」だったが、文字どおり 0.09 にすると
  // エンジン全開(=武器0%)でも発熱9.0/秒にしかならず、
  // 放熱(自然6.0 + ラジエーター8.0 = 14.0/秒)に負けて
  // 熱がいっさい上がらない ― つまり何も起きない数字だった。
  //
  // 一度 0.20 まで上げたが効きすぎたので、その0.6倍に落としてある。
  //   エンジン100% … 発熱12.0/秒
  //   エンジン 25% … 発熱 3.0/秒
  // 武器(0.35)に対しては約1/2.9。
  //
  // 注意:エンジン単独では放熱(14.0/秒)に届かないので、
  // 「エンジン全振り・武器0%」では熱は上がらない。
  // 武器にも配っている状態で、エンジンぶんが上乗せされて効いてくる数字。
  PER_ENGINE:     0.12,

  VENT_BASE:      6.0,   // 自然放熱。真空なので「遅い」のがこのゲームの肝(仕様書9.3)
  // ラジエーター展開中の放熱。
  // 弱いと「開けっぱなしにするしかない」運用になり、
  // 展開が見つかりやすさを上げる意味が薄れる。
  // 強くしておくと「短く開いて一気に捨て、また隠れる」が成立する。
  VENT_RADIATOR: 20.0,   // ラジエーター展開中に上乗せされる放熱量
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
  // バレルロール(QQ / EE)1回の消費量。
  //
  // ただ回るだけならタダでよさそうだが、回っている間ビームを弾けるので、
  // タダにすると「ずっと回り続けるのが最適」になってしまう。
  // 仕様書9.3は推進剤を「急機動で消費」と定めており、
  // 1回転は立派な急機動なので、ここから引くのが筋。
  // 回避バースト(8)より安く、満タンから16回。
  BARREL_COST:   6,
  BARREL_HEAT:   4,   // 急機動ぶんの熱。バースト(6)より軽い
  LOW:          20,   // この値を下回ると数値が赤くなる
};

// --- シールド強度の設定値(仕様書9.3の防御1段目)---------------------
// 「電力配分で回復速度が変化」
const SHIELD = {
  MAX:              100,   // 最大値
  REGEN_PER_POWER: 0.12,   // シールド配分1%につき、毎秒回復する量(配分25%なら 3.0/秒)
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
  WARN_SEC:    60,   // 残りこの秒数を切ったら、タイマーを赤く点滅させる
  // ※ かつてここに KILL_GOAL(規定数撃墜で任務達成)があった。
  //   今の勝利条件は「戦艦を沈める」なので廃止した。
  //   画面の KILLS x/y の y は BOSS.SPAWN_KILLS ―
  //   あと何機落とせば戦艦が出てくるか、を表している。
};

// --- 敵の攻撃を受けたときの設定 -------------------------------------
const INCOMING = {
  SHIELD_DAMAGE:    17,   // 敵弾1発でシールドが減る量
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
  LOCK_BEEP:  0.22,   // ロック完了後の「ピー」の間隔。音の長さとほぼ同じ = 途切れない
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
    heat: 3,              // 1条ごとに上がる熱。6点バーストなので合計は18
    ammo: Infinity,       // 弾数無限。撃ち放題
    minPower: 15,         // 武器への電力配分がこれ未満だと撃てない
    auto: false,          // 押しっぱなしでは連射しない
    interval: 0.45,       // 次のバーストまでの間隔
    // ★ 1回の引き金で6条を続けて撃つ(6点バースト)。
    //
    // 【3点から6点へ増やしたときに動いた数字】
    //   1回の引き金で入るダメージ   3 → 6(汎用機のHP6 = 全弾当たれば一撃)
    //   1回の引き金で上がる熱      9 → 18(熱100までの引き金の回数 11回 → 5.6回)
    //   バーストが鳴り終わるまで  0.17秒 → 0.35秒
    //
    // burstGap を 0.085 から詰めてあるのは、バースト長を間隔の内側に収めるため。
    // 0.085 のままだと 0.437秒 で、次の引き金までの 0.45秒 に対して余裕が0.013秒しかない ―
    // コマ落ちすると撃ち終わる前に次が撃てる状態になり、
    // 新しい引き金が前のバーストを途中で打ち切ってしまう(条数が減る)。
    // 0.07 なら 0.35秒 で、0.10秒 の無音が残る = バーストの区切りも耳で分かる。
    burst: 6,
    burstGap: 0.07,       // バースト内の1条ごとの間隔(秒)
    boltColor: 0x9fe1cb,
  },
  {
    key: 'CANNON',
    label: 'CANNON',      // 機関砲
    jp: '機関砲',
    // 1発が敵HPを削る量。ビーム(1発1)の1.5倍。
    // 弾数が有限で熱もほとんど出ない代わりに撃ち切ると終わり、という
    // 位置づけなので、当たったぶんはしっかり効くようにしてある。
    damage: 1.5,
    heat: 0.5,            // ほぼ熱を出さない。ビームの16分の1
                          //   = 撃ってもレーダーに映りにくい隠密武器の下地
    // 有限。戦闘中は補充できない(リロード不可)。
    // 240発 = 毎秒11発なので、押しっぱなしにすると22秒で撃ち尽くす。
    // 戦艦の弱点は開いている1.7秒しか撃てないので、
    // 「開くまで待って、開いたら遠慮なく叩き込む」ぶんの弾数が要る。
    ammo: 240,
    minPower: 0,          // 電力を必要としない
    auto: true,           // Fを押しっぱなしで連射できる
    interval: 0.09,       // 連射の間隔(秒)。毎秒約11発
    boltColor: 0xffcf6a,
  },
  {
    key: 'MISSILE',
    label: 'MISSILE',     // 誘導弾
    jp: 'ミサイル',
    heat: 3,              // 中くらい
    // 敵はフレアで振り切ってくるので、当たらない発射がどうしても出る。
    // 数が少ないと「撃つかどうか」ではなく「撃てない」になってしまうため、
    // 読み合いに使えるだけの数を持たせてある。
    ammo: 24,
    minPower: 0,
    auto: false,
    interval: 0.6,        // 連続では撃てない
    needsLock: true,      // ★ センサーロックがないと撃てない
    boltColor: 0xff9d4d,
  },
];

let weaponIndex = 0;                  // 今選んでいる兵装
let ammo = WEAPONS.map((w) => w.ammo);   // 兵装ごとの残弾
let fireCooldown = 0;                 // 次に撃てるようになるまでの残り秒
let flareCount = FLARE.COUNT;         // フレアの残数(scene.js の FLARE と同じ数を使う)
let saidAmmoOut = false;              // 弾切れ音声を言ったか(1回だけ)

// --- バーストの途中経過(ビーム砲の連続射)---
// 引き金を1回引くと3条が続けて出る。1条目はその場で撃ち、
// 残りは「あと何条・次まで何秒」を覚えておいて毎コマ撃ち足していく。
let burstLeft  = 0;   // 撃ち残している条の数
let burstTimer = 0;   // 次の1条までの残り秒

// ===================================================================
// 投下兵装 BOMBS(武器仕様書3章の「範囲攻撃」3種)
//
// 主武器とは完全に別の枠にしてある。仕様書でも「主武器3系統」と
// 「範囲攻撃3種」は別の層として書かれている。
// 分けている実利のほうが大きい ― パイロ弾で敵を熱で止めたその瞬間に、
// 武器を切り替えずそのまま F で撃ち込める。切替の待ち時間で好機を逃さない。
//
//   B … 投下(パイロ弾は押しっぱなしで連射)
//   N … BOMBS の切替(パイロ ⇄ ボム ⇄ EMP)
//
// パイロ弾 … 熱を攻める。放熱を止めて、敵を自分の発熱で追い詰める
// ボム    … HULL/シールドを削る素直な物理範囲ダメージ
// EMP     … 電力を攻める。キルは取れないが、範囲内の敵を数秒黙らせる
// ===================================================================
const BOMBS = [
  {
    key: 'PYRO', label: 'PYRO', jp: 'パイロ弾',
    kind: 'pyro',
    ammo: 36,         // 1発が範囲攻撃なので、機関砲よりずっと少ない
    heat: 1.5,        // 自分の熱はほとんど出ない
    minPower: 0,
    auto: true,       // ★ Bを押しっぱなしで撒き続けられる
    interval: 0.30,
  },
  {
    key: 'BOMB', label: 'BOMB', jp: 'ボム',
    kind: 'bomb',
    // 「弾幕・置き攻め」(武器仕様書§3)を名乗るには4発では足りなかった ―
    // 10分の戦闘で4回しか置けないなら、置き方を試すこと自体ができない
    ammo: 8,
    heat: 2,          // 投げるだけなので熱はほとんど出ない
    minPower: 0,      // 電力もいらない
    auto: false,
    interval: 1.2,
  },
  {
    key: 'EMP', label: 'EMP', jp: 'EMP弾',
    kind: 'emp',
    ammo: 5,          // 3発では「ここぞ」を選ぶ前に無くなっていた
    heat: 6,          // 強い電磁パルスを作るので、自分もそれなりに発熱する
    minPower: 20,     // ★ 電力を食う装備。武器へ配ってないと撃てない
    auto: false,
    interval: 1.2,
  },
];

let bombIndex = 0;
let bombAmmo = BOMBS.map((w) => w.ammo);
let bombCooldown = 0;

// 今の兵装を取り出す短縮形
// 機体ごとの性能差を被せて返す(ships.js)。
// 元の WEAPONS / BOMBS は書き換えない ― 書き換えると次の出撃に持ち越される。
// ===================================================================
// ★ ships.js が読み込まれていなくても、ゲームが止まらないようにする
//
// 新しい .js を足したとき、ブラウザが古い index.html をキャッシュしていると
// そのファイルだけ読み込まれない。すると毎コマ例外が出て、描画も敵AIも
// 当たり判定も全部止まる ― 画面が真っ暗になり、敵がすり抜けて動かなくなる。
// しかも tick() が例外を握り潰すので、原因が表に出ない。
//
// 足りない部品は「無いなり」に動く既定値で埋める。
// 機体の個性は失われるが、遊べなくなるよりずっとよい。
// ===================================================================
if (typeof shipTuned !== 'function') {
  console.warn('ships.js が読み込まれていません。制式機の性能で代用します('
             + 'Ctrl+Shift+R で再読込すると直ります)');
  window.SHIPS = window.SHIPS || {};
  window.ship = window.ship || (() => ({ name: '制式機', bodyColor: null, wingColor: null }));
  window.setShip = window.setShip || (() => {});
  window.shipTuned = (entry) => entry;
  window.shipHasWeapon = () => true;
  window.shipHasBomb = () => true;
  window.shipYaw = (d) => d;
  window.shipYawSmooth = (base) => base;
  window.shipRollCap = (base) => base;
  window.shipRollAccel = (base) => base;
}

const currentWeapon = () => shipTuned(WEAPONS[weaponIndex]);
const currentBomb   = () => shipTuned(BOMBS[bombIndex]);

// この機体が積んでいる兵装の番号だけを並べる。
// 積んでいないものは切替で飛ばす ― 選べてしまうと「撃てないのに選べる」ことになる。
function carriedWeaponIndexes() {
  const list = [];
  for (let i = 0; i < WEAPONS.length; i++) {
    if (shipHasWeapon(WEAPONS[i].key)) list.push(i);
  }
  return list.length ? list : [0];   // 万一ゼロなら1つは残す(操作不能を避ける)
}

function carriedBombIndexes() {
  const list = [];
  for (let i = 0; i < BOMBS.length; i++) {
    if (shipHasBomb(BOMBS[i].key)) list.push(i);
  }
  return list;
}

// --- 各リソースの現在値 ---------------------------------------------
let heat = 0;               // 現在の熱量(0〜100)
let radiatorOpen = true;    // ラジエーターを展開しているか(出撃時は展開状態)

// ===================================================================
// ラジエーターの操作モード(Vキーで切り替え)
//
//   'open'   … 展開しっぱなし。よく冷えるが、そのぶん敵に見つかる
//   'closed' … 収納しっぱなし。見つかりにくいが熱が抜けない
//   'auto'   … 熱を見て自動で開閉する
//
// 自動が要るのは、展開に代償があるから。
// 「冷やしたいが目立ちたくない」の折り合いを毎回手で付けるのは忙しいので、
// 基本の方針だけ機械に任せられるようにする。
//
// 自動の方針:
//   熱が OPEN_AT を超えたら開く / CLOSE_AT を下回ったら閉じる(往復を防ぐ幅)
//   ミサイルにロックされている間は閉じる ― いちばん見つかりたくない場面だから
//   ただし熱が CRITICAL を超えていれば、ロック中でも開く(焼けるよりまし)
// ===================================================================
let radiatorMode = 'open';
const RADIATOR_AUTO = {
  // 目標にする上限。シャットダウン(100)ではなく、ここを守りに行く。
  // 100を基準にすると「あと少しで焼ける」まで動かないので、
  // 気づくと常に高温で、撃ちたいときの余裕が残っていない。
  // 65を天井にしておけば、いつでも一撃ぶんの余白がある。
  CEILING:    65,
  // 「閉じたままだと、あと何秒で天井に届くか」がこれを下回ったら開く。
  // 熱の“今の値”ではなく“この先どうなるか”で決めるのが要点。
  // 短めにしてあるのは、展開している時間そのものが危険だから ―
  // 早めに開くほど熱は低く保てるが、そのぶんずっと見つかっている。
  // 「ぎりぎりまで閉じ、必要なぶんだけ開く」に寄せてある。
  LOOKAHEAD:   4.0,
  // 安全と見なせるまでの余裕(開いた直後にすぐ閉じ直さないため)
  SAFE_AHEAD:  6.0,
  CLOSE_AT:   45,   // これを下回っていて、かつ当面上がらないなら閉じる
  CRITICAL:   70,   // ここを超えたら、隠れるより冷やすほうが先

  // 一度動かしたら、最低この秒数は動かさない。
  // これが無いと、敵のロックが点いたり消えたりするたびに開閉して
  // 毎秒のようにパタパタする ― 見ていて壊れているようにしか思えない。
  MIN_HOLD:  2.5,
  // ロックされたときに隠れるのは、熱に余裕があるときだけ。
  // 熱いのに閉じても、すぐ開け直すことになって意味がない。
  HIDE_BELOW: 45,
};

let radiatorHold = 0;   // 次に開閉してよくなるまでの残り秒

// ラジエーターの開閉を変えたときの熱収支(毎秒)。
// 「今このまま閉じていたらどうなるか」を先に計算するために使う。
//
// ※ 式は currentHeatRate と同じものを共有している。
//   別々に書くと、回収した機材の効果を片方だけ入れ忘れた瞬間に
//   「計器の予測」と「実際に起きること」が食い違う。
function heatRateIfRadiator(open) {
  return heatGainRate() - heatVentRate(open);
}

// 閉じたままなら、あと何秒で天井(CEILING)に届くか。
// 冷えていく、またはもう超えているなら 0 / Infinity を返す。
function secondsToCeilingClosed() {
  const rate = heatRateIfRadiator(false);
  if (rate <= 0.01) return Infinity;          // 閉じていても冷える
  const room = RADIATOR_AUTO.CEILING - heat;
  return room <= 0 ? 0 : room / rate;
}

function updateRadiatorAuto(dt) {
  if (radiatorMode !== 'auto') { radiatorOpen = (radiatorMode === 'open'); return; }

  if (radiatorHold > 0) radiatorHold -= (dt || 0);

  const ahead = secondsToCeilingClosed();
  const lvl = threatStatus().level;
  const locked = (lvl === 'LOCK' || lvl === 'MISSILE');

  // 「こうしたい」をまず決める
  let want = radiatorOpen;
  if (heat >= RADIATOR_AUTO.CRITICAL) {
    want = true;                          // 焼けるほうが困る。ロック中でも開く
  } else if (ahead < RADIATOR_AUTO.LOOKAHEAD) {
    // このまま閉じていると天井に届く。ロックされていても開ける ―
    // 見つかるより、動けなくなるほうが重い。
    want = true;
  } else if (locked && heat < RADIATOR_AUTO.HIDE_BELOW) {
    want = false;                         // 熱に余裕がある今だけ隠れる
  } else if (heat <= RADIATOR_AUTO.CLOSE_AT && ahead > RADIATOR_AUTO.SAFE_AHEAD) {
    want = false;                         // 冷えていて、当面上がる心配もない
  }

  // 実際に動かすのは、前回から MIN_HOLD 秒あいてから。
  // ただし焼けそうなときだけは待たずに開ける。
  if (want === radiatorOpen) return;
  const urgent = (heat >= RADIATOR_AUTO.CRITICAL) || (want && ahead < 3.0);
  if (!urgent && radiatorHold > 0) return;

  radiatorOpen = want;
  radiatorHold = RADIATOR_AUTO.MIN_HOLD;
}
let shutdownLeft = 0;       // 強制シャットダウンの残り秒数(0 なら通常状態)

// EMPを浴びている残り秒数(自分のEMPに巻き込まれたとき)。
// この間はシールドが再生せず、センサーの精度も落ちる。
let empLeft = 0;
// 自機がEMPを受けたときのききめ。ここを書き換えれば重さを調整できる
const EMP_SELF = {
  SENSOR_MULT: 0.35,   // センサーの効きをこの割合まで落とす
};

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
  engine:     { label: 'エンジン', lost: '推力半減' },
  sensor:     { label: 'センサー', lost: '索敵半減' },
  heat:       { label: '熱',       lost: '冷却不能' },
  propellant: { label: '推進剤',   lost: 'バースト不能' },
  shieldhp:   { label: 'シールド強度', lost: '表示不正確' },
  mirror:     { label: '後方カメラ', lost: '映像喪失' },
  scope:      { label: '照準スコープ', lost: '映像喪失' },
};

// 壊れた系統の名前を入れておく集合。has() で「壊れているか」を調べる
const brokenSystems = new Set();
const isBroken = (key) => brokenSystems.has(key);

// ===================================================================
// エンジン系が壊れているときに、配分がどれだけ通るか
//
// 【なぜ0にしないのか】
// 以前は壊れた瞬間にエンジンの配分を 0 として扱っていた。
// speedFromEnginePower(0) は最低速度の 6 なので、
// 敵(狙撃機14 / 汎用機20〜30 / 突撃機34〜46)の誰よりも遅くなり、
// 逃げることも間合いを詰めることもできない置き物になっていた。
// 武器系を「3系統のうち1つだけ沈黙」にしたのと同じ理由で、
// 計器の破損が試合を終わらせてしまうのは避ける。
//
// 半減にすると、こうなる:
//
//   配分   無傷の速度   破損時の速度
//   ----  ----------  ------------
//    25%      17.0         11.5
//    50%      28.0         17.0
//   100%      50.0         28.0
//
// 壊れても、エンジンへ振り直せば 28 まで戻せる ―
// 狙撃機(14)と汎用機の攻撃中(20)は振り切れる速さ。
// ただしそのぶん武器・シールド・センサーを削ることになるので、
// 「どこを壊されたか」が配分の判断に効く、という設計はむしろ強くなる。
//
// センサーの破損が「索敵半減」で生きているのと同じ形に揃えてある。
const ENGINE_BROKEN_MULT = 0.5;

// エンジン系の破損を通したあとの、実際に効いている配分
function effectiveEngine() {
  const pct = power.engine * powerOutputMult();
  return isBroken('engine') ? pct * ENGINE_BROKEN_MULT : pct;
}

// ===================================================================
// 沈黙した主武器(ビーム/機関砲/ミサイルのうち、撃てなくなったもの)
//
// 【なぜ分けたか】
// 以前は「武器系」がひとかたまりで、そこが壊れると3系統ぜんぶ撃てなくなった。
// 壊れうる計器は8種、HULL5で終わるので死ぬまでに壊れるのは最大4種 ―
// つまり約50%の試合で武器が全損する。勝利条件は戦艦の撃沈=撃つことなので、
// 当たった瞬間に詰みだった。時間切れまで飛ぶだけの試合になる。
//
// 仕様書9.3は「武器系被弾で発射不可」と書いているが、その狙いは
// 「どこを壊されたかが数字より重い」こと。何もできなくなる状態は
// その狙いに貢献していない ― むしろ「どこを」が消える。
//
// そこで壊れるのは3系統のうち1つだけにした。
//   ・その武器については「発射不可」が字義どおり成り立つ
//   ・Rで持ち替えれば戦い続けられる(詰まない)
//   ・機関砲を失うのとミサイルを失うのは全く別の事態になる
//     = 「どこを壊されたか」が初めて意味を持つ
//
// BOMBS(パイロ/ボム/EMP)はこの集合の対象外。武器仕様書が
// 「主武器3系統」と「範囲攻撃3種」を別の層として立てているので、
// 別回路として扱う ― 主武器を1つ失っても範囲攻撃は残る。
// ===================================================================
const brokenWeapons = new Set();
const isWeaponBroken = (key) => brokenWeapons.has(key);

// --- 被弾・ミッション状態 -------------------------------------------
let hullDamage    = 0;       // これまでに受けたHULL損傷の回数
let hitsTaken     = 0;       // 被弾した回数(リザルト用)

// ミッションの進行状態。
//   'active'   … 戦闘中
//   'complete' … 勝利(規定数を撃墜した)
//   'failed'   … 敗北(HULL損傷が限界)
//   'timeup'   … 敗北(時間切れ)
// いま見せている画面。切り替えるのは screens.js の役目で、
// ここでは「戦闘の計算を回してよいか」を判断するために持っている。
//   'menu' … タイトル画面 / 'mission' … 戦闘中 / 'paused' … 一時停止
let screenState   = 'menu';

let missionState  = 'active';
let missionTime   = MISSION.DURATION;   // 残り秒数

let shakeLeft     = 0;       // 画面の揺れの残り秒数
let shakeStrength = 0;       // 揺れの強さ
let hitVignette   = 0;       // 被弾した瞬間に強く光る赤の残り時間

// 照準の捕捉音のための状態
let lastAimState = 'CLEAR';   // 前のコマの照準状態(変わった瞬間を知るため)
let beepTimer = 0;            // 次の「ビー」までの残り秒
let lockBeepTimer = 0;        // ロック中の「ピー」までの残り秒
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
const scopeEl    = document.getElementById('scope');       // 照準スコープの枠
const scopeMagEl = document.getElementById('scope-mag');   // 照準スコープの倍率表示
const mirrorEl   = document.getElementById('rear-mirror'); // 後方確認ミラーの枠
const scopePipEl = document.getElementById('scope-pip');   // スコープの中の偏差照準
const scopeReadEl = document.getElementById('scope-read');  // スコープの観測・解析
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
const killGoalEl  = document.getElementById('kill-goal');
const combatLogEl = document.getElementById('combat-log');

// 装甲(HULL)ゲージ。5段の四角で「あと何発耐えられるか」を出す
const hullTubeEl = document.getElementById('hull-tube');
const hullNumEl  = document.getElementById('hull-num');
const hullSubEl  = document.getElementById('hull-sub');
const hullSegEls = hullTubeEl ? Array.from(hullTubeEl.children) : [];

// 戦艦パネル(boss.js が出す情報の表示先)
const bossPanelEl    = document.getElementById('boss-panel');
const bossVentListEl = document.getElementById('boss-vent-list');
const bossDistEl     = document.getElementById('boss-dist');
const bossVentEls    = [];   // 弱点1つにつき1行。最初の1回だけ作る

const speedEl     = document.getElementById('speed');
const aiStateEl   = document.getElementById('ai-state');
const hullEl      = document.getElementById('hull');
const enemyHeatEl = document.getElementById('enemy-heat');
const vignetteEl  = document.getElementById('damage-vignette');

const radarEl       = document.getElementById('radar');
const radarRangeEl  = document.getElementById('radar-range');
const radarSensorEl = document.getElementById('radar-sensor');
const markerLayer   = document.getElementById('marker-layer');
const crosshairEl   = document.querySelector('.crosshair');
const lockRingEl    = document.getElementById('lock-ring');
const helpEl        = document.getElementById('help');
const consoleFrameEl = document.getElementById('console-frame');
const leadPipEl      = document.getElementById('lead-pip');
const lockWarnEl     = document.getElementById('lock-warn');
const dpThreatEl     = document.getElementById('dp-threat');
const dpDetectEl     = document.getElementById('dp-detect');
const dpOverheatEl   = document.getElementById('dp-overheat');
const dpLockEl       = document.getElementById('dp-lock');
const dpRangeEl      = document.getElementById('dp-range');
const dpClosureEl    = document.getElementById('dp-closure');
const dpDriftEl      = document.getElementById('dp-drift');
const dpBurstEl      = document.getElementById('dp-burst');
const dpTheatEl      = document.getElementById('dp-theat');
const autoTrackEl    = document.getElementById('auto-track');
const viewModeEl    = document.getElementById('view-mode');
const weaponPanelEl = document.getElementById('weapon-panel');
const weaponNameEl  = document.getElementById('wp-name');
const weaponAmmoEl  = document.getElementById('wp-ammo');
const weaponHeatEl  = document.getElementById('wp-heat');
const weaponJpEl    = document.getElementById('wp-jp');
const flareCountEl  = document.getElementById('wp-flare');
const flareRowEl    = document.getElementById('wp-flare-row');
const bombNameEl    = document.getElementById('wp-bomb-name');
const bombAmmoEl    = document.getElementById('wp-bomb-ammo');
const bombRowEl     = document.getElementById('wp-bomb-row');
const empBadgeEl    = document.getElementById('emp-badge');
const salvageBadgeEl = document.getElementById('salvage-badge');
const salvageBuffEl  = document.getElementById('salvage-buff');
const proximityEl   = document.getElementById('proximity');
const proxTextEl    = document.getElementById('prox-text');
const proxDistEl    = document.getElementById('prox-dist');

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
  radEl.textContent = (radiatorMode === 'auto')
    ? ('RAD AUTO ' + (radiatorOpen ? '▲' : '▼'))
    : (radiatorOpen ? 'RAD OPEN' : 'RAD CLOSED');
  radEl.classList.toggle('open', radiatorOpen);

  // 速度計。3D側が持っている今の速さを表示する
  speedEl.textContent = Math.round(currentSpeed());

  // --- HULL残量と赤いビネット ---
  const hullLeft = HULL.MAX_DAMAGE - hullDamage;
  hullEl.textContent = hullLeft;
  hullEl.style.color = hullLeft <= 2 ? '#ff5a3c' : '';
  renderHullGauge(hullLeft);

  // 損傷が進むほど常時うっすら赤くなり、被弾の瞬間だけ強く光る
  const baseRed = (hullDamage / HULL.MAX_DAMAGE) * 0.55;
  const flashRed = hitVignette / 0.45;
  vignetteEl.style.opacity = Math.min(baseRed + flashRed * 0.75, 1);

  // 自動追尾の入切
  autoTrackEl.textContent = isAimAssistOn() ? 'ON' : 'OFF';
  autoTrackEl.style.color = isAimAssistOn() ? '' : '#4a5b66';

  // EMPを浴びている間だけ、残り秒数を出す
  empBadgeEl.classList.toggle('on', empLeft > 0);
  if (empLeft > 0) empBadgeEl.querySelector('b').textContent = empLeft.toFixed(1);

  // 回収した機材の効果。効いているものを短く並べて、残り秒を出す
  renderSalvageBadge();

  // いちばん近い敵の熱。パイロ弾がどれだけ効いているかを見せる
  const eHeat = nearestEnemyHeat();
  const ventDown = nearestEnemyVentDown();
  // ▼ が付いている間は敵が熱を捨てられない = パイロ弾のデバフが効いている
  enemyHeatEl.textContent = eHeat + (ventDown ? ' ▼' : '');
  enemyHeatEl.style.color = ventDown ? '#ff7a2a'
                          : (eHeat >= 70 ? '#ff5a3c' : (eHeat >= 35 ? '#ffcf6a' : ''));

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

// ===================================================================
// 回収した機材の効果(salvage.js のドロップを拾うと点く)
//
// 【いちばん大事な決まり】
// 電力セルが上げるのは「配分の合計」ではなく「発電量」。
//
// 仕様書9.3:「毎秒供給される発電量を4系統に手動配分。合計100%を超えられない」
// ― 100%はあくまで“発電した量の取り分”なので、発電量が増えれば
// 同じ配分30%がより多くの出力になる。配分UIは100%のまま動かさない。
//
// これは言葉遊びではなく、山場を守るための線引きでもある。
// 仕様書9.2は「自機100%配分だったUIが艦隊電力プールに接続される。
// いつものUIが化ける瞬間」をレビヤタン最終戦のために予約している。
// そこを拾い物ひとつで先に使ってしまうわけにはいかない。
// ===================================================================
let powerBoostLeft   = 0;   // 発電量アップの残り秒
let powerBoostMult   = 1;   // そのときの倍率
let coolantLeft      = 0;   // 放熱アップの残り秒
let coolantVentMult  = 1;   // そのときの倍率

// 今の発電量の倍率。電力に由来する値は、すべてこれを掛けて使う
function powerOutputMult() {
  return powerBoostLeft > 0 ? powerBoostMult : 1;
}

// 今の放熱の倍率(冷却材)
function coolantMult() {
  return coolantLeft > 0 ? coolantVentMult : 1;
}

// 武器に実際に届いている電力(%)。
// 「武器への配分が minPower に足りているか」の判定は全部これを見る。
// 発電量が上がっていれば、配分を動かさなくても撃てるようになることがある。
function effectiveWeaponPower() {
  return power.weapon * powerOutputMult();
}

// 効いている効果を「PWR+20% 12s」のような短い文字列にする。
// 何も効いていなければ null(バッジごと隠す)。
// HTMLの計器と3Dの計器で同じ文字列を使うので、作るのは1か所だけにしてある。
function salvageBuffText() {
  const parts = [];
  if (powerBoostLeft > 0) {
    parts.push('PWR+' + Math.round((powerBoostMult - 1) * 100) + '% '
      + Math.ceil(powerBoostLeft) + 's');
  }
  if (coolantLeft > 0) {
    parts.push('COOL×' + coolantVentMult.toFixed(1) + ' '
      + Math.ceil(coolantLeft) + 's');
  }
  return parts.length ? parts.join('  ') : null;
}

function renderSalvageBadge() {
  if (!salvageBadgeEl) return;
  const text = salvageBuffText();
  salvageBadgeEl.classList.toggle('on', !!text);
  if (text) salvageBuffEl.textContent = text;
}

// 効果の残り時間を減らす。tickBody から毎コマ呼ぶ
function updateSalvageBuffs(dt) {
  if (powerBoostLeft > 0) {
    powerBoostLeft -= dt;
    if (powerBoostLeft <= 0) {
      powerBoostLeft = 0;
      addCombatLog('電力セル 消耗 ― 出力 通常', 'warn');
    }
  }
  if (coolantLeft > 0) {
    coolantLeft -= dt;
    if (coolantLeft <= 0) {
      coolantLeft = 0;
      addCombatLog('冷却材 枯渇', 'warn');
    }
  }
}

// 全部解除する(再出撃時)
function resetSalvageBuffs() {
  powerBoostLeft = 0;
  powerBoostMult = 1;
  coolantLeft = 0;
  coolantVentMult = 1;
}

// シールドの毎秒回復量(仕様書9.3:電力配分で回復速度が変化)
function currentShieldRegen() {
  if (isBroken('shield')) return 0;            // シールド系が壊れていると再生しない
  if (shutdownLeft > 0) return 0;              // 停止中は回復しない(＝無防備)
  if (empLeft > 0) return 0;                   // EMPを浴びている間は再生が止まる
  if (shieldHp >= SHIELD.MAX) return 0;        // 満タンなら回復不要
  return power.shield * SHIELD.REGEN_PER_POWER * powerOutputMult();
}

// 現在の毎秒の熱収支を計算して返す(発熱 − 放熱)
//
// ※ 発熱と放熱の式は、予測計器(heatRateIfRadiator / HEAT BUDGET表示)でも
//   使う。バラバラに書くと「計器の予測」と「実際に起きること」がずれるので、
//   下の2つの小さな関数に集約して、3か所ともここを通すようにしてある。
function currentHeatRate() {
  if (shutdownLeft > 0) return -HEAT.VENT_SHUTDOWN;
  return heatGainRate() - heatVentRate(radiatorOpen);
}

// 発熱(毎秒)。武器系(主)とエンジン(従、武器の約1/4)の2か所から出る。
//
// 発電量が上がっている間は発熱も増える ― 出力を上げたぶん熱くなるのは当然で、
// 「電力セルは強いが、そのぶん熱の管理が忙しくなる」という代償になる。
function heatGainRate() {
  const mult = powerOutputMult();
  // エンジンの発熱は「実際に出ている出力」に比例させる。
  // 壊れて半減しているときは発熱も半分 ―
  // ここを0のままにすると「エンジンを壊されたほうが涼しい」ことになってしまう。
  return power.weapon * HEAT.PER_WEAPON * mult
       + effectiveEngine() * HEAT.PER_ENGINE;
}

// 放熱(毎秒)。radiator に true を渡すとラジエーター展開中の値になる。
//
// 自然放熱はドリフト中(推力カット)に2倍。
// 回収した冷却材は、この自然放熱のほうを増やす ―
// ラジエーターを開かずに冷えるので、被探知が上がらないのが要点。
// 仕様書9.3の「冷やしたいが今冷やすと危ない」ジレンマからの、稀な逃げ道。
function heatVentRate(radiator) {
  const natural = HEAT.VENT_BASE
                * (driftInput ? HEAT.DRIFT_VENT_MULT : 1)
                * coolantMult();
  // ラジエーターぶんは倍率の対象外(こちらは機械的な強制放熱なので)
  return natural + (radiator ? HEAT.VENT_RADIATOR : 0);
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
// ===================================================================
// バレルロール(QQ / EE の2連打)
//
// 一気に1回転し、回っている間だけ敵のビーム(曳光)を機体表面で弾く。
// 弾けるのは曳光だけで、ミサイルと戦艦の大型ビームは通る ―
// あちらはフレアと射線回避という別の答えが用意してあるので、
// 回転ひとつで全部無効になってしまわないようにしてある。
//
// 戻り値:実際に回ったか(false なら呼び出し側がふつうの90度として扱う)
// ===================================================================
let lastRollKey = '';    // 直前に押したロールのキー('q' / 'e')
let lastRollAt  = -99;   // その時刻(秒)

function tryBarrelRoll(dir) {
  // 推進剤系が壊れていると急機動そのものができない(回避バーストと同じ扱い)
  if (isBroken('propellant')) return false;
  if (propellant < PROP.BARREL_COST) {
    addCombatLog('推進剤不足 ― ロール不能', 'warn');
    playDenied();
    return false;
  }
  if (!requestBarrelRoll(dir)) return false;   // すでに回っている

  propellant -= PROP.BARREL_COST;
  heat = Math.min(heat + PROP.BARREL_HEAT, HEAT.MAX);
  startShake(0.22);
  playBurst();
  addCombatLog('BARREL ROLL', 'warn');
  return true;
}

// scene.js から呼ばれる:スコープで撃ち込んだ弾が、敵の系統を潰した。
// 仕様書9.3-5「どこを壊されたか」が数字より重い ― の裏返しなので、
// 落としたときとは違う音とログにして「不具にした」ことを伝える。
function onEnemyPartBroken(part, type) {
  if (missionState !== 'active') return;
  partBreakCount += 1;
  playDeflect();
  addCombatLog((type || '敵') + ' ' + (part === 'weapon' ? '武装破壊' : '推進破壊'), 'warn');
}
let partBreakCount = 0;   // 1試合で潰した系統の数

// scene.js から呼ばれる:回転中にビームを弾いた。
// ログは出さない ― 1回転で何発も弾くので、出すと戦闘ログが埋まる。
// 音と火花だけで十分伝わる。
function onBeamDeflected() {
  if (missionState !== 'active') return;
  deflectCount += 1;
  playDeflect();
}
let deflectCount = 0;   // 1試合で弾いた数(リザルト用。いまは数えるだけ)

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

  // ★ 実際に機体を押し出す(scene.js)。
  //   ここが抜けていたため、推進剤だけ減って何も起きない状態になっていた。
  const speed = burstShip();
  startShake(BURST.SHAKE);
  playBurst();

  // 熱の跳ね上がりで限界を超えることがある。撃ったときと同じ扱いにする
  if (heat >= HEAT.MAX) {
    heat = HEAT.MAX;
    shutdownLeft = HEAT.SHUTDOWN_SEC;
    burstLeft = 0;
    playShutdown();
    speakVoice('POWER_FAILURE');
  }

  return speed;
}

// ===================================================================
// シールドを削る ― 敵の攻撃や自分のボムの爆風から呼ばれる
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
  // メニュー中・一時停止中は、操縦系のキーをいっさい受け付けない。
  // メニューの上下移動と決定は screens.js が別に引き受けている。
  if (screenState !== 'mission') return;

  keysHeld.add(event.key.toLowerCase());   // 押しっぱなし判定用に記録
  resumeAudio();   // ブラウザの規則で、最初のキー入力があるまで音は鳴らせない

  // C キー … フレア投下(武器仕様書4章)
  // ※ 仕様書9.6ではCはマスターコーション確認。そちらは未実装のため
  //   暫定でここに割り当てている。実装時にキーを見直すこと。
  if (event.key.toLowerCase() === 'c') {
    if (missionState === 'active') useFlare();
    return;
  }

  // Tab キー … 操作説明の開閉
  // preventDefault を入れないと、ブラウザ本来の「次の要素へ移動」が起きてしまう。
  // ミッション中でも終了後でも使えるよう、他の判定より先に置く。
  if (event.key === 'Tab') {
    event.preventDefault();
    helpEl.classList.toggle('on');
    playViewClick();
    return;
  }

  // Z キー … 照準の自動追尾の入切
  // 自分で狙いたい人には邪魔になりうるので、いつでも切れるようにしておく。
  if (event.key.toLowerCase() === 'z') {
    setAimAssist(!isAimAssistOn());
    playPresetConfirm();
    addCombatLog('AUTO TRACK ' + (isAimAssistOn() ? 'ON' : 'OFF'), 'warn');
    return;
  }

  // Q / E キー … 90度ずつの急旋回(ロール)
  //
  // 押しっぱなしの自動リピートは無視する(event.repeat)。
  // 1回の「押した」で必ず90度、というのがこの操作の約束なので、
  // 押したままにしただけで回り続けると、その約束が崩れる。
  // もっと回したければもう1回押す ― 2回ぶん(180度)まで予約できる。
  if ((event.key.toLowerCase() === 'q' || event.key.toLowerCase() === 'e') && !event.repeat) {
    if (missionState === 'active' && shutdownLeft <= 0) {
      const key = event.key.toLowerCase();
      const dir = (key === 'q') ? 1 : -1;
      const now = performance.now() / 1000;

      // 同じ向きへ素早く2回 → バレルロール(一気に1回転してビームを弾く)
      if (key === lastRollKey && now - lastRollAt < FEEL.BARREL_TAP_SEC) {
        if (tryBarrelRoll(dir)) { lastRollKey = ''; return; }
        // 断られた(推進剤切れなど)ときは、ふつうの90度として扱う
      }
      lastRollKey = key;
      lastRollAt  = now;
      requestRollStep(dir);
    }
    return;
  }

  // O キー … 照準スコープの開閉
  //
  // 【なぜ O か】
  // 仕様書9.6のキーマップは決定済みで、T(目標切替)・G(神器コア)・
  // M(戦術プロット)・H(旗艦ドッキング)・C(マスターコーション)は
  // 将来ぶんとして予約されている。今そこを使うと後で必ずぶつかる。
  // 空いていて、かつ右手の定位置(発射のP・電力配分の矢印)から
  // 指を動かさずに届くのが O だった。
  //
  // Ctrl は使えない ― 押しながら W を叩くとブラウザがタブを閉じてしまう。
  if (event.key.toLowerCase() === 'o') {
    if (missionState !== 'active') return;
    // 押すたびに 2倍 → 4倍 → 6倍 → 閉じる
    const r = cycleScope();
    if (!r) return;
    if (!r.on) {
      playViewClick();
      addCombatLog('SCOPE OFF', 'warn');
      return;
    }
    playPresetConfirm();
    if (r.capped) {
      // 選んだ倍率が索敵電力の上限を超えた。黙って落とすと
      //「押したのに変わらない」と見えるので、足りないことを言う
      addCombatLog('SCOPE x' + r.mag.toFixed(1) + ' ― 索敵不足(x' +
                   r.want.toFixed(0) + 'には索敵を上げる)', 'warn');
    } else {
      addCombatLog('SCOPE x' + r.mag.toFixed(1), 'warn');
    }
    return;
  }

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
    // 展開 → 収納 → 自動 → 展開 … と順に切り替える
    radiatorMode = (radiatorMode === 'open') ? 'closed'
                 : (radiatorMode === 'closed') ? 'auto' : 'open';
    updateRadiatorAuto();
    playRadiator(radiatorOpen);
    addCombatLog('RAD ' + radiatorMode.toUpperCase(), 'warn');
    return;
  }

  // Space キー … 回避バースト
  if (event.key === ' ') {
    event.preventDefault();   // Spaceで画面がスクロールするのを止める
    if (!event.repeat) burst();   // 押しっぱなしの連射は無効(1回押して1回)
    return;
  }

  // B キー … BOMBS の投下。押しっぱなしの連射は updateAutoFire が続ける
  if (event.key.toLowerCase() === 'b' && !event.repeat) {
    if (bombCooldown <= 0) fireBomb();
    return;
  }

  // N キー … BOMBS の切替(パイロ ⇄ ボム ⇄ EMP)
  if (event.key.toLowerCase() === 'n') {
    switchBomb();
    return;
  }

  // F キー / P キー … 主兵装発射(仕様書9.6)
  // 押しっぱなしでは連射しない。撃つ回数=熱の上がり方をプレイヤーが自分で決める形にする。
  // 仕様書9.3「攻撃的なプレイヤーほどリスクを背負う」を、この1行が担っている。
  //
  // Pキーを足した理由:
  //   左手はW/S・A/D・Q/Eで指が埋まっているので、Dで旋回しながらFを押すと
  //   同じ人差し指の取り合いになる。右手は矢印キー(電力配分)にしか使わず、
  //   配分は交戦の合間の操作なので、旋回中の右手は空いている。
  //   そこに発射を置けば、指の取り合いそのものが無くなる。
  if ((event.key.toLowerCase() === 'f' || event.key.toLowerCase() === 'p') && !event.repeat) {
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
  // 後方ミラーの枠も、祖先ではなく自分自身に印を付けて出し入れする
  if (mirrorEl) mirrorEl.classList.toggle('on', nowCockpit);
  return nowCockpit;
}

// 敵がミサイルの発射予告に入った。scene.js から呼ばれる
function onIncomingMissile() {
  if (missionState !== 'active') return;
  // 音と音声は renderLockWarn が鳴らし続けるので、ここではログだけ。
  // 二重に鳴らすと、続く警報の頭が潰れて聞き取れなくなる。
  addCombatLog('MISSILE LOCK ― 敵が照準中', 'hull');
}

// 敵のミサイルが自機に当たった
function onPlayerMissileHit() {
  if (missionState !== 'active') return;

  hitsTaken += 1;
  hitVignette = 0.6;
  startShake(INCOMING.SHAKE_HULL);

  if (shieldHp > 0) {
    shieldHp = Math.max(shieldHp - ENEMY_MISSILE.SHIELD_DAMAGE, 0);
    damageFlash = 0.4;
    playShieldHit();
    addCombatLog('MISSILE HIT ― SHIELD −' + ENEMY_MISSILE.SHIELD_DAMAGE, 'hull');
    if (shieldHp <= 0) { addCombatLog('SHIELD DOWN', 'hull'); playShieldDown(); }
  } else {
    hullDamage += 1;
    playHullDamage();
    const brokenName = breakRandomInstrument();
    addCombatLog('MISSILE HIT ― HULL ' + hullDamage + '/' + HULL.MAX_DAMAGE, 'hull');
    if (brokenName) addCombatLog(brokenName, 'hull');
    if (hullDamage >= HULL.MAX_DAMAGE) endMission('failed');
  }
}

// パイロ弾で敵が熱暴走した。武器仕様書「シャットダウン誘発」の成果
function onEnemyOverheat() {
  if (missionState !== 'active') return;
  playShutdown();
  addCombatLog('TARGET OVERHEAT', 'kill');
  speakVoice('TARGET_OVERHEAT');
}

// 自機が敵機に激突した。scene.js から呼ばれる
function onPlayerCollide() {
  if (missionState !== 'active') return;
  playPlayerExplosion();
  startShake(COLLIDE.SHAKE);
  hitVignette = 0.6;
  addCombatLog('接触 ― 機体損傷', 'hull');
  speakVoice('CRITICAL_DAMAGE');

  // シールドを大きく削り、抜けたぶんはHULLへ。ぶつかれば無事では済まない
  const before = shieldHp;
  shieldHp = Math.max(shieldHp - COLLIDE.SHIELD_DAMAGE, 0);
  hitsTaken += 1;
  if (before <= 0 || shieldHp <= 0) {
    hullDamage += 1;
    playHullDamage();
    const brokenName = breakRandomInstrument();
    addCombatLog('HULL DAMAGE ' + hullDamage + '/' + HULL.MAX_DAMAGE, 'hull');
    if (brokenName) addCombatLog(brokenName + ' 損傷', 'hull');
    if (hullDamage >= HULL.MAX_DAMAGE) endMission('failed');
  }
}

// 敵機どうしが激突した(こちらの戦果にはしない)。
// ※ 今は敵どうしが衝突しないよう scene.js 側で避け合うので、ここは呼ばれない。
//   編隊の間隔を詰めるなど、避けきれない設定にしたときのために残してある。
function onEnemyCollide() {
  if (missionState !== 'active') return;
  playExplosion();
  addCombatLog('敵機 接触 ― 相討ち', 'kill');
}

// ===================================================================
// 戦艦の艦体に激突した ― 即死
//
// 敵機との接触(onPlayerCollide)は HULL を1つ削るだけの「重い被弾」だが、
// こちらは相手が全長210の艦体。質量が違いすぎて、立て直す余地がない。
// 弱点に近づくほどこの壁も近くなる、という緊張がこの判定の役目。
// ===================================================================
function onPlayerRamBoss() {
  if (missionState !== 'active') return;
  addCombatLog('■ 艦体に接触 ― 機体消失', 'hull');
  speakVoice('CRITICAL_DAMAGE');
  hitsTaken += 1;
  hullDamage = HULL.MAX_DAMAGE;   // 計器も「全損」を指す
  // 中で爆散と効果音が鳴る。理由は「撃墜された」ではないので書き分ける
  endMission('failed', BOSS.NAME + ' 艦体に激突');
}

// 敵がロックしたのに撃たずに解いた。
// 「来なかった」ことが分かると、次にロックされたときの判断が重くなる。
function onEnemyMissileBreak() {
  if (missionState !== 'active') return;
  addCombatLog('敵ロック解除 ― 発射なし', 'warn');
}

// 敵がフレアを撒いた
function onEnemyFlare(tooHot) {
  playFlare();
  addCombatLog(tooHot ? '敵フレア ― 失敗' : '敵フレア', 'warn');
}

// 敵が発射予告に入った(＝こちらが狙われた)。scene.js から呼ばれる
function onIncomingLock() {
  if (missionState !== 'active') return;
  // これは銃の発射予告。音だけ鳴らし、音声は使わない。
  // 銃は数が多いので、いちいち喋らせるとミサイルの警報が埋もれる。
  playLockWarning();
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
// 実際に効いているセンサーの強さ(%)。
// 配分そのものではなく、故障とEMPの影響を通したあとの値を使う。
// 索敵半径・ロック時間・レーダーはすべてこの1か所を見る。
// 回収した電力セルで発電量が上がっている間は、その倍率もここで通す。
// 配分そのものは変わらないが、同じ配分がより多くの出力になる ―
// 結果として索敵半径もロック速度も伸びる。
function effectiveSensor() {
  let pct = power.sensor * powerOutputMult();
  if (isBroken('sensor')) pct *= 0.5;          // センサー計器の故障
  if (empLeft > 0) pct *= EMP_SELF.SENSOR_MULT; // EMPで一時的に低下
  return pct;
}

function updateAimFeedback(dt) {
  // ロックまで進めるのはミサイルを選んでいるときだけ。
  // 銃は捉える(TRACKING)までで、偏差照準の目標にだけ使う。
  const state = updateAim(dt, effectiveSensor(), !!currentWeapon().needsLock);

  if (state !== 'CLEAR') {
    // 捉え続けた時間に応じて 0→1 へ。1に近いほど間隔が詰まる
    // ロックの進み具合をそのまま音の詰まり方に使う。
    // 「音が詰まりきる=ロック完了」が耳で分かるようになる。
    const progress = currentLockProgress();
    const interval = CAPTURE.BEEP_START +
                     (CAPTURE.BEEP_END - CAPTURE.BEEP_START) * progress;

    if (state === 'LOCKED' && lastAimState !== 'LOCKED') {
      speakVoice('LOCK');          // ロックが満ちた瞬間
      playLockTone();
      lockBeepTimer = CAPTURE.LOCK_BEEP;
    }

    // --- ロック中は「ピー」という高音を鳴らし続ける ---
    // 捕捉中の「ビビビ」とは別の音にして、状態が変わったことを耳で分からせる
    if (state === 'LOCKED') {
      lockBeepTimer -= dt;
      if (lockBeepTimer <= 0) {
        playLockedBeep();
        lockBeepTimer = CAPTURE.LOCK_BEEP;
      }
      lastAimState = state;
      return;                      // ロック中は捕捉音のほうは鳴らさない
    }

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
// レーダーの調整値
const RADAR = {
  MISSILE_BLIPS: 6,    // 同時に映せる接近ミサイルの数
  // 「ほぼ同じ高さ」とみなす幅(索敵半径に対する割合)。
  // これがないと、高さが揃っているときに ▲▼ が細かく入れ替わって読みづらい。
  LEVEL_BAND:  0.05,
  EDGE:        0.94,   // 輝点を円の内側にとどめる位置(1.0=ふち)
};

const radarBlips   = [];   // 敵の輝点
const missileBlips = [];   // 接近ミサイルの輝点
const enemyMarkers = [];   // 3D画面に重ねる敵マーカー

// 戦艦の輝点とマーカー。戦闘機の枠を使い回さず、専用に1組だけ持つ。
//
// 使い回すと、戦闘機が落ちて配列が縮むたびに戦艦の割り当て先がずれ、
// 表示が別の輝点に飛び移ってちらつく。1隻しか出ないのだから、
// 専用の枠を1つ用意しておくのがいちばん素直で確実。
let bossBlip   = null;
let bossMarker = null;

// 落ちている回収物の輝点。同時に出せる数だけ先に作っておく
const salvageBlips = [];

function setupRadar() {
  const count = (typeof enemyCount === 'function') ? enemyCount() : 0;

  // 接近ミサイル用の輝点をあらかじめ作っておく
  for (let i = 0; i < RADAR.MISSILE_BLIPS; i++) {
    const mb = document.createElement('div');
    mb.className = 'radar-blip missile';
    radarEl.appendChild(mb);
    missileBlips.push(mb);
  }

  // 戦艦用(1隻ぶん)
  bossBlip = document.createElement('div');
  bossBlip.className = 'radar-blip capital';
  radarEl.appendChild(bossBlip);

  bossMarker = document.createElement('div');
  bossMarker.className = 'enemy-marker capital';
  bossMarker.innerHTML = '<span></span><span></span><span></span><span></span>' +
                         '<span class="dist"></span><span class="tag"></span>';
  markerLayer.appendChild(bossMarker);

  // 回収物用の輝点。場に出せる数だけ先に作っておく
  const salvageMax = (typeof SALVAGE !== 'undefined') ? SALVAGE.MAX_ON_FIELD : 0;
  for (let i = 0; i < salvageMax; i++) {
    const sb = document.createElement('div');
    sb.className = 'radar-blip salvage';
    radarEl.appendChild(sb);
    salvageBlips.push(sb);
  }

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

// ===================================================================
// ロックオン表示(赤い円と「LOCKED ON」)
//
// 照準に重ねるので、視点に関わらず出す。
// コックピットではHTMLの十字は消えるが、こちらは光像式照準器の
// レティクルの位置に重なるため、そのまま使える。
// ===================================================================
function renderLockRing() {
  const locked = (currentAimState() === 'LOCKED');
  const aim = locked ? getAimNdc() : null;

  if (!locked || !aim || !aim.visible) {
    lockRingEl.classList.remove('on');
    return;
  }

  lockRingEl.classList.add('on');
  lockRingEl.style.left = ((aim.x * 0.5 + 0.5) * 100) + '%';
  lockRingEl.style.top  = ((-aim.y * 0.5 + 0.5) * 100) + '%';
}

// ===================================================================
// 偏差照準(リードパイパー)
//
// 「弾が届くころ、敵はここにいる」という点に小さな印を出す。
// 印に機首を合わせて撃てば当たる ― 動く敵に当てるための道具。
// 判定は3D側(scene.js の getLeadNdc)。ここは置くだけ。
// ===================================================================
// ===================================================================
// 被ロック警報(ミサイルにロックされている間)
//
// この装備の駆け引きは「撃ってくるか分からないまま、
// 有限のフレアを切るかどうかを決める」ところにある。
// だから警報は「ロックされた」で鳴り始め、
// 実際に飛んできたかどうかは別の段階として見せる。
//   LOCKED   … ロックされている。来るかもしれない ― ここが判断の時間
//   INBOUND  … 発射された。もう迷う段階ではない
// ===================================================================
let lastThreatLevel = 'CLEAR';
let threatBeepTimer = 0;

function renderLockWarn(dt) {
  const t = threatStatus();
  const locked  = (t.level === 'LOCK');
  const inbound = (t.level === 'MISSILE');

  lockWarnEl.classList.toggle('on', locked || inbound);
  lockWarnEl.classList.toggle('inbound', inbound);
  if (locked || inbound) {
    lockWarnEl.querySelector('.lock-warn-label').textContent =
      inbound ? 'MISSILE INBOUND' : 'MISSILE LOCK';
  }

  // 鳴り続ける警報。間隔は段階で変える(発射済みのほうが速い)
  if (locked || inbound) {
    threatBeepTimer -= dt;
    if (threatBeepTimer <= 0) {
      playMissileLockWarn();
      threatBeepTimer = inbound ? 0.22 : 0.38;
    }
  } else {
    threatBeepTimer = 0;
  }

  // 段階が上がった瞬間だけ音声を出す(毎コマ言わせない)
  if (t.level !== lastThreatLevel) {
    if (inbound) speakVoice('MISSILE_INBOUND');
    else if (locked) speakVoice('INCOMING');
    lastThreatLevel = t.level;
  }
}

// ===================================================================
// 三人称視点のデータパネル
//
// コックピットでは同じ内容を3Dの計器盤に描いているので、そちらでは出さない。
// 三人称は「機外から見ている表示」なので、板として画面に置く。
// ===================================================================
function renderDataPanel() {
  if (isCockpitView()) return;

  const t = threatStatus();
  const d = playerDetection();
  const info = nearestTargetInfo();

  const map = { CLEAR: ['CLEAR', ''], TRACK: ['TRACKED', 'track'],
                LOCK: ['MSL LOCK', 'lock'], MISSILE: ['INBOUND', 'missile'] };
  const m = map[t.level] || map.CLEAR;
  dpThreatEl.textContent = m[0];
  dpThreatEl.className = 'dp-threat' + (m[1] ? ' ' + m[1] : '');

  const set = (el, text, cls) => { el.textContent = text; el.className = cls || ''; };

  set(dpDetectEl, d.seen ? 'SEEN' : 'COLD', d.seen ? 'warn' : 'cool');

  // 今の熱収支のまま、あと何秒でシャットダウンするか
  const rate = currentHeatRate();
  if (rate <= 0.05 || shutdownLeft > 0) set(dpOverheatEl, '――', '');
  else {
    const sec = (HEAT.MAX - heat) / rate;
    set(dpOverheatEl, sec.toFixed(1) + 's',
        sec < 8 ? 'warn' : (sec < 20 ? 'amber' : ''));
  }

  const aim = currentAimState();
  set(dpLockEl, aim === 'LOCKED' ? 'LOCKED' : (aim === 'TRACKING' ? 'TRACK' : '----'),
      aim === 'LOCKED' ? 'warn' : (aim === 'TRACKING' ? 'amber' : ''));

  set(dpRangeEl, info.valid ? String(Math.round(info.dist)) : '----', '');
  if (info.valid) {
    const c = Math.round(info.closure);
    set(dpClosureEl, (c > 0 ? '+' : '') + c, c > 0 ? 'amber' : 'cool');
  } else set(dpClosureEl, '----', '');

  const drift = driftAngleDeg();
  set(dpDriftEl, Math.round(drift) + '°', drift > 25 ? 'cool' : '');

  const bursts = Math.floor(propellant / PROP.BURST_COST);
  set(dpBurstEl, String(bursts), bursts <= 2 ? 'warn' : '');

  const eh = nearestEnemyHeat();
  const vd = nearestEnemyVentDown();
  set(dpTheatEl, eh + (vd ? ' ▼' : ''),
      vd ? 'amber' : (eh >= 70 ? 'warn' : ''));
}

function renderLeadPip() {
  // センサーが壊れていると、そもそも精密な予測は出せない
  const lead = isBroken('sensor') ? null : getLeadNdc();
  if (!lead || !lead.visible) { leadPipEl.classList.remove('on'); return; }

  leadPipEl.classList.add('on');
  leadPipEl.style.left = ((lead.x * 0.5 + 0.5) * 100) + '%';
  leadPipEl.style.top  = ((-lead.y * 0.5 + 0.5) * 100) + '%';
}

// ===================================================================
// 計器盤を3Dの計器台に描く(コックピット視点のみ)
//
// HTMLの計器を上に重ねるのをやめ、計器の絵を canvas に描いて
// 3Dの板に貼る。板は機体の一部なので、揺れも傾きも遠近も
// こちらで何もしなくても付いてくる。
//
// ここでは「今の状態」を集めて console3d.js へ渡すだけ。
// 描き方はあちら、貼り付け先は scene.js。
// ===================================================================
// ===================================================================
// 照準スコープの枠まわり(中身の映像は scene.js が3Dで描く)
//
// ここの仕事は3つだけ:
//   1. 索敵の実効値を scene.js へ渡す(倍率はこれで決まる)
//   2. 開いているときだけ枠を出す
//   3. 倍率の数字を出す
//
// 倍率が索敵電力で動くので、この数字がそのまま
// 「センサーに配ると遠くが狙える」という手応えになる。
// センサー計器が壊れれば effectiveSensor が半分になり、倍率も勝手に落ちる。
// ===================================================================
function renderScopeHud() {
  // 故障とEMPを通したあとの索敵の強さ。索敵半径・ロック時間と同じ値を使う
  setScopeSensor(effectiveSensor());

  const st = scopeStatus();
  // 表示の切り替えは枠そのものに付ける。
  // この要素は body の直下にあって計器盤(#console)の中ではないので、
  // 「計器盤に印を付けて子孫を出す」書き方では一致しない
  if (scopeEl) scopeEl.classList.toggle('on', st.on);
  if (st.on && scopeMagEl) {
    // 索敵不足で頭打ちのときは、選んだ倍率も一緒に出す。
    // 「x6を選んだのに x3.5 しか出ていない」を、数字だけで分かるようにする
    scopeMagEl.textContent = st.capped
      ? 'x' + st.mag.toFixed(1) + ' / x' + st.want.toFixed(0)
      : 'x' + st.mag.toFixed(1);
    scopeMagEl.style.color = st.capped ? '#ffb44d' : '#7fe0c4';
  }
}

// ===================================================================
// スコープの中の偏差照準
//
// 本画面の照準器だけでは、拡大した窓の中で「どこへ撃つか」が分からない。
// 弾は敵の未来位置へ飛ばすものなので、拡大したならその未来位置も
// 一緒に拡大して見せないと、覗いても狙う道具にならない。
//
// updateScene のあと(= スコープのカメラが今コマぶん整ったあと)に呼ぶこと。
// ===================================================================
function renderScopePip() {
  if (!scopePipEl) return;
  // センサーが壊れていれば精密な予測は出せない。本画面の偏差照準と同じ扱い
  const p = isBroken('sensor') ? null : scopeLeadNdc();
  if (!p) { scopePipEl.classList.remove('on'); return; }
  scopePipEl.classList.add('on');
  // 撃つべき点が窓の外なら、縁に寄せて形を変える(黄色い菱形 = そっちだ、の合図)
  scopePipEl.classList.toggle('off', !!p.off);
  scopePipEl.style.left = (p.u * 100) + '%';
  scopePipEl.style.top  = (p.v * 100) + '%';
}

// ===================================================================
// スコープの観測・解析の読み出し
//
// 仕様書9.6 は敵の残弾を「センサー配分40%以上のときだけ読める」と定めている。
// スコープはその上位手段で、覗いて解析が済んだ相手だけは配分に関わらず全部読める。
// 遠くの敵は赤い点にしか見えず機種すら分からないので、
// 「狙撃機か突撃機か」が分かるだけでも間合いの取り方が変わる。
// ===================================================================
function renderScopeRead() {
  if (!scopeReadEl) return;
  const a = (typeof scopeAnalysis === 'function' && !isBroken('sensor'))
    ? scopeAnalysis() : null;
  if (!a) { scopeReadEl.classList.remove('on'); return; }
  scopeReadEl.classList.add('on');

  const rows = [];
  rows.push('<b>' + a.type + '</b>  ' + a.dist.toFixed(0));

  if (!a.done) {
    // 解析中。進み具合を細い線で見せる
    rows.push('解析中<u style="width:' + Math.round(a.progress * 100) + '%"></u>');
  } else {
    const heatPct = Math.round(a.heat / a.heatMax * 100);
    rows.push('熱 ' + (heatPct >= 70 ? '<i>' + heatPct + '%</i>' : heatPct + '%') +
              '  HULL ' + a.hp + '/' + a.hpMax);
    if (a.ventDown > 0) rows.push('<i>放熱不能 ' + a.ventDown.toFixed(1) + 's</i>');
    rows.push('MSL ' + a.missiles + '  FLR ' + a.flares);
    if (a.lockingMe) rows.push('<i>自機をロック中</i>');
  }
  // 壊した系統は解析の有無に関わらず見せる(自分でやったことなので)
  if (a.weaponDown > 0) rows.push('<s>武装 破壊 ' + a.weaponDown.toFixed(1) + 's</s>');
  if (a.engineDown > 0) rows.push('<s>推進 破壊 ' + a.engineDown.toFixed(1) + 's</s>');

  scopeReadEl.innerHTML = rows.join('<br>');
}

function renderConsole3D(dt) {
  const sensorPct = effectiveSensor();
  const w = currentWeapon();
  const a = currentBomb();
  const left = ammo[weaponIndex];

  drawConsole3D({
    power: power,
    heat: heat,
    heatRate: (currentHeatRate() >= 0 ? '+' : '') + currentHeatRate().toFixed(1) + '/s',
    radiatorOpen: radiatorOpen,
    radiatorMode: radiatorMode,
    autoTrack: isAimAssistOn(),
    propellant: propellant,
    shieldHp: shieldHp,
    // 計器が壊れていると表示だけが揺らぐ(実際の値は正しい)
    shieldShown: isBroken('shieldhp')
      ? Math.max(0, Math.round(shieldHp + (Math.random() - 0.5) * 26))
      : Math.round(shieldHp),
    shieldRegen: currentShieldRegen(),

    weapon: {
      label: w.label, jp: w.jp,
      ammo: (left === Infinity) ? '∞' : String(left),
      heatText: w.burst ? ('+' + w.heat + '×' + w.burst) : ('+' + w.heat),
      low: (left !== Infinity && left <= Math.max(2, Math.ceil(w.ammo * 0.25)))
           || effectiveWeaponPower() < w.minPower,
      isBeam: w.key === 'BEAM',
    },
    // ★ 1発も積んでいない機体では「―」を出す。
    //   「0」だと撃ち尽くしたように見えるが、積んでいないのとは別の状態。
    bomb: carriedBombIndexes().length
      ? { label: a.label, ammo: bombAmmo[bombIndex],
          low: bombAmmo[bombIndex] <= 0 || effectiveWeaponPower() < a.minPower }
      : { label: '---', ammo: '―', low: true },
    flare: flareCount,
    flareLow: flareCount <= Math.ceil(FLARE.COUNT / 6) || heat >= FLARE.HEAT_LIMIT,

    // 効いている回収品の効果(無ければ null で、計器の欄ごと出ない)
    salvageBuff: salvageBuffText(),

    contacts: getContacts(sensorPct),
    inbound: missileContacts(sensorPct),
    // 戦艦は enemies に入っていないので、contacts には含まれない。
    // 索敵半径にも縛らないので、別の枠で渡す(いなければ null)。
    capital: (typeof bossContact === 'function')
      ? bossContact() : null,
    sensorRange: sensorRange(sensorPct),
    sensorPct: sensorPct,
    radarNoisy: isBroken('sensor') || empLeft > 0,

    broken: {
      weapon: isBroken('weapon'), shield: isBroken('shield'),
      engine: isBroken('engine'), sensor: isBroken('sensor'),
      heat: isBroken('heat'), propellant: isBroken('propellant'),
      shieldhp: isBroken('shieldhp'),
    },

    // --- 熱の内訳 ---
    // 熱ゲージは溜まった量しか見せない。上がるか下がるかは
    // 発熱(武器+エンジン)と放熱の差で決まるので、その3つを分けて渡す。
    // 倍率(発電量アップ・冷却材)も通した実際の値を渡すこと ―
    // ここだけ素の値にすると、計器の内訳と熱ゲージの動きが食い違う。
    heatFromWeapon: power.weapon * HEAT.PER_WEAPON * powerOutputMult(),
    heatFromEngine: effectiveEngine() * HEAT.PER_ENGINE,
    heatVent: (shutdownLeft > 0) ? HEAT.VENT_SHUTDOWN : heatVentRate(radiatorOpen),

    // --- 狙われているか / 見つかっているか ---
    threat: threatStatus(),
    detect: playerDetection(),

    // --- 目標の中身 ---
    enemyInfo: nearestEnemyInfo(),
    // 敵の残弾は本来こちらから見えない情報。
    // センサーに十分配っているときだけ読める、という利得にしてある。
    canReadEnemyAmmo: (sensorPct >= 40) && !isBroken('sensor'),

    // --- 戦績 ---
    kills: killCount,
    killGoal: BOSS.SPAWN_KILLS,   // 戦艦が出てくるまでの残り撃墜数の分母
    hitsTaken: hitsTaken,
    // シールドが満タンに戻るまでの秒数。撤退するかの判断に使う
    shieldToFull: (function () {
      const r = currentShieldRegen();
      if (r <= 0 || shieldHp >= SHIELD.MAX) return null;
      return (SHIELD.MAX - shieldHp) / r;
    })(),

    // --- 上級者向けの読み ---
    // 現在値ではなく「このままだとどうなるか」を出す欄。
    // シャットダウンまでの秒数は、今の熱収支がそのまま続いた場合の見積り。
    // 熱が下がっているときは意味がないので null を渡して「――」にする。
    heatToShutdown: (function () {
      const rate = currentHeatRate();
      if (rate <= 0.05 || shutdownLeft > 0) return null;
      return (HEAT.MAX - heat) / rate;
    })(),
    aimState: currentAimState(),
    lockProgress: currentLockProgress(),
    driftAngle: driftAngleDeg(),
    targetDist: nearestTargetInfo().dist,
    closure: nearestTargetInfo().closure,
    targetValid: nearestTargetInfo().valid,
    burstsLeft: Math.floor(propellant / PROP.BURST_COST),
    // 選んでいない武器の残弾も見せる。持ち替える前に残りが分かる。
    // ★ 積んでいない兵装はそもそも並べない ―
    //   旧式艇で「CANNON 0」と出ると、撃ち尽くしたように見えてしまう。
    //   積んでいないことと、撃ち尽くしたことは別の状態。
    allAmmo: WEAPONS
      .map((wp, i) => ({ wp, i }))
      .filter(({ wp }) => shipHasWeapon(wp.key))
      .map(({ wp, i }) => ({
        name: wp.label.slice(0, 4),
        value: (ammo[i] === Infinity) ? '∞' : String(ammo[i]),
        low: ammo[i] !== Infinity && ammo[i] <= Math.max(2, Math.ceil(wp.ammo * 0.25)),
        selected: i === weaponIndex,
      })),

    speed: Math.round(currentSpeed()),
    target: currentEnemyState(),
    tHeat: nearestEnemyHeat(),
    hull: HULL.MAX_DAMAGE - hullDamage,
    hullMax: HULL.MAX_DAMAGE,
    preset: presetEl.textContent,
    empLeft: empLeft,
  }, dt);

  markConsoleTextureDirty();
}

// ===================================================================
// 計器盤を機体と一緒に揺らす(コックピット視点のみ)
//
// 計器は機体に付いている物なので、機体が揺れれば計器も画面の中で動く。
// 動かないと、そこだけ画面に貼られた別物に見えてしまう ―
// 「浮いて見える」の正体はこれ。
//
// 三人称では計器はコックピットの外の表示なので、動かさない。
// ===================================================================
function renderConsoleSway() {
  // コックピットでは計器は3Dの面に描かれるので、HTMLの計器盤はまるごと隠す。
  // 「重ねる」のをやめた、というのはこの1行のこと。
  consoleFrameEl.style.display = isCockpitView() ? 'none' : '';
  if (!isCockpitView() && consoleFrameEl.style.transform) {
    consoleFrameEl.style.transform = '';
  }
}

function renderRadar() {
  // センサー系が壊れていると索敵半径が半分に、EMPを浴びるとさらに落ちる
  const sensorPct = effectiveSensor();
  const range = sensorRange(sensorPct);
  radarRangeEl.textContent = Math.round(range);
  radarSensorEl.textContent = Math.round(sensorPct);
  // 故障中とEMP中はレーダーにノイズを出す
  radarEl.classList.toggle('noisy', isBroken('sensor') || empLeft > 0);

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
    placeBlip(blip, c, range);
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

  renderBossBlip(range);
  renderSalvageBlips(sensorPct, range);

  // --- 接近しているミサイル ---
  // 敵機と同じ形の輝点だが、色と点滅で「これは弾ではなく脅威」と分かるようにする
  const inbound = missileContacts(sensorPct);
  for (let i = 0; i < missileBlips.length; i++) {
    const mb = missileBlips[i];
    const m = inbound[i];
    if (!m) { mb.style.display = 'none'; continue; }
    placeBlip(mb, m, range * SENSOR_HEAT_BONUS_FOR_RADAR);
    // フレアに引っかかったミサイルは、もう自機を狙っていないので落ち着いた色に
    mb.classList.toggle('decoyed', m.decoyed);
  }
}

// ===================================================================
// 戦艦の輝点とマーカー
//
// 戦闘機とは別枠で描く。理由は2つ:
//   1. 見分けがつかないと困る。戦闘機3機と戦艦1隻が同じ点では読めない
//   2. 索敵半径に縛らない(boss.js の bossContact 参照)。
//      全長210の艦が画面いっぱいに見えているのにレーダーが空、では嘘になる
//
// 圏外にいるあいだは輝点がスコープの縁に貼り付く(placeBlip が丸める)。
// 「あの方角の、ずっと遠く」がそれで伝わる。
// ===================================================================
function renderBossBlip(range) {
  if (!bossBlip) return;

  const c = (typeof bossContact === 'function')
    ? bossContact() : null;

  if (!c) {
    bossBlip.style.display = 'none';
    bossMarker.style.display = 'none';
    return;
  }

  placeBlip(bossBlip, c, range);
  bossBlip.classList.toggle('hot', c.hot);   // 主砲チャージ中は色が変わる

  if (!c.inFront) { bossMarker.style.display = 'none'; return; }

  bossMarker.style.display = 'block';
  bossMarker.style.left = ((c.ndcX * 0.5 + 0.5) * 100) + '%';
  bossMarker.style.top  = ((-c.ndcY * 0.5 + 0.5) * 100) + '%';

  // 枠は戦闘機よりずっと大きく。艦の大きさに合わせて距離で変える
  const size = Math.max(70, Math.min(26000 / Math.max(c.dist, 1), 320));
  bossMarker.style.width  = size + 'px';
  bossMarker.style.height = size + 'px';

  bossMarker.classList.toggle('hot', c.hot);
  bossMarker.querySelector('.dist').textContent = Math.round(c.dist);
  bossMarker.querySelector('.tag').textContent =
    BOSS.NAME + '  VENT ' + c.ventsLeft + '/' + BOSS.VENT.LIST.length;
}

// ===================================================================
// 落ちている回収物の輝点
//
// 戦艦と違って索敵半径には縛る ―
// 拾い物まで無条件に見えると、センサーへ電力を配ることの意味が薄れる。
// 「センサーを厚くすると拾い物が見つけやすい」という利得を残したい。
// ===================================================================
function renderSalvageBlips(sensorPct, range) {
  const list = (typeof salvageContacts === 'function')
    ? salvageContacts(sensorPct) : [];

  for (let i = 0; i < salvageBlips.length; i++) {
    const el = salvageBlips[i];
    const c = list[i];
    if (!c) { el.style.display = 'none'; continue; }
    placeBlip(el, c, range);
  }
}

// レーダーに使う索敵半径の熱補正。ミサイルは噴射で燃えているぶん遠くから映る
const SENSOR_HEAT_BONUS_FOR_RADAR = 1.5;

// ===================================================================
// 輝点を1つ置く
//
// 自機から見た左右(localX)と前後(localZ)を、そのまま画面の横と縦に使う。
// localZ がマイナス=前方 → 画面の上、になるので座標の向きがそのまま合う。
// 高さ(localY)は位置ではなく「記号」で表す ― 平面のスコープに
// 高さを描く場所はないので、▲(上にいる)/▼(下にいる)で伝える。
// ===================================================================
function placeBlip(el, c, range) {
  let nx = c.localX / range;
  let ny = c.localZ / range;

  // 熱ボーナスなどで範囲外の対象が映るときは、円からはみ出すので縁に貼り付ける
  const r = Math.hypot(nx, ny);
  if (r > RADAR.EDGE) { nx = (nx / r) * RADAR.EDGE; ny = (ny / r) * RADAR.EDGE; }

  el.style.display = 'block';
  el.style.left = (50 + nx * 50) + '%';
  el.style.top  = (50 + ny * 50) + '%';
  el.textContent = altitudeGlyph(c.localY, range);
}

// 高さを表す記号。▲=自分より上 / ▼=自分より下 / ◆=ほぼ同じ高さ
function altitudeGlyph(localY, range) {
  const band = range * RADAR.LEVEL_BAND;
  if (localY >  band) return '▲';
  if (localY < -band) return '▼';
  return '◆';
}

// ===================================================================
// フレアを撒く(武器仕様書4章:回避装備はこれ一本)
//
// 熱が高いと騙せない、が肝。
// 「熱管理できている者だけがフレアを活かせる」という設計をここで作る。
// ===================================================================
function useFlare() {
  if (flareCount <= 0) {
    addCombatLog('FLARE EMPTY', 'hull');
    playDryFire();
    speakVoice('FLARES_OUT');
    return;
  }

  const result = dropFlare(heat);
  if (!result.ok) return;

  flareCount -= 1;
  playFlare();
  renderWeapon();

  if (heat >= FLARE.HEAT_LIMIT) {
    // 本体のほうが熱いので、偽の熱源として通用しない
    addCombatLog('FLARE ― 熱すぎる', 'hull');
    speakVoice('FLARE_INEFFECTIVE');
  } else if (result.fooled > 0) {
    addCombatLog('FLARE ― ' + result.fooled + '機を撹乱', 'warn');
  } else {
    addCombatLog('FLARE', 'warn');
  }
}

// 兵装を切り替える(仕様書9.6:R)
function switchWeapon() {
  // 積んでいる兵装だけを順に回す。1種類しか積んでいなければ何も起きない
  const carried = carriedWeaponIndexes();
  if (carried.length <= 1) {
    weaponIndex = carried[0];
    renderWeapon();
    return;
  }
  const at = carried.indexOf(weaponIndex);
  weaponIndex = carried[(at + 1) % carried.length];
  fireCooldown = 0;
  burstLeft = 0;      // 前の武器のバーストが残っていたら捨てる
  saidAmmoOut = false;   // 武器が変わったので、また弾切れを知らせてよい
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
  // バースト武器は「1条ぶんの熱 ×条数」と出す(1回の引き金で複数条出るため)
  weaponHeatEl.textContent = w.burst ? ('+' + w.heat + '×' + w.burst)
                                     : ('+' + w.heat);

  // --- 範囲攻撃(ボム/EMP)---
  const a = currentBomb();
  bombNameEl.textContent = a.label;
  bombAmmoEl.textContent = bombAmmo[bombIndex];
  bombRowEl.classList.toggle('low',
    bombAmmo[bombIndex] <= 0 || effectiveWeaponPower() < a.minPower);

  // 残りが少ない、または電力不足で撃てないときは赤くする。
  // 「残り10発」で固定にすると、最大6発のミサイルが常に赤くなってしまうので、
  // 搭載数に対する割合(1/4以下)で判断する。
  const low = (left !== Infinity && left <= Math.max(2, Math.ceil(w.ammo * 0.25)));
  const noPower = (effectiveWeaponPower() < w.minPower);
  const dead = isWeaponBroken(w.key);
  weaponPanelEl.classList.toggle('low', low || noPower || dead);
  weaponPanelEl.classList.toggle('dead', dead);
  weaponPanelEl.classList.toggle('beam', w.key === 'BEAM');
  // 沈黙した武器は、残弾ではなく理由を出す。
  // 数字が並んでいると「撃てるのに撃てない」ように見えてしまう
  if (dead) weaponAmmoEl.textContent = '×';

  // フレアの残数。熱が高いと効かないので、そのときは赤くする
  flareCountEl.textContent = flareCount;
  // 残りが搭載数の1/6を切ったら赤くする(搭載数を変えても目安が変わらないように)
  flareRowEl.classList.toggle('low',
    flareCount <= Math.ceil(FLARE.COUNT / 6) || heat >= FLARE.HEAT_LIMIT);
}

// ===================================================================
// 近接警告 ― ぶつかりそうなものが近づくと、画面のふちが光る
//
// コックピット視点は距離感がつかめない。自機が映らないうえ、
// 全長210の戦艦は遠くにいても近くにいても画面いっぱいにしか見えない。
// 艦体に触れたら即死なので、知らせないと理不尽になる。
//
// 見せ方:
//   ・遠い … 黄色でゆっくり点滅
//   ・近い … 赤で速く点滅し、ふちの光が濃く・広くなる
// 色相を 48(黄)から 0(赤)へ動かすだけで「黄→橙→赤」が出る。
// 段階で切り替えるのではなく連続で変えているので、
// 「じわじわ赤くなってきた」が距離そのものの手がかりになる。
// ===================================================================
const PROX_LOOK = {
  HUE_FAR:    48,    // 遠いときの色相(黄)
  HUE_NEAR:    0,    // 近いときの色相(赤)
  BLINK_FAR: 1.6,    // 遠いときの点滅の速さ(往復/秒)
  BLINK_NEAR: 7.5,   // 近いときの点滅の速さ
  ALPHA_MIN: 0.30,   // 点滅のいちばん暗いところ
  ALPHA_MAX: 0.95,
  SPREAD_FAR:  40,   // ふちの光の広がり(px)
  SPREAD_NEAR: 190,
};

let proxBlinkPhase = 0;   // 点滅の位相。速さを変えても飛ばないよう自前で進める

function renderProximity(dt) {
  if (!proximityEl) return;

  const w = (typeof proximityWarning === 'function' && missionState === 'active')
    ? proximityWarning() : null;

  if (!w) {
    proximityEl.classList.remove('on');
    proxBlinkPhase = 0;
    return;
  }
  proximityEl.classList.add('on');

  // level 0〜1 をそのまま「切迫度」として使う。
  // 二乗しているのは、近づいた終盤で急に強まるようにするため ―
  // 線形だと、まだ余裕がある距離から画面が真っ赤になって鬱陶しい。
  const k = w.level * w.level;

  // 点滅。近いほど速い
  const hz = PROX_LOOK.BLINK_FAR + (PROX_LOOK.BLINK_NEAR - PROX_LOOK.BLINK_FAR) * k;
  proxBlinkPhase += dt * hz * Math.PI * 2;
  const blink = 0.5 + 0.5 * Math.sin(proxBlinkPhase);

  // 色。黄 → 赤へ連続で動かす
  const hue = PROX_LOOK.HUE_FAR + (PROX_LOOK.HUE_NEAR - PROX_LOOK.HUE_FAR) * k;
  const color = 'hsl(' + hue.toFixed(0) + ', 100%, ' + (58 - k * 8).toFixed(0) + '%)';

  const alpha = (PROX_LOOK.ALPHA_MIN
    + (PROX_LOOK.ALPHA_MAX - PROX_LOOK.ALPHA_MIN) * blink) * (0.35 + 0.65 * k);
  const spread = PROX_LOOK.SPREAD_FAR
    + (PROX_LOOK.SPREAD_NEAR - PROX_LOOK.SPREAD_FAR) * k;

  proximityEl.style.setProperty('--prox-color', color);
  proximityEl.style.setProperty('--prox-alpha', alpha.toFixed(3));
  proximityEl.style.setProperty('--prox-spread', spread.toFixed(0) + 'px');

  // 触れたら即死のもの(戦艦)は、文字でもそう言う
  proxTextEl.textContent = w.deadly ? 'COLLISION − FATAL' : 'PROXIMITY';
  proxDistEl.textContent = Math.round(w.dist);
}

// ===================================================================
// 残骸から機材を回収した ― salvage.js から呼ばれる
//
// 3D側は「拾った」ことだけを知らせ、効果・音・ログは main.js が決める。
// boss.js が onBossVentHit を呼ぶのと同じ役割分担。
//
// 設定の裏づけは docs/salvage_system_v1.md に置いてある。
// 4種とも実在技術に根拠がある(仕様書6.2「魔法的な謎兵器は禁止」の方針)。
// ===================================================================
function onSalvagePickup(kind) {
  if (missionState !== 'active') return;

  const spec = salvageKind(kind);
  playSalvage();   // 上がっていく3音(audio.js)

  if (kind === 'power') {
    // 発電量が上がる。配分UIの合計は100%のまま(仕様書9.3)。
    // スーパーキャパシタ/フライホイール蓄電 ― 残骸に残っていた蓄電体
    powerBoostMult = spec.MULT;
    powerBoostLeft = spec.SEC;   // 重ねがけは延長ではなく上書き
    addCombatLog('◆ 電力セル回収 ― 出力 +'
      + Math.round((spec.MULT - 1) * 100) + '%', 'kill');
    speakVoice('SALVAGE');

  } else if (kind === 'coolant') {
    // 昇華型冷却材。ラジエーターを開かずに冷える = 被探知が上がらない。
    // 仕様書9.3の「冷やしたいが今冷やすと危ない」ジレンマからの逃げ道
    heat = Math.max(heat - spec.HEAT_DROP, 0);
    coolantVentMult = spec.VENT_MULT;
    coolantLeft = spec.SEC;
    addCombatLog('◆ 冷却材回収 ― 熱 −' + spec.HEAT_DROP, 'kill');
    speakVoice('SALVAGE');

  } else if (kind === 'prop') {
    // 破断タンクの残留推進剤。満タンにはしない ―
    // 「終盤の残量が読み合いになる」(仕様書9.3)を残すため
    const before = propellant;
    propellant = Math.min(propellant + spec.AMOUNT, PROP.MAX);
    addCombatLog('◆ 推進剤回収 ― +'
      + Math.round(propellant - before), 'kill');
    speakVoice('SALVAGE');

  } else if (kind === 'repair') {
    // 残骸から剥いだ同型部品で、壊れた計器を1つ取り替える。
    // HULLの数字は戻さない(仕様書9.3「機体構造:戦闘中回復不可」)―
    // 戻るのは機能だけで、受けた損傷そのものは消えない。
    const fixed = repairOneInstrument();
    if (fixed) {
      addCombatLog('◆ 修理パーツ ― ' + fixed + ' 復旧', 'kill');
      speakVoice('SALVAGE');
    } else {
      addCombatLog('◆ 修理パーツ ― 損傷なし', 'warn');
    }

  } else {
    // シールド発生器のコンデンサバンク。HULLは治らない(仕様書9.3:戦闘中回復不可)
    const before = shieldHp;
    shieldHp = Math.min(shieldHp + spec.AMOUNT, SHIELD.MAX);
    addCombatLog('◆ シールド回収 ― +'
      + Math.round(shieldHp - before), 'kill');
    speakVoice('SALVAGE');
  }

  render();       // 拾った瞬間にゲージへ反映する
  renderStatus();
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

  // 「あとから登場」の設定のときだけ、規定数で戦艦を呼ぶ。
  // 出撃時から出す設定(SPAWN_AT_START)なら、ここは何もしない。
  // どちらにせよ任務が終わるのは、戦艦を沈めたとき(onBossDestroyed)。
  // ★ 脱出戦では戦艦を出さない。
  //   小説では砲火が桟橋ごと呑んでいる ― 艦隊は「倒す相手」ではなく、
  //   村を焼いていく環境。初戦で超弩級戦艦と一騎討ちさせるのは筋が違うし、
  //   実弾を積んでいない旧式艇では、そもそも勝ち目の設計になっていない。
  if (typeof escapeRunning === 'function' && escapeRunning()) return;
  if (!BOSS.SPAWN_AT_START && killCount >= BOSS.SPAWN_KILLS && !bossStatus()) spawnBoss();
}

// ===================================================================
// ボス(boss.js)からの通知をまとめて受ける場所
//
// 3Dの見た目は boss.js、音とログと計器は main.js ―
// このゲームでずっと守っている役割分担をここでも通す。
// ===================================================================

// 出現した。withdrew = 戦場から引いた味方…ではなく敵戦闘機の数
function onBossArrive(withdrew) {
  addCombatLog('▲ WARNING ― CAPITAL SHIP', 'alert');
  addCombatLog(BOSS.NAME + ' 接近', 'alert');
  // 戦闘機が引いたことは、必ず伝える。
  // 黙って消すと「撃ち落としたのか、バグで消えたのか」が分からない。
  if (withdrew > 0) addCombatLog('敵戦闘機 ' + withdrew + '機 離脱 ― 単艦戦闘', 'warn');
  // 戦艦相手にだけ通用する決まりを、最初に1度だけ知らせる。
  // 説明書を読ませずに済ませるための1行(戦闘中に気づくのは難しい)
  addCombatLog('排熱口が開く直前からロック可 ― 艦体への接触は即死', 'warn');
  speakVoice('CAPITAL_SHIP');
  playLockWarning();
  bossPanelEl.classList.add('on');
  renderBossPanel();
}

// 片付けた(再出撃など)
function onBossGone() {
  if (bossPanelEl) bossPanelEl.classList.remove('on');
}

// 装甲に弾かれた。毎発ログを出すと流れてしまうので間引く
let lastRicochetLog = 0;
function onBossRicochet() {
  const now = performance.now();
  if (now - lastRicochetLog < 900) return;
  lastRicochetLog = now;
  addCombatLog('ARMOR ― 装甲に弾かれた', 'miss');
}

// 弱点が開いた。音でも知らせる ―
// 画面のどこを見ていても「今だ」が分かるようにするため
function onBossVentOpen(vent) {
  playLockedBeep();
  speakVoice('VENT_EXPOSED');
}

// 弱点に当たった
function onBossVentHit(vent, ventsLeft) {
  playEnemyHit();
  addCombatLog('◎ VENT HIT ― ' + vent.labelJa, 'hit');
  renderBossPanel();
}

// 弱点をひとつ潰した
function onBossVentDown(vent, ventsLeft) {
  playExplosion();
  addCombatLog('★ VENT DESTROYED ― ' + vent.labelJa + ' 沈黙', 'kill');
  addCombatLog('残る排熱口 ' + ventsLeft, 'kill');
  speakVoice('TARGET_DESTROYED');
  renderBossPanel();
}

// ミサイル発射の予告
function onBossMissileWarn() {
  addCombatLog('▲ MISSILE INBOUND ― 多数', 'alert');
  speakVoice('MISSILE_INBOUND');
  playMissileLockWarn();
}

// 主砲のチャージ開始
function onBossBeamCharge() {
  addCombatLog('▲ MAIN GUN CHARGING ― 退避', 'alert');
  speakVoice('MAIN_GUN');
  playLockWarning();
  renderBossPanel();
}

// 主砲発射
function onBossBeamFire() {
  playExplosion();
  addCombatLog('■ MAIN GUN FIRE', 'alert');
  renderBossPanel();
}

// 撃破演出の開始
function onBossDeathStart() {
  addCombatLog('★★ 排熱口 全滅 ― 艦体崩壊', 'kill');
  playExplosion();
}

// 沈んだ = 任務達成
function onBossDestroyed() {
  playExplosion();
  if (bossPanelEl) bossPanelEl.classList.remove('on');
  addCombatLog('★★★ ' + BOSS.NAME + ' 撃沈', 'kill');
  endMission('complete');
}

// ===================================================================
// ボスの計器パネル。弱点4つの状態をそのまま出す
//
// 「いま撃ってよいのはどれか」が一目で分かることが唯一の目的。
// 開いている弱点だけが緑で光る。
// ===================================================================
function renderBossPanel() {
  if (!bossPanelEl) return;
  const st = bossStatus();
  if (!st) { bossPanelEl.classList.remove('on'); return; }

  bossDistEl.textContent = st.dist;
  bossPanelEl.classList.toggle('beam', st.beam === 'charge' || st.beam === 'fire');

  // 行が無ければ最初に作る。あとは中身だけ差し替える
  if (bossVentEls.length === 0) {
    for (const v of st.vents) {
      const row = document.createElement('div');
      row.className = 'boss-vent';
      row.innerHTML = '<span class="lbl"></span><span class="bar"><i></i></span><span class="st"></span>';
      bossVentListEl.appendChild(row);
      bossVentEls.push(row);
    }
  }

  st.vents.forEach((v, i) => {
    const row = bossVentEls[i];
    row.classList.toggle('open', v.open && v.alive);
    // 開く直前(予告)。ここからミサイルのロックを始められるので、
    // 「開いた/閉じた」の2状態では足りない ― 3つ目の表示を出す。
    row.classList.toggle('warn', !!v.warn && v.alive);
    row.classList.toggle('down', !v.alive);
    row.querySelector('.lbl').textContent = v.labelJa;
    row.querySelector('.bar > i').style.width = (v.hp / v.maxHp * 100) + '%';
    row.querySelector('.st').textContent =
      !v.alive ? '沈黙' : (v.open ? 'OPEN' : (v.warn ? '開放前' : '閉'));
  });
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
// damageMult = 撃ってきた敵のタイプごとの威力倍率。
// 省略されたら1.0(=これまでどおり)として扱う。
function onPlayerHit(damageMult) {
  if (missionState !== 'active') return;   // リザルト表示中はもう減らさない

  const mult = (typeof damageMult === 'number') ? damageMult : 1;
  const damage = Math.round(INCOMING.SHIELD_DAMAGE * mult);

  hitsTaken += 1;              // リザルトに出す被弾回数
  hitVignette = 0.45 * Math.min(mult, 1.6);   // 重い一撃ほど画面が強く赤くなる

  if (shieldHp > 0) {
    // --- シールドで受けた ---
    shieldHp = Math.max(shieldHp - damage, 0);
    damageFlash = 0.3;         // シールドゲージが赤く光る(既存の演出を流用)
    startShake(INCOMING.SHAKE_STRENGTH * Math.min(mult, 1.8));
    addCombatLog('SHIELD −' + damage, 'warn');
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
  // 壊れうるものをすべて集め、まだ無事なものだけを残す。
  // ゲージだけでなく後方カメラも対象なので、data-system が付いたもの全部を見る。
  const all = Array.from(document.querySelectorAll('[data-system]'));
  const intact = all.filter((g) => !g.classList.contains('broken'));
  if (intact.length === 0) return null;   // もう全部壊れている

  const picked = intact[Math.floor(Math.random() * intact.length)];
  picked.classList.add('broken');

  const key = picked.dataset.system;
  brokenSystems.add(key);   // ここから機能が失われる

  // 後方カメラと照準スコープは3D側が描いているので、描画そのものを止めてもらう
  if (key === 'mirror') setMirrorBroken(true);
  if (key === 'scope')  setScopeBroken(true);

  // 武器系は「ひとかたまり」ではなく、主武器3系統のうち1つが沈黙する。
  // 詳しい理由は brokenWeapons の説明を参照
  if (key === 'weapon') {
    const lost = breakOneWeapon();
    if (lost) return lost + ' 発射不能';
  }

  const info = BREAKAGE[key];
  return info ? (info.label + ' ' + info.lost) : null;
}

// ===================================================================
// 修理パーツ(salvage.js)で、壊れたものを1つ直す
//
// 直した名前を返す。直すものが無ければ null。
//
// 【直す順番】沈黙した主武器 → それ以外の計器。
// 撃てないことが試合をいちばん強く止めるので、そこを最優先で戻す。
// 「拾ったのに直ってほしいところが直らない」を避けるための決め打ち。
//
// ※ HULLの数字(hullDamage)は戻さない。
//   仕様書9.3「機体構造:戦闘中回復不可」を守る。
//   戻すのは機能だけで、受けた損傷そのものは消えない。
// ===================================================================
function repairOneInstrument() {
  // --- まず主武器 ---
  if (brokenWeapons.size > 0) {
    const key = brokenWeapons.values().next().value;
    brokenWeapons.delete(key);
    const w = WEAPONS.find((x) => x.key === key);
    // 「武器」計器そのものの故障表示も一緒に戻す。
    // ここを残すと、撃てるのに電力を武器へ配れないままになる
    brokenSystems.delete('weapon');
    const el = document.querySelector('[data-system="weapon"]');
    if (el) el.classList.remove('broken');
    renderWeapon();
    return w ? w.jp : '主武器';
  }

  // --- 次にそれ以外の計器 ---
  const el = document.querySelector('[data-system].broken');
  if (!el) return null;

  const key = el.dataset.system;
  el.classList.remove('broken');
  brokenSystems.delete(key);
  if (key === 'mirror') setMirrorBroken(false);
  if (key === 'scope')  setScopeBroken(false);

  const info = BREAKAGE[key];
  return info ? info.label : key;
}

// 直すものがあるか(salvage.js が修理パーツを抽選に混ぜるか決めるのに使う)。
// 無傷のときに修理パーツを出しても、拾って何も起きない外れくじになる。
function salvageNeedsRepair() {
  return brokenWeapons.size > 0 || brokenSystems.size > 0;
}

// 主武器3系統のうち、まだ生きているものを1つ選んで沈黙させる。
// 沈黙させた武器の名前を返す(全部落ちていれば null)。
//
// 最後の1つは残す ― 撃つ手段がゼロになると、勝利条件(戦艦の撃沈)に
// 手が届かなくなり、時間切れまで飛ぶだけの試合になってしまう。
function breakOneWeapon() {
  const alive = WEAPONS.filter((w) => !isWeaponBroken(w.key));
  if (alive.length <= 1) return null;   // 最後の1系統は壊さない

  const picked = alive[Math.floor(Math.random() * alive.length)];
  brokenWeapons.add(picked.key);

  // 今それを選んでいたら、生きているものへ勝手に持ち替える。
  // 撃てない武器を握らせたまま放り出すと、何が起きたのか分からない
  if (currentWeapon().key === picked.key) {
    const next = WEAPONS.findIndex((w) => !isWeaponBroken(w.key));
    if (next >= 0) {
      weaponIndex = next;
      addCombatLog(currentWeapon().jp + ' へ切替', 'warn');
    }
  }
  renderWeapon();
  return picked.jp;
}

// ===================================================================
// 装甲(HULL)ゲージ
//
// シールドは削られても自然に回復するが、装甲は戻らない。
// 5段すべて失うと任務失敗 ― こちらが本当の体力。
// 「あと何発耐えられるか」を、数えなくても分かる形で出す。
// ===================================================================
function renderHullGauge(hullLeft) {
  if (!hullTubeEl) return;

  // 段の表示。上から失われていく(要素は下から積んである)
  for (let i = 0; i < hullSegEls.length; i++) {
    hullSegEls[i].classList.toggle('lost', i >= hullLeft);
  }

  // 残りに応じて色を変える。数字を読まなくても危険度が分かるようにする
  hullTubeEl.classList.toggle('warn', hullLeft === 3);
  hullTubeEl.classList.toggle('crit', hullLeft <= 2);

  hullNumEl.textContent = hullLeft;
  hullNumEl.style.color = hullLeft <= 2 ? '#ff5a3c' : (hullLeft === 3 ? '#ffcf6a' : '');

  // 添え書き。今の状態をひとことで
  hullSubEl.textContent =
    hullLeft >= HULL.MAX_DAMAGE ? 'INTACT'
    : hullLeft <= 1 ? 'CRITICAL'
    : hullLeft <= 2 ? 'HEAVY'
    : 'DAMAGED';
  hullSubEl.style.color = hullLeft <= 2 ? '#ff5a3c' : '';
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
// reason を渡すと、失敗の理由文をその文字列にする(省略すると既定の「機体構造 崩壊」)
function endMission(result, reason) {
  if (missionState !== 'active') return;   // 二重に終わらせない

  missionState = result;
  setCombatFrozen(true);          // 敵AIと敵弾を止める
  stopBgm();                      // BGM を引く。結果の音と重ならないように
  consoleEl.classList.add('failed');   // リザルト画面を表示するクラス

  // 見出しと理由。同じ枠を色違いで使い回す
  resultPanel.classList.remove('win', 'timeup');
  if (result === 'escaped') {
    // ★ 勝ちだが「MISSION COMPLETE」ではない。
    //   貨物船は出た。村は落ちた。両方を同時に言う表示にしてある。
    resultPanel.classList.add('win');
    resultTitleEl.textContent = t('esc.win.title');
    resultReasonEl.textContent = t('esc.win.reason');
    playMissionComplete();
  } else if (result === 'complete') {
    resultPanel.classList.add('win');
    resultTitleEl.textContent = 'MISSION COMPLETE';
    resultReasonEl.textContent = BOSS.NAME + ' 撃沈 ― 任務達成';
    playMissionComplete();
  } else if (result === 'timeup') {
    playTimeUp();
    resultPanel.classList.add('timeup');
    resultTitleEl.textContent = 'TIME UP';
    resultReasonEl.textContent = '制限時間到達 ― 任務失敗';
  } else {
    // 自機の爆発が先。ジングルは爆発が収まってから鳴らす
    explodePlayer();          // scene.js:自機の位置に破片をまき散らす
    playPlayerExplosion();
    startShake(1.6);
    playMissionFailed(1.1);
    resultTitleEl.textContent = 'MISSION FAILED';
    resultReasonEl.textContent = reason || '機体構造 崩壊';
  }

  // ロックオン表示を消す(戦闘が止まるので、出しっぱなしにしない)
  lockRingEl.classList.remove('on');

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
  resetBoss();   // 前回の戦艦を片付ける(boss.js)。出し直しは自機を戻したあと
  resetSalvageBuffs();   // 前回拾った機材の効果を解除する(持ち越さない)

  // --- 7パラメーターを初期状態へ ---
  power.weapon = 25; power.shield = 25; power.engine = 25; power.sensor = 25;
  presetEl.textContent = 'MANUAL';
  heat = 0;
  radiatorMode = 'open';
  radiatorOpen = true;   // 出撃時はラジエーター展開状態
  shutdownLeft = 0;
  empLeft = 0;
  propellant = PROP.MAX;
  shieldHp = SHIELD.MAX;
  // 積んでいる兵装の先頭を選ぶ。旧式艇ならビーム砲しか無い
  weaponIndex = carriedWeaponIndexes()[0];
  bombIndex = (carriedBombIndexes()[0] !== undefined) ? carriedBombIndexes()[0] : 0;
  ammo = WEAPONS.map((w) => (shipHasWeapon(w.key) ? w.ammo : 0));   // 積んでいない弾は0

  fireCooldown = 0;
  burstLeft = 0;
  deflectCount = 0;
  partBreakCount = 0;
  lastRollKey = '';      // 前の出撃の押しを引きずって、いきなり回らないように
  lastRollAt = -99;
  saidAmmoOut = false;
  bombIndex = 0;
  bombAmmo = BOMBS.map((w) => (shipHasBomb(w.key) ? w.ammo : 0));   // 積んでいないBOMBSは0
  bombCooldown = 0;
  flareCount = FLARE.COUNT;              // フレアも積み直す

  // --- 損傷を消す ---
  hullDamage = 0;
  hitVignette = 0;
  for (const el of document.querySelectorAll('[data-system].broken')) {
    el.classList.remove('broken');
  }
  brokenSystems.clear();
  brokenWeapons.clear();    // 沈黙した主武器も戻す
  setMirrorBroken(false);   // 後方カメラの映像を戻す

  // --- 戦果とログを消す ---
  killCount = 0;
  killCountEl.textContent = '0';
  combatLogEl.innerHTML = '';

  resetFlight();   // 3D側:自機の位置・速度・敵をやり直す
  render();
  addCombatLog('SORTIE', 'warn');
  playSortie();

  // 戦艦を出す(boss.js)。
  //
  // ★ 必ず resetFlight() のあとで呼ぶこと。
  //   出現位置は「自機の正面 430」で決めるので、自機を原点に戻す前に呼ぶと、
  //   前回の任務を終えた場所と向きを基準にしてしまい、
  //   戦艦が真横や真後ろに現れる。
  //
  // ★ screenState を見ているのは、ページを開いた直後や
  //   メニューに戻っているときに出さないため ―
  //   タイトルの背景に戦艦が現れて警報が鳴りだしたら事故になる。
  if (BOSS.SPAWN_AT_START && screenState === 'mission') spawnBoss();
  console.log('RESTART ― 再出撃');
}

// ===================================================================
// 発射:熱を上げて、3D空間にビームを撃つ
// ===================================================================
function fire() {
  const w = currentWeapon();

  // 前のバーストがまだ鳴り終わっていないなら、新しい引き金は受けない。
  //
  // バーストの長さはコマの粒度で伸びる ― 1条ごとの間隔0.07秒は、
  // 60fps なら5コマ(0.083秒)、30fps なら3コマ(0.10秒)に丸められるので、
  // 6条ぶんで 0.42秒 〜 0.50秒 と揺れる。
  // 次の引き金までの間隔(0.45秒)を超えるコマ落ち時に、
  // このガードが無いと新しい引き金が前のバーストを打ち切り、条数が減っていた。
  // 時間の数字を突き合わせて調整するより、状態で弾くほうが確実。
  if (burstLeft > 0) return;

  // --- 撃てるかどうかの確認 ---
  // 仕様書9.3「武器系被弾で発射不可」。ただし潰れるのは3系統のうち1つだけで、
  // 持ち替えれば戦い続けられる(理由は brokenWeapons の説明を参照)
  if (isWeaponBroken(w.key)) {
    addCombatLog(w.jp + ' 発射不能 ― R で持ち替え', 'hull');
    playDenied();
    return;
  }
  // ビームは武器へ電力が回っていないと撃てない(=電力を大食いする表現)
  if (effectiveWeaponPower() < w.minPower) {
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

  // ミサイルはセンサーロックがないと撃てない(武器仕様書)
  if (w.needsLock) {
    if (!hasLock()) {
      addCombatLog('NO LOCK', 'hull');
      playDenied();
      speakVoice('NO_LOCK');
      return;
    }
    if (!fireMissile()) { playDenied(); return; }
    ammo[weaponIndex] -= 1;
    heat = Math.min(heat + w.heat, HEAT.MAX);
    fireCooldown = w.interval;
    playMissileLaunch();
    speakVoice('MISSILE_AWAY');
    startShake(FEEL.SHAKE_FIRE * 2);
    return;
  }

  fireOnce(w);        // 1条目
  fireCooldown = w.interval;

  // バースト武器は、残りの条を予約しておく。
  // ここで一度に全部撃たず、時間を空けて撃つから「ドドドッ」と聞こえる。
  if (w.burst && w.burst > 1) {
    burstLeft  = w.burst - 1;
    burstTimer = w.burstGap;
  }
}

// ===================================================================
// 1条だけ撃つ ― 弾数を減らし、熱を上げ、3Dへ弾を出す
//
// fire() から呼ばれるほか、バーストの2条目以降もここを通る。
// 「撃てるかどうかの確認」は fire() が済ませている前提。
// ===================================================================
function fireOnce(w) {
  const index = WEAPONS.indexOf(w);
  if (ammo[index] !== Infinity) ammo[index] -= 1;

  heat = Math.min(heat + w.heat, HEAT.MAX);
  fireBolt(w.boltColor, w.damage);   // scene.js:弾を飛ばす(威力は兵装ごと)
  playFireSound();

  // 撃った手応え。被弾(0.55)よりずっと弱い、ごく小さな振動
  startShake(FEEL.SHAKE_FIRE);

  // 発射で限界を超えたら、その場でシャットダウン
  if (heat >= HEAT.MAX) {
    heat = HEAT.MAX;
    shutdownLeft = HEAT.SHUTDOWN_SEC;
    burstLeft = 0;             // 停止したのでバーストの残りは撃てない
    playShutdown();
    speakVoice('POWER_FAILURE');
    console.log('OVERHEAT ― 強制シャットダウン(発射熱)');
  }
}

// バーストの残り条を撃ち足す。毎コマ呼ばれる
function updateBurst(dt) {
  if (burstLeft <= 0) return;

  // 途中でシャットダウンしたり武器を替えたら、残りは撃たない
  const w = currentWeapon();
  if (shutdownLeft > 0 || !w.burst || ammo[weaponIndex] <= 0) {
    burstLeft = 0;
    return;
  }

  burstTimer -= dt;
  if (burstTimer > 0) return;

  fireOnce(w);
  burstLeft -= 1;
  burstTimer = w.burstGap;
}

// ===================================================================
// 範囲攻撃の発射(Bキー)
//
// 主武器と違い「当てる」のではなく「置く」。数秒後にその場で炸裂する。
// 自分も巻き込まれるので、撃ったら離れる操作とセットになる。
// ===================================================================
function fireBomb() {
  // 積んでいない機体では、そもそも投げられない(旧式艇には1発も無い)
  if (!carriedBombIndexes().length) return;

  const a = currentBomb();

  // BOMBS は武器系の故障では止まらない。
  // 武器仕様書が「主武器3系統」と「範囲攻撃3種」を別の層として立てているので、
  // 別回路として扱う ― 主武器を失っても、これで戦い続けられる。
  // (電力が要るのは変わらないので、EMPは武器への配分が足りないと撃てない)
  if (bombCooldown > 0) return;

  // EMPは電力を食う装備。武器へ配っていないと撃てない
  if (effectiveWeaponPower() < a.minPower) {
    addCombatLog('出力不足', 'hull');
    playDenied();
    return;
  }
  if (bombAmmo[bombIndex] <= 0) {
    addCombatLog(a.label + ' OUT', 'hull');
    playDryFire();
    speakVoice('AMMO_DEPLETED');
    return;
  }

  if (!launchOrdnance(a.kind)) { playDenied(); return; }

  bombAmmo[bombIndex] -= 1;
  bombCooldown = a.interval;
  heat = Math.min(heat + a.heat, HEAT.MAX);
  playOrdnanceLaunch(a.kind === 'emp');
  // パイロ弾は連射するので、1発ごとにログを出すとログが埋まってしまう
  if (!a.auto) addCombatLog(a.jp + ' 投下', 'warn');
  startShake(FEEL.SHAKE_FIRE * (a.auto ? 1.0 : 1.5));
  renderWeapon();
}

// BOMBS の切替(Nキー)
function switchBomb() {
  // 1発も積んでいない機体では、切替そのものが起きない
  const carried = carriedBombIndexes();
  if (!carried.length) {
    addCombatLog('BOMB 未搭載', 'warn');
    return;
  }
  const at = carried.indexOf(bombIndex);
  bombIndex = carried[(at + 1) % carried.length];
  bombCooldown = 0;
  playPresetConfirm();
  addCombatLog(currentBomb().jp, 'warn');
  renderWeapon();
}

// ===================================================================
// 炸裂の結果を受け取る ― scene.js から呼ばれる
// ===================================================================

// 範囲攻撃が炸裂した。hit=巻き込んだ機数 / killed=そのうち撃墜した数
function onAreaBlast(kind, hit, killed) {
  if (kind === 'pyro') {
    // パイロ弾は毎秒何発も出るので、音とログは当たったときだけにする
    playEnemyHit();
    if (hit > 0) {
      addCombatLog('PYRO ― ' + hit + '機に燃焼片', 'warn');
      speakVoice('TARGET_OVERHEAT');
    }
    return;
  }

  playBlast(kind === 'emp');

  if (kind === 'emp') {
    if (hit > 0) addCombatLog('EMP ― ' + hit + '機 沈黙', 'kill');
    else         addCombatLog('EMP ― 効果なし', 'warn');
  } else {
    if (hit > 0) addCombatLog('BOMB ― ' + hit + '機に命中', 'kill');
    else         addCombatLog('BOMB ― 外れ', 'warn');
  }
}

// 自分のボムに巻き込まれた
function onPlayerBlast(damage) {
  if (damage <= 0) return;
  addCombatLog('自爆 ― 爆風', 'hull');
  takeDamage(damage);
}

// 自分のパイロ弾の燃焼片を浴びた。近すぎる相手に撒くと自分の熱が上がる
function onPlayerPyro(heatAdd) {
  if (heatAdd <= 0) return;
  heat = Math.min(heat + heatAdd, HEAT.MAX);
  addCombatLog('自機に燃焼片 ― 熱+' + Math.round(heatAdd), 'hull');
  if (heat >= HEAT.MAX) {
    heat = HEAT.MAX;
    shutdownLeft = HEAT.SHUTDOWN_SEC;
    burstLeft = 0;
    playShutdown();
    speakVoice('POWER_FAILURE');
  }
}

// 自分のEMPに巻き込まれた。
// シールドが再生せず、センサーも落ちる ― 撃ったら離れる、を守らせる代償。
function onPlayerEmp(seconds) {
  empLeft = Math.max(empLeft, seconds);
  addCombatLog('EMP 被曝 ― 系統低下', 'hull');
  playEmpHit();
  speakVoice('SYSTEMS_DOWN');
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

// ループの本体。ここは「1コマぶんの処理」だけを書く。
// 次のコマの予約は下の tick() が必ず行うので、ここでは予約しない。
function tickBody(now) {
  // now はページを開いてからの経過ミリ秒。前回との差＝この1コマの長さ(秒)を出す。
  // Math.min(..., 0.1) は、別タブに移って戻ったときに時間が飛ぶのを防ぐための上限。
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  elapsed += dt;

  // --- タイトル画面:自機をゆっくり漂わせるだけ。時間も戦闘も進まない ---
  if (screenState === 'menu') {
    updateMenuBackdrop(dt);   // screens.js:ゆるい旋回と巡航
    updateScene(dt, elapsed);
    return;
  }

  // --- ストーリー:サイドビューのADVパート。3Dは動かさない ---
  if (screenState === 'story') {
    updateStory(dt);          // story.js:歩き・会話・カメラ
    return;
  }

  // --- ギャラリー:機体を1機だけ置いて、ゆっくり回して見せる ---
  if (screenState === 'gallery') {
    updateGalleryView(dt, CRAFT[galleryIndex].key);   // scene.js が描画まで行う
    return;
  }

  // --- 一時停止:景色をそのまま止めて置く(背景も動かさない)---
  if (screenState === 'paused') {
    updateScene(dt, elapsed);
    return;
  }

  if (missionState !== 'active') {
    // --- リザルト表示中:操作も戦闘も止める。R キー待ち ---
    updateShake(dt);
    updateScene(dt, elapsed);   // 破片などは動き続ける
    renderHeat();
    renderStatus();
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
  // 脱出戦のときは、時間切れ = 貨物船が港を出た = 勝ち。
  // 決着は escape.js が出すので、こちらの時間切れ処理は通さない。
  if (typeof escapeRunning === 'function' && escapeRunning()) { /* escape.js に任せる */ }
  else if (missionTime <= 0) {
    missionTime = 0;
    endMission('timeup');
  }

  updateAutoFire(dt);               // 機関砲の連射
  updateBurst(dt);                  // ビーム砲のバーストの残り条
  // 回収した機材の効果の残り時間。熱と電力の計算より先に減らすこと ―
  // 切れたコマにまだ効いていることになると、計器の予測と1コマぶんずれる
  updateSalvageBuffs(dt);
  // 僚機(味方の旧式艇)。読み込まれていなければ何もしない
  if (typeof updateWingmen === 'function') updateWingmen(dt);
  // アルカディア脱出戦。貨物船と僚機の消耗はここで進む
  if (typeof updateEscape === 'function') updateEscape(dt);
  updateRadiatorAuto(dt);           // ラジエーターの自動開閉
  updateDrift();                    // Shift の押し具合を見る(update より先。熱の計算に効く)
  update(dt);                       // 7パラメーターの時間経過
  updateView(dt);                   // W/A/S/D による機首操作
  updateShake(dt);                  // 被弾の揺れ(カメラを置く前に決めておく)
  // エンジン系が壊れていると推力を制御できず、最低出力に張り付く
  // 発電量が上がっている間は、同じ配分でも実効出力が増える = 速く飛べる。
  // scene.js の speedFromEnginePower は100を超える値を受け取れるようにしてある。
  updateFlight(dt, effectiveEngine());
  // 自機の熱とラジエーターの状態を、敵の目とミサイルのシーカーへ伝える
  setPlayerHeat(heat, radiatorOpen);
  updateAimFeedback(dt);            // 照準の捕捉判定と、捕捉音
  updateVoiceAlerts(dt);            // コックピット音声
  renderScopeHud();                 // 照準スコープ(倍率は索敵電力で決まる)
  updateScene(dt, elapsed);         // 敵機・弾・破片の更新と描画(scene.js)
  renderHeat();        // 計器の描画
  renderStatus();
  renderRadar();       // レーダーと敵マーカー
  renderWeapon();      // 兵装パネル(残弾)
  renderCrosshair();   // 照準(弾道の向きに合わせる)
  renderLockRing();    // ロックオンの赤い円と「LOCKED ON」
  renderLeadPip();     // 偏差照準(ここへ撃てば当たる、の小さな印)
  renderScopePip();    // スコープの中にも同じ印を置く(拡大したぶん狙いやすくなる)
  renderScopeRead();   // スコープで捉えた相手の中身(観測・解析)
  renderLockWarn(dt);  // 被ロック警報(視界の縁が脈打つ)
  renderProximity(dt); // 近接警告(ぶつかりそうなものが近いと、ふちが黄→赤に光る)
  renderDataPanel();   // 三人称のデータパネル
  renderBossPanel();   // 戦艦の弱点パネル(開閉が毎コマ変わるので毎コマ描く)
  renderConsoleSway(); // 視点に応じてHTMLの計器盤を出し入れする
  if (isCockpitView()) renderConsole3D(dt);   // 計器を3Dの計器台に描く
}

// ===================================================================
// ループの外枠。
//
// ここが「絶対に止まらない」ことがいちばん大事。
// 以前は tickBody の中身と予約が一体で、最後の行で次のコマを予約していた。
// つまり途中で1回でもエラーが出ると予約に届かず、ループが永久に停止した。
// 画面はそのまま残るので、見た目は「メニューは出ているのに何も反応しない」。
// 原因の表示も出ないので、何が起きたのか分からない ― これを潰す。
// ===================================================================
function tick(now) {
  try {
    tickBody(now);
  } catch (e) {
    reportRuntimeError('ループ', e);
  }
  requestAnimationFrame(tick);   // 何があっても次のコマを予約する
}

// 実行中のエラーを画面の上端に出す。同じ内容は1回だけ。
// 遊べなくならないよう、細い帯にして操作の邪魔はしない(pointer-events: none)。
const reportedErrors = new Set();
function reportRuntimeError(where, e) {
  const msg = where + ': ' + (e && e.message ? e.message : String(e));
  console.error(msg, e);
  if (reportedErrors.has(msg)) return;   // 毎コマ出ると読めないので1回だけ
  reportedErrors.add(msg);
  const el = document.getElementById('runtime-error');
  if (!el) return;
  el.textContent = 'ERROR ' + msg;
  el.style.display = 'block';
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

  // --- 主兵装(Fキー / Pキー)---
  const w = currentWeapon();
  const firing = keysHeld.has('f') || keysHeld.has('p');
  if (w.auto && firing && fireCooldown <= 0) fire();

  // --- BOMBS(Bキー)。パイロ弾だけが連射に対応している ---
  const b = currentBomb();
  if (b.auto && keysHeld.has('b') && bombCooldown <= 0) fireBomb();
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

  // Q/E のロールはここでは扱わない。
  // 「押している間ずっと回る」のをやめて「1回押すと90度回って止まる」に変えたので、
  // 押されっぱなしかどうかではなく、押した瞬間だけが意味を持つ ―
  // だから keydown の側(requestRollStep)で受けている。
  turnView(dt, pitchDir, yawDir);
}

// 1コマぶんの状態更新。dt = 経過秒数
function update(dt) {
  // 演出用の光を時間とともに消していく(0未満にはしない)
  burstFlash  = Math.max(burstFlash  - dt, 0);
  damageFlash = Math.max(damageFlash - dt, 0);
  hitVignette = Math.max(hitVignette - dt, 0);

  // 範囲攻撃の間隔と、EMPを浴びている残り時間を数える
  bombCooldown = Math.max(bombCooldown - dt, 0);
  if (empLeft > 0) {
    empLeft = Math.max(empLeft - dt, 0);
    if (empLeft === 0) playReboot();   // 系統が戻った合図
  }

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
//
// 起動処理は「1つ失敗しても残りは続ける」形にしてある。
// 以前は素で並べていたので、どれか1つが例外を出すと
// そこから下(ループの開始まで)が丸ごと実行されず、
// メニューは出ているのに何をしても反応しない状態になっていた。
// しかも画面には何も出ないので、原因が分からなかった。
const bootErrors = [];
function bootStep(name, fn) {
  try {
    fn();
  } catch (e) {
    console.error('起動処理でエラー: ' + name, e);
    bootErrors.push(name + ': ' + (e && e.message ? e.message : e));
  }
}

bootStep('build', () => { document.getElementById('build').textContent = BUILD; });
// KILLS x/y の y。HTMLに数字を直書きすると、出現条件を変えたときに必ず食い違う
bootStep('killgoal', () => { killGoalEl.textContent = BOSS.SPAWN_KILLS; });
console.log('STEEL CRADLE build: ' + BUILD);

bootStep('audio', initAudio);       // 音の準備(audio.js)。最初のキー入力で鳴り始める
bootStep('voice', initVoice);       // コックピット音声の準備(voice.js)
bootStep('scene', initScene);       // 3D空間の準備(scene.js)。失敗しても計器は動く
bootStep('radar', setupRadar);      // 敵の数だけ輝点とマーカーを用意する(initScene のあと)

// 起動時の視点をオプションから決める
bootStep('view',   () => applyViewMode(OPTIONS.startView === 'cockpit'));
bootStep('render', render);         // 電力ゲージの初期表示
bootStep('weapon', renderWeapon);   // 兵装パネルの初期表示

// ループ開始。ここだけは何があっても必ず走らせる。
// (これが走らないと、キーもマウスも効かない置物になる)
requestAnimationFrame((t) => {   // 1回目は dt=0 になるよう時刻を合わせる
  lastTime = t;
  tick(t);
});

if (bootErrors.length > 0 && typeof showSceneError === 'function') {
  showSceneError('起動処理で問題が起きました<br><span style="opacity:.7">' +
                 bootErrors.join('<br>') + '</span>');
}
console.log('POWER DISTRIBUTION ONLINE');
