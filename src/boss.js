// ===================================================================
// STEEL CRADLE ― 巨大戦艦「ドレッドノート」
//
// トレーニングの最後に出てくる、けた違いに大きい相手。
// 戦闘機と同じルールでは戦えない ― それがこのボスの狙い。
//
// 【設計のいちばん大事なところ】
//   艦体は分厚い装甲で覆われていて、どこを撃っても弾かれる。
//   ダメージが通るのは「排熱口(ベント)」という4つの弱点だけ。
//   しかもベントは常に開いてはいない。数秒に一度、短い時間だけ開く。
//   → つまり「開いた瞬間を狙って撃つ」ゲームになる。
//      当てる腕ではなく、待つ判断を試す相手として作ってある。
//
// 【ファイルを分けた理由】
//   scene.js はすでに大きい。ボスは独立した仕組みなので、
//   まとめて1ファイルに置いたほうが読むときに追いやすい。
//   scene.js の関数(spawnFlash など)はそのまま呼べる ―
//   このゲームは全部のJSが同じ場所を共有しているため。
//
// 【読み込み順】
//   scene.js のあと、main.js より前。index.html を参照。
// ===================================================================


// ===================================================================
// 調整用の数値。触るのはここだけ
//
// ※ 長さの単位は「自機の全長がだいたい3」くらいの世界。
//   戦闘機の全幅が約6なので、全長210のこの艦は戦闘機35機ぶん。
// ===================================================================
const BOSS = {
  NAME: 'DREADNOUGHT',
  NAME_JA: '級 超弩級戦艦',

  // --- 出現 ---------------------------------------------------------
  // true にすると出撃した瞬間から戦艦がいる。
  // false = 戦闘機を SPAWN_KILLS 機落としてから登場(こちらが既定)。
  SPAWN_AT_START: false,

  // 何機落としたら戦艦が出てくるか。
  // ここが「前半:戦闘機との戦い」と「後半:戦艦との一騎討ち」の切れ目になる。
  // どちらの設定でも、開発者コンソールで spawnBoss() と打てばその場で出せる。
  SPAWN_KILLS:   5,

  // true = 戦艦が出たら戦闘機は戦場から引き、以後は補充もされない。
  // 戦艦との1対1にするための設定。
  SOLO_FIGHT: true,
  SPAWN_DIST:  430,     // 出現する距離(自機の正面)
  ARRIVE_SEC:  2.6,     // 出現演出にかける秒数

  // --- 寸法(モデルの実寸。艦首は -Z 向き。戦闘機と同じ向きの決まり)---
  LENGTH: 210,          // 全長
  WIDTH:  130,          // 全幅(最後部)
  HEIGHT:  30,          // 全高(最後部)

  // --- 色 -----------------------------------------------------------
  HULL_COLOR:  0x8f979f,   // 艦体(冷たい灰色。赤青黄の戦闘機と混ざらない色)
  DARK_COLOR:  0x565e66,   // 影の面。2色にすると巨大な形が読み取れる
  EDGE_COLOR:  0xdfe8f0,   // 輪郭線
  TOWER_COLOR: 0x6d757d,   // 艦橋塔
  ENGINE_COLOR:0x7fd8ff,   // エンジンの光(青白)

  // --- 移動 ---------------------------------------------------------
  // ほとんど動かない。ゆっくり自機のほうへ艦首を向けるだけ。
  // 速く動くと「巨大なもの」に見えなくなる ― 大きさは動きの遅さで出る。
  SPEED:        6,      // 前進速度
  TURN_RATE:  0.16,     // 向きを変える速さ(ラジアン/秒)
  KEEP_DIST:  260,      // これより近づかれたら前進をやめる

  // --- 艦首の絞り(形と当たり判定の両方を決める)-----------------------
  // 艦体は楔形。艦首がどれだけ細いかを、この2つで決める。
  //   NOSE_THIN = 艦首の厚み(0.25 = 最後部の1/4)
  //   NOSE_W    = 艦首の幅  (0.06 = 最後部の6%。ごく小さい平らな面)
  //
  // ※ 艦首を「1点」にはしない。理由は見た目ではなく当たり判定にある ―
  //   幅も厚みも0の点に向かって絞ると、その断面の中で
  //   「上端と下端のどのへんか」を割り算で出すときに 0÷0 になる。
  //   ごく小さくても面を残しておけば、その破綻が起きない。
  NOSE_THIN: 0.25,
  NOSE_W:    0.06,

  // --- 弱点(排熱口)-------------------------------------------------
  VENT: {
    COUNT_HP:    5,     // ベント1つを潰すのに必要なダメージ量
    RADIUS:    4.6,     // 光る芯の半径(全長210に対して4.6 = 極小)
    // ダメージが通る半径。光る芯(4.6)より少しだけ甘くしてある。
    HIT_RADIUS:6.2,
    // 排熱口の装置そのものの外径。受け皿と金属の縁を含めた「見えている円」。
    // buildBossVent が縁を RADIUS×1.62 まで描くので、その値と揃えること。
    //
    // ここが要る理由:排熱口は艦体から浮いているので、
    // 縁だけを覆わずにおくと、そこを撃った弾が艦を素通りしてしまう。
    // 芯に当たればダメージ、縁に当たれば弾かれる ― 見えたとおりに当たる。
    RIM_RADIUS: 7.5,
    CYCLE:     7.4,     // 開閉の周期(秒)
    WARN_SEC:  1.0,     // 開く前に光り始める時間(予告)
    OPEN_SEC:  1.7,     // 開いている時間 ← ここが勝負どころ
    // 4つの位置。face = 艦体のどの面か、t = 艦首0.0 〜 艦尾1.0
    // 位置は艦体の傾斜から自動で出すので、艦の寸法を変えても面から浮かない。
    LIST: [
      { key: 'DORSAL',  labelJa: '背部',  face: 'top',    t: 0.80 },
      { key: 'VENTRAL', labelJa: '腹部',  face: 'bottom', t: 0.52 },
      { key: 'PORT',    labelJa: '左舷',  face: 'left',   t: 0.66 },
      { key: 'STARB',   labelJa: '右舷',  face: 'right',  t: 0.66 },
    ],

    // 開いた排熱口は、艦の内側に溜まった熱を宇宙へ捨てている最中 ―
    // この戦場でずばぬけて熱い点になる。だからミサイルはここへ吸い込まれる。
    // 数字は scene.js のシーカーと同じ尺度(フレア1個 = 1050)。
    HEAT: 2400,

    // ミサイルのロックを、開く前の「予告」の段階から許すかどうか。
    // 許さないと、開いている1.7秒のあいだにロック(最大1.55秒)を
    // 満たしてから撃つことになり、事実上ミサイルが使えない。
    // 予告(1.0秒)から数えれば2.7秒 ― 狙う余地が生まれる。
    LOCK_ON_WARN: true,
  },

  // --- 弱点に通るダメージ(武器ごと)------------------------------------
  // 弱点のHPは VENT.COUNT_HP(5)。ここの数字が「何発で1基潰せるか」になる。
  //   機関砲   … 1発1.5(武器表の値がそのまま入る)→ 開いている間に4発
  //   ミサイル … 3.0 → 2発。ただし着弾までに閉じてしまえば装甲に弾かれる
  //   ボム     … 2.5(中心)→ 2発。距離で減るので艦体に押しつけるほど効く
  DAMAGE: {
    MISSILE: 3.0,
    BOMB:    2.5,
    PYRO:    1.0,
  },

  // --- 体当たり ---------------------------------------------------------
  // 全長210・幅130の質量に戦闘機がぶつかれば、結果は1つしかない。
  // 艦体の表面からこれだけ外側でも「接触した」とみなす(自機の当たり半径ぶん)。
  RAM_MARGIN: 2.2,

  // --- 主砲(ターボレーザー)-----------------------------------------
  // 数が多く、重い。まっすぐ来るので避けられるが、当たると痛い。
  TURBO: {
    INTERVAL:   2.3,    // 斉射の間隔(秒)
    BATTERIES:    2,    // 1回の斉射で撃つ砲座の数
    SALVO:        2,    // 1砲座から出る弾数
    GAP:       0.12,    // 同じ砲座の弾どうしの間隔(秒)
    SPEED:      115,    // 弾速。戦闘機の弾(60前後)より速い
    RANGE:      620,    // 射程
    DAMAGE:     1.6,    // 威力(自機の被弾処理に渡す倍率)
    LEAD:      0.85,    // 先読みの強さ(1.0で完全先読み)
    SPREAD:   0.014,    // ばらつき
    COLOR:  0x7dff9b,   // 緑
    TELEGRAPH: 0.45,    // 砲座が光ってから撃つまでの時間(避ける猶予)
  },

  // --- 追尾ミサイル ---------------------------------------------------
  // 自機のフレアで欺ける。既存のシーカーにそのまま乗せてある。
  MISSILE: {
    INTERVAL:  9.0,     // 発射の間隔(秒)
    COUNT:       3,     // 1回に出る本数
    GAP:      0.28,     // 本数どうしの間隔(秒)
    WARN_SEC:  1.2,     // 発射前の警告
    // 寿命(秒)。戦闘機のミサイル(56秒)をそのまま使ってはいけない。
    // 9秒ごとに3発 × 寿命56秒 = 常時18発が空に残る計算になり、
    // 外した弾がいつまでも漂って画面と警報を埋め尽くす。
    // 弾速95・距離260なら3秒弱で届く。12秒あれば一度は回り込める。
    LIFE:       12,
  },

  // --- 艦首主砲(チャージビーム)---------------------------------------
  // いちばん派手で、いちばん危ない。ただし撃つ前に必ず長く光る。
  // 「光ったら横へ抜ける」が正解になるよう、狙いはゆっくりしか追わない。
  BEAM: {
    INTERVAL:  17.0,    // 発射の間隔(秒)
    CHARGE:     2.6,    // ためている時間(この間に逃げる)
    FIRE:       1.5,    // 撃っている時間
    RADIUS:     3.4,    // ビームの太さ(半径)
    TRACK:      0.55,   // 狙いが自機を追う速さ。小さいほど避けやすい
    DPS_TICK:   0.25,   // 何秒ごとにダメージを入れるか
    DAMAGE:     2.2,    // 1回ぶんの威力
    COLOR:  0xff5f4a,   // 赤橙
    CORE_COLOR: 0xfff2d0,   // 芯は白く
  },

  // --- 撃破演出 -------------------------------------------------------
  DEATH: {
    SEC:        5.2,    // 誘爆が続く時間
    POP_GAP:   0.16,    // 誘爆1発ごとの間隔
    ROLL:      0.22,    // 傾いていく速さ
  },
};


