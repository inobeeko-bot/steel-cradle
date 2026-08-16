// ===================================================================
// STEEL CRADLE ― 残骸回収(サルベージ)
//
// 撃墜した機体の残骸から、まだ生きている機材が浮き出てくる。
// 近づくと回収でき、しばらくのあいだ自機が強くなる。
//
// 【設定の裏づけ】docs/salvage_system_v1.md にまとめてある。要点だけ:
//   ・「撃墜されればその場にドロップし、拾った側が奪える」は
//     設定資料 §6.1 で決定済みの挙動(本来は神器コアの話)
//   ・戦争そのものが資源枯渇の話で、戦場跡を漁る商売(終わり屋)まで設定にある
//   ・ただし神器は12基しかない一点物なので、雑兵は落とさない。
//     ここで拾うのは、どの機体にも積まれているありふれた消耗機材
//
// 【ファイルを分けた理由】
//   boss.js と同じ。独立した仕組みなので1ファイルにまとめたほうが追いやすい。
//   scene.js の関数(spawnFlash など)はそのまま呼べる ―
//   このゲームは全部のJSが同じ場所を共有しているため。
//
// 【役割分担】
//   このファイル … 3Dの実体・浮遊・回収判定
//   main.js      … 効果の適用・音・ログ・計器
//   boss.js が onBossVentHit を呼ぶのと同じ形にしてある。
//
// 【読み込み順】
//   boss.js のあと、main.js より前。index.html を参照。
// ===================================================================


// ===================================================================
// 調整用の数値。触るのはここだけ
// ===================================================================
const SALVAGE = {
  // --- 出現 ---------------------------------------------------------
  DROP_CHANCE: 0.55,   // 戦闘機を1機落としたときに出る確率
  MAX_ON_FIELD:   6,   // 同時に場に出せる数の上限
  LIFE:        30.0,   // 消えるまでの秒数
  FADE:         5.0,   // 最後の何秒を点滅させるか(消える予告)

  // --- 見た目 -------------------------------------------------------
  SIZE:        0.85,   // 本体の大きさ
  SPIN:        1.20,   // 自転の速さ(ラジアン/秒)
  DRIFT:        3.0,   // 撃墜地点から漂い出す速さ
  DRAG:         0.9,   // 漂いが止まっていく強さ(毎秒この割合ぶん減速)
  HALO:         5.5,   // まわりの滲みの大きさ(本体の何倍か)
  PULSE:        2.6,   // 明滅の速さ

  // --- 回収 ---------------------------------------------------------
  // 自機がこの距離まで近づいたら回収。
  // 弾の当たり判定(2前後)よりずっと甘い ― 拾うのは作業であって
  // 技術を問う場面ではないので、掠めれば取れるようにしてある。
  PICKUP_RADIUS: 7.0,

  // --- 発電量の上限(電力セル用)---------------------------------------
  // 電力セルは「配分の合計」ではなく「発電量」を上げる。
  // 設定資料 §9.3 の電力は「毎秒供給される発電量を4系統に手動配分。
  // 合計100%を超えられない」― 100%はあくまで発電した量の取り分なので、
  // 発電量が増えれば同じ30%がより多くの出力になる。
  //
  // ※ §9.2 は「合計100%のUIが艦隊電力プールに化ける」瞬間を
  //   レビヤタン最終戦の山場として予約している。配分UIの100%は動かさないこと。
  //
  // scene.js の speedFromEnginePower と sensorRange は、
  // 入力を Math.min(100, …) で切っている。ここを上げないと
  // 「発電量を上げたのに速度と索敵だけ変わらない」という無言の天井になる。
  POWER_INPUT_MAX: 130,

  // --- 4種の中身 -----------------------------------------------------
  // 効果の適用そのものは main.js の onSalvagePickup が行う。
  // ここにあるのは「何を拾ったか」と、その見た目・表示名。
  //
  // 実在技術の根拠は docs/salvage_system_v1.md の表を参照。
  // 色は index.html の計器と揃えてある(電力=水色系 / 熱=橙 / 推進剤=黄 / 盾=青)。
  KINDS: [
    {
      key: 'power', labelJa: '電力セル', label: 'POWER CELL',
      color: 0x9ff6ff, edge: 0xffffff,
      // 発電量を何倍にするか / 何秒続くか
      MULT: 1.20, SEC: 25,
    },
    {
      key: 'coolant', labelJa: '冷却材', label: 'COOLANT',
      color: 0xff9d4d, edge: 0xffe0b0,
      // 拾った瞬間に下がる熱 / 放熱の倍率 / 何秒続くか
      HEAT_DROP: 35, VENT_MULT: 1.6, SEC: 20,
    },
    {
      key: 'prop', labelJa: '推進剤', label: 'PROPELLANT',
      color: 0xffcf6a, edge: 0xfff0c0,
      // 戻る量。満タンにはしない ―
      // 「10分で使い切る量。終盤の残量が読み合いになる」(§9.3)を残すため
      AMOUNT: 25,
    },
    {
      key: 'shield', labelJa: 'シールド', label: 'SHIELD CELL',
      color: 0x7fd4ff, edge: 0xd8f2ff,
      AMOUNT: 40,
    },
  ],
};


