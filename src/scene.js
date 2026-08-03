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

let stars = null;      // 星空

let sceneReady = false;   // 3Dの準備ができたか

// --- 視点(機首の向き)の設定 ---------------------------------------
// 仕様書9.6:W/S = ピッチ(上下) / A/D = ヨー(左右)
const VIEW = {
  // 旋回の速さ(ラジアン/秒)。三人称視点では画面全体が回るため、
  // コックピット視点より酔いやすい。仕様どおり控えめの値から始める。
  TURN_SPEED: 0.80,             // 約46度/秒
  PITCH_LIMIT: Math.PI * 0.45,  // 上下を向ける限界(約81度)。真上で一回転するのを防ぐ
};

let viewPitch = 0;   // 上下の向き(ラジアン)。プラス=上
let viewYaw   = 0;   // 左右の向き(ラジアン)。プラス=左
let lastYawDir = 0;  // 直前の左右入力(見た目の傾きに使う)

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
  CAM_HEIGHT:  0.7,   // 機体からどれだけ上にカメラを置くか
  CAM_BACK:   10.5,   // 機体からどれだけ後ろにカメラを置くか

  ROLL:       0.55,   // 旋回時に機体を傾ける量(見た目だけ。カメラは傾けない=酔い対策)
};

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

  // --- 星空 ---
  stars = createStarfield();
  scene.add(stars);

  // --- 流れる宇宙塵 ---
  dust = createDustField();
  scene.add(dust);

  // --- 自機 ---
  // playerShip = 位置と向きだけを持つ入れ物。カメラも弾もこれを基準にする。
  // その子として playerModel(見た目)をぶら下げ、傾きは子だけに掛ける。
  playerShip  = new THREE.Group();
  playerModel = createPlayerFighter();
  playerShip.add(playerModel);
  playerShip.position.set(0, 0, 0);
  scene.add(playerShip);

  shipVelocity = new THREE.Vector3(0, 0, 0);

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

  // --- 1. 機首の向きを機体に反映する ---
  // Euler(上下, 左右, ひねり, 適用順)。ひねり(ロール)は0のままにして、
  // 見た目の傾きは子(playerModel)だけに掛ける = カメラは水平のまま(酔い対策)
  playerShip.quaternion.setFromEuler(new THREE.Euler(viewPitch, viewYaw, 0, 'YXZ'));

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

  // --- 見た目の傾き(旋回している方向へ機体を倒す)---
  const targetRoll = lastYawDir * PLAYER.ROLL;
  visualRoll += (targetRoll - visualRoll) * (1 - Math.exp(-6 * dt));
  playerModel.rotation.z = visualRoll;

  // --- エンジンの噴射光を速度に合わせて伸ばす ---
  // ドリフト中は推力を切っているので、噴射光も消す(見ただけで状態が分かる)
  const speedRatio = drifting
    ? 0
    : (targetSpeed - PLAYER.MIN_SPEED) / (PLAYER.MAX_SPEED - PLAYER.MIN_SPEED);
  for (const glow of engineGlows) {
    glow.scale.z = 0.05 + speedRatio * 1.8;
    glow.material.opacity = drifting ? 0 : (0.35 + speedRatio * 0.45);
  }

  // --- 5. カメラを機体の後ろへ ---
  // 機体から見た「上に CAM_HEIGHT、後ろに CAM_BACK」の位置を、機体の向きで回して求める
  const camOffset = new THREE.Vector3(0, PLAYER.CAM_HEIGHT, PLAYER.CAM_BACK)
    .applyQuaternion(playerShip.quaternion);
  camera.position.copy(playerShip.position).add(camOffset);
  camera.quaternion.copy(playerShip.quaternion);   // カメラも機首と同じ方向を向く

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

  updateDust();
}

// ドリフトの入切。main.js が Shift の押し具合を見て毎コマ呼ぶ
function setDrift(on) {
  drifting = on;
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
  visualRoll = 0;
  drifting = false;

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

  viewPitch += pitchDir * VIEW.TURN_SPEED * dt;
  viewYaw   += yawDir   * VIEW.TURN_SPEED * dt;

  // 上下は限界を設ける。Math.max/min で挟むと「一定の範囲から出さない」ができる
  viewPitch = Math.max(-VIEW.PITCH_LIMIT, Math.min(VIEW.PITCH_LIMIT, viewPitch));

  // 左右は制限なし(ぐるりと一周できる)

  lastYawDir = yawDir;   // 機体の見た目の傾きに使う
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
  }

  volleyCounter += 1;   // この発射の通し番号

  // 左右の翼から1条ずつ(合わせて「1発」として数える)
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(boltGeometry, boltMaterial);

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
      }
    } else {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) e.telegraph = AI.TELEGRAPH;   // 予告開始(光り始める)
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

// ===================================================================
// 敵機への命中
// ===================================================================
// dealDamage が false のときは、見た目(光と破片)だけでHPは減らさない
function hitEnemy(e, point, dealDamage) {
  e.hitFlash = ENEMY.FLASH_SEC;   // 白く光らせる

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
