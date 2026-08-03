// ===================================================================
// STEEL CRADLE / フェーズ1:3D宇宙空間(Three.js)
//
// 仕様書11.2:ローポリ実3D。初代スターフォックス調
//             = 単色フラットシェーディング + 輪郭線。画像ファイルは使わない
// 仕様書11.2:視点は案A・コックピット視点(距離感は実3D遠近法で解決)
//
// このファイルは「3Dの見た目」だけを担当する。
// 電力・熱などのゲームの数字は main.js が持っている。役割を分けておくと迷わない。
// ===================================================================

// 3Dの基本3点セット。中身は initScene() で作る
let renderer = null;   // 描画装置(実際に絵を描く人)
let scene    = null;   // 空間(物を置く箱)
let camera   = null;   // カメラ(＝自機のコックピットからの視点)

let stars     = null;  // 遠い星(自機について来る=流れない背景)
let starsNear = null;  // 近い星(空間に固定。通り抜けるので流れる=視差)

let sceneReady = false;   // 3Dの準備ができたか

// ===================================================================
// ゲームフィール調整値
//
// 「操縦の手応え」と「画面の質感」に関わる数字を、ここ1か所に集めてある。
// 遊びながらこの数字だけを書き換えて、好みを探せるようにするためのもの。
// ===================================================================
const FEEL = {
  // --- 1. 機体の慣性 ---
  TURN_SPEED:   0.80,   // 最大の旋回速度(ラジアン/秒。約46度/秒)
  TURN_SMOOTH:  0.18,   // 旋回速度の立ち上がり・減衰にかかる時間(秒)
                        //   大きいほど重い機体。0にすると今までどおり即座に最高速
  BANK_ANGLE:   0.55,   // 旋回時に機体を傾ける最大角(ラジアン。約32度)
  BANK_SMOOTH:  0.30,   // 傾きの追従時間(秒)。大きいほどゆっくり倒れ、ゆっくり戻る
  CAM_LAG:      0.14,   // カメラが機首に追いつくまでの時間(秒)
                        //   0にすると遅延なし。大きいほど「機体が先に動く」感が強い
  AIM_DISTANCE:  300,   // 照準を置く距離。カメラが遅れても弾道の先を指すために使う

  // --- 2. 常時のアイドル揺れ(機体は静止しない)---
  // 周期の違うサイン波を2本重ねて、ゆっくり不規則に漂う値を作る。
  // 乱数をそのまま使うとカクカク震えるが、この方法なら滑らかに揺れる。
  IDLE_SWAY: {
    ANGLE:      0.011,  // 機首の揺れ幅(ラジアン。約0.63度)
                        //   0 にするとぴたりと止まる。上げすぎると酔う
    PERIOD_A:     7.4,  // 遅い波の周期(秒)。大きいほどゆったり漂う
    PERIOD_B:     3.1,  // 速い波の周期(秒)
    SPEED_GAIN:   0.7,  // 最高速のとき、揺れが何倍になるか
    DRIFT_GAIN:  0.45,  // ドリフト中に何倍ぶん上乗せするか
    HEAD_RATIO:  0.55,  // 内装が画面の中でずれる量(機首の揺れに対する割合)。
                        //   0 にすると内装は画面に貼り付いたまま動かない
  },

  // --- 3. カメラの生命感 ---
  CAM_PULL:        3.5,  // 最高速のときカメラが後ろへ引く距離
  FOV_BASE:         70,  // 標準の視野角(度)
  FOV_GAIN:          9,  // 最高速で広がる視野角(度)。大きいほど速度感が強い
  CAM_SPEED_SMOOTH: 0.55,// 引き・視野角の追従時間(秒)
  CAM_LAG_DRIFT:   0.40, // ドリフト中のカメラ追従時間(通常より緩める=滑ってる感)
  SHAKE_FIRE:      0.10, // 射撃時のごく小さな振動(被弾の 0.55 に対してごく弱く)

  // --- 4. 見た目の底上げ ---
  GLOW_FLICKER:   0.14,  // エンジン噴射光のゆらぎの大きさ
  BOLT_TRAIL:       11,  // ビームの残光の長さ
  STAR_NEAR_COUNT: 700,  // 近い星の数(視差用の2層目)
  STAR_NEAR_FIELD: 760,  // 近い星をばらまく立方体の一辺
};

// --- 視点(機首の向き)の設定 ---------------------------------------
// 仕様書9.6:W/S = ピッチ(上下) / A/D = ヨー(左右)
const VIEW = {
  PITCH_LIMIT: Math.PI * 0.45,  // 上下を向ける限界(約81度)。真上で一回転するのを防ぐ
};

let viewPitch = 0;   // 上下の向き(ラジアン)。プラス=上
let viewYaw   = 0;   // 左右の向き(ラジアン)。プラス=左

// 今の「回転の速さ」。キー入力はこの値を動かし、この値が角度を動かす。
// 入力→角度 を直結させず1段はさむことで、慣性のある動きになる。
let yawRate   = 0;   // ラジアン/秒
let pitchRate = 0;

let camQuat = null;  // カメラの向き。機体より少し遅れて追いつく。initScene で作る

// --- コックピット視点の設定 -----------------------------------------
// 仕様書11.2は「案A・コックピット視点」が本命。三人称は操縦しやすさのために併設し、
// X キーで行き来できるようにする(参考:スターフォックス64のコックピットモード)
const COCKPIT = {
  // --- 目の位置(機体の中心から見た相対位置)---
  EYE_FORWARD: 0.70,   // 機首方向へどれだけ前に目を置くか。
                       //   小さいほど後ろ=キャノピーの内側に座っている感じになる
  EYE_UP:      0.55,   // どれだけ上に置くか(キャノピーの高さ)

  // --- 内装の配置 ---
  //
  // 方針:「壁」ではなく「縁」。宇宙が7割以上そのまま見えること。
  // ガラス面は張らない(素通し)。反射光も置かない。
  //
  // 内装はすべて「平面のシルエット」で作る。箱にすると画面端で奥行きの側面が
  // 写り込み、細く作ったつもりでも太い枠になってしまうため。
  //
  // 大きさは画面に対する割合で指定する。ウィンドウの縦横比や、
  // 速度による視野角の変化があっても、画面上の比率が保たれる。
  PANEL_DIST:    2.0,   // 内装を置く距離

  DASH_TOP:     0.26,   // 計器台が覆う画面下部の割合(HTML計器を載せる高さぶん確保)
  DASH_TAPER:   0.66,   // 台形の上辺 ÷ 下辺。小さいほど台形がはっきりする

  DASH_TRIM:   0.009,   // 計器台の上辺に走る明るい縁取りの太さ(画面高さの割合)

  PILLAR_EDGE:  0.93,   // 支柱の左右位置(画面の半幅に対する割合。1.0=画面端)
  PILLAR_WIDTH: 0.050,  // 支柱の太さ(画面幅に対する割合)
  PILLAR_LEAN:  0.16,   // 支柱の傾き(上ほど内側へ)

  TOP_BAR:     0.075,   // 上枠が覆う画面上部の割合

  // 自機の機首。ガラスの向こうに、計器台の上へ突き出して見える部分。
  // 実際の機体モデルは目の真下に隠れて見えないため、
  // 「前へ伸びた機首の先端」だけを専用のシルエットとして描く。
  NOSE_RISE:    0.20,   // 計器台の上辺から上へ突き出す高さ(画面高さの割合)
                        //   中央のHTML計器パネルより高く出す必要がある
  NOSE_WIDTH:   0.13,   // 計器台の位置での機首の幅(画面幅の割合)
  NOSE_TIP:     0.30,   // 先端の幅 ÷ 根元の幅。小さいほど鋭くとがる

  // --- 光像式照準器(リフレクターサイト)---
  // 参考:WW2戦闘機。計器台の中央に立つ小さな箱と、斜めに立つ半透明のガラス板。
  // ガラス板に映るレティクルが弾道の向きを示す(レティクルは次の段階)。
  SIGHT_DIST:      1.25,   // 目からの距離。近いほど大きく見える
  SIGHT_GLASS_CY:  0.50,   // ガラス板の中心の高さ(画面上からの割合)。
                           //   0.50 = 画面中央 = 弾道の向きと一致する位置
  SIGHT_GLASS_W:  0.105,   // ガラス板の幅(画面幅の割合)
  SIGHT_GLASS_H:  0.135,   // ガラス板の高さ(画面高さの割合)
  SIGHT_GLASS_OPACITY: 0.08,  // ガラスの濃さ。上げると視界が曇る
  SIGHT_TILT:      0.30,   // ガラス板の傾き(上を手前へ倒す)
  SIGHT_BASE_W:   0.050,   // 土台の幅(画面幅の割合)
  SIGHT_BASE_TOP: 0.575,   // 土台の上端の高さ(画面上からの割合)

  RETICLE_SIZE:    0.62,   // レティクルの大きさ(ガラス板の高さに対する割合)
  RETICLE_COLOR: 0x9fe1cb, // 通常時の色
  RETICLE_LOCK:  0xff4b2b, // 敵を捉えているときの色
  RETICLE_OPACITY: 0.85,   // 通常時の明るさ
  RETICLE_OPACITY_LOCK: 1.0, // 捉えているときの明るさ

  COLOR: 0x05080b,      // 内装の色。星より暗い、ほぼ黒のシルエット
  EDGE:  0x3c6a60,      // 輪郭線(これだけが形を伝える)
  EDGE_OPACITY: 0.55,   // 輪郭線の濃さ
  GLINT: 0x9fe1cb,      // 計器の輝点
};

// 今コックピット視点か。true なら自機モデルを消して機首の中から見る
let cockpitView = false;
let cockpitInterior = null;   // コックピットの内装(自機に付いている3Dオブジェクト)
let sceneTime = 0;   // 起動からの累計秒。ふらつきの計算に使う
let camSpeedEase = 0;// カメラの引き・視野角に使う「なめらかにした速度の割合」(0〜1)

// --- 自機の設定 -----------------------------------------------------
const PLAYER = {
  BODY_COLOR: 0x4d6b78,   // 胴体(青灰色)。敵の赤と正反対の色にして見分けやすくする
  WING_COLOR: 0x2c414c,   // 翼(胴体より暗く)
  CANOPY_COLOR: 0x8fd8ff, // キャノピー(明るい水色)
  EDGE_COLOR: 0x9fe1cb,   // 輪郭線(計器と同じ蛍光グリーン)
  SCALE:      0.85,

  // --- 飛行性能 ---
  // 仕様:機首方向へ常に自動前進。速度はエンジンの電力配分%に比例。
  //       配分0%でも止まらず微速で進む。
  MIN_SPEED:     6,   // エンジン配分0%のときの速度(単位/秒)
  MAX_SPEED:    50,   // エンジン配分100%のときの速度
  ACCEL:       2.5,   // 速度が機首方向へ寄っていく速さ。小さいほど機体が重く感じる

  // --- 三人称カメラ ---
  // 高さ÷後退距離 が大きいほど、機体は画面の下のほうに映る。
  // 下部の電力パネルに機体が隠れないよう、高さは控えめ・距離は長めにしている。
  CAM_HEIGHT:  0.7,   // 機体からどれだけ上にカメラを置くか(三人称)
  CAM_BACK:   10.5,   // 機体からどれだけ後ろにカメラを置くか(三人称)
};
// ※ 旋回時の機体の傾き(バンク)は FEEL.BANK_ANGLE に移した

