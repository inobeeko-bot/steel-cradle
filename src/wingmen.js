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
//   できる   … 飛ぶ / 敵へ向かう / 撃つ / 敵にダメージを与える / 落ちる
//   できない … 敵が僚機を「狙って」撃つこと。敵AIは自機しか見ていない。
//              僚機が落ちるのは escape.js が受け持つ ―
//              近くに敵がいれば削られ、そうでなくても必ず一機ずつ失う。
//              小説「防衛隊の四機は一時間もたなかった」に合わせてある。
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

// --- 呼び寄せ(H キー)-----------------------------------------------
//
// ★ この戦いは「守り切れない」ように作ってある(escape.js の LOSS_AT)。
//   だからこそ、何もできずに見ているだけにはしたくない。
//   三回だけ、僚機を自分のところへ呼べる ―
//   貨物船に敵が群がったとき、そこへ自分が飛んでから呼ぶ、という使い方になる。
//
//   回数を三回に絞ってあるのは、押し得の道具にしないため。
//   「いつ使うか」を決めるのがこの仕掛けの中身で、押すこと自体ではない。
const WINGMAN_CALL = {
  MAX:          3,     // 一回の出撃で呼べる回数
  // ★ 秒数と速さは「間に合うか」から決めた。
  //   僚機は自分から520まで敵を追うので、呼んだ時点で自機から
  //   500以上離れていることがある。巡航26のままだと着く前に切れる。
  //   68 なら 16秒で1088進めるので、どこにいても必ず間に合う。
  SEC:       16.0,     // 呼んだあと、何秒ついてくるか
  SPEED_MULT: 2.6,     // 駆けつける間の速さ(巡航26 → 68)
  RANGE:      460,     // 集合中に狙う敵の範囲。自機からの距離で測る
  FIRE_EVERY: 0.9,     // 集合中は撃つ間隔を詰める(1.5 → 0.9)
  SLOT:        90,     // 自機のどれだけ近くに着くか(通常の編隊は70)
};

// --- 発艦のダイヤモンド編隊 -------------------------------------------
// ★ 発艦直後だけ、僚機を自機のまわりの定位置に貼り付ける。
//   ふだんの僚機は各自の判断で動くが(updateWingmen)、
//   発艦の場面は「四機で出た」ことを見せるための絵なので、
//   隊形が崩れては意味がない。
//
//   自機は菱形のいちばん後ろに置く。三人称のカメラは自機の後ろにあるので、
//   前を行く三機が視界に入る ― カイトが四番機(いちばん新しい当番)である
//   ことも、位置関係だけで伝わる。
// ★ 間隔は「三人称のカメラに四機とも、機体だと分かる大きさで写るか」で決めた。
//   最初は 150 も前に置いていたが、カメラは自機の 10.5 後ろにあるので
//   前方150 の機体は点にしかならない ― 編隊を組んでいることが伝わらなかった。
//   かといって左右を近づけすぎると、今度は横の二機だけがカメラの間近に来て
//   画面の端で大きく写り、菱形に見えない(横38・前19 で実際そうなった)。
//   前後の差を縮めて 前52・横27・斜め30 にすると、
//   三機がだいたい同じ大きさで、画面座標 ±0.5 の内側に収まる。
//   戦闘機の全幅は約6なので、横27 は4機半ぶんの間隔 ― 密だが接触しない。
const WING_DIAMOND = [
  [  0,  10, -52],   // 一番機:正面やや上
  [-27,  -3, -30],   // 二番機:左
  [ 27,  -3, -30],   // 三番機:右
];
let wingFormation = false;
function setWingFormation(on) { wingFormation = !!on; }

let wingCallsLeft = 0;   // 残りの回数
let wingCallLeft  = 0;   // 効いている残り秒数

let wingmen = [];
let wingBolts = [];

// 残り回数(計器の表示用)
function wingCallCount() { return wingCallsLeft; }
// いま呼集が効いているか
function wingRallying()  { return wingCallLeft > 0; }
// 呼集の仕掛けを使う出撃か(僚機がいない訓練飛行では計器に出さない)
function wingCallActive() { return wingmen.length > 0; }

// 呼ぶ。keydown(H)から呼ばれる
function callWingmen() {
  const alive = wingmen.filter(function (w) { return !w.dead; });

  // 誰も残っていない ― これはこの戦いの結末そのものなので、
  // 「使えない」ではなく「応答がない」と出す
  if (!alive.length) {
    if (typeof addCombatLog === 'function') addCombatLog(t('wing.call.none'), 'warn');
    if (typeof playDenied === 'function') playDenied();
    return false;
  }
  if (wingCallsLeft <= 0) {
    if (typeof addCombatLog === 'function') addCombatLog(t('wing.call.empty'), 'warn');
    if (typeof playDenied === 'function') playDenied();
    return false;
  }

  wingCallsLeft -= 1;
  wingCallLeft   = WINGMAN_CALL.SEC;

  if (typeof addCombatLog === 'function') {
    addCombatLog(t('wing.call.on') + ' ― ' + t('wing.call.rest')
                 .replace('%s', String(wingCallsLeft)), 'kill');
  }
  if (typeof playWingCall === 'function') playWingCall();
  if (typeof radioSay === 'function') {
    const lines = ['了解 ― そっちへ行く', '任せろ、いま行く', '回り込む。持ちこたえろ'];
    radioSay(alive[Math.floor(Math.random() * alive.length)].def.numKey,
             lines[Math.floor(Math.random() * lines.length)], true);
  }
  return true;
}

