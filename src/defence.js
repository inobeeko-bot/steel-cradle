// ===================================================================
// STEEL CRADLE / アルカディア防衛戦
//
// 一章の戦闘。これは「防衛戦」という名前だが、守り切る戦いではない。
// 時間稼ぎと敗走。勝っても村は落ちる。
//
// 【原典】小説v2「二 暗闇の回廊」
//   ★ 参照するのは docs/steel_cradle_novel_v2.md。
//     改稿前のv1は削除済み。_v2 の付かない小説を見つけても読まないこと。
//
//   「二十年続いた戦争には、たったひとつの不文律があった。
//     畑と空気は、撃たない。撃てば次に焼かれるのは自分の畑だと、
//     どの勢力も知っていたからだ。
//     ――その不文律は、帳簿に載った畑だけを守っていた」
//
//   「防衛隊の四機は一時間もたなかった」
//   「カイトが最後に見た地上の光景は、燃える果樹園と、
//     旧ドックへ走る祖父の背中だった」
//
// つまりこの戦いは:
//   勝利 = 決められた時間を生き延びること。撃墜数ではない
//   敗北 = 自機を失うこと。それだけ
//   そして勝っても村は落ちる ― 焼失率は必ず上がり続ける
//
// 【この戦闘で見せたいもの】
//   敵が果樹園を撃つ。畑を撃つ。
//   二十年、どの勢力もやらなかったことを、目の前でやる。
//   アルカディアは帳簿に載っていないので、不文律の外にある ―
//   カイトはまだその理屈を知らないが、異常であることは分かる。
//
// 【僚機は落ちる】
//   四機のうち三機(自機が四機目)。これは演出ではなく戦いの内容そのもの。
//   下の LOSS_AT がその保証。敵が近ければそれで落ちるが、
//   何も起きなくても、この進行度までには必ず一機ずつ失う。
//   ごまかさずに書いておく:ここは意図的に仕組んである。
//
// 【この章に入れないもの】
//   貨物船の脱出と、その後の「砲火は来なかった」は入れない。
//   v2はあの奇跡に理由を書かない ―「誰も、何も、調べなかった」。
//   遊びとして見せた時点で、プレイヤーが調べてしまう。後の章で扱う。
// ===================================================================