// --- 自機の状態 -----------------------------------------------------
let playerShip  = null;   // 位置と向きを持つ入れ物(カメラはこれを基準に置く)
let playerModel = null;   // 見た目だけを傾けるための子。物理には影響しない
let engineGlows = [];     // エンジンの噴射光。速度に応じて伸ばす

let shipVelocity = null;  // 速度ベクトル。initScene で作る
let visualRoll   = 0;     // 今の見た目の傾き

// ドリフト中かどうか。main.js が Shift の状態を見て setDrift() で教えてくる。
// true の間は推力を止め、速度ベクトルを慣性のまま維持する。
// = 進行方向はそのままで機首だけ自由に回せる(振り向き撃ち)
let drifting = false;

// --- 流れる宇宙塵(速度感を出すための線)-----------------------------
// 遠くの星だけでは動いている実感が出ないため、自機の周りに近距離の塵をばらまき、
// 速度の逆向きに尾を引かせて「流れる線」に見せる。
const DUST = {
  COUNT:   420,    // 塵の数
  FIELD:   120,    // 自機を中心とした立方体の一辺の長さ。外へ出たら反対側へ回り込ませる
  STREAK: 0.055,   // 尾の長さ(秒)。速いほど線が長く伸びる
};

let dust = null;   // LineSegments(線の集まり)

// --- 射撃(ビーム)の設定 -------------------------------------------
const BOLT = {
  SPEED:    90,       // 弾の速さ(単位/秒)。速すぎると目で追えない
  // 消えるまでの秒数。速さ×寿命=射程(90×2.2≒198)。
  // ドリフト反転には約4秒かかり、その間に90以上離れてしまうため、
  // 射程が短いと「振り向き撃ち」が成立しない。ここを詰めて射程を確保している。
  LIFE:    2.2,
  COLOR:   0x9fe1cb,  // 自機の兵装色(計器と同じ蛍光グリーン)
  OFFSET_X: 1.3,      // 発射口の左右の位置(自機の翼の位置)
  OFFSET_Y: -0.8,     // 発射口の高さ(少し下)
  OFFSET_Z: -2.5,     // 発射口の前後(少し前)
};

let bolts = [];            // 飛んでいる弾のリスト
let boltGeometry = null;   // 弾の形(使い回すので1つだけ作る)
let boltMaterial = null;   // 弾の材質(同上)
let boltTrailGeometry = null;   // 残光の形
let boltTrailMaterial = null;   // 残光の材質

// 1回の発射は左右2条のビームだが、ダメージは「1発ぶん」として数えたい。
// そこで発射ごとに通し番号(斉射番号)を振り、同じ番号の2本目は
// 見た目だけ当てて HP は減らさない、という扱いにする。
let volleyCounter    = 0;   // 発射するたびに増える通し番号
let lastDamagedVolley = -1;  // 最後にダメージを与えた斉射番号

// --- 敵機の見た目の設定 ---------------------------------------------
const ENEMY = {
  BODY_COLOR: 0xa8452f,   // 胴体の単色(くすんだ赤)
  WING_COLOR: 0x6d2a20,   // 翼の単色(胴体より暗く。2色にすると形が読み取りやすい)
  CANOPY_COLOR: 0x3a1a16, // コックピットの単色
  EDGE_COLOR: 0xff9d84,   // 輪郭線の色(黒背景で線が見えるよう本体より明るく)
  DISTANCE:       -24,    // 自機からの距離(マイナス=画面の奥)
  SCALE:          1.4,    // 機体全体の大きさ

  MAX_HP:           5,    // 何発で撃墜されるか
  HIT_RADIUS:     2.8,    // 当たり判定の半径。機体を包む球の大きさ
  FLASH_SEC:     0.18,    // 被弾したとき白く光る時間
  RESPAWN_SEC:    3.0,    // 撃墜されてから次の機体が現れるまでの秒数
};

// --- 敵AIの設定(3状態:接近 / 攻撃 / 回避)-------------------------
const AI = {
  APPROACH_SPEED: 15,    // 接近しているときの移動速度
  ATTACK_SPEED:   11,    // 攻撃中の移動速度(横へ回り込む)
  EVADE_SPEED:    24,    // 逃げるときの移動速度(いちばん速い)

  ATTACK_RANGE:   60,    // この距離まで詰めたら「攻撃」へ
  BREAK_RANGE:    95,    // これより離されたら「接近」へ戻る
  TOO_CLOSE:      22,    // これより近いと下がる(自機をすり抜けないため)

  TURN_RATE:     2.2,    // 機首を自機へ向ける速さ
  FIRE_INTERVAL: 2.4,    // 攻撃中に何秒おきに撃つか
  TELEGRAPH:     0.5,    // 発射の何秒前から光り始めるか(避ける余地)
  EVADE_SEC:     3.0,    // 被弾後に逃げ回る秒数
};

// --- センサー精度の設定(仕様書9.3の7つ目「センサー精度:電力配分依存」)---
const SENSOR = {
  MIN_RANGE:   45,    // センサー配分0%のときの索敵半径
  MAX_RANGE:  260,    // センサー配分100%のときの索敵半径
  HEAT_BONUS: 1.5,    // 熱を出している敵は索敵半径の何倍まで映るか
  HEAT_LINGER: 1.5,   // 発射・被弾のあと何秒間「熱い」とみなすか
};

// --- 照準(エイム)の設定 -------------------------------------------
// 当たり判定(HIT_RADIUS)とは別に「捕捉半径」を持たせる。
// 捕捉のほうを大きくしておくと、アイドル揺れで捕捉が細かく点滅しない。
// またロックオンの調整を、命中のしやすさと切り離して行える。
const AIM = {
  CAPTURE_MULT:   2.2,   // 捕捉半径 = 敵の当たり半径 × これ
  CAPTURE_SPREAD: 0.05,  // 距離に応じて広がる分(遠い敵も捉えられるように)
  CAPTURE_RANGE:  240,   // この距離より遠い敵は捕捉しない
};

// 照準の状態。今は2段階だが、将来ロックオンで3段階目を使う。
//   'CLEAR'    … 何も捉えていない
//   'TRACKING' … 照準の先に敵がいる(捕捉中)
//   'LOCKED'   … 捕捉を維持しきってロックした(※中身は将来実装)
let aimState = 'CLEAR';
let aimTarget = null;      // 今捉えている敵
let aimHoldTime = 0;       // 捕捉を続けている秒数(ロックオンの判定に使う予定)

// --- 敵の弾の設定 ---------------------------------------------------
const ENEMY_BOLT = {
  SPEED:      60,        // 自機の弾(90)の2/3。見てから避けられるが、ぬるくない速さ
  LIFE:      3.0,        // 射程 = 60 × 3.0 = 180(速くしたぶん寿命を縮めて射程は据え置き)
  COLOR: 0xff6a4d,       // 敵の兵装色(赤)。自機の緑と混ざらないようにする
  OFFSET_X:  1.2,        // 発射口の左右位置
  OFFSET_Z: -2.0,        // 発射口の前後位置(機首側)
  HIT_RADIUS: 2.2,       // 自機の当たり判定の半径
};

// --- 敵機の管理 -----------------------------------------------------
// 常に2機を保つ(仕様:撃墜されるたびリスポーンして1〜2機いる状態を維持)。
// 機体を作り直すと重いので、2機ぶんを最初に作って「生きている/死んでいる」を
// 切り替えて使い回す。
const ENEMY_COUNT = 2;

// 1機ぶんの情報をまとめたオブジェクトの配列。
// 敵が1機だけのときは変数を並べれば足りたが、複数になると
// 「1機ぶんの情報のかたまり」を作って配列で持つほうがはるかに見通しがよい。
let enemies = [];

let enemyBolts = [];             // 敵が撃った弾のリスト
let enemyBoltGeometry = null;
let enemyBoltMaterial = null;

// 敵も左右2条で撃つので、自機の武器と同じく「1回の発射=1発ぶん」として数える。
// 2本目は火花だけ出してダメージにはしない。
let enemyVolleyCounter = 0;
let lastPlayerHitVolley = -1;

// 被弾時のカメラの揺れ。main.js が毎コマ setCameraShake() で渡してくる
let camShakeX = 0;
let camShakeY = 0;

// ミッション失敗中は戦闘を止める(敵AIと敵弾の判定を休ませる)
let combatFrozen = false;

// --- 破片(デブリ)の設定 -------------------------------------------
const DEBRIS = {
  HIT_COUNT:    7,    // 命中時に飛ぶ破片の数
  HIT_SIZE:  0.18,    // 命中時の破片の大きさ
  HIT_SPEED:    9,    // 命中時の飛び散る速さ
  KILL_COUNT:  26,    // 撃墜時の破片の数
  KILL_SIZE:  0.5,    // 撃墜時の破片の大きさ
  KILL_SPEED:  15,    // 撃墜時の飛び散る速さ
  DRAG:       0.7,    // 空気抵抗のような減速(宇宙だが、見た目の収まりのため入れる)
};

let debris = [];            // 飛んでいる破片のリスト
let debrisGeometry = null;  // 破片の形(使い回す)

