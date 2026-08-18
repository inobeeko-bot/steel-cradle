// ===================================================================
// STEEL CRADLE ― 背景のスペースコロニー
//
// 遠くに浮かぶ巨大な円盤。回して遠心力で人工重力を作る、いわゆる
// スタンフォード・トーラス型の居住コロニー。
//
// 【なぜ置くか】
// このゲームの題名は「鋼の揺り籠」で、舞台はコロニー群〈クレイドル〉。
// 何のために撃ち合っているのかが、背景にひとつ浮かんでいるだけで伝わる。
// 小説のアルカディアはこう書かれている:
//   「直径六キロの回転体の内壁に土を敷き、鏡面帆で採った陽光を軸から降らせる。
//     農業コロニーとしては小さすぎ、貧しすぎ」
// ― 6kmで「小さすぎ」なのだから、標準のコロニーはもっと大きい。
//   だからこれは、遠慮なく大きくしてよい対象。
//
// 【作り】小説の描写をそのまま部品にしてある。
//   リング   … 回転体。内壁に人が住む
//   内壁の光 … そこに敷かれた土と町の明かり
//   スポーク … 軸とリングをつなぐ
//   ハブ     … 軸。無重量区(小説の「軸区の無重量スラム」)
//   鏡面帆   … 陽光を集めて軸へ降らせる帆
//
// 【動き】ゆっくり回る。これが人工重力そのものなので、止めてはいけない。
//
// 【読み込み順】scene.js のあと。index.html を参照。
// ===================================================================


// ===================================================================
// 調整用の数値。触るのはここだけ
// ===================================================================
const COLONY = {
  // --- 置く場所 -------------------------------------------------------
  // 自機について来る(遠い星空と同じ扱い)。
  // 10分で3万は飛べるので、空間に固定すると通り過ぎてしまう ―
  // 何キロも先にあるものは近づいても大きくならない、というのが本当のところでもある。
  //
  // ※ 距離は「遠い星(自機から900〜1300)より外」かつ
  //   「カメラの描画限界より内」に収める必要がある。
  //   近すぎると星がコロニーの手前に描かれ、遠すぎると消える。
  // 2600 では、いちばん手前の縁が1285 ― 遠い星の層(900〜1300)に食い込み、
  // 星がコロニーの手前に描かれてしまう。星の層より外へ出すこと。
  DIST: 2800,
  DIR: { x: -0.52, y: 0.20, z: -0.83 },   // 自機から見てどの方角に置くか(左前やや上)

  // --- 寸法 -----------------------------------------------------------
  // 距離2800でリング半径1150(太さ込み1315)= 見かけの直径がおよそ50度。
  // 視野70度なので、画面の横幅の7割を占める。これで「めっちゃ大きい」になる。
  // ★ アルカディア。「地図にない村」なので、大都市コロニーより一回り小さい。
  //   1150 → 820。遠景に浮かぶ「小さな環」に見せる。
  RING_R:     820,   // リングの半径
  RING_TUBE:  135,   // リングの太さ
  HUB_R:      130,   // 軸の太さ
  HUB_LEN:    980,   // 軸の長さ
  SPOKES:       6,   // 軸とリングをつなぐ本数
  SPOKE_W:     44,   // スポークの太さ

  // --- 傾き -----------------------------------------------------------
  // 真正面でも真横でもない角度で見せる。円盤だと分かり、かつ奥行きも出る
  TILT_X: 0.62,
  TILT_Z: 0.20,

  // --- 回る速さ(ラジアン/秒)------------------------------------------
  // 実物は数十秒で1回転するが、そのまま回すと目が回る。
  // 「止まっていない」と分かる最小限に落としてある
  SPIN: 0.030,

  // --- 色 -------------------------------------------------------------
  // 戦闘の色(敵=赤/自機=緑/戦艦=灰)と混ざらないよう、青灰でまとめる。
  // 全体に暗め ― 遠くにあるものが明るいと、手前の戦闘より目立ってしまう。
  HULL:    0x4d5a68,   // リングの外殻
  HULL_D:  0x323d49,   // 影の面。2色にすると巨大な曲面の形が読める
  EDGE:    0x8fa6bb,   // 輪郭線
  HUB:     0x596674,   // 軸
  WINDOW:  0xffd9a0,   // 内壁の明かり(暖色。人が住んでいる色)

  // ★ リングの内側に見えるもの。ここが「自然のあるコロニー」の正体。
  //   外殻の灰色しか見えないと、ただの構造物になる。
  //   果樹園の緑、実った畑の黄、そして水 ― この3色が回っていれば、
  //   遠景でも「人が耕して住んでいる場所」に見える。
  FIELD:   0x4f7a3a,   // 果樹園・畑の緑
  GRAIN:   0xbfa23e,   // 実りの黄。収穫祭の色でもある
  WATER:   0x2f6f86,   // 湖と水路
  MIRROR:  0xbcd4e8,   // 鏡面帆
};