const DEFENCE = {
  HOLD_SEC:      180,    // これだけ生き延びれば任務達成

  // --- コロニーへの砲撃 ---------------------------------------------
  // 敵の何割かは自機を見ない。最初からコロニーだけを撃っている。
  // これがこの戦闘の主題なので、割合は高めに取ってある ―
  // 「こっちを狙ってこない敵がいる」と気付けることが大事。
  BOMBARD_RATIO:  0.45,  // コロニーを撃つ機の割合(9機なら4機)
  BOMBARD_EVERY:   5.0,  // 1機が撃つ間隔(秒)
  BOMBARD_SPEED:   900,  // 撃った弾がコロニーへ届くまでの速さ

  // --- 焼失率 -------------------------------------------------------
  // ★ 村は必ず落ちる(CREEP)。ただし「どれだけ焼けたか」は変わる。
  //   失敗条件にはしない ― 守り切れないことは決まっているので、
  //   そこで敗北にすると、決まっている結末で罰することになる。
  //   代わりに結果画面へ数字として残す。上手い人ほど数字が小さい。
  //
  //   数字の根拠(180秒):
  //     放っておくと … 4機 × 36発 × 0.55 + 0.10×180 = 97%(ほぼ全焼)
  //     撃ち落とすと … その半分 + 18% = 約58%
  //   村は必ず燃えるが、どこまで燃えるかはプレイヤー次第になる。
  BURN_PER_HIT:   0.55,  // 着弾1発で進む焼失率(%)
  BURN_CREEP:     0.10,  // 何もしなくても毎秒進む(%)。地上の火の手
  BURN_MAX:        100,

  // --- 僚機 ---------------------------------------------------------
  WING_HP:         140,
  WING_THREAT:     170,  // 敵がこれより近いと僚機が削られる
  WING_DPS:       0.08,
  // 進行度がここを超えたら、まだ生きている僚機を1機失う。
  // 72秒 / 119秒 / 158秒。最後の22秒はひとりで飛ぶことになる。
  LOSS_AT: [0.40, 0.66, 0.88],

  ENEMY_TYPE: 'SOLDIER',   // 哨戒機だけ。超弩級戦艦は出さない

  // --- 交戦空域の境界 -----------------------------------------------
  // ★ 縛る理由は「当番士の職務」。
  //   カイトは避難民を誘導する当番で出ている。村から離れれば
  //   誘導する相手が視界から消える ― だから戻る。
  //   罰ではない。失敗にもしないし、焼失率も増えない。
  //   引き戻す演出だけを置く。
  //
  //   広さは自由度優先で決めた。自機は配分25%固定で巡航17なので、
  //   1400 まっすぐ飛び続けて82秒。180秒の任務の半分近くを
  //   逃げ続けて初めて届く。ふつうに戦っている限り一生出ない。
  //   敵との交戦距離は85しかないので、戦闘は自機の周囲300で完結する。
  BOUND_WARN:     1100,  // ここを越えると一言だけ(操作は奪わない)
  BOUND_TURN:     1400,  // ここを越えると強制的に機首を持ち場へ向ける
  BOUND_RELEASE:    40,  // 機首が持ち場からこの角度以内に入ったら操作を返す(度)
  // ★ 万一向き切れなくても、この秒数で必ず返す。
  //   2.5 にしていたが、実測の最悪が2.4秒で余裕が0.1秒しか無かった ―
  //   旧式艇は右の推力偏向が渋い(効き0.55)ので、右へ180度回すと遅い。
  //   打ち切られると、外を向いたまま操作が返る = 引き戻しが効かない。
  //   向き切れば即座に返るので、上げても普段の体感は変わらない。
  BOUND_MAX_SEC:   3.5,
  // ★ 操作を返したあと、すぐには再発動させない。
  //   これが無いと、境界の外に留まったとき毎コマ発動と解除を繰り返し、
  //   舵が点滅して操縦できなくなる(実際にそうなった)。
  //   内側へ戻れば即座に再武装するので、外に居座り続けたときだけ効く。
  BOUND_REARM:       6,  // 外に留まったまま、次に引き戻すまでの秒数

  // --- 発艦(戦闘が始まる前の移動)-----------------------------------
  // ★ コロニーのすぐ脇から、持ち場まで四機で一気に飛ぶ。
  //   ここは戦闘ではなく「出てきた」ことを見せるための時間なので、
  //   操縦も編隊も機体に預ける。プレイヤーは見ているだけでよい。
  //   ADVの発艦筒から出た直後の続き、という位置づけ。
  RUN_DIST:       1630,  // 持ち場から何だけ離れた所から始めるか
                         //(村の中心まで1570 ― 輪の外縁1170の外側400)
  RUN_SPEED:       340,  // 巡航17の20倍。「射出された」速さ
  RUN_END:         160,  // 持ち場にこれだけ近づいたら戦闘へ渡す
  RUN_MAX_SEC:      12,  // 何かあっても、この秒数で必ず戦闘へ渡す
};

let defenceActive = false;
let holdTime      = 0;     // 経過(秒)
let burnPct       = 0;     // 焼失率(0〜100)
let defenceLosses = 0;     // 失った僚機の数
let bombRounds    = [];    // 飛んでいる砲撃弾
let burnSaid      = 0;     // どこまで焼失を報告したか(25/50/75/100)

let defencePhase  = 'fight';   // 'run'(発艦の移動) → 'fight'(戦闘)
let runLeft       = 0;         // 発艦の移動に使える残り秒(保険)

let homePos       = null;  // 出撃地点。境界はここを中心に測る
let colonyPos     = null;  // 固定したアルカディアの位置
let boundSaid     = 0;     // 何回、戻れと言ったか(初回だけ理由を言う)
let boundRearm    = 0;     // 外に留まったまま、次に引き戻すまでの残り秒
let lastBoundLine = '';    // 直前に言った一言(同じものを続けないため)
let pullbackLeft  = 0;     // 引き戻し中の残り秒(0 なら操作はプレイヤーのもの)
let warnedOut     = false; // 注意の輪の外にいるか(出入りのたびに言わないため)

