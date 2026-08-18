// ===================================================================
// STEEL CRADLE / アルカディア脱出戦
//
// 一章の戦闘。訓練飛行とは勝ち方が違う。
//
// 【原典】小説「二 七分間」
//   「防衛隊の四機は一時間もたなかった」
//   「生き残り三百十一人を詰めた老朽貨物船が港を離れたとき、
//     脱出の成功を信じる者は船内に一人もいなかった」
//
// つまりこの戦いは:
//   勝利 = 貨物船が港を出ること。撃墜数ではない
//   敗北 = 貨物船が沈むこと / 自機を失うこと
//   そして勝っても、村は落ちる
//
// 【襲撃の理由】
//   表向き「無登録居住体の接収」― 人ではなく資産として扱われている。
//   本当の狙いは祠に秘匿された紋章と神器コア(仕様書 §主要人物)。
//   だがカイトはまだ知らない。だから戦闘中の表示にも出さない。
//
// 【僚機は落ちる】
//   四機は保たない。これは演出ではなく、この戦いの内容そのもの。
//   プレイヤーが上手く飛んでも守り切れない ― そう作ってある。
//   下の LOSS_AT がその保証。敵が近ければそれで落ちるが、
//   何も起きなくても、この進行度までには必ず一機ずつ失う。
//   ごまかさずに書いておく:ここは意図的に仕組んである。
// ===================================================================

const ESCAPE = {
  // ★ 二段構えにしてある。
  //   前半 = 港で待つ貨物船を守る。後半 = 射出された貨物船を追う。
  //   「時間切れで終わり」ではなく、最後に動きのある締めを置きたかった。
  DEFEND_SEC:     150,    // 守る時間。240秒は長すぎた(集中が保たない)
  CHASE_SEC:       26,    // 射出されてから決着まで
  SPEED:            7,    // 港を離れるときの速さ。鈍い
  // 自機は配分25%固定なので巡航17。追いつけない数字にすると追跡が成立しない。
  LAUNCH_SPEED:    44,    // 射出後の貨物船の速さ(巡航の約6倍)
  LAUNCH_RAMP:    2.6,    // この秒数かけて加速する(いきなり消えると何が起きたか分からない)
  CHASE_SPEED:     52,    // 追跡中の自機の速さ。貨物船よりわずかに速い ―
                          // 離されはしないが、追いついた実感は自分で作る余地を残す

  // ★ 数字は「守り切れるか」から逆算した。最初は HP60・毎秒1.6 にしていたが、
  //   敵1機が近づいただけで38秒で沈む ― 240秒の任務なのに守りようがない。
  //   いまは 敵1機=240秒 / 2機=120秒 / 3機=80秒。
  //   放っておけば必ず沈むが、駆けつければ間に合う。
  FREIGHTER_HP:   120,
  THREAT_RANGE:   300,    // 敵がこれより近いと貨物船を削られる
  THREAT_DPS:     0.5,    // 1機あたり毎秒この量

  // 僚機は escape.js の予定表(LOSS_AT)で必ず落ちる。
  // この削られ方は「敵に囲まれたら予定より早く落ちる」ぶんなので、
  // 予定を追い越しすぎない速さにしてある(敵2機で約18秒)。
  // ★ 粘らせる。敵が6機に増えたので、前の HP16 だと囲まれた瞬間に消えた。
  WING_HP:         34,
  WING_THREAT:    170,    // 敵がこれより近いと僚機が削られる
  WING_DPS:      0.40,

  // 進行度がここを超えたら、まだ生きている僚機を1機失う。
  // 「守り切れない」を保証するための仕掛け。
  // ★ 後ろへ寄せた。早々に一人になると、守っている実感の前に諦めが来る。
  //   最後の一機は射出の直前まで残る ― 誰もいなくなってから追いかける。
  LOSS_AT: [0.46, 0.72, 0.93],

  SURVIVORS: 311,         // 貨物船に詰めた人数(小説の数字)

  // 敵は哨戒機のみ。小説「企業艦隊の哨戒網」。
  // 超弩級戦艦(boss.js)はこの戦闘には出さない ― main.js 側で止めてある。
  ENEMY_TYPE: 'SOLDIER',
};

let freighter    = null;
let escapeActive = false;
let escapeTime   = 0;      // 経過(秒)
let escapeLosses = 0;      // 失った僚機の数
let freighterHp  = 0;
let escapePhase  = 'defend';   // 'defend'(港を守る) → 'launch'(射出・追跡)
let launchDir    = null;       // 射出の向き。決まった一方向へまっすぐ出る
let launchSpeed  = 0;
let chaseTime    = 0;