// ===================================================================
// 2つめ ― 円筒型(オニール・シリンダー)
//
// 1つめの円盤(トーラス)とは別系統の設計。
// 円盤は「輪の内壁に住む」が、こちらは「長い筒の内側全面に住む」。
// 帯状の陸と窓が筒の長さ方向に交互に走り、外には採光鏡が開く。
//
// 設定資料3.2は「数十のコロニーで構成」。形が1種類しかないほうが不自然なので、
// 遠景に2つ、違う設計のものを浮かべておく。
// こちらは遠く・小さめに置いて、円盤の引き立て役にする。
// ===================================================================
const COLONY2 = {
  DIST: 3400,
  DIR: { x: 0.74, y: -0.13, z: -0.66 },   // 円盤の反対側(右前やや下)

  LENGTH:  1500,   // 筒の長さ
  RADIUS:   300,   // 筒の半径
  SEG:       12,   // 断面の分割数。低ポリで面が数えられるように
  STRIPS:     6,   // 陸と窓の帯の数(交互なので、窓は半分の3本)
  MIRRORS:    3,   // 採光鏡の枚数
  CAP_R:    120,   // 両端のドッキング部の半径

  // 軸の傾き。真横に寝かせると板に見えるので、少し振っておく
  TILT_X: 0.30,
  TILT_Y: 0.55,

  SPIN: 0.045,     // 回る速さ。円盤より小さいぶん速く回る(遠心力を稼ぐため)

  HULL:   0x46525e,
  HULL_D: 0x2c3640,
  EDGE:   0x8296a8,
  WINDOW: 0xbfe6d8,   // 窓は寒色。円盤の暖色と対にして、別のコロニーだと分かるように
  MIRROR: 0xc8dcec,
};


let colony  = null;   // 1つめ(円盤)。作る前は null
let colony2 = null;   // 2つめ(円筒)