// --- 出す -----------------------------------------------------------
function spawnWingmen() {
  clearWingmen();
  // 呼べる回数は出撃ごとに戻す(clearWingmen ではなくここ ―
  // 訓練飛行でも clearWingmen は呼ばれるので、そちらへ書くと意味が変わる)
  wingCallsLeft = WINGMAN_CALL.MAX;
  wingCallLeft  = 0;
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
  wingCallsLeft = 0;   // 僚機のいない出撃では計器にも出さない
  wingCallLeft  = 0;
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
  // 一時停止中は僚機も時間も止める(呼集の残り時間を食い潰さないため)
  if (typeof combatFrozen !== 'undefined' && combatFrozen) return;

  // ★ 呼集の残り時間は、僚機がいてもいなくても減らす。
  //   下の「僚機がいなければ帰る」より前に置くこと ―
  //   呼んだ直後に最後の一機が落ちると、ここへ辿り着けなくなって
  //   残り時間が止まったままになり、計器が光りっぱなしになる。
  if (wingCallLeft > 0) wingCallLeft = Math.max(0, wingCallLeft - dt);

  if (!wingmen.length || !playerShip) return;

  // --- 発艦中:編隊を組んだまま自機について来る -----------------------
  // 各自の判断(下の処理)はいっさい働かせない。撃たないし、敵も見ない。
  if (wingFormation) {
    for (let i = 0; i < wingmen.length; i++) {
      const w = wingmen[i];
      if (w.dead) continue;
      const o = WING_DIAMOND[i % WING_DIAMOND.length];
      const off = new THREE.Vector3(o[0], o[1], o[2]).applyQuaternion(playerShip.quaternion);
      w.group.position.copy(playerShip.position).add(off);
      w.group.quaternion.copy(playerShip.quaternion);
    }
    updateWingBolts(dt);
    return;
  }

  const rally = wingCallLeft > 0;

  for (const w of wingmen) {
    if (w.dead) continue;          // 落ちた僚機は動かさない(escape.js が落とす)

    // --- 誰を狙うか ---
    // ふだん … 自分にいちばん近い敵(それぞれ勝手に戦う)
    // 呼集中 … 「自機にいちばん近い敵」を三機そろって狙う。
    //          呼んだのに各自の都合で散っては、呼んだ意味がない。
    let best = null;
    let bestD = rally ? WINGMAN_CALL.RANGE : WINGMAN.ENGAGE_RANGE;
    if (typeof enemies !== 'undefined') {
      const from = rally ? playerShip.position : w.group.position;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = from.distanceTo(e.group.position);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    w.target = best;
    // bestD は「測った元」からの距離なので、撃つ判定には自分からの距離を取り直す。
    // ここを取り違えると、遠くから撃てないはずの弾が出る
    const myD = best ? w.group.position.distanceTo(best.group.position) : Infinity;

    // --- どこへ向かうか ---
    // 敵がいれば敵。いなければ自機の斜め前(はぐれないように)。
    // 呼集中は自機のすぐ脇に着けるので、寄る半径を縮める
    const ring = rally ? WINGMAN_CALL.SLOT : WINGMAN.FORM_RADIUS;
    const aim = new THREE.Vector3();
    if (best) {
      aim.copy(best.group.position);
    } else {
      const o = w.def.offset;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion);
      aim.copy(playerShip.position)
         .add(fwd.multiplyScalar(ring))
         .add(new THREE.Vector3(o[0] * ring * 0.6,
                                o[1] * WINGMAN.FORM_HEIGHT,
                                0));
    }

    // --- 向きをそちらへ寄せる ---
    const look = new THREE.Matrix4().lookAt(w.group.position, aim, new THREE.Vector3(0, 1, 0));
    const want = new THREE.Quaternion().setFromRotationMatrix(look);
    w.group.quaternion.rotateTowards(want, WINGMAN.TURN * dt);

    // --- 前へ進む ---
    // 呼集中は速い。巡航のままでは、呼んでも間に合わないうちに時間が切れる
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(w.group.quaternion);
    const spd = WINGMAN.SPEED * (rally ? WINGMAN_CALL.SPEED_MULT : 1);
    w.group.position.addScaledVector(fwd, spd * dt);

    // --- 撃つ ---
    w.fireCool -= dt;
    if (best && myD < WINGMAN.FIRE_RANGE && w.fireCool <= 0) {
      const toE = best.group.position.clone().sub(w.group.position).normalize();
      if (toE.dot(fwd) > WINGMAN.FIRE_CONE) {
        fireWingmanBolt(w, best);
        w.fireCool = rally ? WINGMAN_CALL.FIRE_EVERY : WINGMAN.FIRE_EVERY;
      }
    }

    // --- 敵を見つけたら一度だけ言う ---
    if (best && !w.said && myD < WINGMAN.FIRE_RANGE * 1.5) {
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