// ===================================================================
// 3D空間の初期化。起動時に1回だけ呼ぶ
// 戻り値:成功したら true
// ===================================================================
function initScene() {
  // Three.js が読み込めていない(オフライン等)場合は、3Dなしで計器だけ動かす
  if (typeof THREE === 'undefined') {
    document.getElementById('scene-error').style.display = 'flex';
    console.error('Three.js を読み込めませんでした。3Dなしで続行します。');
    return false;
  }

  const container = document.getElementById('scene');

  // --- 描画装置 ---
  // antialias = 輪郭のギザギザを滑らかにする設定
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // 高精細画面対策
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x02040a, 1);   // 宇宙の背景色(ほぼ黒)
  container.appendChild(renderer.domElement);

  // --- 空間 ---
  scene = new THREE.Scene();

  // --- カメラ(コックピットの目)---
  // PerspectiveCamera(視野角, 画面の縦横比, 映る最短距離, 映る最長距離)
  // 視野角70度は「窓から覗いている」感じに近い値
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 0);   // 自機＝原点。カメラは初期状態で -Z方向(奥)を向いている
  // 回転の適用順。'YXZ' = 先に左右(Y)、次に上下(X)。
  // この順にしないと、上を向いた状態で左右に振ったときに首がねじれてしまう。
  camera.rotation.order = 'YXZ';

  // --- 光 ---
  // フラットシェーディング(面ごとに単色)を活かすため、光は2つだけの単純構成にする。
  // 平行光=太陽、環境光=宇宙の反射光。これで「面ごとに明るさが変わる」見た目になる。
  scene.add(new THREE.AmbientLight(0x3a4657, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(-1, 1.3, 0.8);   // 左上手前から当てる
  scene.add(sun);

  // --- 星空(2層)---
  // 遠い層は自機について来るので流れない(=無限遠の背景)。
  // 近い層は空間に置いたまま自機が通り抜けるので、少しずつ流れる = 視差が生まれる。
  stars = createStarfield();
  scene.add(stars);

  starsNear = createNearStars();
  scene.add(starsNear);

  // --- 流れる宇宙塵 ---
  dust = createDustField();
  scene.add(dust);

  // --- 自機 ---
  // playerShip = 位置と向きだけを持つ入れ物。カメラも弾もこれを基準にする。
  // その子として playerModel(見た目)をぶら下げ、傾きは子だけに掛ける。
  playerShip  = new THREE.Group();
  playerModel = createPlayerFighter();
  playerShip.add(playerModel);

  // コックピットの内装。自機に付けるので、機体と一緒に動く。
  // 目の位置に置いておき、そこを原点として各パーツを配置する。
  cockpitInterior = createCockpitInterior();
  cockpitInterior.position.set(0, COCKPIT.EYE_UP, -COCKPIT.EYE_FORWARD);
  cockpitInterior.visible = false;   // 三人称では見せない
  playerShip.add(cockpitInterior);

  playerShip.position.set(0, 0, 0);
  scene.add(playerShip);

  shipVelocity = new THREE.Vector3(0, 0, 0);
  camQuat      = new THREE.Quaternion();   // カメラの向き(機体より少し遅れる)

  // --- 敵機(2機)---
  for (let i = 0; i < ENEMY_COUNT; i++) {
    const e = createEnemy();
    // 最初は自機の前方に少しずらして配置する
    e.group.position.set((i - 0.5) * 26, 0, ENEMY.DISTANCE - i * 14);
    enemies.push(e);
  }

  // 画面サイズが変わったときの対応
  window.addEventListener('resize', onResize);

  sceneReady = true;
  console.log('SCENE ONLINE ― Three.js r' + THREE.REVISION);
  return true;
}

// ===================================================================
// 星空を作る
// 何千個もの点を1つのまとまり(Points)として扱う。
// 星1個ずつを別の物体にすると重くなるため、座標の配列をまとめて渡す方式。
// ===================================================================
function createStarfield() {
  const COUNT  = 1600;   // 星の数
  const RADIUS = 900;    // 自機からこのくらい遠くに配置する

  // Float32Array = 小数を大量に詰める専用の配列。x,y,z の3つで1つの星なので長さは3倍
  const positions = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    // 球状にランダムに散らす。まっすぐ乱数を使うと極に偏るので acos で補正する
    const r     = RADIUS + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;          // 横方向の角度
    const phi   = Math.acos(Math.random() * 2 - 1);     // 縦方向の角度

    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);   // x
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);   // y
    positions[i * 3 + 2] = r * Math.cos(phi);                     // z
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // sizeAttenuation: false = 遠くても点の大きさが変わらない。
  // これが初代スターフォックス期の「くっきりしたドットの星」の見た目になる。
  const material = new THREE.PointsMaterial({
    color: 0xdfe9f5,
    size: 2,
    sizeAttenuation: false,
  });

  return new THREE.Points(geometry, material);
}

// ===================================================================
// 近い星の層を作る(視差用)
//
// 遠い星は自機について来るので画面上を動かないが、この層は空間に置いたまま。
// 自機が通り抜けることで、遠い星に対してゆっくり流れて見える。
// 箱から出たら反対側へ回り込ませるので、どこまで飛んでも尽きない。
// ===================================================================
function createNearStars() {
  const positions = new Float32Array(FEEL.STAR_NEAR_COUNT * 3);
  for (let i = 0; i < FEEL.STAR_NEAR_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * FEEL.STAR_NEAR_FIELD;
    positions[i * 3 + 1] = (Math.random() - 0.5) * FEEL.STAR_NEAR_FIELD;
    positions[i * 3 + 2] = (Math.random() - 0.5) * FEEL.STAR_NEAR_FIELD;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // 遠い星より少し大きく明るくして、手前にあることを分かりやすくする
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.75,
  });
  return new THREE.Points(geometry, material);
}

// 点の集まりを自機の周りの箱に収め続ける(はみ出したら反対側へ回り込ませる)
function wrapPointsAroundShip(geometry, fieldSize) {
  const arr = geometry.attributes.position.array;
  const half = fieldSize / 2;
  const center = [playerShip.position.x, playerShip.position.y, playerShip.position.z];

  for (let i = 0; i < arr.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const diff = arr[i + a] - center[a];
      if (diff > half)       arr[i + a] -= fieldSize;
      else if (diff < -half) arr[i + a] += fieldSize;
    }
  }
  geometry.attributes.position.needsUpdate = true;
}

// ===================================================================
// 流れる宇宙塵を作る
//
// LineSegments = 2点で1本の線。頂点を2個ずつ組にして扱う。
// 「頭」を自機の周りにばらまき、「尾」を速度の逆向きへ伸ばすと流れ星のように見える。
// ===================================================================
function createDustField() {
  // 1粒につき頂点2個 × 座標3つ = 6
  const positions = new Float32Array(DUST.COUNT * 6);

  for (let i = 0; i < DUST.COUNT; i++) {
    // 自機(最初は原点)を中心とした立方体の中にランダム配置
    const x = (Math.random() - 0.5) * DUST.FIELD;
    const y = (Math.random() - 0.5) * DUST.FIELD;
    const z = (Math.random() - 0.5) * DUST.FIELD;

    positions[i * 6 + 0] = x;  positions[i * 6 + 1] = y;  positions[i * 6 + 2] = z;  // 頭
    positions[i * 6 + 3] = x;  positions[i * 6 + 4] = y;  positions[i * 6 + 5] = z;  // 尾(最初は同じ)
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0x93aec6,
    transparent: true,
    opacity: 0.55,      // 濃すぎると画面がうるさくなる
  });

  return new THREE.LineSegments(geometry, material);
}

// ===================================================================
// 部品を1つ作るための共通関数
//
// 仕様書11.2の「単色フラットシェーディング+輪郭線」をここで実現する。
//  ・flatShading: true … 面を1色で塗る(丸く滑らかに見せない)= ローポリらしさの正体
//  ・EdgesGeometry  … 面と面の境目だけを線として抜き出す = 輪郭線
// ===================================================================
function createFlatPart(geometry, color, edgeColor) {
  // MeshLambertMaterial = 光の当たり方で明るさが変わる、いちばん素朴な材質
  const material = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);

  // 輪郭線を子として貼り付ける。親を動かせば線も一緒に動く
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edgeColor })
  );
  mesh.add(edges);

  return mesh;
}

// ===================================================================
// 敵機を組み立てる
//
// 画像は使わず、単純な立体(円錐・箱・八面体)を組み合わせて機体の形を作る。
// 面の数が少ないほど「ローポリ」らしくなるので、円錐はあえて4面にしている。
// Group = 複数の部品をひとまとめにして、1つの物として動かすための入れ物。
// ===================================================================
function createEnemyFighter() {
  const ship = new THREE.Group();

  // ※ 機首は自機と同じ「-Z が前」に揃えてある。
  //    こうしておくと Three.js の lookAt(相手の位置) がそのまま
  //    「相手の方へ機首を向ける」になり、AIの向き制御が素直に書ける。

  // --- 胴体 ---
  // ConeGeometry(底面の半径, 高さ, 何角形にするか)。4 = 四角錐 = かなり角ばる
  const bodyGeo = new THREE.ConeGeometry(0.75, 3.0, 4);
  // 円錐は初期状態で上(+Y)を向いているので、90度倒して前(-Z)へ向ける
  bodyGeo.rotateX(-Math.PI / 2);
  ship.add(createFlatPart(bodyGeo, ENEMY.BODY_COLOR, ENEMY.EDGE_COLOR));

  // --- 主翼(左右)---
  // BoxGeometry(幅, 高さ, 奥行き)
  // 細長すぎると1本の棒に見えてしまうので、奥行き(前後の厚み)をしっかり取る
  for (const side of [-1, 1]) {          // -1=左 / +1=右 をまとめて作る
    const wingGeo = new THREE.BoxGeometry(1.8, 0.16, 1.7);
    const wing = createFlatPart(wingGeo, ENEMY.WING_COLOR, ENEMY.EDGE_COLOR);
    wing.position.set(side * 1.3, -0.1, 0.5);
    wing.rotation.z = side * 0.20;       // 少し上に反らせて「への字」の翼にする
    wing.rotation.y = side * 0.16;       // 後退角(翼を後ろへ倒す)
    ship.add(wing);
  }

  // --- 垂直尾翼 ---
  const finGeo = new THREE.BoxGeometry(0.14, 1.1, 1.0);
  const fin = createFlatPart(finGeo, ENEMY.WING_COLOR, ENEMY.EDGE_COLOR);
  fin.position.set(0, 0.6, 1.1);
  ship.add(fin);

  // --- エンジンノズル(左右)---
  // 5角柱。少ない面数のまま「機械的な塊」を足して、機体の後ろを重く見せる
  for (const side of [-1, 1]) {
    const nozzleGeo = new THREE.CylinderGeometry(0.3, 0.36, 1.0, 5);
    nozzleGeo.rotateX(Math.PI / 2);      // 円柱を寝かせて前後方向にする
    const nozzle = createFlatPart(nozzleGeo, ENEMY.WING_COLOR, ENEMY.EDGE_COLOR);
    nozzle.position.set(side * 0.62, -0.05, 1.3);
    ship.add(nozzle);
  }

  // --- コックピット(八面体。角ばったキャノピー)---
  const canopyGeo = new THREE.OctahedronGeometry(0.42);
  const canopy = createFlatPart(canopyGeo, ENEMY.CANOPY_COLOR, ENEMY.EDGE_COLOR);
  canopy.position.set(0, 0.36, -0.15);
  canopy.scale.set(1, 0.7, 1.6);        // 前後に伸ばして流線形っぽく
  ship.add(canopy);

  ship.scale.setScalar(ENEMY.SCALE);    // 全体の大きさをまとめて調整
  return ship;
}

