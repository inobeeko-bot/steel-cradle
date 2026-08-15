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
  // 撃墜数がここに届くと出現する。
  // MISSION.KILL_GOAL と同じ数にしてある ―
  // 「規定数を落としたら任務達成」だった場所が「戦艦が出てくる」に変わる。
  // 動作を試したいときは、開発者コンソールで spawnBoss() と打てばすぐ出せる。
  SPAWN_KILLS:  10,
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

  // --- 装甲(弾かれる判定)-------------------------------------------
  // 艦体は楔形なので、球ではなく「先へ行くほど細くなる箱」で判定する。
  // NOSE_THIN = 艦首側の厚みの割合(0.25 = 最後部の1/4の厚み)
  NOSE_THIN: 0.25,

  // --- 弱点(排熱口)-------------------------------------------------
  VENT: {
    COUNT_HP:    5,     // ベント1つを潰すのに必要なダメージ量
    RADIUS:    4.6,     // 見た目の半径(全長210に対して4.6 = 極小)
    HIT_RADIUS:6.2,     // 当たり判定の半径。見た目より少しだけ甘くする
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
  },

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


// ===================================================================
// 艦体の断面の大きさを返す。
//
// 楔形なので、艦首(t=0)へ行くほど細く薄くなる。
// 弱点の位置も当たり判定も、この1つの関数から出す ―
// 別々に書くと、寸法を変えたときに片方だけズレる。
//   t: 0 = 艦首 / 1 = 艦尾
// ===================================================================
function bossCrossSection(t) {
  const thin = BOSS.NOSE_THIN + (1 - BOSS.NOSE_THIN) * t;
  return {
    halfW: (BOSS.WIDTH  / 2) * t,      // 幅は艦首で0(とがっている)
    halfH: (BOSS.HEIGHT / 2) * thin,   // 厚みは艦首でも少し残す
  };
}

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

  const halfL = BOSS.LENGTH / 2;
  const rear  = bossCrossSection(1);
  const topW  = rear.halfW * 0.72;   // 上面は下面より狭い = 断面が台形になる

  // 5つの頂点だけで楔を作る。
  //   0: 艦首の1点
  //   1,2: 艦尾の下辺(左・右)
  //   3,4: 艦尾の上辺(左・右)
  const v = [
     0,            0,          -halfL,   // 0 艦首
    -rear.halfW,  -rear.halfH,  halfL,   // 1 艦尾 左下
     rear.halfW,  -rear.halfH,  halfL,   // 2 艦尾 右下
    -topW,         rear.halfH,  halfL,   // 3 艦尾 左上
     topW,         rear.halfH,  halfL,   // 4 艦尾 右上
  ];
  // 三角形の並び。表から見て反時計回りになる順に書く(これを間違えると裏返る)
  const idx = [
    0, 2, 1,        // 下面
    0, 3, 4,        // 上面
    0, 1, 3,        // 左舷
    0, 4, 2,        // 右舷
    1, 2, 4,  1, 4, 3,   // 艦尾
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
    const w = cs.halfW * 0.72 * 1.5;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, 3.2), trenchMat);
    bar.position.set(0, cs.halfH + 0.4, bossZAt(t));
    g.add(bar);
  }
  // 左右の舷側にも段を付ける
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = 0.40 + i * 0.12;
      const cs = bossCrossSection(t);
      const blk = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 9), trenchMat);
      blk.position.set(side * (cs.halfW * 0.72), 0, bossZAt(t));
      g.add(blk);
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

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 18), towerMat);
  bridge.position.set(0, base.position.y + 10.5, towerZ);
  g.add(bridge);

  // 探知球。艦橋の左右に1つずつ。低ポリの球(面が少ないほうがこの絵に合う)
  const domeMat = new THREE.MeshLambertMaterial({
    color: BOSS.DARK_COLOR, flatShading: true,
  });
  bossHullMats.push(domeMat);
  for (const side of [-1, 1]) {
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(4.4, 0), domeMat);
    dome.position.set(side * 13, bridge.position.y + 6.5, towerZ);
    g.add(dome);
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

  return { group: g, engines: engines };
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

  // 面ごとに「置く場所」と「どちらを向くか」を決める
  let pos, rot;
  const topW = cs.halfW * 0.72;
  if (spec.face === 'top') {
    pos = new THREE.Vector3(0, cs.halfH + 0.6, z);
    rot = new THREE.Euler(-Math.PI / 2, 0, 0);
  } else if (spec.face === 'bottom') {
    pos = new THREE.Vector3(0, -cs.halfH - 0.6, z);
    rot = new THREE.Euler(Math.PI / 2, 0, 0);
  } else if (spec.face === 'left') {
    pos = new THREE.Vector3(-topW - 0.6, 0, z);
    rot = new THREE.Euler(0, -Math.PI / 2, 0);
  } else {
    pos = new THREE.Vector3(topW + 0.6, 0, z);
    rot = new THREE.Euler(0, Math.PI / 2, 0);
  }

  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.copy(rot);

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

  return {
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
    fireLeft: 0,     // 破壊後に吹き出す炎の残り時間
  };
}


