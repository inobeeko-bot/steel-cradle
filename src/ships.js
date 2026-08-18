// ===================================================================
// STEEL CRADLE / 機体スペック
//
// 「どの機体に乗っているか」で、使える兵装と操縦の癖が変わる。
// 三部作で機体は増えていくので、一度きりのフラグではなく表にしてある。
//
// 【この表の元になっているもの】
// 旧式艇の制限は、私が考えた数字ではない。
// ストーリー シーン3「旧式艇四機」の台詞に、そのまま書かれている:
//
//   「整備記録は毎月つけてる。……実弾を積んだことは、一度もない」
//        → 機関砲・ミサイル・ボム類は積んでいない。動力で撃つビームだけが残る
//
//   「右の推力偏向が渋い。前から言ってる」(ベンが最後にもう一度念を押す)
//        → 右へのヨーとロールだけ、効きが弱く・戻りが遅い
//
// 台詞に根拠が無い制限は入れない。物語と機体が食い違うと、どちらも嘘になる。
// ===================================================================

const SHIPS = {

  // --- 制式機 ------------------------------------------------------
  // メニューの TRAINING で使う現行の機体。何も制限しない。
  // 値が 1.0 / null ばかりなのは「基準」だから。ここを読めば
  // 下の旧式艇が何をどれだけ削っているかが分かる。
  standard: {
    name:    '制式機',
    nameEn:  'Standard',
    weapons: null,          // null = WEAPONS を全部使える
    bombs:   null,          // null = BOMBS を全部使える
    weaponOverride: {},     // 兵装の性能を書き換えない

    bodyColor: null,        // null = 既定の色(青灰色)のまま
    wingColor: null,

    yawRightScale:  1.0,    // 右へ向く効き(1.0 = 素の性能)
    yawRightSmooth: 1.0,    // 右へ向くときの反応の鈍さ(大きいほど鈍い)
    rollRightScale: 1.0,    // 右へロールする速さ
    rollRightAccel: 1.0,    // 右ロールの回り出しの重さ
  },

  // --- 旧式艇 四番機 -----------------------------------------------
  // カイトの当番機。物語の最初の出撃で乗る。
  boat4: {
    name:    '旧式艇 四番機',
    nameEn:  'Old Boat No.4',

    // ★「実弾を積んだことは、一度もない」
    //   機関砲もミサイルもボムも、そもそも搭載されていない。
    //   ビーム砲だけが残るのは、あれが弾ではなく動力で撃つものだから。
    weapons: ['BEAM'],
    bombs:   [],

    // ★ ただしそのビームも、村の練習艇に積まれた古い型。
    //   6条バーストは制式機の性能なので、2条まで落とす。
    //   熱は倍、次の引き金までも倍近く待たされる。
    //   「撃てる」が「戦える」ではない、という手触りにする。
    weaponOverride: {
      BEAM: {
        burst:    2,      // 6条 → 2条
        heat:     6,      // 1条あたり 3 → 6(1回の引き金で 18 → 12。手数は減る)
        interval: 0.85,   // 0.45秒 → 0.85秒
      },
    },

    // ★ 塗り直されないまま二十年。制式機の青灰色ではなく、褪せた鼠色。
    //   背景(格納庫に置かれた四番機)と同じ色味に揃えてある。
    bodyColor: 0x6b6f70,
    wingColor: 0x44484a,

    // ★「右の推力偏向が渋い」
    //   弱いだけでなく、遅れて効く。だから左へ回るほうが速い、という癖が出る。
    //   左右の非対称は操縦の邪魔になるが、それがこの機体の人格でもある。
    yawRightScale:  0.55,
    yawRightSmooth: 2.2,
    rollRightScale: 0.55,
    rollRightAccel: 2.4,
  },
};

// いま乗っている機体。既定は制式機。
let activeShipKey = 'standard';

// 機体を乗り換える。出撃の直前に呼ぶ。
function setShip(key) {
  if (!SHIPS[key]) {
    console.warn('知らない機体: ' + key + ' ― 制式機のまま出ます');
    activeShipKey = 'standard';
    return;
  }
  activeShipKey = key;
}

// いまの機体の仕様。知らないキーが入っていても落ちないようにしておく。
function ship() { return SHIPS[activeShipKey] || SHIPS.standard; }

// この兵装を積んでいるか
function shipHasWeapon(key) {
  const list = ship().weapons;
  return !list || list.indexOf(key) >= 0;
}

function shipHasBomb(key) {
  const list = ship().bombs;
  return !list || list.indexOf(key) >= 0;
}

// 兵装に機体ごとの性能差を被せて返す。
// 元の WEAPONS / BOMBS は書き換えない ― 書き換えると次の出撃に持ち越される。
function shipTuned(entry) {
  if (!entry) return entry;
  const ov = ship().weaponOverride[entry.key];
  if (!ov) return entry;
  return Object.assign({}, entry, ov);
}

// 右へ向くときだけ効きを落とす(推力偏向が渋い)
function shipYaw(yawDir) {
  // yawDir < 0 が右(D キー)。左は素のまま
  return yawDir < 0 ? yawDir * ship().yawRightScale : yawDir;
}

// 右へ向くときだけ反応を鈍らせる
function shipYawSmooth(base, yawDir) {
  return yawDir < 0 ? base * ship().yawRightSmooth : base;
}

// 右ロールだけ遅くする(rollLeft < 0 が右)
function shipRollCap(base, rollLeft) {
  return rollLeft < 0 ? base * ship().rollRightScale : base;
}

function shipRollAccel(base, rollLeft) {
  return rollLeft < 0 ? base * ship().rollRightAccel : base;
}