// ===================================================================
// 自機を組み立てる
//
// 三人称視点では機体を「後ろから」見ることになるので、
// 後部(エンジンノズル・噴射光)を強めに作ると形が読み取りやすい。
// 敵機と違い、機首は -Z(画面の奥)を向ける。
// ===================================================================
function createPlayerFighter() {
  const ship = new THREE.Group();

  // --- 胴体 ---
  const bodyGeo = new THREE.ConeGeometry(0.55, 2.8, 5);
  bodyGeo.rotateX(-Math.PI / 2);   // +Y を向いている円錐を -Z(前方)へ倒す
  ship.add(createFlatPart(bodyGeo, PLAYER.BODY_COLOR, PLAYER.EDGE_COLOR));

  // --- 主翼(左右)---
  for (const side of [-1, 1]) {
    const wingGeo = new THREE.BoxGeometry(1.7, 0.14, 1.5);
    const wing = createFlatPart(wingGeo, PLAYER.WING_COLOR, PLAYER.EDGE_COLOR);
    wing.position.set(side * 1.2, -0.08, 0.5);
    wing.rotation.z = side * -0.18;   // 少し下に反らせる(敵機と逆にして印象を変える)
    wing.rotation.y = side * 0.16;    // 後退角
    ship.add(wing);
  }

  // --- 垂直尾翼 ---
  const finGeo = new THREE.BoxGeometry(0.12, 0.95, 0.9);
  const fin = createFlatPart(finGeo, PLAYER.WING_COLOR, PLAYER.EDGE_COLOR);
  fin.position.set(0, 0.5, 1.1);
  ship.add(fin);

  // --- エンジンノズルと噴射光(左右)---
  for (const side of [-1, 1]) {
    const nozzleGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.9, 6);
    nozzleGeo.rotateX(Math.PI / 2);
    const nozzle = createFlatPart(nozzleGeo, PLAYER.WING_COLOR, PLAYER.EDGE_COLOR);
    nozzle.position.set(side * 0.55, -0.02, 1.25);
    ship.add(nozzle);

    // 噴射光。速度に応じて後ろへ伸ばすので、あとで触れるよう配列に控えておく。
    // MeshBasicMaterial = 光の影響を受けずに自分で光る材質。炎の表現向き。
    const glowGeo = new THREE.ConeGeometry(0.22, 1.6, 6);
    glowGeo.rotateX(Math.PI / 2);      // 後ろ(+Z)へ尖らせる
    glowGeo.translate(0, 0, 0.8);      // 円錐の根元がノズル口に来るようずらす
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x8fd8ff, transparent: true, opacity: 0.6,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(side * 0.55, -0.02, 1.6);
    ship.add(glow);
    engineGlows.push(glow);
  }

  // --- キャノピー ---
  const canopyGeo = new THREE.OctahedronGeometry(0.36);
  const canopy = createFlatPart(canopyGeo, PLAYER.CANOPY_COLOR, PLAYER.EDGE_COLOR);
  canopy.position.set(0, 0.3, -0.2);
  canopy.scale.set(1, 0.65, 1.7);
  ship.add(canopy);

  ship.scale.setScalar(PLAYER.SCALE);
  return ship;
}

// ===================================================================
// コックピットの内装を組み立てる
//
// 参考:スターフォックス64のコックピットモード。
// 「囲まれている」と感じるのは、視界の下と左右が機体の内側で塞がれているから。
// そこで計器台・左右の支柱・上枠の4つで画面の縁を物理的に埋める。
//
// 材質は MeshBasicMaterial(光の影響を受けない単色)を使う。
// 機内は本来暗いので、太陽の向きで明るさが変わってしまうと不自然なため。
// ===================================================================
function createSilhouette(points) {
  // Shape = 平面の輪郭。点を順につないで閉じると、その内側が面になる。
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: COCKPIT.COLOR, side: THREE.DoubleSide })
  );

  // 輪郭線。ほぼ黒のシルエットなので、形を伝えるのはこの線だけ。
  const linePoints = points.map((pt) => new THREE.Vector3(pt[0], pt[1], 0));
  linePoints.push(linePoints[0].clone());   // 最後に始点へ戻して閉じる
  mesh.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(linePoints),
    new THREE.LineBasicMaterial({
      color: COCKPIT.EDGE, transparent: true, opacity: COCKPIT.EDGE_OPACITY,
    })
  ));

  return mesh;
}

function createCockpitInterior() {
  const g = new THREE.Group();

  // --- 計器台(台形)---
  // 「縦横1」の大きさで作っておき、毎コマ画面に合わせて拡大縮小する。
  // 下辺を広く、上辺を狭くすると台形になる。
  const t = COCKPIT.DASH_TAPER * 0.5;
  const dash = createSilhouette([
    [-0.5, -0.5], [0.5, -0.5], [t, 0.5], [-t, 0.5],
  ]);
  g.add(dash);

  // --- 計器の輝点 ---
  // 計器台の子にして、台の拡大縮小をそのまま受け継がせる。
  // 天面のすぐ内側に一列っぽく散らす。
  const glintCount = 18;
  const glintPos = new Float32Array(glintCount * 3);
  for (let i = 0; i < glintCount; i++) {
    glintPos[i * 3 + 0] = (Math.random() - 0.5) * (COCKPIT.DASH_TAPER * 0.88);
    glintPos[i * 3 + 1] = 0.5 - 0.10 - Math.random() * 0.16;
    glintPos[i * 3 + 2] = 0.01;   // 面よりほんの少し手前に出して隠れないようにする
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute('position', new THREE.BufferAttribute(glintPos, 3));
  dash.add(new THREE.Points(glintGeo, new THREE.PointsMaterial({
    color: COCKPIT.GLINT, size: 2.5, sizeAttenuation: false,
    transparent: true, opacity: 0.7,
  })));

  // --- 左右の支柱 ---
  // 縦長の細い平面。傾けて視界の縁をかすめさせる。
  const pillars = [];
  for (const side of [-1, 1]) {
    const pillar = createSilhouette([
      [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5],
    ]);
    pillar.rotation.z = side * COCKPIT.PILLAR_LEAN * -1;
    g.add(pillar);
    pillars.push(pillar);
  }

  // --- 上辺の枠 ---
  const topBar = createSilhouette([
    [-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5],
  ]);
  g.add(topBar);

  // --- 機首(ガラスの向こうに見える自機の先端)---
  // 台形。根元は計器台に隠れ、先端だけが上に出る。
  const noseTip = COCKPIT.NOSE_TIP * 0.5;
  const nose = createSilhouette([
    [-0.5, -0.5], [0.5, -0.5], [noseTip, 0.5], [-noseTip, 0.5],
  ]);
  g.add(nose);

  // --- 光像式照準器:土台 ---
  // 計器台から生えて、ガラス板を目の高さまで持ち上げる箱。
  const sightBase = createSilhouette([
    [-0.5, -0.5], [0.5, -0.5], [0.32, 0.5], [-0.32, 0.5],
  ]);
  g.add(sightBase);

  // --- 光像式照準器:ガラス板 ---
  //
  // sightPlane は「ガラス板の面そのもの」を表す入れ物。
  // 拡大縮小を縦横同じ倍率で掛けるので、この中に置いたものは形が歪まない。
  // 将来のロックオンマーカーも、この中に足せば同じ面の上を動く。
  const sightPlane = new THREE.Group();

  // ガラス。半透明。宇宙が透けて見えることが大事なので、かなり薄くする。
  // depthWrite: false で、奥のものを消してしまわないようにする。
  const sightGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x8fd8ff,
      transparent: true,
      opacity: COCKPIT.SIGHT_GLASS_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  sightGlass.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
    new THREE.LineBasicMaterial({ color: COCKPIT.EDGE, transparent: true, opacity: 0.8 })
  ));
  sightPlane.add(sightGlass);

  // --- レティクル(照準環)---
  // ガラスに光が投影されているように見せる。円+中心点+左右の目盛り。
  // depthTest: false で、常に手前に描く(ガラスに埋もれないように)。
  const reticleMat = new THREE.LineBasicMaterial({
    color: COCKPIT.RETICLE_COLOR, transparent: true,
    opacity: COCKPIT.RETICLE_OPACITY, depthTest: false,
  });
  const reticle = new THREE.Group();
  reticle.renderOrder = 10;   // 最後に描く = 何にも隠されない

  // 外側の円
  const ringPts = [];
  const RING_SEG = 40;
  for (let i = 0; i <= RING_SEG; i++) {
    const th = (i / RING_SEG) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(th) * 0.5, Math.sin(th) * 0.5, 0));
  }
  reticle.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), reticleMat));

  // 中心点(ごく小さな円)
  const dotPts = [];
  for (let i = 0; i <= 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    dotPts.push(new THREE.Vector3(Math.cos(th) * 0.055, Math.sin(th) * 0.055, 0));
  }
  reticle.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dotPts), reticleMat));

  // 左右と上の短い目盛り
  const tickPts = [
    new THREE.Vector3(-0.72, 0, 0), new THREE.Vector3(-0.52, 0, 0),
    new THREE.Vector3( 0.52, 0, 0), new THREE.Vector3( 0.72, 0, 0),
    new THREE.Vector3(0,  0.52, 0), new THREE.Vector3(0,  0.72, 0),
  ];
  reticle.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(tickPts), reticleMat));

  sightPlane.add(reticle);
  g.add(sightPlane);

  // --- 計器台の上辺を走る縁取り ---
  // WebGLの線は太さを変えられない(常に1ピクセル)ため、
  // 「太い線」が欲しいときは細長い面を1枚置くのが確実。
  const trim = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: COCKPIT.EDGE, side: THREE.DoubleSide })
  );
  g.add(trim);

  // 毎コマの配置計算で使うので、部品を覚えておく
  g.userData = {
    dash: dash, pillars: pillars, topBar: topBar, trim: trim, nose: nose,
    sightBase: sightBase, sightPlane: sightPlane, sightGlass: sightGlass,
    reticle: reticle, reticleMat: reticleMat,
  };
  return g;
}