// ===================================================================
// 状態。ボスは常に1隻なので、配列ではなく1つの入れ物で持つ
// ===================================================================
let boss = null;          // { group, ... } 出現前は null
let bossState = 'none';   // none / arriving / active / dying / dead
let bossHullMats = [];    // 被弾で白く光らせるために覚えておく材質

// 艦体からはみ出している部分(艦橋塔・探知球・溝の桟・舷側の段)の当たり判定。
// 楔形の艦体だけでは、上に27も伸びている艦橋塔が素通りになってしまう。
// buildBossHull が、見た目を作るのと同時にここへ積んでいく。
let bossParts = [];


// ===================================================================
// 艦体の断面の大きさを返す。
//
// 楔形なので、艦首(t=0)へ行くほど細く薄くなる。
// 弱点の位置も当たり判定も、この1つの関数から出す ―
// 別々に書くと、寸法を変えたときに片方だけズレる。
//   t: 0 = 艦首 / 1 = 艦尾
// ===================================================================
// ※ この関数が返す形が、そのまま艦体のメッシュの形になっている
//   (buildBossHull は、t=0 と t=1 のここの値を頂点に使う)。
//   だから「見えている形」と「当たる形」は、直しようがないほど一致する ―
//   別々に書いていたときは、艦首側で当たり判定が3.75ぶん厚く、
//   何も無い空間で弾が弾かれていた。
function bossCrossSection(t) {
  const wide = BOSS.NOSE_W    + (1 - BOSS.NOSE_W)    * t;
  const thin = BOSS.NOSE_THIN + (1 - BOSS.NOSE_THIN) * t;
  return {
    halfW: (BOSS.WIDTH  / 2) * wide,   // 幅は艦首でごく細い
    halfH: (BOSS.HEIGHT / 2) * thin,   // 厚みは艦首でも少し残す
  };
}

// 断面の上辺は下辺よりこの割合だけ狭い(= 断面が台形になる)。
// 艦体を作るときも、当たり判定も、弱点の取り付け位置も、全部この1つを見る。
const BOSS_TOP_RATIO = 0.72;

// t(0〜1)を、モデルのZ座標に直す。艦首が -Z
function bossZAt(t) {
  return -BOSS.LENGTH / 2 + BOSS.LENGTH * t;
}


// ===================================================================
// 艦体を作る
//
// 面の数はできるだけ少なく。単色の面 + 輪郭線という、
// このゲームの見た目の決まりに合わせる(初代スターフォックス調)。
// ===================================================================
function buildBossHull() {
  const g = new THREE.Group();

  // 当たり判定の部品リスト。見た目を作るのと同じ場所・同じ数字から登録していく。
  // 「作る場所」と「当たる場所」を別々に書くと、片方だけ直したときに必ずズレる ―
  // 実際、艦橋塔は見た目だけ作られていて当たり判定が無く、
  // 撃っても弾がすり抜けていた。
  bossParts = [];

  const halfL = BOSS.LENGTH / 2;
  const nose  = bossCrossSection(0);
  const rear  = bossCrossSection(1);
  const noseTopW = nose.halfW * BOSS_TOP_RATIO;
  const rearTopW = rear.halfW * BOSS_TOP_RATIO;

  // 8つの頂点で楔を作る。艦首も「ごく小さい台形の面」にしてある ―
  // 断面の関数(bossCrossSection)が返す形をそのまま頂点にしているので、
  // 当たり判定はこの形と完全に一致する。
  //   0〜3: 艦首(左下・右下・左上・右上)
  //   4〜7: 艦尾(同じ順)
  const v = [
    -nose.halfW, -nose.halfH, -halfL,   // 0 艦首 左下
     nose.halfW, -nose.halfH, -halfL,   // 1 艦首 右下
    -noseTopW,    nose.halfH, -halfL,   // 2 艦首 左上
     noseTopW,    nose.halfH, -halfL,   // 3 艦首 右上
    -rear.halfW, -rear.halfH,  halfL,   // 4 艦尾 左下
     rear.halfW, -rear.halfH,  halfL,   // 5 艦尾 右下
    -rearTopW,    rear.halfH,  halfL,   // 6 艦尾 左上
     rearTopW,    rear.halfH,  halfL,   // 7 艦尾 右上
  ];
  // 三角形の並び。表から見て反時計回りになる順に書く(これを間違えると裏返る)
  const idx = [
    0, 5, 4,  0, 1, 5,   // 下面
    2, 6, 7,  2, 7, 3,   // 上面
    0, 4, 6,  0, 6, 2,   // 左舷
    1, 3, 7,  1, 7, 5,   // 右舷
    4, 5, 7,  4, 7, 6,   // 艦尾
    0, 2, 3,  0, 3, 1,   // 艦首
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    color: BOSS.HULL_COLOR, flatShading: true,
  });
  const hull = new THREE.Mesh(geo, mat);
  g.add(hull);
  bossHullMats.push(mat);

  // 輪郭線。巨大な単色の塊は、線が無いと形が読み取れない
  g.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: BOSS.EDGE_COLOR })
  ));

  // --- 上面の溝(縦に走る細い箱を数本)-------------------------------
  // 平らな面がそのままだと「大きさ」が伝わらない。
  // 細かい凹凸を置くと、目が比較する物差しを得て、急に巨大に見える。
  const trenchMat = new THREE.MeshLambertMaterial({
    color: BOSS.DARK_COLOR, flatShading: true,
  });
  bossHullMats.push(trenchMat);
  for (let i = 0; i < 7; i++) {
    const t = 0.30 + i * 0.095;
    const cs = bossCrossSection(t);
    const w = cs.halfW * BOSS_TOP_RATIO * 1.5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, 3.2), trenchMat);
    bar.position.set(0, cs.halfH + 0.4, bossZAt(t));
    g.add(bar);
    addBossPart(bar, w, 1.6, 3.2);
  }
  // 左右の舷側にも段を付ける
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = 0.40 + i * 0.12;
      const cs = bossCrossSection(t);
      const blk = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 9), trenchMat);
      blk.position.set(side * (cs.halfW * BOSS_TOP_RATIO), 0, bossZAt(t));
      g.add(blk);
      addBossPart(blk, 3.0, 2.2, 9);
    }
  }

  // --- 艦橋塔(後部のいちばん高いところ)------------------------------
  const towerMat = new THREE.MeshLambertMaterial({
    color: BOSS.TOWER_COLOR, flatShading: true,
  });
  bossHullMats.push(towerMat);
  const towerZ = bossZAt(0.90);
  const baseCs = bossCrossSection(0.90);

  // 台形の基部 → 司令ブロック → 左右の探知球、の3段構え
  const base = new THREE.Mesh(new THREE.BoxGeometry(34, 13, 30), towerMat);
  base.position.set(0, baseCs.halfH + 6.5, towerZ);
  // 輪郭線は「その形の子」として足す。親が動けば線も一緒に動くので、
  // 位置を2か所に書かずに済む(書くとかならず片方がズレる)。
  base.add(new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry),
    new THREE.LineBasicMaterial({ color: BOSS.EDGE_COLOR })));
  g.add(base);
  addBossPart(base, 34, 13, 30);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 18), towerMat);
  bridge.position.set(0, base.position.y + 10.5, towerZ);
  g.add(bridge);
  addBossPart(bridge, 22, 8, 18);

  // 基部と司令室のあいだは、外からは1本の塔に見える。
  // 見た目は空いていても、そこを弾がすり抜けたら嘘になるので、
  // 判定だけは細い柱でつないでおく。
  bossParts.push({
    kind: 'box',
    c: new THREE.Vector3(0, (base.position.y + bridge.position.y) / 2, towerZ),
    half: new THREE.Vector3(9, (bridge.position.y - base.position.y) / 2, 8),
  });

  // 探知球。艦橋の左右に1つずつ。低ポリの球(面が少ないほうがこの絵に合う)
  const domeMat = new THREE.MeshLambertMaterial({
    color: BOSS.DARK_COLOR, flatShading: true,
  });
  bossHullMats.push(domeMat);
  for (const side of [-1, 1]) {
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(4.4, 0), domeMat);
    dome.position.set(side * 13, bridge.position.y + 6.5, towerZ);
    g.add(dome);
    // 球は箱ではなく球で判定する。箱で包むと、角の何も無いところで弾かれる
    bossParts.push({ kind: 'sphere', c: dome.position.clone(), r: 4.4 });
  }

  // --- 主機(艦尾のエンジン)-------------------------------------------
  // 大3・小2。加算合成で光らせる。
  const engMat = new THREE.MeshBasicMaterial({
    color: BOSS.ENGINE_COLOR, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const engines = [];
  const engY = -rear.halfH * 0.15;
  for (const spec of [
    { x: -26, r: 11 }, { x: 0, r: 13 }, { x: 26, r: 11 },
    { x: -46, r: 6 },  { x: 46, r: 6 },
  ]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(spec.r, 12), engMat.clone());
    disc.position.set(spec.x, engY, halfL + 0.6);
    g.add(disc);
    engines.push(disc);
    // 縁のリング(光の輪郭)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spec.r, spec.r + 1.2, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.position.copy(disc.position);
    g.add(ring);
  }

  return { group: g, engines: engines, parts: bossParts, radius: bossBoundRadius() };
}