// --- 始める ---------------------------------------------------------
function startDefence() {
  clearDefence();
  defenceActive = true;
  holdTime = 0;
  burnPct  = 0;
  defenceLosses = 0;
  burnSaid = 0;

  // 敵は哨戒機だけに固定する。
  // 小説の企業艦隊は「倒す相手」ではなく、村を焼く環境として書かれている。
  if (typeof setArchetypeLock === 'function') setArchetypeLock(DEFENCE.ENEMY_TYPE);
  // ★ この戦闘では敵のミサイルを封じる。強すぎる ―
  //   旧式艇の対抗手段はフレアだけで、しかもフレアの使い方は
  //   まだ物語の中で誰にも教わっていない。
  if (typeof setEnemyMissiles === 'function') setEnemyMissiles(false);
  assignBombardiers();

  // 境界の中心は出撃地点。村はここから決まった方角へ固定する
  boundSaid = 0; boundRearm = 0; pullbackLeft = 0; warnedOut = false; lastBoundLine = '';
  homePos = (typeof playerShip !== 'undefined' && playerShip)
    ? playerShip.position.clone() : null;
  colonyPos = (typeof anchorColony === 'function') ? anchorColony() : null;

  // 任務時間は「生き延びる時間」そのもの
  if (typeof missionTime !== 'undefined') missionTime = DEFENCE.HOLD_SEC;

  beginLaunchRun();
}

// --- 発艦。コロニーの脇から持ち場まで、四機で飛ぶ ---------------------
function beginLaunchRun() {
  defencePhase = 'fight';
  runLeft = 0;
  if (!homePos || !colonyPos) return;          // 3Dが無い状況では省く
  if (typeof playerShip === 'undefined' || !playerShip) return;

  // 村のすぐ脇へ置く。持ち場から見て村の方向へ RUN_DIST 進んだ所
  const toVillage = colonyPos.clone().sub(homePos).normalize();
  playerShip.position.copy(homePos).addScaledVector(toVillage, DEFENCE.RUN_DIST);

  // 持ち場へ向けて、最初から高速で飛んでいる状態にする
  if (typeof launchShipToward === 'function') launchShipToward(homePos, DEFENCE.RUN_SPEED);
  if (typeof setWingFormation === 'function') setWingFormation(true);
  if (typeof placeWingmenNearPlayer === 'function') placeWingmenNearPlayer();

  defencePhase = 'run';
  runLeft = DEFENCE.RUN_MAX_SEC;

  if (typeof addCombatLog === 'function') addCombatLog(t('run.log'), 'warn');
  if (typeof playFreighterLaunch === 'function') playFreighterLaunch();
  if (typeof startShake === 'function') startShake(0.9);
}

function updateLaunchRun(dt) {
  runLeft -= dt;
  const left = playerShip ? playerShip.position.distanceTo(homePos) : 0;
  if (left <= DEFENCE.RUN_END || runLeft <= 0) endLaunchRun();
}

function endLaunchRun() {
  defencePhase = 'fight';
  if (typeof setSpeedOverride === 'function') setSpeedOverride(0);
  if (typeof setWingFormation === 'function') setWingFormation(false);
  // 移動で減ったぶんの時間を戻す。戦うための180秒はここから数える
  if (typeof missionTime !== 'undefined') missionTime = DEFENCE.HOLD_SEC;
  if (typeof addCombatLog === 'function') addCombatLog(t('run.arrive'), 'warn');
  if (typeof radioSay === 'function' && typeof wingmen !== 'undefined') {
    const alive = wingmen.filter(function (w) { return !w.dead; });
    if (alive.length) radioSay(alive[alive.length - 1].def.numKey, t('run.say'), true);
  }
}