// ===================================================================
// 内装を画面の大きさに合わせて配置し直す
//
// ウィンドウの縦横比も、速度による視野角の変化も、内装の見え方に影響させたくない。
// そこで毎コマ「今の視野で、この距離の平面が画面何個ぶんの大きさか」を計算し、
// 割合指定(画面の下18%など)から実際の大きさを逆算する。
// ===================================================================
function layoutCockpitInterior() {
  if (!cockpitInterior || !cockpitView) return;

  const d = COCKPIT.PANEL_DIST;
  // この距離での「画面の半分の高さ・半分の幅」が世界の座標で何単位ぶんか
  const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * d;
  const halfW = halfH * camera.aspect;

  const parts = cockpitInterior.userData;

  // --- 計器台:上辺を画面下から DASH_TOP の高さに置く ---
  const dashTopY = -halfH + COCKPIT.DASH_TOP * (halfH * 2);
  // 画面外まで十分に伸ばす(下や横に隙間ができないように)
  const dashH = (dashTopY + halfH) * 2.4;
  const dashW = halfW * 2 * 1.30;
  parts.dash.scale.set(dashW, dashH, 1);
  parts.dash.position.set(0, dashTopY - dashH / 2, -d);

  // --- 機首:計器台の上辺から NOSE_RISE ぶん突き出す ---
  // 計器台より少し「奥」に置くのがポイント。こうすると根元が計器台に隠れ、
  // 機体が計器台の向こうへ伸びているように見える。
  const noseRise = halfH * 2 * COCKPIT.NOSE_RISE;
  const noseH = noseRise * 2.2;                       // 根元は計器台の裏へ十分に伸ばす
  const noseW = halfW * 2 * COCKPIT.NOSE_WIDTH;
  parts.nose.scale.set(noseW, noseH, 1);
  parts.nose.position.set(0, dashTopY + noseRise - noseH / 2, -d - 0.06);

  // --- 計器台の上辺の縁取り ---
  const trimH = halfH * 2 * COCKPIT.DASH_TRIM;
  parts.trim.scale.set(dashW * (COCKPIT.DASH_TAPER + 0.02), trimH, 1);
  parts.trim.position.set(0, dashTopY - trimH / 2, -d + 0.01);

  // --- 支柱:画面端の少し内側に、画面より高く ---
  const pillarW = halfW * 2 * COCKPIT.PILLAR_WIDTH;
  const pillarH = halfH * 2 * 1.5;
  for (let i = 0; i < parts.pillars.length; i++) {
    const side = (i === 0) ? -1 : 1;
    parts.pillars[i].scale.set(pillarW, pillarH, 1);
    parts.pillars[i].position.set(side * halfW * COCKPIT.PILLAR_EDGE, 0, -d);
  }

  // --- 光像式照準器 ---
  // 照準器だけは目に近い距離に置くので、その距離での画面の大きさを別に計算する。
  const ds = COCKPIT.SIGHT_DIST;
  const halfHs = Math.tan((camera.fov * Math.PI / 180) / 2) * ds;
  const halfWs = halfHs * camera.aspect;
  // 画面の上からの割合(0=上, 1=下)を、その距離での高さに直す
  const yAt = (f) => (1 - 2 * f) * halfHs;

  const glassW = halfWs * 2 * COCKPIT.SIGHT_GLASS_W;
  const glassH = halfHs * 2 * COCKPIT.SIGHT_GLASS_H;

  // 面そのものは縦横同じ倍率で拡大する(中に置いたレティクルを歪ませないため)
  parts.sightPlane.scale.setScalar(glassH);
  parts.sightPlane.position.set(0, yAt(COCKPIT.SIGHT_GLASS_CY), -ds);
  parts.sightPlane.rotation.x = COCKPIT.SIGHT_TILT;

  // ガラスだけは横長にしたいので、面の中で横方向に引き伸ばす
  parts.sightGlass.scale.set(glassW / glassH, 1, 1);

  // レティクルの大きさ(ガラスの高さに対する割合)
  parts.reticle.scale.setScalar(COCKPIT.RETICLE_SIZE);

  const baseTopY = yAt(COCKPIT.SIGHT_BASE_TOP);
  const baseH = (baseTopY + halfHs) * 1.6;   // 計器台の裏まで十分に伸ばす
  parts.sightBase.scale.set(halfWs * 2 * COCKPIT.SIGHT_BASE_W, baseH, 1);
  parts.sightBase.position.set(0, baseTopY - baseH / 2, -ds);

  // --- 上辺の枠:画面上部を TOP_BAR ぶんだけ覆う ---
  const topH = halfH * 2 * COCKPIT.TOP_BAR;
  parts.topBar.scale.set(halfW * 2 * 1.3, topH * 2.5, 1);
  parts.topBar.position.set(0, halfH - topH + (topH * 2.5) / 2, -d);
}

// ===================================================================
// 自機の飛行(仕様:機首方向へ自動前進。速度はエンジンの電力配分に比例)
//
// enginePercent … main.js が持っている電力配分の「エンジン」の値(0〜100)
//
// 【考え方】
//  1. 機首の向き(viewPitch / viewYaw)から「前方」の向きを求める
//  2. 目標の速度ベクトル = 前方 × 目標速度
//  3. 今の速度をそこへ少しずつ寄せる(いきなり切り替えると機体が軽く感じる)
//  4. 位置を速度のぶんだけ進める
//  5. カメラを機体の後ろに置き直す
// ===================================================================
function updateFlight(dt, enginePercent) {
  if (!sceneReady) return;

  sceneTime += dt;

  // --- 1. 機首の向きを機体に反映する ---
  //
  // ここで「ふらつき」を少しだけ足す。
  // 乱数をそのまま使うとカクカク震えるので、周期の違う波を2つ重ねて
  // ゆっくり不規則に揺れる値を作る。行き過ぎたら必ず戻るので暴走しない。
  const speedNow = shipVelocity.length();
  const speedRatio = Math.max(0, Math.min(
    (speedNow - PLAYER.MIN_SPEED) / (PLAYER.MAX_SPEED - PLAYER.MIN_SPEED), 1));

  const sway = FEEL.IDLE_SWAY;
  const a = Math.PI * 2 * sceneTime / sway.PERIOD_A;   // 遅い波
  const b = Math.PI * 2 * sceneTime / sway.PERIOD_B;   // 速い波

  const swayYaw   = Math.sin(a) * 0.6 + Math.sin(b + 1.7) * 0.4;
  const swayPitch = Math.sin(a * 1.27 + 1.3) * 0.6 + Math.sin(b * 0.83 + 0.5) * 0.4;

  // 速いほど、そしてドリフト中はさらに、揺れがわずかに増す
  const swayAmp = sway.ANGLE
    * (1 + speedRatio * sway.SPEED_GAIN)
    * (drifting ? 1 + sway.DRIFT_GAIN : 1);

  // Euler(上下, 左右, ひねり, 適用順)。ひねり(ロール)は0のままにして、
  // 見た目の傾きは子(playerModel)だけに掛ける = カメラは水平のまま(酔い対策)
  playerShip.quaternion.setFromEuler(new THREE.Euler(
    viewPitch + swayPitch * swayAmp,
    viewYaw   + swayYaw   * swayAmp,
    0, 'YXZ'));

  // 操縦士の頭の揺れ。機首とは別の位相で揺らすことで、
  // 内装(計器台・照準器)が画面の中でわずかに漂う = 機内にいる感覚になる。
  const headAmp = swayAmp * sway.HEAD_RATIO;
  const headYaw   = (Math.sin(a * 0.71 + 2.4) * 0.6 + Math.sin(b * 1.13 + 0.9) * 0.4) * headAmp;
  const headPitch = (Math.sin(a * 0.94 + 0.3) * 0.6 + Math.sin(b * 1.31 + 2.2) * 0.4) * headAmp;

  // 機体の「前方」。もとの前方 (0,0,-1) を機体の向きで回して求める
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);

  // --- 2. 目標速度 ---
  const targetSpeed = speedFromEnginePower(enginePercent);

  // --- 3. 今の速度を目標へ寄せる ---
  //
  // ここがドリフトの正体。
  //   通常飛行 … 速度ベクトルを機首方向へ寄せていく = 向いた方へ曲がっていく
  //   ドリフト … 何もしない = 慣性のまま。機首をどこへ向けても進路は変わらない
  //
  // Shift を離すと再びこの処理が働き、進路が機首方向へ曲がり始める。
  if (!drifting) {
    const targetVelocity = forward.clone().multiplyScalar(targetSpeed);

    // 1 - Math.exp(-k*dt) は「毎秒 k の勢いで近づく」割合。
    // dt(コマの長さ)が変わっても同じ速さで寄るので、環境によって挙動が変わらない。
    const blend = 1 - Math.exp(-PLAYER.ACCEL * dt);
    shipVelocity.lerp(targetVelocity, blend);   // lerp = 2つの値の間を指定の割合だけ進む
  }

  // --- 4. 位置を進める ---
  playerShip.position.addScaledVector(shipVelocity, dt);

  // --- 自動バンク(旋回している方向へ機体を倒す)---
  // キー入力ではなく「今の実際の旋回速度」から傾きを決める。
  // こうすると、慣性で回り続けている間は傾いたままになり、
  // 速度が落ちるにつれて自然に水平へ戻る。
  const rollTarget = (yawRate / FEEL.TURN_SPEED) * FEEL.BANK_ANGLE;
  visualRoll += (rollTarget - visualRoll) * (1 - Math.exp(-dt / Math.max(FEEL.BANK_SMOOTH, 0.0001)));
  playerModel.rotation.z = visualRoll;

  // --- エンジンの噴射光をエンジン配分に合わせて伸ばす ---
  // ドリフト中は推力を切っているので、噴射光も消す(見ただけで状態が分かる)
  const thrustRatio = drifting
    ? 0
    : (targetSpeed - PLAYER.MIN_SPEED) / (PLAYER.MAX_SPEED - PLAYER.MIN_SPEED);
  // 炎らしく見せるための細かいゆらぎ。周期の違う波を重ねて不規則にする
  const flicker = 1 + FEEL.GLOW_FLICKER *
    (Math.sin(sceneTime * 27) * 0.6 + Math.sin(sceneTime * 41 + 2.1) * 0.4);
  for (const glow of engineGlows) {
    glow.scale.z = (0.05 + thrustRatio * 2.2) * flicker;
    glow.material.opacity = drifting ? 0 : (0.30 + thrustRatio * 0.55) * flicker;
  }

  // --- 5. カメラを機体の後ろへ(少し遅れて追いつく)---
  //
  // camQuat は「カメラの向き」。機体の向きへ slerp で寄せていくことで、
  // 機首が先に動き、カメラが少し遅れて追う = 重量感が出る。
  // 速度に応じた「なめらかな速度の割合」。視野角とカメラの引きに使う
  camSpeedEase += (speedRatio - camSpeedEase) *
    (1 - Math.exp(-dt / Math.max(FEEL.CAM_SPEED_SMOOTH, 0.0001)));

  if (cockpitView) {
    // --- コックピット視点 ---
    // 自分の機体の中に座っているので、カメラは機首と完全に一体で動く。
    // ここで遅延を入れると「自分の頭が自機に遅れて付いてくる」不自然さになる。
    camQuat.copy(playerShip.quaternion);

    const eye = new THREE.Vector3(0, COCKPIT.EYE_UP, -COCKPIT.EYE_FORWARD)
      .applyQuaternion(camQuat);
    camera.position.copy(playerShip.position).add(eye);
    camera.quaternion.copy(camQuat);

    // 頭の揺れを上乗せする。掛ける順を「あとから」にすると、
    // 機体の向きを基準にした首の振りになる。
    camera.quaternion.multiply(
      new THREE.Quaternion().setFromEuler(new THREE.Euler(headPitch, headYaw, 0, 'YXZ'))
    );

    layoutCockpitInterior();   // 内装を今の画面の大きさに合わせる

  } else {
    // --- 三人称視点 ---
    // ドリフト中は追従をさらに緩めて「滑っている」感じを出す
    const lag = drifting ? FEEL.CAM_LAG_DRIFT : FEEL.CAM_LAG;
    camQuat.slerp(playerShip.quaternion, 1 - Math.exp(-dt / Math.max(lag, 0.0001)));

    // 速度に応じてカメラを後ろへ引く。加速中にじわっと変化する = 速度感
    const back = PLAYER.CAM_BACK + camSpeedEase * FEEL.CAM_PULL;
    const camOffset = new THREE.Vector3(0, PLAYER.CAM_HEIGHT, back).applyQuaternion(camQuat);
    camera.position.copy(playerShip.position).add(camOffset);
    camera.quaternion.copy(camQuat);
  }

  // 視野角。変化があったときだけ計算し直す(毎コマ呼ぶと無駄なので)
  const wantFov = FEEL.FOV_BASE + camSpeedEase * FEEL.FOV_GAIN;
  if (Math.abs(camera.fov - wantFov) > 0.01) {
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }

  // 被弾の揺れ。カメラから見た「右」と「上」へずらす(どの向きを向いていても同じ揺れ方になる)
  if (camShakeX !== 0 || camShakeY !== 0) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up    = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    camera.position.addScaledVector(right, camShakeX).addScaledVector(up, camShakeY);
  }

  // --- 星空を自機について来させる ---
  // 星は「遠くの背景」なので、置き去りにせず常に自機を中心に置く。
  // こうすると、どこまで飛んでも星空の外に出てしまうことがない。
  stars.position.copy(playerShip.position);

  // 近い星は空間に置いたまま、箱から出たぶんだけ回り込ませる。
  // 遠い星は動かないので、この層だけが流れて視差になる。
  wrapPointsAroundShip(starsNear.geometry, FEEL.STAR_NEAR_FIELD);

  updateDust();
}