// ===================================================================
// 艦全体を包む球の半径
//
// 当たり判定は毎コマ何十回も呼ばれるので、まず「艦の中心からこれより
// 遠ければ細かい判定はしない」で足切りする。その「これ」がこの半径。
//
// ここを目分量で決めてはいけない。全長の半分(105)を使っていたが、
// 艦尾の下辺の角は中心から124.4 ― 差の19.4ぶん、艦体の角が素通りしていた。
// 頂点と部品から実際に測って出す。
// ===================================================================
function bossBoundRadius() {
  const rear = bossCrossSection(1);
  // いちばん遠いのは艦尾の下辺の角
  let r = Math.sqrt(rear.halfW * rear.halfW + rear.halfH * rear.halfH +
                    (BOSS.LENGTH / 2) * (BOSS.LENGTH / 2));
  for (const p of bossParts) {
    // 部品の中心までの距離 + その部品自身の広がり(箱なら対角線の半分)
    const reach = (p.kind === 'sphere') ? p.r : p.half.length();
    r = Math.max(r, p.c.length() + reach);
  }
  return r;
}

// 作ったばかりの箱を、そのまま当たり判定の部品として登録する。
// 位置は mesh.position をそのまま使うので、見た目と1ミリもズレようがない。
function addBossPart(mesh, w, h, d) {
  bossParts.push({
    kind: 'box',
    c: mesh.position.clone(),
    half: new THREE.Vector3(w / 2, h / 2, d / 2),
  });
}


// ===================================================================
// 弱点(排熱口)を1つ作る
//
// 見た目は3枚重ね:
//   1. 暗い受け皿 … 閉じているときの「ただの穴」
//   2. 光る芯     … 開いたときだけ明るくなる
//   3. ぼんやりした光 … 遠くからでも位置が分かるように
// ===================================================================
function buildBossVent(spec) {
  const cs = bossCrossSection(spec.t);
  const z  = bossZAt(spec.t);

  // 面ごとに「置く場所」と「どちらを向くか」を決める。
  //
  // ※ 舷側が要注意。断面は台形(下辺 halfW、上辺 halfW×0.72)なので、
  //   舷側の面は垂直ではなく内側へ傾いている。
  //   上辺の位置に置くと弱点が艦体に埋まって見えなくなるので、
  //   高さ0での実際の面(halfW と上辺の中間)を基準にし、
  //   さらに傾きぶん(最大3ほど)の余裕を足して外へ出す。
  let pos, rot;
  const topW  = cs.halfW * 0.72;
  const sideX = (cs.halfW + topW) / 2;   // 高さ0での舷側の面
  if (spec.face === 'top') {
    // 上面には溝の桟(高さ1.6)が並んでいる。そこへめり込まないよう少し浮かせる
    pos = new THREE.Vector3(0, cs.halfH + 1.8, z);
    rot = new THREE.Euler(-Math.PI / 2, 0, 0);
  } else if (spec.face === 'bottom') {
    pos = new THREE.Vector3(0, -cs.halfH - 1.6, z);
    rot = new THREE.Euler(Math.PI / 2, 0, 0);
  } else if (spec.face === 'left') {
    pos = new THREE.Vector3(-sideX - 5.0, 0, z);
    rot = new THREE.Euler(0, -Math.PI / 2, 0);
  } else {
    pos = new THREE.Vector3(sideX + 5.0, 0, z);
    rot = new THREE.Euler(0, Math.PI / 2, 0);
  }

  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.copy(rot);
  // 艦から見た位置と向きを行列にしておく。
  // 排熱口は「艦の表面に貼った平らな円板」なので、当たり判定も円板で行う。
  // そのために、点を「排熱口から見た座標」へ引き戻す道具(逆行列)が要る。
  // 艦体に対して動かないので、ここで1回作れば以後ずっと使える。
  g.updateMatrix();

  const R = BOSS.VENT.RADIUS;

  // 1. 受け皿(閉じている状態の見た目)
  const dishMat = new THREE.MeshBasicMaterial({ color: 0x20262c });
  const dish = new THREE.Mesh(new THREE.CircleGeometry(R * 1.35, 10), dishMat);
  g.add(dish);
  // 縁の金属リング
  const rimMat = new THREE.MeshBasicMaterial({ color: 0x9aa6b0 });
  const rim = new THREE.Mesh(new THREE.RingGeometry(R * 1.35, R * 1.62, 10), rimMat);
  rim.position.z = 0.05;
  g.add(rim);

  // 2. 光る芯。開いているときだけ明るい
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x203040, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const core = new THREE.Mesh(new THREE.CircleGeometry(R, 10), coreMat);
  core.position.z = 0.12;
  g.add(core);

  // 3. ぼんやりした光。scene.js のフレア用テクスチャを借りる
  if (!flareGlowTex) flareGlowTex = makeFlareGlowTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareGlowTex, color: 0x8ff0ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(R * 5);
  halo.position.z = 0.4;
  g.add(halo);

  const vent = {
    key: spec.key,
    labelJa: spec.labelJa,
    group: g,
    coreMat: coreMat,
    rimMat: rimMat,
    dishMat: dishMat,
    halo: halo,
    hp: BOSS.VENT.COUNT_HP,
    alive: true,
    phase: 0,        // 開閉の位相(秒)。出現時にずらす
    open: false,
    warn: false,     // 開く直前(予告中)か
    fireLeft: 0,     // 破壊後に吹き出す炎の残り時間

    // 世界座標の目印。
    // 上の group は艦体の子なので、group.position は「艦から見た位置」―
    // 照準もシーカーも世界座標で物を見るので、そのままでは使えない。
    // 毎コマ世界座標を書き写す入れ物を1つ持たせておく。
    mark: new THREE.Object3D(),
    prevMark: new THREE.Vector3(),   // 1コマ前の位置(速度を測るのに使う)
    hasPrev: false,

    // 「艦から見た座標」→「排熱口から見た座標」に直す行列。
    // 排熱口から見ると、円板は必ず XY 平面に寝ていて、法線は Z ―
    // だから半径は √(x²+y²)、面からの浮きは |z| で読める。
    toDisc: new THREE.Matrix4().copy(g.matrix).invert(),
  };

  // --- ミサイルのロック対象 -------------------------------------------
  // scene.js の照準は「敵機の配列」を見て回る作りになっている。
  // 排熱口をそこへ混ぜられるよう、敵機と同じ形をした最小限の入れ物を作る。
  //   alive … 開いている(または予告中の)あいだだけ true
  //   group … 世界座標を持つ目印
  //   vel/acc … 偏差照準が読む。排熱口は艦と一緒に動くだけなので0でよい
  vent.target = {
    isBossVent: true,
    vent: vent,
    group: vent.mark,
    alive: false,
    heat: 0,                       // シーカーが見る熱量。開いている間だけ入る
    vel: new THREE.Vector3(),
    acc: new THREE.Vector3(),
  };

  return vent;
}