// ===================================================================
// 作る。buildScene から1回だけ呼ぶ
// ===================================================================
function createColony() {
  const g = new THREE.Group();

  // --- リング(回転体そのもの)---------------------------------------
  // トーラス = ドーナツ形。分割数を低く抑えて、面ごとの単色が見えるようにする
  // (このゲームの見た目の決まり。初代スターフォックス調)
  const ringGeo = new THREE.TorusGeometry(
    COLONY.RING_R, COLONY.RING_TUBE, 8, 44);
  const ringMat = new THREE.MeshLambertMaterial({
    color: COLONY.HULL, flatShading: true,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  g.add(ring);

  // --- 内壁の明かり ---------------------------------------------------
  // 人が住んでいるのはリングの内側の壁。そこに土が敷かれ、町がある。
  // 内側を向いた細い輪を1本、加算合成で光らせる ―
  // 外から見て「中に灯りがある」と分かるのは、この1本だけで足りる。
  // ★ 内側の地面を区画に分ける。
  //   TorusGeometry の6番目の引数 arc は「どこまで回すか」(ラジアン)。
  //   これで円弧の一片だけを作り、rotation.z で位置を回して並べれば、
  //   リングの内側をぐるりと塗り分けられる。
  //   区画の並びは決め打ち ― 毎回ばらけると「同じ村」に見えなくなる。
  const PLOTS = [
    'FIELD', 'FIELD', 'WATER', 'GRAIN', 'FIELD', 'GRAIN',
    'WATER', 'FIELD', 'GRAIN', 'FIELD', 'WATER', 'FIELD',
  ];
  const step = (Math.PI * 2) / PLOTS.length;
  const groundR = COLONY.RING_R - COLONY.RING_TUBE * 0.52;
  for (let i = 0; i < PLOTS.length; i++) {
    const geo = new THREE.TorusGeometry(
      groundR, COLONY.RING_TUBE * 0.34, 5, 5, step * 0.94);   // 0.94 = 区画の境に隙間
    const plot = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: COLONY[PLOTS[i]], flatShading: true,
    }));
    plot.rotation.z = i * step;
    g.add(plot);
  }

  // その上に暖色の明かりを薄く重ねる。畑の色を殺さない程度に。
  // 「灯りがある」ことと「耕されている」ことを両方見せたい
  const glowGeo = new THREE.TorusGeometry(
    groundR, COLONY.RING_TUBE * 0.24, 6, 44);
  const glowMat = new THREE.MeshBasicMaterial({
    color: COLONY.WINDOW, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  g.add(new THREE.Mesh(glowGeo, glowMat));

  // --- リングの縁の輪郭線 ---------------------------------------------
  // トーラスに EdgesGeometry を掛けると線が出すぎて滲むので、
  // 細い輪を2本、明るい色で重ねて「縁」に見せる
  const rimMat = new THREE.MeshBasicMaterial({ color: COLONY.EDGE });
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(COLONY.RING_R, COLONY.RING_TUBE * 0.055, 4, 44), rimMat);
    rim.position.z = side * COLONY.RING_TUBE * 0.92;
    g.add(rim);
  }

  // --- 外殻の帯 -------------------------------------------------------
  // のっぺりした輪のままだと大きさが伝わらない。
  // 等間隔に暗い帯を巻くと、目が「いくつ分か」を数えられるようになり、急に巨大に見える
  const bandMat = new THREE.MeshLambertMaterial({
    color: COLONY.HULL_D, flatShading: true,
  });
  const BANDS = 22;
  for (let i = 0; i < BANDS; i++) {
    const a = (i / BANDS) * Math.PI * 2;
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(38, COLONY.RING_TUBE * 0.55, COLONY.RING_TUBE * 2.25),
      bandMat);
    band.position.set(Math.cos(a) * COLONY.RING_R, Math.sin(a) * COLONY.RING_R, 0);
    band.rotation.z = a;
    g.add(band);
  }

  // --- 軸(ハブ)------------------------------------------------------
  // 無重量区。小説でいう「軸区の無重量スラム」がここにあたる
  const hubMat = new THREE.MeshLambertMaterial({
    color: COLONY.HUB, flatShading: true,
  });
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(COLONY.HUB_R, COLONY.HUB_R, COLONY.HUB_LEN, 10),
    hubMat);
  hub.rotation.x = Math.PI / 2;   // 円盤の軸に合わせて寝かせる
  g.add(hub);
  hub.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(hub.geometry),
    new THREE.LineBasicMaterial({ color: COLONY.EDGE })));

  // --- スポーク(輻)--------------------------------------------------
  // 軸とリングをつなぐ通路。ここを人と物が行き来する
  const spokeMat = new THREE.MeshLambertMaterial({
    color: COLONY.HULL_D, flatShading: true,
  });
  const spokeLen = COLONY.RING_R - COLONY.HUB_R;
  for (let i = 0; i < COLONY.SPOKES; i++) {
    const a = (i / COLONY.SPOKES) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(spokeLen, COLONY.SPOKE_W, COLONY.SPOKE_W), spokeMat);
    // 軸とリングのちょうど中間に置き、外向きに寝かせる
    const mid = COLONY.HUB_R + spokeLen / 2;
    spoke.position.set(Math.cos(a) * mid, Math.sin(a) * mid, 0);
    spoke.rotation.z = a;
    g.add(spoke);
  }

  // --- 鏡面帆 ---------------------------------------------------------
  // 「鏡面帆で採った陽光を軸から降らせる」(小説)。
  // 軸のまわりに大きな板を斜めに立てて、陽を受けている風にする。
  // 加算合成にはせず、明るい単色の面にしておく ―
  // 光っているのではなく「光を反射している板」なので、そのほうが正しい。
  const mirrorMat = new THREE.MeshLambertMaterial({
    color: COLONY.MIRROR, flatShading: true, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sail = new THREE.Mesh(
      new THREE.PlaneGeometry(COLONY.RING_R * 1.05, COLONY.RING_R * 0.62),
      mirrorMat);
    // 軸の外側に、軸へ向けて傾けて置く
    const out = COLONY.RING_R * 0.60;
    sail.position.set(Math.cos(a) * out, Math.sin(a) * out, -COLONY.HUB_LEN * 0.62);
    sail.rotation.z = a;
    sail.rotation.y = 0.55;
    g.add(sail);
    sail.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(sail.geometry),
      new THREE.LineBasicMaterial({ color: 0xe8f4ff })));
  }

  // --- 航法灯 ---------------------------------------------------------
  // リングの縁に等間隔に小さな光点。大きさの物差しになる
  if (!flareGlowTex) flareGlowTex = makeFlareGlowTexture();
  const beacons = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareGlowTex, color: 0xffb060, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    b.scale.setScalar(80);
    b.position.set(
      Math.cos(a) * (COLONY.RING_R + COLONY.RING_TUBE * 0.6),
      Math.sin(a) * (COLONY.RING_R + COLONY.RING_TUBE * 0.6),
      0);
    g.add(b);
    beacons.push(b);
  }

  // 円盤ぜんぶをまとめて傾ける入れ物。
  // 回転(人工重力)は中身の g に掛け、傾きはこの親に掛ける ―
  // 分けておかないと、回すたびに傾きまで動いてしまう。
  const tilt = new THREE.Group();
  tilt.rotation.x = COLONY.TILT_X;
  tilt.rotation.z = COLONY.TILT_Z;
  tilt.add(g);

  scene.add(tilt);

  colony = { group: tilt, spin: g, beacons: beacons };
  updateColony(0);   // 最初の1コマから正しい位置に置く
  return colony;
}


