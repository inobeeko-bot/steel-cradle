// ===================================================================
// STEEL CRADLE / 僚機(味方の旧式艇)
//
// 物語の出撃では、カイトは一人で飛んでいない。
// シーン3「四機で村を守る、ということになっている」
// シーン4 一番機のハッチは開いていて、二番機からはリスベスの声が来る。
//
// それなのに戦闘に入ると自機しかいないのでは、場面が繋がらない。
// ここで飛ばすのは「一番機・二番機・三番機」の三機。
//
// 【いまの作りでできること・できないこと】
//   できる   … 飛ぶ / 敵へ向かう / 撃つ / 敵にダメージを与える / 無線で喋る
//   できない … 撃墜されること。敵は僚機を狙わないし、僚機は落ちない。
//              小説では「防衛隊の四機は一時間もたなかった」ので、
//              ここは本来つくり込む必要がある。今回は状況を見せるところまで。
//
// 敵の実装(タイプ別モデル・部位破壊・解析)には乗せていない。
// あちらは複雑で、僚機に必要のない機能が多いため、専用の軽い仕組みにした。
// ===================================================================

const WINGMAN = {
  COUNT_MAX:    3,
  SPEED:        26,     // 巡航速度(自機はもう少し速い)
  TURN:         1.5,    // 向きを変える速さ(ラジアン/秒)
  ENGAGE_RANGE: 520,    // これより近い敵へ向かっていく
  FIRE_RANGE:   190,    // これより近ければ撃つ
  FIRE_CONE:    0.94,   // 機首がどれだけ敵を向いていれば撃つか(内積)
  FIRE_EVERY:   1.5,    // 撃つ間隔(秒)
  DAMAGE:       1,      // 1発ぶん。自機のビーム1条と同じ
  BOLT_SPEED:   260,
  BOLT_LIFE:    0.9,
  FORM_RADIUS:  70,     // 敵がいないときに自機の周りを飛ぶ半径
  FORM_HEIGHT:  18,
};

// 誰が何番機に乗っているか。シーン3・4の台詞に合わせてある
const WINGMAN_DEFS = [
  { id: 'w1', numKey: 'wing.n1', offset: [-1.0, 0.35,  0.2] },
  { id: 'w2', numKey: 'wing.n2', offset: [ 1.0, 0.15, -0.3] },   // リスベス
  { id: 'w3', numKey: 'wing.n3', offset: [-0.4, -0.30, -0.9] },  // ベン
];

let wingmen = [];
let wingBolts = [];

// --- 出す -----------------------------------------------------------
function spawnWingmen() {
  clearWingmen();
  if (typeof scene === 'undefined' || !scene) return;

  for (let i = 0; i < WINGMAN_DEFS.length; i++) {
    const def = WINGMAN_DEFS[i];
    const group = new THREE.Group();

    // 自機と同じ旧式艇。色は ships.js の指定へ寄せる(褪せた鼠色)
    const model = createPlayerFighter();
    const spec = (typeof ship === 'function') ? ship() : {};
    model.traverse(function (o) {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const base = o.material.color.getHex();
      if (base === PLAYER.BODY_COLOR && spec.bodyColor) o.material.color.setHex(spec.bodyColor);
      else if (base === PLAYER.WING_COLOR && spec.wingColor) o.material.color.setHex(spec.wingColor);
    });
    group.add(model);
    scene.add(group);

    wingmen.push({
      def: def,
      group: group,
      vel: new THREE.Vector3(),
      fireCool: WINGMAN.FIRE_EVERY * (0.4 + i * 0.3),   // 撃つ間隔をずらす
      target: null,
      said: false,       // 「捉えた」を言ったか(1機につき1回)
    });
  }
  placeWingmenNearPlayer();
}

function clearWingmen() {
  for (const w of wingmen) if (w.group.parent) w.group.parent.remove(w.group);
  for (const b of wingBolts) if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
  wingmen = [];
  wingBolts = [];
}