// ===================================================================
// ボスを出現させる
// ===================================================================
function spawnBoss() {
  if (!sceneReady || boss) return;

  bossHullMats = [];
  const built = buildBossHull();
  const group = built.group;

  // 自機の正面、遠くに置く。艦首(-Z)を自機のほうへ向ける。
  //
  // ※ ここで group.lookAt() を使ってはいけない。
  //   three.js の Object3D.lookAt は、カメラと光源以外では内部で引数を入れ替える
  //   (Matrix4.lookAt(目標, 位置) の順で呼ぶ)ので、素の Matrix4.lookAt とは
  //   向きがちょうど逆になる ― つまり +Z が相手を向く。
  //   このゲームは機首を -Z と決めているので、それでは真後ろを向いて出てくる。
  //   実際そうなっていて、戦艦は後ろ向きに現れ、登場演出で自機から遠ざかり、
  //   そのあと20秒近くかけてその場で回頭していた。
  //   敵機(updateEnemyAI)と同じ Matrix4.lookAt(位置, 目標) に揃える。
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
  group.position.copy(playerShip.position).addScaledVector(forward, BOSS.SPAWN_DIST);
  group.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(
    group.position, playerShip.position, new THREE.Vector3(0, 1, 0)));

  // 弱点を4つ取り付ける
  const vents = [];
  BOSS.VENT.LIST.forEach((spec, i) => {
    const vent = buildBossVent(spec);
    // 4つが同時に開くと的が大きくなりすぎる。周期の1/4ずつずらす
    vent.phase = (BOSS.VENT.CYCLE / BOSS.VENT.LIST.length) * i;
    group.add(vent.group);
    vents.push(vent);
  });

  // 艦を包む球に、排熱口のぶんも入れておく。
  // 弱点は艦体から外へ突き出しているので、艦体だけで測った半径だと
  // 足切りで弾かれて「弱点に当たらない」ことが起こりうる。
  let radius = built.radius;
  for (const v of vents) {
    radius = Math.max(radius, v.group.position.length() + BOSS.VENT.RIM_RADIUS);
  }

  // 艦首の主砲。ためている間ここが光り、ビームもここから出る
  if (!flareGlowTex) flareGlowTex = makeFlareGlowTexture();
  const chargeGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flareGlowTex, color: BOSS.BEAM.COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  chargeGlow.position.set(0, 0, -BOSS.LENGTH / 2 - 2);
  group.add(chargeGlow);

  scene.add(group);

  boss = {
    group: group,
    engines: built.engines,
    vents: vents,
    chargeGlow: chargeGlow,
    // 艦全体を包む球の半径。当たり判定の足切りに使う(実測値。目分量ではない)
    radius: radius,

    // 「世界の座標」を「艦から見た座標」に直す行列。毎コマ1回だけ作り直す。
    //
    // 当たり判定は弾1発ごとに座標を直す必要があるが、
    // そのたびに艦じゅうの行列を作り直していた(艦は50個以上の部品でできている)。
    // 弾が40発あれば40回 ― 1コマの4%を、同じ計算のくり返しに使っていた。
    // 艦は1コマに1度しか動かないのだから、直す道具も1度作れば足りる。
    invMatrix: new THREE.Matrix4(),

    arriveLeft: BOSS.ARRIVE_SEC,
    hitFlash: 0,

    // 武装のタイマー
    turboCool:   BOSS.TURBO.INTERVAL * 0.7,
    turboQueue:  [],    // 予告済みで、これから出る弾
    missileCool: BOSS.MISSILE.INTERVAL,
    missileQueue: 0,
    missileGap:  0,
    beamCool:    BOSS.BEAM.INTERVAL,
    beamState:   'idle',   // idle / charge / fire
    beamLeft:    0,
    beamAim:     new THREE.Vector3(),
    beamTick:    0,     // 発射中、次にダメージを見るまでの残り時間
    beamMesh:    null,
    beamCoreMesh:null,

    // 撃破演出
    deathLeft: 0,
    popLeft:   0,
  };

  bossState = 'arriving';
  bossRefreshMatrix();   // 出現した直後から当たり判定が効くようにしておく

  // 出現の演出:大きな閃光と、ふくらむ輪
  spawnFlash(group.position, 120, 0xffffff, 0.5);
  spawnBlast(group.position, 70, 0x9fd8ff);
  startShake(1.4);

  // 戦闘機には退いてもらう。ここからは1対1。
  const left = BOSS.SOLO_FIGHT ? withdrawEnemies() : 0;

  onBossArrive(left);   // main.js:ログ・音声・HUDの表示
}

// ボスが戦場にいるか。戦闘機の補充を止める判断に使う
function bossOnField() {
  return !!boss && (bossState === 'arriving' || bossState === 'active' || bossState === 'dying');
}


// ===================================================================
// ボスを消す(ミッションのやり直し・メニューへ戻るとき)
// ===================================================================
function resetBoss() {
  if (boss) {
    clearBossLocks();   // 消える艦をロックしたままにしない
    if (boss.beamMesh) scene.remove(boss.beamMesh);
    if (boss.beamCoreMesh) scene.remove(boss.beamCoreMesh);
    scene.remove(boss.group);
  }
  boss = null;
  bossState = 'none';
  bossHullMats = [];
  onBossGone();   // main.js:HUDを隠す
}

// ボスがいて、まだ戦える状態か
function bossIsActive() {
  return !!boss && bossState === 'active';
}

// メニューの背景では出さない
function setBossHidden(hidden) {
  if (boss) boss.group.visible = !hidden;
}


// ===================================================================
// 毎コマの更新。scene.js の updateScene から呼ばれる
// ===================================================================
function updateBoss(dt) {
  if (!boss) return;

  // エンジンの明滅は、止まっていても続ける(生きている艦に見せるため)
  const pulse = 0.75 + Math.sin(performance.now() / 260) * 0.2;
  for (const e of boss.engines) e.material.opacity = pulse;

  // 被弾の白い光は常に減らす
  if (boss.hitFlash > 0) {
    boss.hitFlash -= dt;
    const k = Math.max(boss.hitFlash / 0.14, 0);
    // emissive(自分で光る色)を持つのは Lambert 系だけ。持たない材質は飛ばす
    for (const m of bossHullMats) {
      if (m.emissive) m.emissive.setScalar(k * 0.7);
    }
  }

  if (bossState === 'arriving') {
    boss.arriveLeft -= dt;
    // 出現中は艦体をだんだん実体化させる…のではなく、
    // 「遠くから減速して滑り込んでくる」ほうが質量を感じる。
    const k = 1 - Math.max(boss.arriveLeft / BOSS.ARRIVE_SEC, 0);
    boss.group.position.addScaledVector(
      new THREE.Vector3(0, 0, 1).applyQuaternion(boss.group.quaternion),
      -(1 - k) * 120 * dt
    );
    if (boss.arriveLeft <= 0) bossState = 'active';
    bossRefreshMatrix();   // 滑り込み中でも体当たり判定は効かせる
    return;
  }

  if (bossState === 'dying') {
    updateBossDeath(dt);
    bossRefreshMatrix();
    return;
  }

  if (bossState !== 'active') return;
  if (typeof combatFrozen !== 'undefined' && combatFrozen) return;

  updateBossMove(dt);

  // 動かしたら、行列(位置と向きの計算結果)をすぐ作り直しておく。
  // localToWorld / worldToLocal はこの行列を見るので、更新しないと
  // 砲の発射位置も弱点の当たり判定も1コマぶん古い場所を指す。
  bossRefreshMatrix();

  updateBossVents(dt);
  updateBossTurbo(dt);
  updateBossMissiles(dt);
  updateBossBeam(dt);
}


// ===================================================================
// 艦の位置と向きの計算結果を作り直す ― 1コマに1回だけ
//
// updateMatrixWorld は艦じゅうの部品(50個以上)をたどり直す重い処理。
// 艦が動くのは1コマに1度だけなので、ここで1回やれば足りる。
// 当たり判定はここで作った invMatrix を使い回すだけにしてある。
// ===================================================================
function bossRefreshMatrix() {
  boss.group.updateMatrixWorld(true);
  // 逆行列 = 「世界の座標」を「艦から見た座標」へ引き戻す道具
  boss.invMatrix.copy(boss.group.matrixWorld).invert();
}

// 世界座標の点を、艦から見た座標に直して返す。
// 返るのは使い回しの入れ物なので、値が要るなら呼び出し側で写すこと。
const _bossLocal = new THREE.Vector3();

function bossToLocal(point) {
  return _bossLocal.copy(point).applyMatrix4(boss.invMatrix);
}


// ===================================================================
// 移動:ゆっくり自機へ艦首を向け、遠ければ前進する
// ===================================================================
function updateBossMove(dt) {
  const toPlayer = playerShip.position.clone().sub(boss.group.position);
  const dist = toPlayer.length();

  // 向けたい向きを作り、そこへ少しずつ近づける。
  // 一気に向けると、巨大な艦がその場でくるりと回って軽く見える。
  const want = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(boss.group.position, playerShip.position, new THREE.Vector3(0, 1, 0))
  );
  boss.group.quaternion.rotateTowards(want, BOSS.TURN_RATE * dt);

  if (dist > BOSS.KEEP_DIST) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(boss.group.quaternion);
    boss.group.position.addScaledVector(fwd, BOSS.SPEED * dt);
  }
}


// ===================================================================
// 弱点の開閉
//
// 1周期のなかで
//   [ずっと閉じている] → [予告で光る] → [開く] → 閉じる
// をくり返す。開いている間だけダメージが通る。
// ===================================================================
const _ventVel = new THREE.Vector3();   // 速度の計算に使い回す入れ物