// ===================================================================
// 状態
// ===================================================================
let salvages = [];              // 場に浮かんでいるもの
let salvageGeometry = null;     // 本体の形(全種で共有)
let salvageEdgeGeometry = null; // 輪郭線の形(同上)


// 種類の表を key から引く
function salvageKind(key) {
  for (const k of SALVAGE.KINDS) if (k.key === key) return k;
  return SALVAGE.KINDS[0];
}


// ===================================================================
// 1個出現させる
//
// position … 出る場所(世界座標)
// forceKind … 種類を指定したいとき。省略すると抽選
//
// 戻り値:出したら true
// ===================================================================
function spawnSalvage(position, forceKind) {
  if (!sceneReady) return false;
  if (salvages.length >= SALVAGE.MAX_ON_FIELD) return false;

  const spec = forceKind ? salvageKind(forceKind)
    : SALVAGE.KINDS[Math.floor(Math.random() * SALVAGE.KINDS.length)];

  // 形は1つ作って全部で使い回す。拾うたびに作り直すと引っかかる
  if (!salvageGeometry) {
    salvageGeometry = new THREE.OctahedronGeometry(SALVAGE.SIZE);
    salvageEdgeGeometry = new THREE.EdgesGeometry(salvageGeometry);
  }
  if (!flareGlowTex) flareGlowTex = makeFlareGlowTexture();

  const group = new THREE.Group();
  group.position.copy(position);

  // 本体。単色の八面体 ― 投下兵装と同じ作りにして、
  // 「弾でも破片でもない、置かれている物」に見せる
  const bodyMat = new THREE.MeshBasicMaterial({ color: spec.color });
  const body = new THREE.Mesh(salvageGeometry, bodyMat);
  group.add(body);

  // 輪郭線。ローポリの決まりに合わせる
  const edgeMat = new THREE.LineBasicMaterial({ color: spec.edge });
  body.add(new THREE.LineSegments(salvageEdgeGeometry, edgeMat));

  // まわりの滲み。遠くからでも「何か落ちている」と分かるように
  const haloMat = new THREE.SpriteMaterial({
    map: flareGlowTex, color: spec.color, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(SALVAGE.SIZE * SALVAGE.HALO);
  group.add(halo);

  scene.add(group);

  // 残骸から漂い出す向き。まっすぐ止まっているより「弾き出された」感じになる
  const drift = new THREE.Vector3(
    Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
  ).normalize().multiplyScalar(SALVAGE.DRIFT * (0.4 + Math.random() * 0.6));

  salvages.push({
    kind: spec.key,
    group: group,
    body: body,
    halo: halo,
    bodyMat: bodyMat,
    edgeMat: edgeMat,
    haloMat: haloMat,
    velocity: drift,
    life: SALVAGE.LIFE,
    // 明滅の位相をずらす。そろっていると同時に点滅して機械的に見える
    phase: Math.random() * Math.PI * 2,
  });

  return true;
}


// 撃墜1機ぶんの抽選。当たれば1個出す(scene.js の killEnemy から呼ぶ)
function rollSalvageDrop(position) {
  if (Math.random() > SALVAGE.DROP_CHANCE) return false;
  return spawnSalvage(position);
}


// ===================================================================
// 毎コマの更新。漂わせ、明滅させ、拾えたら消す
// ===================================================================
function updateSalvage(dt) {
  if (!sceneReady) return;

  // 戦闘が止まっている間(リザルト表示中)は拾えない。
  // 見た目は動かし続ける ― 止めると画面が固まって見える。
  const canPick = !(typeof combatFrozen !== 'undefined' && combatFrozen);

  for (let i = salvages.length - 1; i >= 0; i--) {
    const s = salvages[i];

    // --- 漂う ---
    s.group.position.addScaledVector(s.velocity, dt);
    s.velocity.multiplyScalar(1 - SALVAGE.DRAG * dt);   // だんだん止まる

    // --- 自転 ---
    s.body.rotation.x += SALVAGE.SPIN * dt;
    s.body.rotation.y += SALVAGE.SPIN * 0.7 * dt;

    s.life -= dt;

    // --- 明滅と、消える予告 ---
    // ふだんはゆっくり息をするような明滅。
    // 残り FADE 秒を切ったら速く点滅させ、同時に薄くしていく。
    const pulse = 0.75 + Math.sin(sceneTime * SALVAGE.PULSE + s.phase) * 0.25;
    let alpha = 1;
    if (s.life < SALVAGE.FADE) {
      const k = Math.max(s.life / SALVAGE.FADE, 0);   // 1 → 0
      // 速い点滅。k が小さいほど速くなる
      const blink = 0.5 + 0.5 * Math.sin(s.life * 22);
      alpha = k * (0.35 + 0.65 * blink);
    }
    s.haloMat.opacity = 0.7 * pulse * alpha;
    s.halo.scale.setScalar(SALVAGE.SIZE * SALVAGE.HALO * (0.85 + pulse * 0.3));
    // 本体そのものは消さない(単色の面は透明度を持たせると輪郭が濁る)。
    // 代わりに大きさを落として「遠ざかって消える」ように見せる
    s.body.scale.setScalar(0.55 + 0.45 * alpha);

    // --- 回収 ---
    // 距離だけの素直な判定。拾うのは技術を問う場面ではないので甘くしてよい
    if (canPick &&
        s.group.position.distanceTo(playerShip.position) <= SALVAGE.PICKUP_RADIUS) {
      collectSalvage(s, i);
      continue;
    }

    // --- 寿命切れ ---
    if (s.life <= 0) {
      removeSalvage(s, i);
    }
  }
}


// 回収した:光を出して消し、main.js に知らせる
function collectSalvage(s, index) {
  const spec = salvageKind(s.kind);
  const p = s.group.position;

  spawnFlash(p, 14, spec.color, 0.28);
  spawnFlash(p, 7, 0xffffff, 0.16);
  spawnDebris(p, 5, 0.18, 11, spec.color, true);

  removeSalvage(s, index);
  onSalvagePickup(s.kind);   // main.js:効果・音・ログ
}


// 場から取り除いて後片付けする。
// 材質は1個ずつ作っているので、必ず捨てること(捨てないと積もっていく)
function removeSalvage(s, index) {
  scene.remove(s.group);
  s.bodyMat.dispose();
  s.edgeMat.dispose();
  s.haloMat.dispose();
  salvages.splice(index, 1);
}


// 全部消す(再出撃・メニューへ戻るとき)。
// scene.js の resetFlight から呼ぶ ―
// ここを忘れると、出撃をまたいでメッシュが場に残り続ける。
function resetSalvage() {
  for (const s of salvages) {
    scene.remove(s.group);
    s.bodyMat.dispose();
    s.edgeMat.dispose();
    s.haloMat.dispose();
  }
  salvages.length = 0;
}


// メニューの背景では出さない(setEnemiesHidden から呼ぶ)
function setSalvageHidden(hidden) {
  for (const s of salvages) s.group.visible = !hidden;
}


// 今いくつ場に出ているか(計器・確認用)
function salvageOnField() {
  return salvages.length;
}


// ===================================================================
// レーダーに映すための情報(main.js の renderRadar が使う)
//
// 戦闘機と同じ形の配列で返すので、main.js は同じ描画処理を使い回せる。
// 索敵半径には縛る ― 拾い物まで無条件に見えると、
// センサーへ電力を配ることの意味が薄れる。
// ===================================================================
const _salvageInv = new THREE.Quaternion();
const _salvageTo  = new THREE.Vector3();

function salvageContacts(sensorPercent) {
  const result = [];
  if (!sceneReady || salvages.length === 0) return result;

  const range = sensorRange(sensorPercent);
  _salvageInv.copy(playerShip.quaternion).invert();

  for (const s of salvages) {
    _salvageTo.subVectors(s.group.position, playerShip.position);
    const dist = _salvageTo.length();
    if (dist > range) continue;

    const local = _salvageTo.clone().applyQuaternion(_salvageInv);
    result.push({
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      dist: dist,
      kind: s.kind,
    });
  }
  return result;
}