function clearDefence() {
  defenceActive = false;
  holdTime = 0;
  burnPct  = 0;
  defenceLosses = 0;
  burnSaid = 0;
  for (const r of bombRounds) {
    if (r.mesh && r.mesh.parent) r.mesh.parent.remove(r.mesh);
  }
  bombRounds = [];
  if (typeof clearColonyFires === 'function') clearColonyFires();   // 村を元の色へ戻す
  homePos = null; colonyPos = null;
  boundSaid = 0; boundRearm = 0; pullbackLeft = 0; warnedOut = false; lastBoundLine = '';
  defencePhase = 'fight'; runLeft = 0;
  if (typeof setWingFormation === 'function') setWingFormation(false);
  if (typeof setSpeedOverride === 'function') setSpeedOverride(0);
  if (typeof setArchetypeLock === 'function') setArchetypeLock(null);
  if (typeof setEnemyMissiles === 'function') setEnemyMissiles(true);   // 他の出撃へ戻す
  if (typeof releaseColony === 'function') releaseColony();   // 背景の追従へ戻す
}

const defenceRunning = () => defenceActive;

// --- 誰がコロニーを撃つか ---------------------------------------------
// ★ 均等に散らす。前から順に印を付けると、小隊がまるごと砲撃機になり、
//   「こっちを狙ってこない一団」ではなく「そこだけ別の戦場」になってしまう。
function assignBombardiers() {
  if (typeof enemies === 'undefined' || !enemies.length) return;
  const total = enemies.length;
  const want  = Math.max(1, Math.round(total * DEFENCE.BOMBARD_RATIO));
  for (const e of enemies) { e.bombards = false; e.bombCool = 0; }
  for (let i = 0; i < want; i++) {
    const e = enemies[Math.round(i * total / want) % total];
    e.bombards = true;
    // 撃ち始めをばらす。全機が同時に撃つと、間の時間が空いて嘘に見える
    e.bombCool = DEFENCE.BOMBARD_EVERY * (0.25 + Math.random() * 0.9);
  }
}

// --- 毎コマ -----------------------------------------------------------
function updateDefence(dt) {
  if (!defenceRunning()) return;
  if (typeof missionState !== 'undefined' && missionState !== 'active') return;
  if (typeof combatFrozen !== 'undefined' && combatFrozen) return;

  // --- 発艦の移動中 ---
  // 時間も焼失も敵も、まだ数えない。戦闘は持ち場に着いてから始まる
  if (defencePhase === 'run') { updateLaunchRun(dt); return; }

  holdTime += dt;
  const progress = Math.min(holdTime / DEFENCE.HOLD_SEC, 1);

  // 地上の火。何もしなくても広がり続ける ― 村は必ず落ちる
  addBurn(DEFENCE.BURN_CREEP * dt);

  updateBombardment(dt);
  updateBoundary(dt);
  updateWingmanLosses(dt, progress);

  // 生き延びた
  if (holdTime >= DEFENCE.HOLD_SEC) {
    defenceActive = false;
    if (typeof endMission === 'function') endMission('held');
  }
}

// --- 焼失率を進める ---------------------------------------------------
function addBurn(amount) {
  if (amount <= 0) return;
  burnPct = Math.min(burnPct + amount, DEFENCE.BURN_MAX);

  // 村の見た目へ反映する。数字を読まなくても、振り返れば分かる状態にする
  if (typeof setColonyBurn === 'function') setColonyBurn(burnPct);

  // 節目だけ報告する。毎回言うとうるさく、一度も言わないと気付かれない
  const marks = [25, 50, 75, 100];
  while (burnSaid < marks.length && burnPct >= marks[burnSaid]) {
    const pct = marks[burnSaid];
    burnSaid++;
    if (typeof addCombatLog === 'function') {
      addCombatLog(t('def.burn').replace('%s', String(pct)), pct >= 75 ? 'bad' : 'warn');
    }
    if (typeof radioSay === 'function' && typeof wingmen !== 'undefined') {
      const alive = wingmen.filter((w) => !w.dead);
      if (alive.length) {
        // ★ 台詞は「畑を撃たれている」という一点に絞る。
        //   不文律を知っているのは大人たちで、カイトはまだ知らない ―
        //   だから説明ではなく、信じられないという反応で出す。
        const lines = {
          25:  '果樹園に落ちてる ― 畑だぞ、あれ',
          50:  '居住区までやられてる。人がいるのに',
          75:  '旧ドックが燃えてる ― 誰か、誰か出てこい',
          100: '……もう、燃えるものが無い',
        };
        radioSay(alive[0].def.numKey, lines[pct], true);
      }
    }
  }
}