function updateBossVents(dt) {
  const C = BOSS.VENT;

  for (const vent of boss.vents) {
    // 世界座標の目印を毎コマ更新する。
    // 照準・シーカー・爆風の判定は、すべてこの1点を見る。
    vent.group.getWorldPosition(vent.mark.position);

    // 動いた量から速度を出す。艦がゆっくりでも、舷側の排熱口は
    // 艦が向きを変えるだけで大きく振られる ―
    // 偏差照準(先読みの印)がこれを読むので、測っておかないと印がずれる。
    //
    // 1コマぶんの差をそのまま使うと細かく震えて印が落ち着かないので、
    // 敵機の速度測定と同じように、前の値へ少しずつ寄せる(なまし)。
    if (vent.hasPrev && dt > 1e-4) {
      _ventVel.subVectors(vent.mark.position, vent.prevMark).divideScalar(dt);
      vent.target.vel.lerp(_ventVel, 1 - Math.exp(-dt / 0.12));
    }
    vent.prevMark.copy(vent.mark.position);
    vent.hasPrev = true;

    if (!vent.alive) {
      // 潰したあとは、焼け跡から炎が吹き出し続ける
      vent.fireLeft -= dt;
      if (vent.fireLeft <= 0) {
        vent.fireLeft = 0.28;
        const p = vent.mark.position;
        spawnFlash(p, 7 + Math.random() * 5, 0xff9040, 0.3);
        spawnDebris(p, 2, 0.4, 9, 0xffb060, true);
      }
      continue;
    }

    vent.phase = (vent.phase + dt) % C.CYCLE;

    // 周期の後ろのほうに「予告 → 開放」を置く
    const openStart = C.CYCLE - C.OPEN_SEC;
    const warnStart = openStart - C.WARN_SEC;

    if (vent.phase >= openStart) {
      // --- 開いている ---
      // 閉→開に変わった最初のコマだけ知らせる。毎コマ呼ぶと音が鳴り続ける
      if (!vent.open) onBossVentOpen(vent);
      vent.open = true;
      vent.warn = false;
      // 開いた直後がいちばん明るく、閉じぎわに少し落ちる
      const k = 1 - (vent.phase - openStart) / C.OPEN_SEC;
      const flick = 0.82 + Math.sin(performance.now() / 40) * 0.18;
      vent.coreMat.color.setHex(0x9ff6ff);
      vent.coreMat.opacity = (0.55 + 0.45 * k) * flick;
      vent.rimMat.color.setHex(0xd8fbff);
      vent.halo.material.opacity = 0.75 * (0.4 + 0.6 * k) * flick;
      vent.halo.scale.setScalar(C.RADIUS * (7 + 2 * k));
    } else if (vent.phase >= warnStart) {
      // --- 予告(開く直前)---
      // だんだん速く点滅させる。「そろそろ来る」が音無しで伝わる
      vent.open = false;
      vent.warn = true;
      const k = (vent.phase - warnStart) / C.WARN_SEC;
      const blink = 0.5 + 0.5 * Math.sin(k * k * 46);
      vent.coreMat.color.setHex(0xffa53c);
      vent.coreMat.opacity = 0.25 + 0.5 * blink * k;
      vent.rimMat.color.setHex(0xffc06a);
      vent.halo.material.opacity = 0.3 * blink * k;
      vent.halo.scale.setScalar(C.RADIUS * 4.5);
    } else {
      // --- 閉じている ---
      vent.open = false;
      vent.warn = false;
      vent.coreMat.color.setHex(0x203040);
      vent.coreMat.opacity = 0.5;
      vent.rimMat.color.setHex(0x9aa6b0);
      vent.halo.material.opacity = 0;
    }

    // --- ロック対象としての状態を更新する ---
    // 開いている(設定によっては予告中も)あいだだけ、
    // ミサイルの照準はこの排熱口を捉えられる。
    const lockable = vent.open || (BOSS.VENT.LOCK_ON_WARN && vent.warn);
    vent.target.alive = lockable;
    // シーカーが見る熱量。開いてからが本番なので、予告中は控えめにしておく
    vent.target.heat = vent.open ? BOSS.VENT.HEAT : (lockable ? BOSS.VENT.HEAT * 0.25 : 0);
  }
}


// ===================================================================
// ミサイルの照準が捉えられる的の一覧(scene.js の updateAim が使う)
//
// 敵機の配列に混ぜて回してもらうので、返すのは敵機と同じ形の入れ物。
// ボスがいない・開いている排熱口が無いときは空の配列。
// ===================================================================
const _noBossTargets = [];

function bossLockTargets() {
  if (!boss || bossState !== 'active') return _noBossTargets;
  const list = [];
  for (const v of boss.vents) if (v.alive && v.target.alive) list.push(v.target);
  return list;
}

// シーカー(ミサイルの目)から見た熱源の一覧。
// 開いている排熱口だけを、けた違いに熱い点として差し出す。
function bossHeatSources() {
  if (!boss || bossState !== 'active') return _noBossTargets;
  const list = [];
  for (const v of boss.vents) {
    if (!v.alive || !v.open) continue;
    list.push({ pos: v.mark.position, heat: BOSS.VENT.HEAT, target: v.target });
  }
  return list;
}

// ロックを全部落とす(艦を消すとき・沈み始めたとき)。
// これを忘れると、もう無い排熱口をロックしたままの表示が残る。
function clearBossLocks() {
  if (!boss) return;
  for (const v of boss.vents) { v.target.alive = false; v.target.heat = 0; }
}


// ===================================================================
// レーダーに映すための情報(main.js の renderRadar が使う)
//
// 戦艦は enemies の配列に入っていないので、戦闘機用の getContacts では
// いつまでも映らない ― 画面いっぱいに見えているのにレーダーは空、という
// 状態になっていた。ここで戦艦のぶんだけ別に作って渡す。
//
// 【索敵半径に縛らない理由】
// 戦闘機は「冷えていれば見つからない」が成立する。全長3の機体だから。
// 全長210・主機5基を焚いている艦にそれは通らない ―
// 目で見えているものがレーダーに無いほうが、よほど嘘になる。
// 圏外なら輝点はスコープの縁に貼り付く(placeBlip が丸めてくれる)ので、
// 「遠くにいる」ことは距離の数字と縁の位置で伝わる。
//
// 戻り値は getContacts の1件ぶんと同じ形。main.js は同じ描画処理を使える。
// 出ていなければ null。
// ===================================================================
const _contactInv  = new THREE.Quaternion();   // 使い回し(毎コマ2回呼ばれる)
const _contactTo   = new THREE.Vector3();
const _contactNdc  = new THREE.Vector3();
const _contactView = new THREE.Vector3();   // 前後の判定用。ndc と兼用しないこと

function bossContact() {
  if (!boss || !bossOnField() || !boss.group.visible) return null;

  // 自機の向きの「逆回転」。これを掛けると世界の座標が
  // 「自機から見た前後左右」になる(機首が常に上のレーダーの要)
  _contactInv.copy(playerShip.quaternion).invert();

  _contactTo.subVectors(boss.group.position, playerShip.position);
  const dist = _contactTo.length();
  const local = _contactTo.applyQuaternion(_contactInv);

  const ndc = _contactNdc.copy(boss.group.position).project(camera);
  const inFront = camera.worldToLocal(_contactView.copy(boss.group.position)).z < 0;

  return {
    localX: local.x,
    localY: local.y,
    localZ: local.z,
    dist: dist,
    // 主砲をためている間は「熱い」扱いにする。輝点の色が変わるので、
    // レーダーを見ているだけでも「今チャージしている」が分かる。
    hot: (boss.beamState === 'charge' || boss.beamState === 'fire'),
    ndcX: ndc.x,
    ndcY: ndc.y,
    inFront: inFront,
    // 残っている排熱口の数。マーカーに出す
    ventsLeft: bossVentsLeft(),
  };
}


// ===================================================================
// ターボレーザー:舷側の砲座から重い弾を撃つ
//
// 光ってから撃つ(TELEGRAPH)。光った瞬間に進路を変えれば当たらない。
// ===================================================================
function updateBossTurbo(dt) {
  // 予告済みの弾を、時間が来たものから撃つ
  for (let i = boss.turboQueue.length - 1; i >= 0; i--) {
    const q = boss.turboQueue[i];
    q.left -= dt;
    if (q.left <= 0) {
      fireBossTurbolaser(q.origin);
      boss.turboQueue.splice(i, 1);
    }
  }

  boss.turboCool -= dt;
  if (boss.turboCool > 0) return;
  boss.turboCool = BOSS.TURBO.INTERVAL;

  // 砲座の位置を選ぶ。舷側に沿って並んでいる想定
  for (let b = 0; b < BOSS.TURBO.BATTERIES; b++) {
    const t = 0.35 + Math.random() * 0.55;
    const cs = bossCrossSection(t);
    const side = Math.random() < 0.5 ? -1 : 1;
    const local = new THREE.Vector3(side * cs.halfW * 0.7, cs.halfH * 0.4, bossZAt(t));

    // 発射の合図。砲座の位置に小さく光を出す
    const world = boss.group.localToWorld(local.clone());
    spawnFlash(world, 5, 0xbdffcf, BOSS.TURBO.TELEGRAPH);

    for (let s = 0; s < BOSS.TURBO.SALVO; s++) {
      boss.turboQueue.push({
        origin: local.clone(),
        left: BOSS.TURBO.TELEGRAPH + s * BOSS.TURBO.GAP,
      });
    }
  }
}