// ドリフトの入切。main.js が Shift の押し具合を見て毎コマ呼ぶ
function setDrift(on) {
  drifting = on;
}

// ===================================================================
// 視点の切り替え(三人称 ⇄ コックピット)
// isCockpit が true でコックピット視点。自機モデルは見えなくする。
// ===================================================================
function setViewMode(isCockpit) {
  cockpitView = !!isCockpit;

  // 機体の外見モデルは三人称だけ。
  // コックピットで見える「機首の先端」は、内装側の専用シルエットで描いている。
  // 実機モデルをそのまま使うと、目の位置がキャノピーの内側に入ってしまい、
  // 裏面が消えて何も見えない(あるいは機内が壁で埋まる)ため。
  if (playerModel)     playerModel.visible     = !cockpitView;
  if (cockpitInterior) cockpitInterior.visible = cockpitView;   // 内装はコックピットだけ
  return cockpitView;
}

// 今コックピット視点かどうか(main.js が切り替えの判断に使う)
function isCockpitView() {
  return cockpitView;
}

// 被弾時のカメラの揺れ幅を受け取る
function setCameraShake(x, y) {
  camShakeX = x;
  camShakeY = y;
}

// ミッション失敗中の戦闘停止
function setCombatFrozen(on) {
  combatFrozen = on;
}

// ===================================================================
// 再出撃:自機と敵を初期状態に戻す
// ===================================================================
function resetFlight() {
  if (!sceneReady) return;

  // 自機を原点・静止・正面向きへ
  playerShip.position.set(0, 0, 0);
  shipVelocity.set(0, 0, 0);
  viewPitch = 0;
  viewYaw = 0;
  yawRate = 0;
  pitchRate = 0;
  visualRoll = 0;
  camSpeedEase = 0;
  drifting = false;
  playerShip.quaternion.identity();
  camQuat.identity();

  // 飛んでいるものをすべて片付ける
  for (const b of bolts)      scene.remove(b.mesh);
  for (const b of enemyBolts) scene.remove(b.mesh);
  for (const d of debris)   { scene.remove(d.mesh); d.mesh.material.dispose(); }
  bolts.length = 0;
  enemyBolts.length = 0;
  debris.length = 0;

  // 敵を全機復活させて前方に置き直す
  for (const e of enemies) respawnEnemy(e);
}

// エンジンの電力配分(0〜100%)から速度を決める
function speedFromEnginePower(enginePercent) {
  const ratio = Math.max(0, Math.min(100, enginePercent)) / 100;
  return PLAYER.MIN_SPEED + ratio * (PLAYER.MAX_SPEED - PLAYER.MIN_SPEED);
}

// 今の速度(単位/秒)。計器表示に使う
function currentSpeed() {
  return shipVelocity ? shipVelocity.length() : 0;
}

// ===================================================================
// 照準の状態を更新する(仕様:段階を持つ1つのシステムとして作る)
//
// 【考え方】
// 機首から前方へまっすぐ伸びる線を引き、敵の中心がその線からどれだけ
// 離れているかを測る。捕捉半径より近ければ「捉えている」。
//
// 当たり判定(ENEMY.HIT_RADIUS)とは別に捕捉半径を持たせているのが要点。
// 捕捉のほうを大きくしておくと、アイドル揺れ程度では捕捉が途切れない。
//
// 状態は 'CLEAR' → 'TRACKING' → (将来) 'LOCKED' と段階を上げていく想定。
// 今回は2段階まで。LOCKED へ上げる条件はここに足せばよい。
// ===================================================================
function updateAim(dt) {
  if (!sceneReady) { aimState = 'CLEAR'; return aimState; }

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);

  let best = null;
  let bestAhead = Infinity;

  for (const e of enemies) {
    if (!e.alive) continue;

    const toEnemy = e.group.position.clone().sub(playerShip.position);

    // 前方への距離。マイナスなら後ろにいるので対象外
    const ahead = toEnemy.dot(forward);
    if (ahead <= 0 || ahead > AIM.CAPTURE_RANGE) continue;

    // 照準線からの横のずれ。
    // 「敵へのベクトル」から「前方成分」を引くと、横方向のずれだけが残る。
    const offset = toEnemy.clone().addScaledVector(forward, -ahead).length();

    // 捕捉半径。遠いほど少し広げる(遠距離でも狙えるように)
    const captureRadius = ENEMY.HIT_RADIUS * AIM.CAPTURE_MULT + ahead * AIM.CAPTURE_SPREAD;

    if (offset < captureRadius && ahead < bestAhead) {
      best = e;
      bestAhead = ahead;
    }
  }

  // --- 状態遷移 ---
  if (best) {
    if (aimState === 'CLEAR') {
      aimState = 'TRACKING';   // 捉えた瞬間
      aimHoldTime = 0;
    }
    aimTarget = best;
    aimHoldTime += dt;

    // ここに「一定時間捉え続けたら LOCKED へ」を将来足す。
    // 例: if (aimHoldTime > AIM.LOCK_SEC) aimState = 'LOCKED';

  } else {
    aimState = 'CLEAR';        // 外したら即座に戻る
    aimTarget = null;
    aimHoldTime = 0;
  }

  // --- レティクルの見た目に反映 ---
  const parts = cockpitInterior ? cockpitInterior.userData : null;
  if (parts && parts.reticleMat) {
    const capturing = (aimState !== 'CLEAR');
    parts.reticleMat.color.setHex(
      capturing ? COCKPIT.RETICLE_LOCK : COCKPIT.RETICLE_COLOR);
    parts.reticleMat.opacity =
      capturing ? COCKPIT.RETICLE_OPACITY_LOCK : COCKPIT.RETICLE_OPACITY;
  }

  return aimState;
}

// 今の照準状態を外から見るための関数
function currentAimState() {
  return aimState;
}

// 敵を捉え続けている秒数(捕捉音を詰めていくのに使う)
function currentAimHold() {
  return aimHoldTime;
}

// ===================================================================
// 照準の画面上の位置
//
// カメラが機首より遅れて追うようにしたため、画面のど真ん中は
// もう「弾が飛んでいく方向」ではなくなった。
// そこで機首の正面のずっと先に点を置き、それを画面へ投影して
// 照準の位置にする。こうすると照準は常に弾道の先を指す。
// ===================================================================
function getAimNdc() {
  if (!sceneReady) return null;

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
  const point = playerShip.position.clone().addScaledVector(forward, FEEL.AIM_DISTANCE);

  const inFront = camera.worldToLocal(point.clone()).z < 0;
  const ndc = point.project(camera);

  return { x: ndc.x, y: ndc.y, visible: inFront };
}

// ===================================================================
// 宇宙塵を更新する
// 塵そのものは動かさない。自機が塵の箱から出そうになったら、
// 塵を反対側へ回り込ませることで「無限に塵が流れてくる」ように見せる。
// ===================================================================
function updateDust() {
  const arr  = dust.geometry.attributes.position.array;
  const p    = playerShip.position;
  const half = DUST.FIELD / 2;

  // 尾を伸ばす向き = 速度の逆向き。速いほど長い線になる
  const tailX = -shipVelocity.x * DUST.STREAK;
  const tailY = -shipVelocity.y * DUST.STREAK;
  const tailZ = -shipVelocity.z * DUST.STREAK;

  const center = [p.x, p.y, p.z];

  for (let i = 0; i < DUST.COUNT; i++) {
    const o = i * 6;

    // x,y,z の3方向それぞれについて、箱からはみ出していたら反対側へ移す
    for (let a = 0; a < 3; a++) {
      const diff = arr[o + a] - center[a];
      if (diff > half)       arr[o + a] -= DUST.FIELD;
      else if (diff < -half) arr[o + a] += DUST.FIELD;
    }

    // 尾の位置を頭からずらして決める
    arr[o + 3] = arr[o + 0] + tailX;
    arr[o + 4] = arr[o + 1] + tailY;
    arr[o + 5] = arr[o + 2] + tailZ;
  }

  // 「配列の中身を書き換えたので画面に反映して」という合図。これを忘れると変化しない
  dust.geometry.attributes.position.needsUpdate = true;
}

// ===================================================================
// 視点を動かす(仕様書9.6:W/S=ピッチ、A/D=ヨー)
//
// pitchDir / yawDir は -1・0・+1 のいずれか。main.js が押されているキーから決める。
//   pitchDir: +1 = 機首上げ / -1 = 機首下げ
//   yawDir:   +1 = 左を向く / -1 = 右を向く
// キーの割り当てや反転設定は main.js 側の仕事。ここは「言われた向きに回す」だけにする。
// カメラ自体を回すことで「機首を向ける」を表現している(コックピット視点)。
// ===================================================================
function turnView(dt, pitchDir, yawDir) {
  if (!sceneReady) return;

  // --- 目標の回転速度 ---
  // キーを押している間だけ「最大の旋回速度」を目標にする。
  const targetYawRate   = yawDir   * FEEL.TURN_SPEED;
  const targetPitchRate = pitchDir * FEEL.TURN_SPEED;

  // --- 今の回転速度を目標へ寄せる ---
  // ここが慣性の正体。押した瞬間に最高速で回らず、離しても即座には止まらない。
  // 1 - Math.exp(-dt / 時間) は「その秒数でだいたい追いつく」割合。
  const k = 1 - Math.exp(-dt / Math.max(FEEL.TURN_SMOOTH, 0.0001));
  yawRate   += (targetYawRate   - yawRate)   * k;
  pitchRate += (targetPitchRate - pitchRate) * k;

  // --- 回転速度で角度を動かす ---
  viewYaw   += yawRate   * dt;
  viewPitch += pitchRate * dt;

  // 上下は限界を設ける。Math.max/min で挟むと「一定の範囲から出さない」ができる
  const clamped = Math.max(-VIEW.PITCH_LIMIT, Math.min(VIEW.PITCH_LIMIT, viewPitch));
  // 限界に当たったら回転速度も止める。そうしないと勢いが溜まり、
  // 逆に倒したときに引っかかったような操作感になる。
  if (clamped !== viewPitch) pitchRate = 0;
  viewPitch = clamped;

  // 左右は制限なし(ぐるりと一周できる)
  // ※ 実際に機体とカメラを向けるのは updateFlight()。ここでは角度を決めるだけ。
}