// --- 貨物船を組み立てる -------------------------------------------
// 戦艦(boss.js)とは別物。武装が無く、鈍く、大きいだけの船。
function buildFreighter() {
  const g = new THREE.Group();
  const HULL = 0x59615f, DECK = 0x3a403f, EDGE = 0x05080b;

  const hull = createFlatPart(new THREE.BoxGeometry(26, 12, 78), HULL, EDGE);
  g.add(hull);

  // 船首は少し細い。貨物船らしい寸胴を崩す
  const bow = createFlatPart(new THREE.BoxGeometry(16, 9, 18), HULL, EDGE);
  bow.position.set(0, 0, -46);
  g.add(bow);

  // 上構(人が乗っている場所)
  const bridge = createFlatPart(new THREE.BoxGeometry(12, 9, 16), DECK, EDGE);
  bridge.position.set(0, 10, 26);
  g.add(bridge);

  // 貨物の塊。311人はここに詰められている
  for (let i = -1; i <= 1; i++) {
    const box = createFlatPart(new THREE.BoxGeometry(9, 8, 16), DECK, EDGE);
    box.position.set(i * 9, 9.5, -6 + i * 2);
    g.add(box);
  }

  // 推進機。1基だけ、大きい
  const eng = createFlatPart(new THREE.CylinderGeometry(7, 8, 12, 7), DECK, EDGE);
  eng.rotateX(Math.PI / 2);
  eng.position.set(0, 0, 44);
  g.add(eng);

  return g;
}

// --- 始める ---------------------------------------------------------
function startEscape() {
  clearEscape();
  if (typeof scene === 'undefined' || !scene || !playerShip) return;

  freighter = buildFreighter();
  // 自機の少し前・下に置く。プレイヤーが振り返れば必ず見える位置
  freighter.position.copy(playerShip.position).add(new THREE.Vector3(0, -40, 210));
  scene.add(freighter);

  freighterHp  = ESCAPE.FREIGHTER_HP;
  escapeTime   = 0;
  escapeLosses = 0;
  escapeActive = true;
  escapePhase  = 'defend';
  launchSpeed  = 0;
  chaseTime    = 0;
  launchDir    = null;
  if (typeof setSpeedOverride === 'function') setSpeedOverride(0);

  if (typeof missionTime !== 'undefined') missionTime = ESCAPE.DEFEND_SEC;

  // 敵は哨戒機だけにする。小説の「企業艦隊の哨戒網」に合わせる ―
  // 初戦にハウンド(追い回す)やスナイパー(遠距離)は出てこない。
  if (typeof setArchetypeLock === 'function') setArchetypeLock(ESCAPE.ENEMY_TYPE);
  // いま飛んでいる敵も哨戒機へ揃え直す
  if (typeof enemies !== 'undefined' && typeof assignArchetype === 'function') {
    for (const e of enemies) assignArchetype(e, ESCAPE.ENEMY_TYPE);
  }
}

function clearEscape() {
  if (freighter && freighter.parent) freighter.parent.remove(freighter);
  freighter = null;
  escapeActive = false;
  // 敵のタイプの固定を解く。訓練飛行では3タイプが混ざるのが既定
  if (typeof setArchetypeLock === 'function') setArchetypeLock(null);
  if (typeof setSpeedOverride === 'function') setSpeedOverride(0);
  escapePhase = 'defend';
}

const escapeRunning = () => escapeActive && freighter !== null;

// --- 毎コマ ---------------------------------------------------------
function updateEscape(dt) {
  if (!escapeRunning()) return;
  if (typeof combatFrozen !== 'undefined' && combatFrozen) return;
  if (typeof missionState !== 'undefined' && missionState !== 'active') return;

  escapeTime += dt;

  // --- 近くの敵が貨物船を削る(どちらの段でも効く) ---
  // 敵AIに「貨物船を狙う」を作り込むと敵の実装へ深く手を入れることになる。
  // ここでは「近くにいる敵の数ぶん削られる」という形にしてある。
  // プレイヤーの仕事は、貨物船のそばから敵を減らすこと。
  let near = 0;
  if (typeof enemies !== 'undefined') {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.group.position.distanceTo(freighter.position) < ESCAPE.THREAT_RANGE) near++;
    }
  }
  if (near > 0) {
    const before = freighterHp;
    freighterHp -= ESCAPE.THREAT_DPS * near * dt;
    if (before >= ESCAPE.FREIGHTER_HP * 0.5 && freighterHp < ESCAPE.FREIGHTER_HP * 0.5) {
      if (typeof addCombatLog === 'function') addCombatLog(t('esc.hit'), 'warn');
    }
  }
  if (freighterHp <= 0) {
    freighterHp = 0;
    if (typeof endMission === 'function') endMission('failed', t('esc.lost'));
    return;
  }

  if (escapePhase === 'defend') updateDefendPhase(dt);
  else updateLaunchPhase(dt);
}