// ターボレーザーを1発撃つ。既存の「敵の弾」の仕組みにそのまま乗せる
function fireBossTurbolaser(localOrigin) {
  if (!boss) return;

  const from = boss.group.localToWorld(localOrigin.clone());

  // 自機が着くころにいる場所へ向ける(先読み)
  const aim = predictedPlayerPoint(from, BOSS.TURBO.SPEED, BOSS.TURBO.LEAD);
  const dir = aim.sub(from).normalize();
  dir.x += (Math.random() - 0.5) * BOSS.TURBO.SPREAD;
  dir.y += (Math.random() - 0.5) * BOSS.TURBO.SPREAD;
  dir.z += (Math.random() - 0.5) * BOSS.TURBO.SPREAD;
  dir.normalize();

  // 戦闘機の弾より太く長い。見ただけで「重い」と分かる大きさにする
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.55, 7),
    new THREE.MeshBasicMaterial({ color: BOSS.TURBO.COLOR })
  );
  mesh.position.copy(from);
  mesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), new THREE.Vector3(0, 1, 0))
  );
  scene.add(mesh);

  // 発射炎
  spawnFlash(from, 9, BOSS.TURBO.COLOR, 0.13);

  enemyVolleyCounter += 1;
  enemyBolts.push({
    mesh: mesh,
    direction: dir,
    life: BOSS.TURBO.RANGE / BOSS.TURBO.SPEED,
    speed: BOSS.TURBO.SPEED,
    damageMult: BOSS.TURBO.DAMAGE,
    volleyId: enemyVolleyCounter,   // 1発ごとに別番号 = 1発ごとに効く
  });
}


// ===================================================================
// 追尾ミサイル:既存のシーカーに乗せる = 自機のフレアで欺ける
// ===================================================================
function updateBossMissiles(dt) {
  // 予告してから順に出す
  if (boss.missileQueue > 0) {
    boss.missileGap -= dt;
    if (boss.missileGap <= 0) {
      boss.missileGap = BOSS.MISSILE.GAP;
      boss.missileQueue -= 1;
      fireBossMissile();
    }
    return;
  }

  boss.missileCool -= dt;
  if (boss.missileCool > 0) return;
  boss.missileCool = BOSS.MISSILE.INTERVAL;
  boss.missileQueue = BOSS.MISSILE.COUNT;
  boss.missileGap   = BOSS.MISSILE.WARN_SEC;
  onBossMissileWarn();   // main.js:警告ログと音声
}

function fireBossMissile() {
  if (!boss) return;
  if (!enemyMissileTemplate) enemyMissileTemplate = createMissileMesh(0xff5a3c);

  const mesh = enemyMissileTemplate.clone();
  // 発射管は艦の下面。左右にばらして出す
  const local = new THREE.Vector3((Math.random() - 0.5) * 60, -bossCrossSection(0.6).halfH - 2, bossZAt(0.55));
  mesh.position.copy(boss.group.localToWorld(local));

  const dir = playerShip.position.clone().sub(mesh.position).normalize();
  scene.add(mesh);
  spawnFlash(mesh.position, 7, 0xffb060, 0.2);

  missiles.push({
    mesh: mesh,
    direction: dir,
    target: null,
    fromEnemy: true,   // 自機を狙う = 既存のシーカーがそのまま働く
    owner: null,       // 撃った戦闘機はいない。null でも判定は素通りする
    life: BOSS.MISSILE.LIFE,   // 戦闘機のミサイルより短い(上の説明を参照)
  });
}


// ===================================================================
// 艦首主砲(チャージビーム)
//
//   idle  → ためる(charge) → 撃つ(fire) → idle
//
// ためている間は艦首が大きく光る。
// 狙いは TRACK の速さでしか追わないので、横へ抜ければ振り切れる。
// ===================================================================
function updateBossBeam(dt) {
  const B = BOSS.BEAM;

  if (boss.beamState === 'idle') {
    boss.beamCool -= dt;
    if (boss.beamCool <= 0) {
      boss.beamState = 'charge';
      boss.beamLeft  = B.CHARGE;
      boss.beamAim.copy(playerShip.position);
      onBossBeamCharge();   // main.js:警告
    }
    return;
  }

  // 狙いを自機へ、ゆっくり寄せる
  boss.beamAim.lerp(playerShip.position, Math.min(B.TRACK * dt, 1));

  if (boss.beamState === 'charge') {
    boss.beamLeft -= dt;
    // ためている光。だんだん大きく、細かく震える
    const k = 1 - Math.max(boss.beamLeft / B.CHARGE, 0);
    const jitter = 0.9 + Math.random() * 0.2;
    boss.chargeGlow.material.opacity = 0.35 + 0.65 * k;
    boss.chargeGlow.scale.setScalar((14 + 46 * k * k) * jitter);

    if (boss.beamLeft <= 0) {
      boss.beamState = 'fire';
      boss.beamLeft  = B.FIRE;
      boss.beamTick  = 0;
      spawnFlash(bossNosePoint(), 70, B.CORE_COLOR, 0.3);
      startShake(1.1);
      onBossBeamFire();
    }
    return;
  }

  // --- 発射中 -------------------------------------------------------
  boss.beamLeft -= dt;
  const nose = bossNosePoint();
  const dir  = boss.beamAim.clone().sub(nose);
  const len  = Math.max(dir.length(), 1);
  dir.normalize();

  drawBossBeam(nose, dir, len * 1.6);

  // 一定間隔でダメージを見る。毎コマ入れると一瞬で沈む
  boss.beamTick -= dt;
  if (boss.beamTick <= 0) {
    boss.beamTick = B.DPS_TICK;
    if (pointNearLine(playerShip.position, nose, dir, len * 1.6) <= B.RADIUS * 1.8) {
      onPlayerHit(B.DAMAGE);
      spawnDebris(playerShip.position, 6, 0.2, 9, 0xffd0a0, true);
      startShake(1.6);
    }
  }

  boss.chargeGlow.material.opacity = 0.9;
  boss.chargeGlow.scale.setScalar(52 + Math.random() * 10);

  if (boss.beamLeft <= 0) {
    boss.beamState = 'idle';
    boss.beamCool  = B.INTERVAL;
    boss.chargeGlow.material.opacity = 0;
    clearBossBeam();
  }
}

// 艦首の先端の、世界での位置
function bossNosePoint() {
  return boss.group.localToWorld(new THREE.Vector3(0, 0, -BOSS.LENGTH / 2 - 2));
}

// 点と半直線の距離。ビームに当たっているかの判定に使う
function pointNearLine(point, origin, dir, maxLen) {
  const v = point.clone().sub(origin);
  const along = v.dot(dir);
  if (along < 0 || along > maxLen) return Infinity;   // ビームの前後には当たらない
  return v.sub(dir.clone().multiplyScalar(along)).length();
}