// 自機のまわりへ並べ直す(出撃した瞬間の配置)
function placeWingmenNearPlayer() {
  if (!playerShip) return;
  for (const w of wingmen) {
    const o = w.def.offset;
    w.group.position.copy(playerShip.position).add(
      new THREE.Vector3(o[0] * WINGMAN.FORM_RADIUS,
                        o[1] * WINGMAN.FORM_HEIGHT,
                        o[2] * WINGMAN.FORM_RADIUS));
    w.group.quaternion.copy(playerShip.quaternion);
  }
}

// --- 毎コマ ---------------------------------------------------------
function updateWingmen(dt) {
  if (!wingmen.length || !playerShip) return;
  if (typeof combatFrozen !== 'undefined' && combatFrozen) return;

  for (const w of wingmen) {
    // --- 誰を狙うか。いちばん近い生きている敵 ---
    let best = null, bestD = WINGMAN.ENGAGE_RANGE;
    if (typeof enemies !== 'undefined') {
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = w.group.position.distanceTo(e.group.position);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    w.target = best;

    // --- どこへ向かうか ---
    // 敵がいれば敵。いなければ自機の斜め前(はぐれないように)
    const aim = new THREE.Vector3();
    if (best) {
      aim.copy(best.group.position);
    } else {
      const o = w.def.offset;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
      aim.copy(playerShip.position)
         .add(fwd.multiplyScalar(WINGMAN.FORM_RADIUS))
         .add(new THREE.Vector3(o[0] * WINGMAN.FORM_RADIUS * 0.6,
                                o[1] * WINGMAN.FORM_HEIGHT,
                                0));
    }

    // --- 向きをそちらへ寄せる ---
    const look = new THREE.Matrix4().lookAt(w.group.position, aim, new THREE.Vector3(0, 1, 0));
    const want = new THREE.Quaternion().setFromRotationMatrix(look);
    w.group.quaternion.rotateTowards(want, WINGMAN.TURN * dt);

    // --- 前へ進む ---
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(w.group.quaternion);
    w.group.position.addScaledVector(fwd, WINGMAN.SPEED * dt);

    // --- 撃つ ---
    w.fireCool -= dt;
    if (best && bestD < WINGMAN.FIRE_RANGE && w.fireCool <= 0) {
      const toE = best.group.position.clone().sub(w.group.position).normalize();
      if (toE.dot(fwd) > WINGMAN.FIRE_CONE) {
        fireWingmanBolt(w, best);
        w.fireCool = WINGMAN.FIRE_EVERY;
      }
    }

    // --- 敵を見つけたら一度だけ言う ---
    if (best && !w.said && bestD < WINGMAN.FIRE_RANGE * 1.5) {
      w.said = true;
      if (typeof addCombatLog === 'function') {
        addCombatLog(t(w.def.numKey) + ' 交戦', 'warn');
      }
    }
  }

  updateWingBolts(dt);
}

// --- 僚機の弾 -------------------------------------------------------
function fireWingmanBolt(w, target) {
  const geo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 5);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x9fe1cb }));
  mesh.position.copy(w.group.position);
  mesh.quaternion.copy(w.group.quaternion);
  scene.add(mesh);

  const dir = target.group.position.clone().sub(w.group.position).normalize();
  wingBolts.push({ mesh: mesh, dir: dir, life: WINGMAN.BOLT_LIFE, target: target });
  if (typeof playWingShot === 'function') playWingShot();
}

function updateWingBolts(dt) {
  for (let i = wingBolts.length - 1; i >= 0; i--) {
    const b = wingBolts[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.dir, WINGMAN.BOLT_SPEED * dt);

    // 当たったか。狙った相手にだけ当たる簡素な判定 ―
    // 自機の弾とは別物。ここで凝ると敵の当たり判定と二重管理になる
    let done = b.life <= 0;
    if (!done && b.target && b.target.alive) {
      const d = b.mesh.position.distanceTo(b.target.group.position);
      if (d < 9) {
        if (typeof hitEnemy === 'function') {
          hitEnemy(b.target, b.mesh.position.clone(), true, WINGMAN.DAMAGE);
        }
        done = true;
      }
    }
    if (done) {
      if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
      wingBolts.splice(i, 1);
    }
  }
}