// --- 砲撃 -------------------------------------------------------------
// 敵がコロニーへ撃つ。弾は自機の脇を抜けて村へ飛んでいく ―
// 「自分が狙われていない」ことが見えるのが、この演出の要。
function updateBombardment(dt) {
  const colonyPos = (typeof colonyPosition === 'function') ? colonyPosition() : null;

  // --- 撃つ ---
  if (colonyPos && typeof enemies !== 'undefined') {
    for (const e of enemies) {
      if (!e.alive || !e.bombards) continue;
      e.bombCool -= dt;
      if (e.bombCool > 0) continue;
      e.bombCool = DEFENCE.BOMBARD_EVERY * (0.8 + Math.random() * 0.4);
      fireAtColony(e, colonyPos);
    }
  }

  // --- 飛んでいる弾を進める ---
  for (let i = bombRounds.length - 1; i >= 0; i--) {
    const r = bombRounds[i];
    r.t += dt;

    // 着弾点はコロニーに貼り付けておく。
    // コロニーは自機について来る背景なので(colony.js)、
    // 世界の座標で覚えると、飛んでいる間に的がずれてしまう。
    const now = (typeof colonyPosition === 'function') ? colonyPosition() : null;
    const target = now ? now.clone().add(r.offset) : r.to;

    const k = Math.min(r.t / r.life, 1);
    if (r.mesh) {
      r.mesh.position.lerpVectors(r.from, target, k);
      r.mesh.lookAt(target);
    }

    if (k >= 1) {
      colonyImpact(target);
      if (r.mesh && r.mesh.parent) r.mesh.parent.remove(r.mesh);
      bombRounds.splice(i, 1);
    }
  }
}

function fireAtColony(e, colonyPos) {
  if (typeof scene === 'undefined' || !scene) return;

  // 着弾点。リングの内側(果樹園のある面)に散らす。
  // 中心そのものを狙わせない ― 輪のどこかに落ちるほうが「面を焼いている」
  const r = (typeof colonyRadius === 'function') ? colonyRadius() : 1000;
  const a = Math.random() * Math.PI * 2;
  const d = r * (0.55 + Math.random() * 0.45);
  const offset = new THREE.Vector3(
    Math.cos(a) * d, Math.sin(a) * d, (Math.random() - 0.5) * r * 0.25);

  const from = e.group.position.clone();
  const to   = colonyPos.clone().add(offset);

  // 弾。自機の脇を抜けて村へ飛んでいく光の筋。
  // ★ 大きさは「見えること」から決めた。
  //   最初は長さ26・半径1.6にしていたが、飛ぶ距離が1900あるので
  //   ほとんどの時間ただの点にしかならず、何が飛んでいるのか分からなかった。
  //   長さ110・半径3.2にして、進行方向へ寝かせてある。
  //   自機のビーム(細い緑)とも、敵の弾(短い橙)とも見分けが付く太さ。
  const mesh = new THREE.Group();
  const geo = new THREE.CylinderGeometry(3.2, 1.2, 110, 6);
  geo.rotateX(Math.PI / 2);
  mesh.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffb060 })));

  // 先端の光。遠くても点が見えるようにする ―
  // 筋だけだと、離れた瞬間に画面から消えてしまう
  if (typeof makeFlareGlowTexture === 'function') {
    if (!flareGlowTex) flareGlowTex = makeFlareGlowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareGlowTex, color: 0xffd9a0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(34);
    glow.position.z = -52;      // 筋の先端(進む向き)
    mesh.add(glow);
  }

  mesh.position.copy(from);
  scene.add(mesh);

  bombRounds.push({
    mesh: mesh, from: from, to: to, offset: offset,
    t: 0, life: Math.max(0.6, from.distanceTo(to) / DEFENCE.BOMBARD_SPEED),
  });

  if (typeof playBombardFire === 'function') playBombardFire();
}