// ビームの見た目を作り直す。太い外側 + 白い芯の2本立て
function drawBossBeam(origin, dir, length) {
  const B = BOSS.BEAM;
  if (!boss.beamMesh) {
    // CylinderGeometry は Y 方向に伸びるので、あとで倒して使う
    const outer = new THREE.CylinderGeometry(B.RADIUS, B.RADIUS * 1.25, 1, 10, 1, true);
    boss.beamMesh = new THREE.Mesh(outer, new THREE.MeshBasicMaterial({
      color: B.COLOR, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    const core = new THREE.CylinderGeometry(B.RADIUS * 0.34, B.RADIUS * 0.42, 1, 8, 1, true);
    boss.beamCoreMesh = new THREE.Mesh(core, new THREE.MeshBasicMaterial({
      color: B.CORE_COLOR, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    scene.add(boss.beamMesh);
    scene.add(boss.beamCoreMesh);
  }

  const mid = origin.clone().addScaledVector(dir, length / 2);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  for (const m of [boss.beamMesh, boss.beamCoreMesh]) {
    m.visible = true;
    m.position.copy(mid);
    m.quaternion.copy(quat);
    m.scale.set(1, length, 1);
  }
  // 太さを細かく揺らす。止まった円柱に見えないように
  const f = 0.86 + Math.random() * 0.28;
  boss.beamMesh.scale.x = boss.beamMesh.scale.z = f;
  boss.beamCoreMesh.scale.x = boss.beamCoreMesh.scale.z = 0.8 + Math.random() * 0.5;
}

function clearBossBeam() {
  if (boss.beamMesh)     boss.beamMesh.visible = false;
  if (boss.beamCoreMesh) boss.beamCoreMesh.visible = false;
}


// ===================================================================
// 自機の攻撃が当たったか
//
// scene.js の updateBolts などから呼ぶ。
// 返り値 true = この弾はここで消える。
//
// 判定は2段構え:
//   1. 弱点の装置に触れたか? → 開いた芯ならダメージ、それ以外は弾かれる
//   2. 艦体の中か?           → いつでも弾かれる
// ===================================================================
// prevPoint = 1コマ前の位置。渡すと、その間を通った線分で判定する。
// 弾は1コマに1.5ほど跳ぶので、点だけで見ると薄い部品(溝の桟は高さ1.6、
// 排熱口の円板はほぼ厚み0)を飛び越して素通りする。
// 省略すると点として扱う(爆風など、動いていないものの判定用)。
const _sweepFrom = new THREE.Vector3();
const _sweepTo   = new THREE.Vector3();
const _sweepAt   = new THREE.Vector3();

function bossTakeHit(point, damage, prevPoint) {
  if (!boss || bossState !== 'active') return false;

  // 飛んでいる弾ぜんぶが毎コマここへ来る。艦を包む球より外なら、
  // 行列の作り直しも座標変換もせずに帰る(いちばん効く節約)。
  // 線分ぶんの長さも足しておかないと、跨いだコマを取りこぼす。
  const span = prevPoint ? prevPoint.distanceTo(point) : 0;
  const rough = boss.radius + BOSS.VENT.RIM_RADIUS + span;
  if (boss.group.position.distanceToSquared(point) > rough * rough) return false;

  // 線分の両端を、艦から見た座標にしておく
  _sweepTo.copy(bossToLocal(point));
  if (prevPoint) _sweepFrom.copy(bossToLocal(prevPoint));
  else           _sweepFrom.copy(_sweepTo);

  // --- 1. 弱点(平らな円板として、線分で見る)---
  const vent = bossVentAt(_sweepFrom, _sweepTo, 0);
  if (vent) {
    if (vent.hitCore && vent.vent.alive && vent.vent.open) {
      damageBossVent(vent.vent, point, damage);
    } else {
      // 縁の金属・閉じた蓋・潰したあとの残骸。どれもただの装甲として弾く
      bossRicochet(point);
    }
    return true;
  }

  // --- 2. 艦体 ---
  // 線分を細かく刻んで確かめる。刻み幅は、いちばん薄い部品(溝の桟の高さ1.6)の
  // 半分より小さくしておけば、跨いで見落とすことはない。
  if (bossSegmentInsideBody(_sweepFrom, _sweepTo)) {
    bossRicochet(point);
    return true;
  }

  return false;
}

// 線分のどこかが艦に入っているか。
// 点で見ると跳び越してしまう薄い部品を、刻んで拾う。
function bossSegmentInsideBody(from, to) {
  const span = from.distanceTo(to);
  // 0.7 = 溝の桟の高さ1.6の半分より小さい。これ以下なら跨げない
  const steps = Math.max(1, Math.ceil(span / 0.7));
  for (let i = 0; i <= steps; i++) {
    _sweepAt.lerpVectors(from, to, i / steps);
    if (bossPointInsideBody(_sweepAt, 0)) return true;
  }
  return false;
}

// ===================================================================
// その点が、どの排熱口の装置に触れているか
//
// 「見えている円のどこかに当たったか」と「芯に当たったか」は別の話。
//   芯(HIT_RADIUS)  … 開いていればダメージが通る
//   縁(RIM_RADIUS)  … ただの金属。弾かれるが、すり抜けはしない
// 縁まで見ておかないと、排熱口は艦体から浮いているので
// そこを撃った弾が艦を素通りしてしまう。
//
// 【球ではなく円板で見る理由】
// 排熱口は艦の表面に貼られた平らな円板で、厚みはほぼ無い。
// これを半径7.5の球で判定していたので、円板の真上7.5の
// 何も無い空間を通った弾まで当たっていた ―
// 「超狭い弱点を、開いた瞬間に狙う」はずが、見た目よりずっと当たりやすかった。
//
// 排熱口から見た座標に直すと、円板は必ず XY 平面に寝ているので、
//   面内の半径 = √(x² + y²)   … 円板からどれだけ横にずれているか
//   面からの浮き = |z|          … 円板からどれだけ浮いているか
// の2つを別々に見られる。これが「見えているとおり」の判定になる。
//
// from / to は艦から見た座標で、弾が1コマで通った線分の両端。
// to だけを見ると、1コマ1.5跳ぶ弾が薄い円板を飛び越してしまう(トンネリング)ので、
// 線分が円板の面を横切った点で判定する。
// margin は近接信管ぶんの甘さ(ミサイル用)。見つからなければ null。
// ===================================================================
const _discFrom = new THREE.Vector3();
const _discTo   = new THREE.Vector3();
const _discAt   = new THREE.Vector3();

function bossVentAt(from, to, margin) {
  const m = margin || 0;
  // 円板の「厚み」。面ぴったり0だと、線分が面をまたがない限り当たらなくなる。
  // 弾そのものの太さぶんは持たせておく。
  const halfThick = 0.9 + m;

  for (const v of boss.vents) {
    _discFrom.copy(from).applyMatrix4(v.toDisc);
    _discTo.copy(to).applyMatrix4(v.toDisc);

    // --- 線分のうち、円板の面にいちばん近いところを選ぶ ---
    let p = _discAt.copy(_discTo);
    const dz = _discTo.z - _discFrom.z;
    if (Math.abs(dz) > 1e-6) {
      // 面(z=0)を横切っているなら、その交点で見る。
      // これがトンネリング対策の本体 ― 通り抜けた弾もここで捕まる
      const t = -_discFrom.z / dz;
      if (t >= 0 && t <= 1) p.lerpVectors(_discFrom, _discTo, t);
    }

    // 面から浮きすぎているものは当たっていない
    if (Math.abs(p.z) > halfThick) continue;

    // 面内でどれだけ中心からずれているか
    const r = Math.sqrt(p.x * p.x + p.y * p.y);
    if (r > BOSS.VENT.RIM_RADIUS + m) continue;

    return { vent: v, hitCore: r <= BOSS.VENT.HIT_RADIUS + m };
  }
  return null;
}

// 艦体(楔形の本体)の中に入っているか
//
// ※ 断面は「箱」ではなく「台形」。上へ行くほど狭い。
//   箱で判定すると、舷側の斜面の外側 ― 実際には何も無い空間 ―
//   でも弾が弾かれ、艦のそばを掠めただけで火花が散ってしまう。
//   見えている形と当たる形は必ず一致させる。
//
// この関数が見ている形は、buildBossHull が頂点に使っている
// bossCrossSection そのもの。だから食い違いようがない。
// margin を渡すと、その距離ぶん外側まで「艦体」とみなす(体当たりの判定用)
function bossPointInsideWedge(local, margin) {
  const m = margin || 0;
  const halfL = BOSS.LENGTH / 2 + m;
  if (local.z < -halfL || local.z > halfL) return false;
  // t は margin を含めない素の艦体で測る(端では0〜1をはみ出すので丸める)
  const t = Math.max(0, Math.min(1,
    (local.z + BOSS.LENGTH / 2) / BOSS.LENGTH));    // 0=艦首 1=艦尾
  const cs = bossCrossSection(t);
  if (Math.abs(local.y) > cs.halfH + m) return false;

  // その高さでの実際の半幅。下辺 halfW から上辺 halfW×0.72 へ線形に狭まる
  const topW = cs.halfW * BOSS_TOP_RATIO;
  const k = Math.max(0, Math.min(1,
    (local.y + cs.halfH) / (2 * cs.halfH)));        // 0=下端 1=上端
  const halfWHere = cs.halfW + (topW - cs.halfW) * k;
  return Math.abs(local.x) <= halfWHere + m;
}

// ===================================================================
// 艦のどこかに触れているか(艦体 + はみ出している部分すべて)
//
// 艦体は楔形ひとつで足りるが、艦橋塔・探知球・溝の桟・舷側の段は
// その外側に出ている。そこを見ないと、艦橋を撃った弾がすり抜ける。
// bossParts に積んである部品を、箱は箱として・球は球として順に見る。
// ===================================================================
function bossPointInsideBody(local, margin) {
  if (bossPointInsideWedge(local, margin)) return true;

  const m = margin || 0;
  for (const p of bossParts) {
    if (p.kind === 'sphere') {
      const r = p.r + m;
      if (local.distanceToSquared(p.c) <= r * r) return true;
    } else {
      if (Math.abs(local.x - p.c.x) <= p.half.x + m &&
          Math.abs(local.y - p.c.y) <= p.half.y + m &&
          Math.abs(local.z - p.c.z) <= p.half.z + m) return true;
    }
  }
  return false;
}


// ===================================================================
// 艦体に触れたか(体当たり・投下兵装の接触信管)
//
// point は世界座標、radius はぶつかる側の当たり半径。
// 自機がこれに引っかかったら、そこで終わり ―
// 戦闘機の質量では、全長210の艦体に勝ち目はない。
// ===================================================================
function bossRamCheck(point, radius) {
  if (!boss) return false;
  if (bossState !== 'arriving' && bossState !== 'active' && bossState !== 'dying') return false;
  if (!boss.group.visible) return false;

  // まず大まかに:艦を包む球より遠ければ、細かい判定はしない(毎コマ呼ぶので軽く)
  const rough = boss.radius + (radius || 0) + BOSS.RAM_MARGIN;
  if (boss.group.position.distanceToSquared(point) > rough * rough) return false;

  return bossPointInsideBody(bossToLocal(point), (radius || 0) + BOSS.RAM_MARGIN);
}


// ===================================================================
// 艦体の表面まで、あとどれくらいか
//
// コックピットからは距離感がつかめない ― 全長210の艦は、
// 遠くにいても近くにいても「画面いっぱい」にしか見えないため。
// 近接警告(main.js)に渡す数字をここで出す。
//
// 艦体は楔形+22個の部品でできていて、表面までの距離を式で解くのは面倒。
// 代わりに「margin だけ太らせた艦の中に自機が入っているか」を
// 挟み撃ちで何回か聞いて、境目を割り出す。
//
// maxDist より遠ければ Infinity(いちばん多い場合を1回の判定で切り上げる)。
// ===================================================================
function bossSurfaceDistance(point, maxDist) {
  if (!boss) return Infinity;
  if (bossState !== 'arriving' && bossState !== 'active' && bossState !== 'dying') return Infinity;
  if (!boss.group.visible) return Infinity;

  // 大まかな足切り。ほとんどのコマはここで帰る
  const rough = boss.radius + maxDist;
  if (boss.group.position.distanceToSquared(point) > rough * rough) return Infinity;

  const local = bossToLocal(point).clone();

  // maxDist まで太らせても届かないなら、警告する距離にはいない
  if (!bossPointInsideBody(local, maxDist)) return Infinity;
  // すでに艦体の中(=接触している)
  if (bossPointInsideBody(local, 0)) return 0;

  // 挟み撃ち。8回も回せば maxDist/256 まで絞れる ―
  // 警告の色を決めるには十分すぎる精度
  let lo = 0, hi = maxDist;
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (bossPointInsideBody(local, mid)) hi = mid;   // まだ届く = 表面はもっと近い
    else                                  lo = mid;  // 届かない = 表面はもっと遠い
  }
  return hi;
}


// ===================================================================
// ミサイル1発ぶんの命中判定
//
// 近接信管なので、少し離れていても弱点なら効く。
// 返り値:
//   'vent'  … 開いている排熱口に吸い込まれた(ダメージが通った)
//   'armor' … 装甲・閉じた排熱口に当たった(弾かれた。弾は無駄になる)
//   null    … 当たっていない
// ===================================================================
// prevPoint = 1コマ前の位置。ミサイルは弾速95で1コマ1.6ほど跳ぶので、
// 弾と同じく線分で見ないと薄いところを飛び越す。
function bossMissileHit(point, damage, fuse, prevPoint) {
  if (!boss || bossState !== 'active') return null;

  const f = fuse || 0;
  const span = prevPoint ? prevPoint.distanceTo(point) : 0;
  const rough = boss.radius + f + BOSS.VENT.RIM_RADIUS + span;
  if (boss.group.position.distanceToSquared(point) > rough * rough) return null;

  const local = bossToLocal(point).clone();
  const prevLocal = prevPoint ? bossToLocal(prevPoint).clone() : local;

  // --- 1. 排熱口 ---
  // 近接信管ぶんだけ甘くする。ロックして撃った弾が縁で滑るのは気持ちが悪い。
  const vent = bossVentAt(prevLocal, local, f);
  if (vent) {
    if (vent.hitCore && vent.vent.alive && vent.vent.open) {
      damageBossVent(vent.vent, point, damage);
      return 'vent';
    }
    return 'armor';       // 閉じた蓋・縁の金属・潰したあとの残骸
  }

  // --- 2. 艦体 ---
  if (bossSegmentInsideBody(prevLocal, local)) return 'armor';

  return null;
}

// 装甲に弾かれた:火花だけ出して、ダメージは入らない
function bossRicochet(point) {
  spawnFlash(point, 2.6, 0xbfd6ff, 0.1);
  spawnDebris(point, 3, 0.13, 8, 0xdfe8ff, true);
  onBossRicochet();   // main.js:「ARMOR」のログ(出しすぎないよう間引く)
}

// 弱点にダメージ
function damageBossVent(vent, point, damage) {
  vent.hp -= (typeof damage === 'number') ? damage : 1;

  boss.hitFlash = 0.14;
  spawnFlash(point, 9, 0xa8f4ff, 0.2);
  spawnDebris(point, 7, 0.26, 12, 0xd0faff, true);

  if (vent.hp > 0) {
    onBossVentHit(vent, bossVentsLeft());
    return;
  }

  // --- 弱点をひとつ潰した ---
  vent.alive = false;
  vent.open  = false;
  vent.warn  = false;
  vent.target.alive = false;   // ロックしていた場合は、ここで外れる
  vent.target.heat  = 0;
  vent.coreMat.color.setHex(0x120806);
  vent.coreMat.opacity = 1;
  vent.rimMat.color.setHex(0x3a2a22);
  vent.halo.material.opacity = 0;

  const p = vent.group.getWorldPosition(new THREE.Vector3());
  spawnFlash(p, 44, 0xffffff, 0.3);
  spawnFlash(p, 26, 0xffb060, 0.5);
  spawnBlast(p, 22, 0xffc070);
  spawnDebris(p, 18, 0.5, 20, 0xffd9a0, true);
  startShake(1.0);

  // 排熱口を1基潰すごとに、確定で回収物が1つ吹き出す(salvage.js)。
  //
  // 戦艦戦は1対1で戦闘機が出ないので、これが無いとボス戦のあいだ
  // アイテムがひとつも手に入らない。いちばん難しいところが報われる形にした。
  // 拾いに行くには艦体のすぐ脇まで寄ることになる ―
  // 艦体に触れたら即死なので、報酬と危険がそこで釣り合う。
  if (typeof spawnSalvage === 'function') spawnSalvage(p);

  onBossVentDown(vent, bossVentsLeft());

  if (bossVentsLeft() <= 0) startBossDeath();
}

// 残っている弱点の数
function bossVentsLeft() {
  if (!boss) return 0;
  let n = 0;
  for (const v of boss.vents) if (v.alive) n += 1;
  return n;
}

// 爆発の範囲でまとめて判定する(ボム・パイロ弾の炸裂用)。
//
// 対象は「開いている弱点」だけ。閉じた排熱口まで爆風で潰せてしまうと、
// タイミングを計らずボムを投げるだけの相手になってしまう。
// 威力は中心からの距離で落ちる ― 艦体に押しつけるほど効く。
function bossSplashDamage(center, radius, damage) {
  if (!boss || bossState !== 'active') return false;
  // 排熱口の世界座標(mark)は updateBossVents が毎コマ書き写しているので、
  // ここで行列を作り直す必要はない。
  let hit = false;
  for (const vent of boss.vents) {
    if (!vent.alive || !vent.open) continue;
    const d = vent.mark.position.distanceTo(center);
    if (d > radius) continue;
    const falloff = 1 - d / radius;          // 1 = 中心 / 0 = 半径のふち
    const dealt = damage * falloff;
    if (dealt <= 0.05) continue;             // ふちをかすめただけでは効かない
    damageBossVent(vent, vent.mark.position, dealt);
    hit = true;
  }
  return hit;
}


// ===================================================================
// 撃破演出
//
// 一瞬で消すと、これだけ大きいものが消えたことに気づけない。
// 5秒かけて、艦体の各所で誘爆させながら傾けていく。
// ===================================================================
function startBossDeath() {
  bossState = 'dying';
  boss.deathLeft = BOSS.DEATH.SEC;
  boss.popLeft   = 0;
  clearBossLocks();
  clearBossBeam();
  boss.chargeGlow.material.opacity = 0;
  startShake(1.2);
  onBossDeathStart();
}

function updateBossDeath(dt) {
  boss.deathLeft -= dt;

  // ゆっくり傾き、前へ流れ続ける(推力を失って惰性で進む)
  boss.group.rotateZ(BOSS.DEATH.ROLL * dt);
  boss.group.rotateX(BOSS.DEATH.ROLL * 0.35 * dt);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(boss.group.quaternion);
  boss.group.position.addScaledVector(fwd, BOSS.SPEED * 0.6 * dt);

  // エンジンの光を落としていく
  const k = Math.max(boss.deathLeft / BOSS.DEATH.SEC, 0);
  for (const e of boss.engines) e.material.opacity = k * 0.9;

  // 艦体のあちこちで誘爆
  boss.popLeft -= dt;
  if (boss.popLeft <= 0) {
    boss.popLeft = BOSS.DEATH.POP_GAP;
    const t = 0.15 + Math.random() * 0.85;
    const cs = bossCrossSection(t);
    const p = boss.group.localToWorld(new THREE.Vector3(
      (Math.random() - 0.5) * cs.halfW * 1.8,
      (Math.random() - 0.5) * cs.halfH * 2,
      bossZAt(t)
    ));
    spawnFlash(p, 14 + Math.random() * 20, 0xffd090, 0.3);
    spawnBlast(p, 9 + Math.random() * 8, 0xffb060);
    spawnDebris(p, 5, 0.4, 16, 0xffd9a0, true);
    if (Math.random() < 0.3) startShake(0.5);
  }

  if (boss.deathLeft > 0) return;

  // --- とどめ:全体が吹き飛ぶ ---
  const c = boss.group.position.clone();
  spawnFlash(c, 260, 0xffffff, 0.5);
  spawnFlash(c, 170, 0xffd090, 0.9);
  spawnBlast(c, 120, 0xffc070);
  spawnBlast(c,  80, 0xffffff);
  spawnDebris(c, 40, 1.5, 46, 0xffd9a0, true);
  spawnDebris(c, 50, 2.2, 34);
  startShake(2.2);

  boss.group.visible = false;
  bossState = 'dead';
  onBossDestroyed();   // main.js:ミッション達成
}


// ===================================================================
// 計器に出すための情報。main.js から読む
// ===================================================================
function bossStatus() {
  if (!boss || bossState === 'none' || bossState === 'dead') return null;
  return {
    state: bossState,
    dist: Math.round(boss.group.position.distanceTo(playerShip.position)),
    vents: boss.vents.map((v) => ({
      key: v.key,
      labelJa: v.labelJa,
      alive: v.alive,
      open: v.open,
      warn: v.warn,                 // まもなく開く(この段階からロックを始められる)
      lockable: v.target.alive,     // ミサイルのロックが乗るか
      hp: Math.max(v.hp, 0),
      maxHp: BOSS.VENT.COUNT_HP,
    })),
    beam: boss.beamState,
  };
}