// ===================================================================
// 射撃(仕様書9.6:F=主兵装発射)
// 命中判定はまだ入れない。まずは「撃った」ことが見て分かる状態にする。
// ===================================================================
function fireBolt() {
  if (!sceneReady) return;

  // 弾の形と材質は毎回作らず、最初の1回だけ作って使い回す(数が増えても重くならない)
  if (!boltGeometry) {
    boltGeometry = new THREE.BoxGeometry(0.14, 0.14, 3.0);   // 細長い光の棒
    // MeshBasicMaterial = 光の影響を受けず、いつも同じ色で光って見える材質。ビーム向き
    boltMaterial = new THREE.MeshBasicMaterial({ color: BOLT.COLOR });

    // 残光(トレイル)。弾の後ろへ細く長く伸びる半透明の棒。
    // 弾はローカル座標の -Z へ進むので、+Z 側が「後ろ」になる。
    boltTrailGeometry = new THREE.BoxGeometry(0.07, 0.07, FEEL.BOLT_TRAIL);
    boltTrailGeometry.translate(0, 0, FEEL.BOLT_TRAIL / 2 + 1.5);
    boltTrailMaterial = new THREE.MeshBasicMaterial({
      color: BOLT.COLOR, transparent: true, opacity: 0.26,
    });
  }

  volleyCounter += 1;   // この発射の通し番号

  // 左右の翼から1条ずつ(合わせて「1発」として数える)
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(boltGeometry, boltMaterial);
    mesh.add(new THREE.Mesh(boltTrailGeometry, boltTrailMaterial));   // 残光を貼り付ける

    // 発射口の位置を「自機から見た座標」で決め、機体の向きに合わせて回す。
    // カメラではなく機体を基準にすることで、翼から弾が出ているように見える。
    const offset = new THREE.Vector3(side * BOLT.OFFSET_X, BOLT.OFFSET_Y, BOLT.OFFSET_Z);
    offset.applyQuaternion(playerShip.quaternion);
    mesh.position.copy(playerShip.position).add(offset);
    mesh.quaternion.copy(playerShip.quaternion);    // 弾も進行方向を向かせる

    // 進む向き = 機首の正面(-Z方向)
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);

    scene.add(mesh);
    bolts.push({ mesh: mesh, direction: direction, life: BOLT.LIFE, volleyId: volleyCounter });
  }
}

// 飛んでいる弾を進め、命中判定をして、寿命が尽きたものを消す
function updateBolts(dt) {
  // 後ろから前へ回すのがコツ。途中で要素を消しても番号がずれない
  for (let i = bolts.length - 1; i >= 0; i--) {
    const bolt = bolts[i];

    // addScaledVector(向き, 距離) = その向きへ指定した距離だけ進める
    bolt.mesh.position.addScaledVector(bolt.direction, BOLT.SPEED * dt);
    bolt.life -= dt;

    // --- 命中判定 ---
    // 「敵機の中心から一定の距離より近づいたら当たり」という球の判定。
    // 面と面で正確に判定する方法もあるが、高速な弾には重すぎるうえ、
    // この距離感のゲームでは球で十分に自然に見える。
    // 敵が複数いるので、生きている全機と突き合わせる。
    let struck = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (bolt.mesh.position.distanceTo(e.group.position) < ENEMY.HIT_RADIUS) { struck = e; break; }
    }

    if (struck) {
      // 同じ発射の2本目なら、光と破片だけ出してHPは減らさない
      const isFirstOfVolley = (bolt.volleyId !== lastDamagedVolley);
      if (isFirstOfVolley) lastDamagedVolley = bolt.volleyId;

      hitEnemy(struck, bolt.mesh.position, isFirstOfVolley);
      scene.remove(bolt.mesh);
      bolts.splice(i, 1);
      continue;   // この弾はもう無いので、次の弾へ
    }

    if (bolt.life <= 0) {
      scene.remove(bolt.mesh);   // 空間から取り除く
      bolts.splice(i, 1);        // リストからも取り除く
    }
  }
}

// ===================================================================
// 敵AI ― 3つの状態を行き来する
//
//   接近(approach) … 自機との距離を詰める
//   攻撃(attack)   … 一定距離を保ちつつ、予告→発射をくり返す
//   回避(evade)    … 被弾したら数秒ランダムな向きへ逃げ、また接近へ戻る
//
// 「状態」を1つの文字列で持ち、状態ごとに「何をするか」を分けて書くのが
// いちばん素直なAIの作り方。状態が増えても同じ形で足していける。
// ===================================================================
// 敵機を1機ぶん作る。見た目・材質・AIの状態をひとまとめにして返す
function createEnemy() {
  const group = createEnemyFighter();
  scene.add(group);

  // 被弾時に白く光らせるため、機体を構成する材質だけを集めておく。
  // traverse = そのグループの中身を隅々まで1つずつ見て回る命令。
  // isMesh で立体だけを選ぶ(輪郭線は LineSegments なので対象外)。
  const materials = [];
  group.traverse((obj) => { if (obj.isMesh) materials.push(obj.material); });

  return {
    group: group,
    materials: materials,
    hp: ENEMY.MAX_HP,
    alive: true,
    respawnLeft: 0,      // リスポーンまでの残り秒数
    hitFlash: 0,         // 被弾時に白く光る残り時間

    // AIの状態。'approach'(接近) / 'attack'(攻撃) / 'evade'(回避)の3つ
    state: 'approach',
    stateTime: 0,        // その状態になってからの経過秒
    fireTimer: AI.FIRE_INTERVAL,   // 次の発射までの残り秒
    telegraph: 0,        // 発射予告(光っている)の残り秒。0 なら予告していない
    evadeDir: new THREE.Vector3(1, 0, 0),

    // 熱の痕跡。発射や被弾で跳ね上がり、時間とともに冷める。
    // 仕様書9.3「敵のHEATが探知手段(撃ちまくる敵ほどよく見える)」の初歩版。
    heatSig: 0,
  };
}

function setEnemyState(e, next) {
  e.state = next;
  e.stateTime = 0;

  if (next === 'evade') {
    // 逃げる向きをランダムに決める(毎回違う方向へ散る)
    e.evadeDir.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    e.telegraph = 0;   // 逃げる間は撃たない。予告も消す
  }
}

function updateEnemyAI(e, dt) {
  e.stateTime += dt;
  e.heatSig = Math.max(e.heatSig - dt, 0);   // 熱はだんだん冷める

  // 自機へのベクトルと距離を求める(すべての判断のもとになる)
  const toPlayer = playerShip.position.clone().sub(e.group.position);
  const distance = toPlayer.length();
  const toPlayerDir = toPlayer.clone().normalize();

  // --- 状態の切り替え ---
  if (e.state === 'approach' && distance < AI.ATTACK_RANGE) {
    setEnemyState(e, 'attack');
  } else if (e.state === 'attack' && distance > AI.BREAK_RANGE) {
    setEnemyState(e, 'approach');
  } else if (e.state === 'evade' && e.stateTime > AI.EVADE_SEC) {
    setEnemyState(e, 'approach');
  }

  // --- 状態ごとの移動 ---
  const move = new THREE.Vector3();
  let speed = 0;

  if (e.state === 'evade') {
    move.copy(e.evadeDir);
    speed = AI.EVADE_SPEED;

  } else if (e.state === 'attack') {
    if (distance < AI.TOO_CLOSE) {
      move.copy(toPlayerDir).negate();     // 近すぎるので下がる
    } else {
      // 自機の周りを横へ回り込む。
      // cross(外積)= 2つの向きの両方に直角な向き。これで「横」が求まる。
      move.copy(toPlayerDir).cross(new THREE.Vector3(0, 1, 0)).normalize();
    }
    speed = AI.ATTACK_SPEED;

  } else {   // approach
    move.copy(toPlayerDir);
    speed = AI.APPROACH_SPEED;
  }

  e.group.position.addScaledVector(move, speed * dt);

  // --- 機首を自機へ向ける ---
  // Matrix4.lookAt は「-Z が相手を向く」向きを作る。敵機の機首も -Z なのでそのまま使える。
  // slerp = 回転をなめらかにつなぐ命令。いきなり向くとロボットのようになる。
  const lookMatrix = new THREE.Matrix4().lookAt(
    e.group.position, playerShip.position, new THREE.Vector3(0, 1, 0)
  );
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
  e.group.quaternion.slerp(targetQuat, 1 - Math.exp(-AI.TURN_RATE * dt));

  // --- 攻撃状態のときだけ、予告 → 発射をくり返す ---
  if (e.state === 'attack') {
    if (e.telegraph > 0) {
      // 予告中。時間が来たら撃つ
      e.telegraph -= dt;
      if (e.telegraph <= 0) {
        e.telegraph = 0;
        fireEnemyBolt(e);
        e.fireTimer = AI.FIRE_INTERVAL;
        e.heatSig = SENSOR.HEAT_LINGER;   // 撃った直後は熱くて見つかりやすい
      }
    } else {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        e.telegraph = AI.TELEGRAPH;   // 予告開始(光り始める)
        onIncomingLock();             // main.js:狙われた警告音
      }
    }
  }
}

// ===================================================================
// 敵の発光をまとめて更新する
// 「被弾の白い点滅」と「発射予告のオレンジの光」の2つがあるので、
// 強いほうを採用して1回で塗る(別々に書くと上書きし合って消える)
// ===================================================================
function updateEnemyGlow(e, dt) {
  let r = 0, g = 0, b = 0;

  if (e.hitFlash > 0) {
    e.hitFlash = Math.max(e.hitFlash - dt, 0);
    const w = e.hitFlash / ENEMY.FLASH_SEC;   // 1 → 0。白
    r = w; g = w; b = w;
  }

  if (e.telegraph > 0) {
    // 予告は「発射が近づくほど明るくなる」ようにする = 溜めている感じが出る
    const t = 1 - e.telegraph / AI.TELEGRAPH;   // 0 → 1
    r = Math.max(r, t);
    g = Math.max(g, t * 0.45);   // オレンジ寄りの色
    b = Math.max(b, t * 0.15);
  }

  for (const material of e.materials) material.emissive.setRGB(r, g, b);
}

// ===================================================================
// 敵の発射
// 自機の「今いる位置」を狙う(先読みしない)。
// 先読みさせると当たりすぎて避けられなくなるため、あえて素直に撃たせる。
// ===================================================================
function fireEnemyBolt(e) {
  if (!enemyBoltGeometry) {
    enemyBoltGeometry = new THREE.BoxGeometry(0.2, 0.2, 2.4);
    enemyBoltMaterial = new THREE.MeshBasicMaterial({ color: ENEMY_BOLT.COLOR });
  }

  enemyVolleyCounter += 1;   // この発射の通し番号

  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(enemyBoltGeometry, enemyBoltMaterial);

    // 発射口(敵機の翼)の位置
    const offset = new THREE.Vector3(side * ENEMY_BOLT.OFFSET_X, 0, ENEMY_BOLT.OFFSET_Z);
    offset.applyQuaternion(e.group.quaternion);
    mesh.position.copy(e.group.position).add(offset);

    // 発射口から自機へ向かう向き
    const direction = playerShip.position.clone().sub(mesh.position).normalize();
    // 弾の見た目も進行方向に合わせて倒す
    mesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), direction.clone().negate(), new THREE.Vector3(0, 1, 0))
    );

    scene.add(mesh);
    enemyBolts.push({
      mesh: mesh, direction: direction, life: ENEMY_BOLT.LIFE,
      volleyId: enemyVolleyCounter,
    });
  }
}

