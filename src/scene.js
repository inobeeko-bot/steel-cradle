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
let enemy = null;      // 敵機1機

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
  SWING_RANGE:      7,    // 左右に振れる幅
  SWING_SPEED:   0.35,    // 左右移動の速さ
  BANK:          0.18,    // 旋回時に機体を傾ける量(大きすぎると真横を向いて形が潰れる)

  MAX_HP:           5,    // 何発で撃墜されるか
  HIT_RADIUS:     2.8,    // 当たり判定の半径。機体を包む球の大きさ
  FLASH_SEC:     0.18,    // 被弾したとき白く光る時間
  RESPAWN_SEC:    3.0,    // 撃墜されてから次の機体が現れるまでの秒数
};

// --- 敵機の状態 -----------------------------------------------------
let enemyHp        = ENEMY.MAX_HP;
let enemyAlive     = true;
let respawnLeft    = 0;      // リスポーンまでの残り秒数
let hitFlash       = 0;      // 被弾時に白く光る残り時間
let enemyMaterials = [];     // 点滅させるために材質だけ集めておく

// リスポーンのたびに変える位置の情報。
// 敵機は空間に固定された点のまわりを往復する(自機を追いかけては来ない)。
let enemySwingPhase = 0;                 // 左右往復の位相(ずらすと違う位置から現れる)
let enemyBaseX      = 0;                 // 往復の中心(左右)
let enemyBaseY      = 0;                 // 高さ
let enemyBaseZ      = ENEMY.DISTANCE;    // 奥行き

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

  // --- 敵機 ---
  enemy = createEnemyFighter();
  enemy.position.set(0, 0, ENEMY.DISTANCE);
  scene.add(enemy);

  // 被弾時に白く光らせるため、機体を構成する材質だけを集めておく。
  // traverse = そのグループの中身を隅々まで1つずつ見て回る命令。
  // isMesh で立体だけを選ぶ(輪郭線は LineSegments なので対象外)。
  enemy.traverse((obj) => {
    if (obj.isMesh) enemyMaterials.push(obj.material);
  });

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

  // --- 胴体 ---
  // ConeGeometry(底面の半径, 高さ, 何角形にするか)。4 = 四角錐 = かなり角ばる
  const bodyGeo = new THREE.ConeGeometry(0.75, 3.0, 4);
  // 円錐は初期状態で上(+Y)を向いているので、90度倒して手前(+Z=自機の方)へ向ける
  bodyGeo.rotateX(Math.PI / 2);
  ship.add(createFlatPart(bodyGeo, ENEMY.BODY_COLOR, ENEMY.EDGE_COLOR));

  // --- 主翼(左右)---
  // BoxGeometry(幅, 高さ, 奥行き)
  // 細長すぎると1本の棒に見えてしまうので、奥行き(前後の厚み)をしっかり取る
  for (const side of [-1, 1]) {          // -1=左 / +1=右 をまとめて作る
    const wingGeo = new THREE.BoxGeometry(1.8, 0.16, 1.7);
    const wing = createFlatPart(wingGeo, ENEMY.WING_COLOR, ENEMY.EDGE_COLOR);
    wing.position.set(side * 1.3, -0.1, -0.5);
    wing.rotation.z = side * 0.20;       // 少し上に反らせて「への字」の翼にする
    wing.rotation.y = side * -0.16;      // 後退角(翼を後ろへ倒す)
    ship.add(wing);
  }

  // --- 垂直尾翼 ---
  const finGeo = new THREE.BoxGeometry(0.14, 1.1, 1.0);
  const fin = createFlatPart(finGeo, ENEMY.WING_COLOR, ENEMY.EDGE_COLOR);
  fin.position.set(0, 0.6, -1.1);
  ship.add(fin);

  // --- エンジンノズル(左右)---
  // 5角柱。少ない面数のまま「機械的な塊」を足して、機体の後ろを重く見せる
  for (const side of [-1, 1]) {
    const nozzleGeo = new THREE.CylinderGeometry(0.3, 0.36, 1.0, 5);
    nozzleGeo.rotateX(Math.PI / 2);      // 円柱を寝かせて前後方向にする
    const nozzle = createFlatPart(nozzleGeo, ENEMY.WING_COLOR, ENEMY.EDGE_COLOR);
    nozzle.position.set(side * 0.62, -0.05, -1.3);
    ship.add(nozzle);
  }

  // --- コックピット(八面体。角ばったキャノピー)---
  const canopyGeo = new THREE.OctahedronGeometry(0.42);
  const canopy = createFlatPart(canopyGeo, ENEMY.CANOPY_COLOR, ENEMY.EDGE_COLOR);
  canopy.position.set(0, 0.36, 0.15);
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
    if (enemyAlive && bolt.mesh.position.distanceTo(enemy.position) < ENEMY.HIT_RADIUS) {
      // 同じ発射の2本目なら、光と破片だけ出してHPは減らさない
      const isFirstOfVolley = (bolt.volleyId !== lastDamagedVolley);
      if (isFirstOfVolley) lastDamagedVolley = bolt.volleyId;

      hitEnemy(bolt.mesh.position, isFirstOfVolley);
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
// 敵機への命中
// ===================================================================
// dealDamage が false のときは、見た目(光と破片)だけでHPは減らさない
function hitEnemy(point, dealDamage) {
  hitFlash = ENEMY.FLASH_SEC;   // 白く光らせる

  // 当たった場所から小さな破片を飛ばす
  spawnDebris(point, DEBRIS.HIT_COUNT, DEBRIS.HIT_SIZE, DEBRIS.HIT_SPEED);

  if (!dealDamage) return;

  enemyHp -= 1;

  if (enemyHp <= 0) {
    killEnemy();
  } else {
    // main.js 側のログ表示を呼ぶ(3Dは見た目、UIは main.js、と役割を分けている)
    onHit(enemyHp);
  }
}

// ===================================================================
// 撃墜:機体を消し、破片をまき散らし、数秒後に別の位置へリスポーンさせる
// ===================================================================
function killEnemy() {
  enemyAlive = false;
  enemy.visible = false;        // 空間からは消さず、見えなくするだけ(使い回すため)
  respawnLeft = ENEMY.RESPAWN_SEC;

  spawnDebris(enemy.position, DEBRIS.KILL_COUNT, DEBRIS.KILL_SIZE, DEBRIS.KILL_SPEED);
  onKill();
}

// ===================================================================
// リスポーン:HPを戻し、前とは違う位置に出現させる
// ===================================================================
function respawnEnemy() {
  enemyHp = ENEMY.MAX_HP;
  enemyAlive = true;
  enemy.visible = true;

  // 自機は空間を移動していくので、リスポーン地点は「今の自機の前方」に取る。
  // そうしないと、飛び去ったあと遠い原点付近に湧いて見つけられなくなる。
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
  const spawn = playerShip.position.clone().addScaledVector(forward, 55);

  enemyBaseX = spawn.x + (Math.random() - 0.5) * 10;
  enemyBaseY = spawn.y + (Math.random() - 0.5) * 8;
  enemyBaseZ = spawn.z + (Math.random() - 0.5) * 10;

  // 位相をずらすと左右往復の「今どこにいるか」が変わる = 違う場所から現れる
  enemySwingPhase = Math.random() * Math.PI * 2;

  // 点滅の消し忘れがないよう、光をゼロに戻しておく
  hitFlash = 0;
  for (const material of enemyMaterials) material.emissive.setScalar(0);
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
  updateDebris(dt);

  // --- 被弾時の白い点滅 ---
  // emissive = その物体自身が発する光。1に近いほど白く飛ぶ。
  // 時間とともに0へ戻すことで「一瞬光って元に戻る」を表現する。
  if (hitFlash > 0) {
    hitFlash = Math.max(hitFlash - dt, 0);
    const brightness = hitFlash / ENEMY.FLASH_SEC;   // 1 → 0
    for (const material of enemyMaterials) material.emissive.setScalar(brightness);
  }

  // --- 撃墜中はリスポーンを待つ ---
  if (!enemyAlive) {
    respawnLeft -= dt;
    if (respawnLeft <= 0) respawnEnemy();
    renderer.render(scene, camera);
    return;   // 機体がいないので、以下の移動処理はしない
  }

  // --- 敵機をゆっくり左右に往復させる ---
  // Math.sin() は -1〜+1 を行ったり来たりする関数。これに幅を掛けると往復運動になる。
  // (AIはフェーズ1の後半で入れる。今は「動いている」ことの確認が目的)
  const angle = elapsed * ENEMY.SWING_SPEED + enemySwingPhase;
  enemy.position.x = enemyBaseX + Math.sin(angle) * ENEMY.SWING_RANGE;
  enemy.position.y = enemyBaseY;
  enemy.position.z = enemyBaseZ;

  // 進行方向へ少し機体を傾ける(バンク)。これだけで「飛んでいる」感じが出る。
  // 傾けすぎると真横を向いて機体の形が潰れるので控えめにする
  const bank = -Math.cos(angle);
  enemy.rotation.z = bank * ENEMY.BANK;
  enemy.rotation.y = bank * ENEMY.BANK * 0.6;

  renderer.render(scene, camera);
}

// ウィンドウサイズが変わったらカメラと描画サイズを合わせ直す
function onResize() {
  if (!sceneReady) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();   // 縦横比を変えたら必ずこれを呼ぶ決まり
  renderer.setSize(window.innerWidth, window.innerHeight);
}