function colonyImpact(point) {
  addBurn(DEFENCE.BURN_PER_HIT);
  if (typeof scene !== 'undefined' && scene) {
    if (typeof spawnFlash === 'function') {
      spawnFlash(point, 120, 0xffb060, 0.8);
      spawnFlash(point, 60, 0xfff0d0, 0.35);
    }
    if (typeof spawnBlast === 'function') spawnBlast(point, 55, 0xff8a3c);
  }
  if (typeof playColonyHit === 'function') playColonyHit();
}

// --- 交戦空域の境界 ---------------------------------------------------
//
// 「守備範囲から出るな」ではなく「誘導する相手が見えなくなる」で縛る。
// カイトは戦闘機乗りではなく、避難の誘導に出ている当番士なので、
// 持ち場を離れることの意味が、勝ち負けではなく職務の側にある。
//
// ★ 罰は置かない。失敗にもしないし、焼失率も増えない ―
//   決まっている結末で罰しない、という焼失率と同じ考え方。
//   起きるのは「一言」と「機首が持ち場へ向く」だけ。
function updateBoundary(dt) {
  if (!homePos || typeof playerShip === 'undefined' || !playerShip) return;

  // 引き戻し中。向き切ったら操作を返す
  if (pullbackLeft > 0) {
    pullbackLeft -= dt;
    if (pullbackLeft <= 0 || headingErrorToStation() <= DEFENCE.BOUND_RELEASE) {
      pullbackLeft = 0;
      boundRearm = DEFENCE.BOUND_REARM;   // すぐには次を発動させない
    }
    return;
  }

  const out = playerShip.position.distanceTo(homePos);

  // --- 引き戻し ---
  if (out >= DEFENCE.BOUND_TURN) {
    // 外に居座っているあいだは、間を置いてから次を出す。
    // 毎コマ発動すると舵が点滅して、操縦そのものができなくなる
    if (boundRearm > 0) { boundRearm -= dt; return; }
    pullbackLeft = DEFENCE.BOUND_MAX_SEC;
    warnedOut = true;
    sayComeBack();
    return;
  }

  boundRearm = 0;   // 内側へ戻ったら、次の一回はすぐ効く

  // --- 注意(操作は奪わない)---
  // 一度しっかり中へ戻るまで、二度は言わない
  if (out >= DEFENCE.BOUND_WARN) {
    if (!warnedOut) {
      warnedOut = true;
      if (typeof radioSay === 'function') radioSay('radio.kaito', t('bound.far'), true);
    }
  } else if (out < DEFENCE.BOUND_WARN * 0.85) {
    warnedOut = false;   // 十分に戻ったら、また言えるようにする
  }
}

// 戻れ、と言う。初回だけ理由まで言い、そのあとは短く言い直す
function sayComeBack() {
  if (typeof radioSay !== 'function') return;

  if (boundSaid === 0) {
    // ★ 初回だけ二段。「こっちに人はいない」を先に置くのは、
    //   職務を説明せずに職務を伝えられるから ―
    //   避難民を誘導する係が、人のいないほうへ流されていたと気付く順番になる。
    radioSay('radio.kaito', t('bound.first1'), true);
    setTimeout(function () { radioSay('radio.kaito', t('bound.first2'), true); }, 1300);
    // 僚機が返す。独り言だけだと無線の場から浮くので、初回だけ受ける
    setTimeout(function () {
      if (typeof wingmen === 'undefined') return;
      const alive = wingmen.filter(function (w) { return !w.dead; });
      if (alive.length) radioSay(alive[alive.length - 1].def.numKey, t('bound.answer'), true);
    }, 2700);
  } else {
    // 2回目以降。直前と同じものは出さない ―
    // 同じ一言が続くと、人の声ではなく警告灯に聞こえる。
    // ★ 前は「boundSaid から計算する」書き方にしていて、
    //   実際には同じものが二度続いていた(検証で出た)。
    //   最後に使ったものを覚えて、そこから外して選ぶのが確実。
    const keys = ['bound.again1', 'bound.again2', 'bound.again3'];
    const pool = keys.filter(function (k) { return k !== lastBoundLine; });
    lastBoundLine = pool[Math.floor(Math.random() * pool.length)];
    radioSay('radio.kaito', t(lastBoundLine), true);
  }
  boundSaid++;
}