// ===================================================================
// ボスを出現させる
// ===================================================================
function spawnBoss() {
  if (!sceneReady || boss) return;

  bossHullMats = [];
  const built = buildBossHull();
  const group = built.group;

  // 自機の正面、遠くに置く。向きは自機のほうを向ける。
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
  group.position.copy(playerShip.position).addScaledVector(forward, BOSS.SPAWN_DIST);
  group.lookAt(playerShip.position);

  // 弱点を4つ取り付ける
  const vents = [];
  BOSS.VENT.LIST.forEach((spec, i) => {
    const vent = buildBossVent(spec);
    // 4つが同時に開くと的が大きくなりすぎる。周期の1/4ずつずらす
    vent.phase = (BOSS.VENT.CYCLE / BOSS.VENT.LIST.length) * i;
    group.add(vent.group);
    vents.push(vent);
  });

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

  // 出現の演出:大きな閃光と、ふくらむ輪
  spawnFlash(group.position, 120, 0xffffff, 0.5);
  spawnBlast(group.position, 70, 0x9fd8ff);
  startShake(1.4);

  onBossArrive();   // main.js:ログ・音声・HUDの表示
}


// ===================================================================
// ボスを消す(ミッションのやり直し・メニューへ戻るとき)
// ===================================================================
function resetBoss() {
  if (boss) {
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
    return;
  }

  if (bossState === 'dying') {
    updateBossDeath(dt);
    return;
  }

  if (bossState !== 'active') return;
  if (typeof combatFrozen !== 'undefined' && combatFrozen) return;

  updateBossMove(dt);

  // 動かしたら、行列(位置と向きの計算結果)をすぐ作り直しておく。
  // localToWorld / worldToLocal はこの行列を見るので、更新しないと
  // 砲の発射位置も弱点の当たり判定も1コマぶん古い場所を指す。
  boss.group.updateMatrixWorld(true);

  updateBossVents(dt);
  updateBossTurbo(dt);
  updateBossMissiles(dt);
  updateBossBeam(dt);
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
function updateBossVents(dt) {
  const C = BOSS.VENT;

  for (const vent of boss.vents) {
    if (!vent.alive) {
      // 潰したあとは、焼け跡から炎が吹き出し続ける
      vent.fireLeft -= dt;
      if (vent.fireLeft <= 0) {
        vent.fireLeft = 0.28;
        const p = vent.group.getWorldPosition(new THREE.Vector3());
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
      vent.coreMat.color.setHex(0x203040);
      vent.coreMat.opacity = 0.5;
      vent.rimMat.color.setHex(0x9aa6b0);
      vent.halo.material.opacity = 0;
    }
  }
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
    life: MISSILE.LIFE,
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
//   1. 弱点の近くか? → 開いていればダメージ、閉じていれば弾かれる
//   2. 艦体の中か?   → いつでも弾かれる
// ===================================================================
function bossTakeHit(point, damage) {
  if (!boss || bossState !== 'active') return false;
  boss.group.updateMatrixWorld(true);   // 判定の前に必ず最新の位置にする

  // --- 1. 弱点 ---
  const local = boss.group.worldToLocal(point.clone());
  for (const vent of boss.vents) {
    if (!vent.alive) continue;
    if (local.distanceTo(vent.group.position) > BOSS.VENT.HIT_RADIUS) continue;

    if (vent.open) {
      damageBossVent(vent, point, damage);
    } else {
      // 閉じている弱点も、ただの装甲として弾く
      bossRicochet(point);
    }
    return true;
  }

  // --- 2. 艦体 ---
  if (bossPointInsideHull(local)) {
    bossRicochet(point);
    return true;
  }

  return false;
}

// 艦体(楔形)の中に入っているか
function bossPointInsideHull(local) {
  const halfL = BOSS.LENGTH / 2;
  if (local.z < -halfL || local.z > halfL) return false;
  const t = (local.z + halfL) / BOSS.LENGTH;     // 0=艦首 1=艦尾
  const cs = bossCrossSection(t);
  return Math.abs(local.x) <= cs.halfW && Math.abs(local.y) <= cs.halfH;
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

// 爆発の範囲でまとめて判定する(ボム・ミサイルの炸裂用)。
// 開いている弱点だけが対象。
function bossSplashDamage(center, radius, damage) {
  if (!boss || bossState !== 'active') return false;
  boss.group.updateMatrixWorld(true);
  let hit = false;
  for (const vent of boss.vents) {
    if (!vent.alive || !vent.open) continue;
    const p = vent.group.getWorldPosition(new THREE.Vector3());
    if (p.distanceTo(center) <= radius) {
      damageBossVent(vent, p, damage);
      hit = true;
    }
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
      hp: Math.max(v.hp, 0),
      maxHp: BOSS.VENT.COUNT_HP,
    })),
    beam: boss.beamState,
  };
}