// --- 前半:港で待つ貨物船を守る -------------------------------------
function updateDefendPhase(dt) {
  const progress = Math.min(escapeTime / ESCAPE.DEFEND_SEC, 1);

  freighter.position.z += ESCAPE.SPEED * dt;      // 港をゆっくり離れる
  updateWingmanLosses(dt, progress);

  // 残り時間を知らせる。数字を見なくても段取りが分かるように
  const left = ESCAPE.DEFEND_SEC - escapeTime;
  for (const mark of [60, 30, 10]) {
    if (left <= mark && left + dt > mark) {
      if (typeof addCombatLog === 'function') {
        addCombatLog(t('esc.count').replace('%s', String(mark)), 'warn');
      }
    }
  }

  if (progress >= 1) beginLaunch();
}

// --- 射出 -----------------------------------------------------------
function beginLaunch() {
  escapePhase = 'launch';
  chaseTime = 0;
  launchSpeed = 0;

  // ★ 決まった一方向へまっすぐ出る。
  //   貨物船は鈍くて曲がれない ― 一度向いた先へ、加速して抜けるだけ。
  //   自機の正面ではなく貨物船の船首方向にしてあるので、
  //   プレイヤーは「置いていかれる」ところから追いかけ始める。
  launchDir = new THREE.Vector3(0, 0, 1);
  if (playerShip) {
    // 港の外(自機から見て前方やや上)へ抜ける
    launchDir = new THREE.Vector3(0.18, 0.10, 1).normalize();
  }

  if (typeof addCombatLog === 'function') addCombatLog(t('esc.launch'), 'warn');
  if (typeof playSortie === 'function') playSortie();

  // 追いつけるように、機体が全力を出す(配分の操作は教えていないので自動)
  if (typeof setSpeedOverride === 'function') setSpeedOverride(ESCAPE.CHASE_SPEED);
  if (typeof missionTime !== 'undefined') missionTime = ESCAPE.CHASE_SEC;
}

// --- 後半:射出された貨物船を追う -----------------------------------
function updateLaunchPhase(dt) {
  chaseTime += dt;

  // だんだん速くなる。いきなり消えると何が起きたか分からない
  const ramp = Math.min(chaseTime / ESCAPE.LAUNCH_RAMP, 1);
  launchSpeed = ESCAPE.LAUNCH_SPEED * ramp;
  freighter.position.addScaledVector(launchDir, launchSpeed * dt);

  if (chaseTime >= ESCAPE.CHASE_SEC) {
    if (typeof setSpeedOverride === 'function') setSpeedOverride(0);
    if (typeof endMission === 'function') endMission('escaped');
  }
}

// --- 僚機の消耗 -----------------------------------------------------
function updateWingmanLosses(dt, progress) {
  if (typeof wingmen === 'undefined' || !wingmen.length) return;

  for (const w of wingmen) {
    if (w.dead) continue;
    if (w.hp === undefined) w.hp = ESCAPE.WING_HP;

    // 近くの敵に削られる
    let near = 0;
    if (typeof enemies !== 'undefined') {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (e.group.position.distanceTo(w.group.position) < ESCAPE.WING_THREAT) near++;
      }
    }
    if (near > 0) w.hp -= ESCAPE.WING_DPS * near * dt;
    if (w.hp <= 0) loseWingman(w);
  }

  // ★ 何も起きなくても、この進行度までには必ず一機ずつ失う。
  //   守り切れないことがこの戦いの内容なので、運任せにしない。
  while (escapeLosses < ESCAPE.LOSS_AT.length && progress >= ESCAPE.LOSS_AT[escapeLosses]) {
    const alive = wingmen.filter((w) => !w.dead);
    if (!alive.length) break;
    loseWingman(alive[0]);
  }
}

function loseWingman(w) {
  if (w.dead) return;
  w.dead = true;
  escapeLosses++;

  // 3D空間が無い状況でも落ちないようにする(起動に失敗した場合など)
  if (typeof spawnFlash === 'function' && typeof scene !== 'undefined' && scene) {
    spawnFlash(w.group.position, 30, 0xffc070, 0.5);
  }
  if (typeof playKill === 'function') playKill();
  if (typeof addCombatLog === 'function') {
    addCombatLog(t(w.def.numKey) + ' ' + t('esc.down'), 'bad');
  }
  if (w.group.parent) w.group.parent.remove(w.group);
}

// --- 計器に出す値 ---------------------------------------------------
function escapeStatus() {
  if (!escapeRunning()) return null;
  return {
    hp: Math.max(0, Math.round(freighterHp)),
    hpMax: ESCAPE.FREIGHTER_HP,
    progress: Math.min(escapeTime / ESCAPE.DEFEND_SEC, 1),
    wingAlive: (typeof wingmen !== 'undefined')
      ? wingmen.filter((w) => !w.dead).length : 0,
  };
}