// 機首と持ち場のあいだの角度(度)。0 なら真っすぐ持ち場を向いている。
//
// ★ 向ける先は「持ち場(出撃地点)」であって、村ではない。
//   村は4200先にあるので、そちらへ向けると戦場からどんどん離れる ―
//   引き戻したはずが、いちばん遠ざかる向きへ送り出すことになる。
//   カイトが戻るべきなのは、僚機と敵がいる空域そのもの。
const _bFwd = new THREE.Vector3();
const _bTo  = new THREE.Vector3();
function headingErrorToStation() {
  if (!homePos || typeof playerShip === 'undefined' || !playerShip) return 0;
  _bFwd.set(0, 0, -1).applyQuaternion(playerShip.quaternion);
  _bTo.subVectors(homePos, playerShip.position).normalize();
  return Math.acos(Math.max(-1, Math.min(1, _bFwd.dot(_bTo)))) * 180 / Math.PI;
}

// いま引き戻し中か。main.js が舵を差し替えるのに使う
function defencePullingBack() { return pullbackLeft > 0; }

// 操縦を機体が預かっているか(発艦の移動中 または 引き戻し中)。
// ★ 奪うのは舵とロールと回避バーストだけ ―
//   射撃・視点・僚機呼集はどちらの場面でもプレイヤーのまま。
function defenceLocked() { return pullbackLeft > 0 || defencePhase === 'run'; }

const _pInv = new THREE.Quaternion();
const _pTo  = new THREE.Vector3();

// 持ち場へ機首を向けるための舵。turnView() にそのまま渡せる形で返す。
// 戻り値 { pitch, yaw } の範囲はキー入力と同じ −1〜+1。
// ★ 奪うのは舵だけ。射撃も速度も視点も、プレイヤーのまま。
function defenceAutoAim() {
  if (!defenceLocked() || !homePos) return null;
  if (typeof playerShip === 'undefined' || !playerShip) return null;

  // 持ち場の位置を「機体から見た座標」へ移す。
  // 向きの逆回転を掛けると、前が −Z・上が +Y・左が −X になる
  _pInv.copy(playerShip.quaternion).invert();
  _pTo.subVectors(homePos, playerShip.position).applyQuaternion(_pInv);

  const flat     = Math.sqrt(_pTo.x * _pTo.x + _pTo.z * _pTo.z);
  const yawErr   = Math.atan2(-_pTo.x, -_pTo.z);   // 左にいれば正
  const pitchErr = Math.atan2(_pTo.y, flat);       // 上にいれば正

  // 角度をそのまま舵にすると、正面に来た瞬間に舵が0になって行き過ぎる。
  // 3倍してから −1〜+1 に収めると、20度ほどずれた時点で目一杯になり、
  // 近づくにつれて自然に緩む
  const hold = function (x) { return Math.max(-1, Math.min(1, x * 3)); };
  return { pitch: hold(pitchErr), yaw: hold(yawErr) };
}

// --- 僚機の消耗 -------------------------------------------------------
function updateWingmanLosses(dt, progress) {
  if (typeof wingmen === 'undefined' || !wingmen.length) return;

  for (const w of wingmen) {
    if (w.dead) continue;
    if (w.hp === undefined) w.hp = DEFENCE.WING_HP;

    // 近くの敵に削られる
    let near = 0;
    if (typeof enemies !== 'undefined') {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (e.group.position.distanceTo(w.group.position) < DEFENCE.WING_THREAT) near++;
      }
    }
    if (near > 0) w.hp -= DEFENCE.WING_DPS * near * dt;
    if (w.hp <= 0) loseWingman(w);
  }

  // ★ 何も起きなくても、この進行度までには必ず一機ずつ失う。
  //   守り切れないことがこの戦いの内容なので、運任せにしない。
  while (defenceLosses < DEFENCE.LOSS_AT.length && progress >= DEFENCE.LOSS_AT[defenceLosses]) {
    const alive = wingmen.filter((w) => !w.dead);
    if (!alive.length) break;
    loseWingman(alive[0]);
  }
}