// 敵の弾を進め、自機に当たったかを見る
function updateEnemyBolts(dt) {
  for (let i = enemyBolts.length - 1; i >= 0; i--) {
    const bolt = enemyBolts[i];

    bolt.mesh.position.addScaledVector(bolt.direction, ENEMY_BOLT.SPEED * dt);
    bolt.life -= dt;

    // --- 自機への命中判定 ---
    if (bolt.mesh.position.distanceTo(playerShip.position) < ENEMY_BOLT.HIT_RADIUS) {
      // 当たった場所に赤い火花を散らす
      spawnDebris(bolt.mesh.position, 5, 0.14, 7);
      scene.remove(bolt.mesh);
      enemyBolts.splice(i, 1);

      // 同じ発射の2本目なら火花だけ。ダメージは1回ぶんに数える
      if (bolt.volleyId !== lastPlayerHitVolley) {
        lastPlayerHitVolley = bolt.volleyId;
        onPlayerHit();   // main.js:シールド/HULLの処理と画面演出
      }
      continue;
    }

    if (bolt.life <= 0) {
      scene.remove(bolt.mesh);
      enemyBolts.splice(i, 1);
    }
  }
}

// 今のAI状態を外(計器表示)から見るための関数。
// 敵が複数いるので「いちばん近い敵」の状態を出す。
// ただし1機でも予告中なら、そちらを優先して危険を知らせる。
function currentEnemyState() {
  let nearest = null;
  let nearestDist = Infinity;

  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.telegraph > 0) return 'FIRING';   // 撃たれる直前は最優先で知らせる
    const d = e.group.position.distanceTo(playerShip.position);
    if (d < nearestDist) { nearestDist = d; nearest = e; }
  }

  if (!nearest) return 'DOWN';
  return { approach: 'APPROACH', attack: 'ATTACK', evade: 'EVADE' }[nearest.state];
}

// 生きている敵の数(計器表示用)
function aliveEnemyCount() {
  return enemies.filter((e) => e.alive).length;
}

// 敵の総数(レーダーの輝点やマーカーを何個作るかの決定に使う)
function enemyCount() {
  return enemies.length;
}

// ===================================================================
// センサー精度(仕様書9.3の7つ目)
// 索敵半径 = センサーの電力配分で決まる。配分0%でも最低限は見える。
// ===================================================================
function sensorRange(sensorPercent) {
  const ratio = Math.max(0, Math.min(100, sensorPercent)) / 100;
  return SENSOR.MIN_RANGE + ratio * (SENSOR.MAX_RANGE - SENSOR.MIN_RANGE);
}

// ===================================================================
// レーダーと敵マーカーのためのデータを作る
//
// 索敵半径の外にいる敵は、そもそもこの配列に入らない。
// = レーダーにも映らず、3D画面にもマーカーが出ない(仕様の4番)
//
// 返す値(敵1機ぶん):
//   localX / localZ … 自機から見た相対位置。localZ がマイナスなら前方
//   dist            … 距離
//   hot             … 熱で捕捉している敵か(発射直前・発射直後・被弾直後)
//   ndcX / ndcY     … 画面上の位置(-1〜+1)。マーカーを置くのに使う
//   inFront         … 画面の前方にいるか(後ろの敵にマーカーを出さないため)
// ===================================================================
function getContacts(sensorPercent) {
  const result = [];
  if (!sceneReady) return result;

  const range = sensorRange(sensorPercent);

  // 自機の向きの「逆回転」。これを掛けると、世界の座標が
  // 「自機から見た前後左右」に変換できる(機首が常に上のレーダーの要)
  const inverse = playerShip.quaternion.clone().invert();

  for (const e of enemies) {
    if (!e.alive) continue;

    const to = e.group.position.clone().sub(playerShip.position);
    const dist = to.length();

    // 熱を出している敵は、索敵半径の HEAT_BONUS 倍まで捕捉できる
    const hot = (e.telegraph > 0 || e.heatSig > 0);
    const limit = range * (hot ? SENSOR.HEAT_BONUS : 1);
    if (dist > limit) continue;   // 圏外。映らない

    const local = to.clone().applyQuaternion(inverse);

    // 画面上の位置を求める。project() は3Dの点を画面座標(-1〜+1)に変換する命令
    const ndc = e.group.position.clone().project(camera);
    // カメラから見て前方にあるか。z がマイナスならカメラの前
    const inFront = camera.worldToLocal(e.group.position.clone()).z < 0;

    result.push({
      localX: local.x,
      localZ: local.z,
      dist: dist,
      hot: hot,
      ndcX: ndc.x,
      ndcY: ndc.y,
      inFront: inFront,
    });
  }

  return result;
}

// ===================================================================
// 敵機への命中
// ===================================================================
// dealDamage が false のときは、見た目(光と破片)だけでHPは減らさない
function hitEnemy(e, point, dealDamage) {
  e.hitFlash = ENEMY.FLASH_SEC;         // 白く光らせる
  e.heatSig  = SENSOR.HEAT_LINGER;      // 被弾直後も熱くて見つかりやすい

  // 当たった場所から小さな破片を飛ばす
  spawnDebris(point, DEBRIS.HIT_COUNT, DEBRIS.HIT_SIZE, DEBRIS.HIT_SPEED);

  if (!dealDamage) return;

  e.hp -= 1;

  if (e.hp <= 0) {
    killEnemy(e);
  } else {
    setEnemyState(e, 'evade');   // 撃たれたら数秒逃げる(仕様の3状態目)
    // main.js 側のログ表示を呼ぶ(3Dは見た目、UIは main.js、と役割を分けている)
    onHit(e.hp);
  }
}

// ===================================================================
// 撃墜:機体を消し、破片をまき散らし、数秒後に別の位置へリスポーンさせる
// ===================================================================
function killEnemy(e) {
  e.alive = false;
  e.group.visible = false;      // 空間からは消さず、見えなくするだけ(使い回すため)
  e.respawnLeft = ENEMY.RESPAWN_SEC;

  spawnDebris(e.group.position, DEBRIS.KILL_COUNT, DEBRIS.KILL_SIZE, DEBRIS.KILL_SPEED);
  onKill();
}

// ===================================================================
// リスポーン:HPを戻し、前とは違う位置に出現させる
// ===================================================================
function respawnEnemy(e) {
  e.hp = ENEMY.MAX_HP;
  e.alive = true;
  e.group.visible = true;
  e.respawnLeft = 0;

  // 自機は空間を移動していくので、リスポーン地点は「今の自機の前方」に取る。
  // そうしないと、飛び去ったあと遠い原点付近に湧いて見つけられなくなる。
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
  e.group.position.copy(playerShip.position)
    .addScaledVector(forward, 90)
    .add(new THREE.Vector3(
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 24,
      (Math.random() - 0.5) * 40
    ));

  // AIを初期状態に戻す
  setEnemyState(e, 'approach');
  e.fireTimer = AI.FIRE_INTERVAL;
  e.telegraph = 0;

  // 点滅の消し忘れがないよう、光をゼロに戻しておく
  e.hitFlash = 0;
  for (const material of e.materials) material.emissive.setRGB(0, 0, 0);
}

// ===================================================================
// 破片(デブリ)を撒く
// position=出る場所 / count=個数 / size=大きさ / speed=飛び散る速さ
// ===================================================================
function spawnDebris(position, count, size, speed) {
  // 四面体 = 三角形4枚。もっとも面数の少ない立体で、ローポリの破片にちょうどいい
  if (!debrisGeometry) debrisGeometry = new THREE.TetrahedronGeometry(1);

  for (let i = 0; i < count; i++) {
    // 破片ごとに薄れ方が違うので、材質は1個ずつ作る(透明度を個別に変えるため)
    const material = new THREE.MeshBasicMaterial({
      color: ENEMY.EDGE_COLOR,
      transparent: true,     // 透明度を扱えるようにする
      opacity: 1,
    });

    const mesh = new THREE.Mesh(debrisGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(size * (0.5 + Math.random()));   // 大きさをばらつかせる

    // ランダムな方向へ、ばらついた速さで飛ばす
    const dir = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ).normalize();   // 長さ1に揃える(そうしないと方向によって速さが変わる)

    const life = 0.6 + Math.random() * 0.8;

    debris.push({
      mesh: mesh,
      velocity: dir.multiplyScalar(speed * (0.4 + Math.random())),
      // 回転の速さもばらばらにすると、破片らしく見える
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
              .multiplyScalar(8),
      life: life,
      maxLife: life,
    });

    scene.add(mesh);
  }
}

// 破片を飛ばし、だんだん薄くして消す
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];

    d.mesh.position.addScaledVector(d.velocity, dt);
    d.velocity.multiplyScalar(1 - DEBRIS.DRAG * dt);   // だんだん減速

    d.mesh.rotation.x += d.spin.x * dt;
    d.mesh.rotation.y += d.spin.y * dt;
    d.mesh.rotation.z += d.spin.z * dt;

    d.life -= dt;
    // 残り寿命の割合をそのまま透明度に使う = だんだん消える
    d.mesh.material.opacity = Math.max(d.life / d.maxLife, 0);

    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.mesh.material.dispose();   // 使い終わった材質を破棄(数が増えても重くならない)
      debris.splice(i, 1);
    }
  }
}

// ===================================================================
// 毎コマ呼ばれる更新+描画。dt=経過秒数 / elapsed=起動からの累計秒数
// ===================================================================
function updateScene(dt, elapsed) {
  if (!sceneReady) return;

  updateBolts(dt);
  updateEnemyBolts(dt);   // 敵の弾は敵が死んでいても飛び続ける
  updateDebris(dt);

  // 発光(被弾の白い点滅 と 発射予告の光)は、止まっていても消えていくよう常に更新する
  for (const e of enemies) updateEnemyGlow(e, dt);

  // --- ミッション終了中は戦闘を止める(破片だけ動かす)---
  if (combatFrozen) {
    renderer.render(scene, camera);
    return;
  }

  // --- 敵1機ずつ:死んでいればリスポーンを待ち、生きていればAIを動かす ---
  for (const e of enemies) {
    if (!e.alive) {
      e.respawnLeft -= dt;
      if (e.respawnLeft <= 0) respawnEnemy(e);
      continue;
    }
    updateEnemyAI(e, dt);
  }

  renderer.render(scene, camera);
}

// ウィンドウサイズが変わったらカメラと描画サイズを合わせ直す
function onResize() {
  if (!sceneReady) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();   // 縦横比を変えたら必ずこれを呼ぶ決まり
  renderer.setSize(window.innerWidth, window.innerHeight);
}