// ===================================================================
// 毎コマの更新。updateScene から呼ばれる
// ===================================================================
function updateColony(dt) {
  if (!colony || !playerShip) return;

  // --- 自機について来させる ---
  // 遠い星空と同じ扱い(scene.js の stars.position.copy と同じ考え方)。
  // 向きは動かさないので、機首を振ればちゃんと視界の中を流れていく。
  colony.group.position.set(
    playerShip.position.x + COLONY.DIR.x * COLONY.DIST,
    playerShip.position.y + COLONY.DIR.y * COLONY.DIST,
    playerShip.position.z + COLONY.DIR.z * COLONY.DIST
  );

  // --- 回す ---
  // これが人工重力そのもの。止めると、ただの浮いている輪になってしまう
  colony.spin.rotation.z += COLONY.SPIN * dt;
}


// メニューの背景でも出したままにするので、隠す関数は用意していない。
// 隠したくなったら visible を false にすればよい。
function setColonyHidden(hidden) {
  if (colony)  colony.group.visible  = !hidden;
  if (colony2) colony2.group.visible = !hidden;
}


// ===================================================================
// 2つめ(円筒型)を作る
//
// 円盤が「輪」なら、こちらは「筒」。
// 筒の内側全面が地面で、長さ方向に陸と窓の帯が交互に走る。
// 外に開いた鏡がその窓へ陽を落とす ― という、オニール・シリンダーの構え。
// ===================================================================
function createColony2() {
  const C = COLONY2;
  const g = new THREE.Group();

  // --- 筒の本体 -------------------------------------------------------
  // 断面を12角形にしてある。丸くしすぎると、このゲームの見た目から浮く
  const bodyMat = new THREE.MeshLambertMaterial({
    color: C.HULL, flatShading: true,
  });
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(C.RADIUS, C.RADIUS, C.LENGTH, C.SEG, 1),
    bodyMat);
  body.rotation.z = Math.PI / 2;   // 筒を横に寝かせる(長さ方向を x に)
  g.add(body);

  // --- 陸と窓の帯 -----------------------------------------------------
  // 筒の長さ方向に、交互に走らせる。
  // 実物は「窓の帯から陽が入り、陸の帯に落ちる」という作りで、
  // 外から見ると光る帯と暗い帯の縞になる。
  // この縞が、円盤との見分けをいちばん強くつけている。
  const landMat = new THREE.MeshLambertMaterial({
    color: C.HULL_D, flatShading: true,
  });
  const winMat = new THREE.MeshBasicMaterial({
    color: C.WINDOW, transparent: true, opacity: 0.62,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < C.STRIPS; i++) {
    const a = (i / C.STRIPS) * Math.PI * 2;
    const isWindow = (i % 2 === 0);
    const w = C.RADIUS * 0.52;   // 帯の幅
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(C.LENGTH * 0.94, w, 6),
      isWindow ? winMat : landMat);
    // 筒の表面へ貼り付ける
    strip.position.set(0, Math.cos(a) * C.RADIUS, Math.sin(a) * C.RADIUS);
    strip.rotation.x = -a;
    g.add(strip);
  }

  // --- 補強のリング ---------------------------------------------------
  // 等間隔に巻く。円盤の「帯」と同じ役目 ― 大きさを測る物差しになる
  const ribMat = new THREE.MeshLambertMaterial({
    color: C.HULL_D, flatShading: true,
  });
  for (let i = 0; i < 5; i++) {
    const t = -0.4 + (i / 4) * 0.8;   // 長さ方向に −0.4〜+0.4
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(C.RADIUS * 1.04, C.RADIUS * 0.045, 4, C.SEG), ribMat);
    rib.position.x = t * C.LENGTH;
    rib.rotation.y = Math.PI / 2;   // 輪の面を筒の断面に合わせる
    g.add(rib);
  }

  // --- 両端のドッキング部 ---------------------------------------------
  // 筒の端は塞がっていて、そこに船が着く。円盤には無い形なので、
  // シルエットの差がここでも出る
  const capMat = new THREE.MeshLambertMaterial({
    color: C.EDGE, flatShading: true,
  });
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(C.CAP_R * 0.6, C.CAP_R, C.LENGTH * 0.10, 8),
      capMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * (C.LENGTH / 2 + C.LENGTH * 0.05);
    g.add(cap);
    cap.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(cap.geometry),
      new THREE.LineBasicMaterial({ color: 0xd0e2f0 })));
  }

  // --- 採光鏡 ---------------------------------------------------------
  // 筒の外に、窓の帯と同じ数だけ蝶番で開く長い鏡。
  // これが陽を筒の中へ落とす。円盤の「鏡面帆」と役目は同じだが、
  // 円盤は軸から降らせ、こちらは横から差し込む ― 形が違う理由もそこにある。
  const mirrorMat = new THREE.MeshLambertMaterial({
    color: C.MIRROR, flatShading: true, side: THREE.DoubleSide,
  });
  for (let i = 0; i < C.MIRRORS; i++) {
    const a = (i / C.MIRRORS) * Math.PI * 2;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(C.LENGTH * 0.88, C.RADIUS * 1.5), mirrorMat);
    // 筒の外へ、開いた本のページのように立てる
    const out = C.RADIUS * 1.75;
    m.position.set(0, Math.cos(a) * out, Math.sin(a) * out);
    m.rotation.x = -a + 0.6;   // 少し倒して陽を受けている風にする
    g.add(m);
  }

  // --- 航法灯 ---------------------------------------------------------
  if (!flareGlowTex) flareGlowTex = makeFlareGlowTexture();
  for (const side of [-1, 1]) {
    const b = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareGlowTex, color: 0x9fe1cb, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    b.scale.setScalar(70);
    b.position.x = side * (C.LENGTH / 2 + C.LENGTH * 0.11);
    g.add(b);
  }

  // 円盤と同じく、回転と傾きを別の入れ物に分ける
  const tilt = new THREE.Group();
  tilt.rotation.x = C.TILT_X;
  tilt.rotation.y = C.TILT_Y;
  tilt.add(g);
  scene.add(tilt);

  colony2 = { group: tilt, spin: g };
  updateColony2(0);
  return colony2;
}


// 2つめの更新。1つめと同じく自機について来て、軸のまわりに回る
function updateColony2(dt) {
  if (!colony2 || !playerShip) return;

  colony2.group.position.set(
    playerShip.position.x + COLONY2.DIR.x * COLONY2.DIST,
    playerShip.position.y + COLONY2.DIR.y * COLONY2.DIST,
    playerShip.position.z + COLONY2.DIR.z * COLONY2.DIST
  );

  // 筒は長さ方向(x)を軸にして回る。円盤の z 軸まわりとは軸が違う
  colony2.spin.rotation.x += COLONY2.SPIN * dt;
}