function loseWingman(w) {
  if (w.dead) return;
  w.dead = true;
  defenceLosses++;

  // 3D空間が無い状況でも落ちないようにする(起動に失敗した場合など)
  if (typeof spawnFlash === 'function' && typeof scene !== 'undefined' && scene) {
    spawnFlash(w.group.position, 30, 0xffc070, 0.5);
  }
  if (typeof playKill === 'function') playKill();
  if (typeof addCombatLog === 'function') {
    addCombatLog(t(w.def.numKey) + ' ' + t('def.down'), 'bad');
  }
  // 落ちた本人ではなく、残っている誰かが呼ぶ。
  // 落ちた機から声が来ては困るし、呼んで返事が無いことに意味がある。
  if (typeof radioSay === 'function' && typeof wingmen !== 'undefined') {
    const rest = wingmen.filter(function (o) { return !o.dead && o !== w; });
    if (rest.length) {
      radioSay(rest[0].def.numKey, '……' + t(w.def.numKey) + '、応答しろ', true);
    }
  }
  if (w.group.parent) w.group.parent.remove(w.group);
}

// --- レーダー・画面マーカー用の情報 -----------------------------------
// boss.js の bossContact() と同じ形で返す。
// ★ コロニーは「無条件で映る」。センサー配分にも熱にも左右されない ―
//   守っている場所が見えないのは、遊びとして成立しない。
const _cTo   = new THREE.Vector3();
const _cInv  = new THREE.Quaternion();
const _cNdc  = new THREE.Vector3();
const _cView = new THREE.Vector3();

function colonyContact() {
  if (!defenceRunning() || typeof playerShip === 'undefined' || !playerShip) return null;
  if (typeof camera === 'undefined' || !camera) return null;
  const pos = (typeof colonyPosition === 'function') ? colonyPosition() : null;
  if (!pos) return null;

  _cInv.copy(playerShip.quaternion).invert();
  _cTo.subVectors(pos, playerShip.position);
  const dist = _cTo.length();
  const local = _cTo.clone().applyQuaternion(_cInv);

  const ndc = _cNdc.copy(pos).project(camera);
  const inFront = camera.worldToLocal(_cView.copy(pos)).z < 0;

  return {
    localX: local.x, localY: local.y, localZ: local.z,
    dist: dist,
    ndcX: ndc.x, ndcY: ndc.y,
    inFront: inFront,
    burn: burnPct,
  };
}

// --- 計器に出す値 -----------------------------------------------------
function defenceStatus() {
  if (!defenceRunning()) return null;
  return {
    burn: burnPct,
    burnMax: DEFENCE.BURN_MAX,
    holdLeft: Math.max(0, DEFENCE.HOLD_SEC - holdTime),
    holdSec: DEFENCE.HOLD_SEC,
    progress: Math.min(holdTime / DEFENCE.HOLD_SEC, 1),
    wingAlive: (typeof wingmen !== 'undefined')
      ? wingmen.filter((w) => !w.dead).length : 0,
  };
}

// 結果画面が使う。任務が終わったあとも読めるように、running を見ない。
// ★ 持ちこたえた時間は missionTime から逆算しない ―
//   あちらは表示用に別で減っていて、途中で止められると合わなくなる。
//   ここで数えている holdTime が実測値そのもの。
function defenceBurn() { return burnPct; }
function defenceHeldSec() { return holdTime; }
function defenceWingAlive() {
  return (typeof wingmen !== 'undefined') ? wingmen.filter((w) => !w.dead).length : 0;
}
