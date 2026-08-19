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
  DEFEND_SEC:     180,    // 守る時間。240秒は長すぎ、150秒では僚機と飛ぶ時間が足りなかった
  // ★ 34秒 → 14秒。
  //   後半は「ただ加速しているだけ」の時間で、長さがそのまま退屈になっていた。
  //   加速を見せるのに必要なのは十数秒で足りる。短いほど、締めとして効く。
  CHASE_SEC:       14,    // 射出されてから決着まで
  SPEED:            7,    // 港を離れるときの速さ。鈍い

  // ★ 285 → 1140(さらに4倍)。自機の巡航(17)の67倍。
  //   加速の形は ease-in(t²)のままなので、1秒で93・2秒で372・
  //   3.5秒で1140 ― 最初はもたつき、気づくと手の届かない速さになる。
  //   これだけ速いと画面まわりの表現がいくつか破綻するので、
  //   噴射光(scene.js の thrustRatio)と塵の尾(DUST.TAIL_MAX)に
  //   上限を入れてある。速度を上げるときは、そちらも一緒に見ること。
  LAUNCH_SPEED:  1140,    // 射出後の貨物船の速さ
  LAUNCH_RAMP:    3.5,    // この秒数かけて加速する(いきなり消えると何が起きたか分からない)
  CHASE_MIN:       26,    // 追跡中の自機の最低速度(貨物船がまだ遅いあいだ)

  // --- 追う自機の位置取り ---
  // 「一定の距離を保って真後ろに着ける」ように、位置から速度を作る。
  // 単純に「貨物船より少し速い」にすると、速度が上がるほど差が誤差になり、
  // しかも詰め続けて最後には船の中へ入ってしまう。
  CHASE_TRAIL:    210,    // 貨物船の何だけ後ろに着けるか
  CHASE_CATCH:    0.9,    // 位置のずれを速度に直す強さ(大きいほどきびきび詰める)
  CHASE_EXTRA:    420,    // 貨物船よりどれだけ速く出してよいか(詰めるとき用)。
                          // 貨物船が速くなったぶん、ここも上げないと一生追いつけない
  // ★ 機首を向ける先を「貨物船そのもの」から「その真後ろ」へ変えるための距離。
  //   貨物船を直接狙わせると、横にいるときに船へ真っすぐ突っ込む ―
  //   追いかけているのではなく体当たりしに行く絵になっていた。
  //   定位置までの向きに「船の進む向き」を足すと、
  //   遠いうちは寄っていき、近づくほど船と同じ向きへ揃っていく。
  CHASE_LEAD:     320,    // どれだけ「前へ進む向き」を混ぜるか
  DRIFT_ACCEL:     12,    // 加速しきったあとも、毎秒この量だけ速くなり続ける ―
                          // 一定速度だと「もう終わった」ように見えるため

  // ★ 数字は「守り切れるか」から逆算した。最初は HP60・毎秒1.6 にしていたが、
  //   敵1機が近づいただけで38秒で沈む ― 240秒の任務なのに守りようがない。
  //   いまは 敵1機=240秒 / 2機=120秒 / 3機=80秒。
  //   放っておけば必ず沈むが、駆けつければ間に合う。
  //   狙う機が2割→3割に増えたので、1機あたりの削り量は少し下げて釣り合わせる。
  //   3機が取り付いて 100秒 ― 放っておけば沈むが、剥がしに行けば間に合う。
  FREIGHTER_HP:   120,
  THREAT_RANGE:   340,    // 敵がこれより近いと貨物船を削られる
  THREAT_DPS:     0.4,    // 1機あたり毎秒この量

  // 僚機は escape.js の予定表(LOSS_AT)で必ず落ちる。
  // この削られ方は「敵に囲まれたら予定より早く落ちる」ぶんなので、
  // 予定を追い越しすぎない速さにしてある(敵2機で約18秒)。
  // ★ さらに粘らせる。予定表(LOSS_AT)より先に消えてしまうと、
  //   「ぎりぎりまで一緒に飛んでいた」という段取りが崩れる。
  //   敵6機に囲まれ続けても 100秒 は保つ数字にしてある。
  //   敵が9機に増えたので、囲まれ続けても予定表より先に落ちない数字にする
  WING_HP:        140,
  WING_THREAT:    170,    // 敵がこれより近いと僚機が削られる
  WING_DPS:      0.08,

  // 進行度がここを超えたら、まだ生きている僚機を1機失う。
  // 「守り切れない」を保証するための仕掛け。
  // ★ 後ろへ寄せた。早々に一人になると、守っている実感の前に諦めが来る。
  //   最後の一機は射出の直前まで残る ― 誰もいなくなってから追いかける。
  // ★★ さらに後ろへ。0.46 では前半で独りになり、守っている相手がいなくなった。
  //   いまは 111秒 / 135秒 / 148秒 ― 最後の一機は射出の2秒前まで飛んでいる。
  // ★★★ さらに後ろへ。144秒 / 166秒 / 179秒 ―
  //   三機そろって飛んでいる時間を、全体の8割まで伸ばした。
  //   独りになるのは最後の1秒。そこから射出を追いかける。
  LOSS_AT: [0.80, 0.92, 0.995],

  SURVIVORS: 311,         // 貨物船に詰めた人数(小説の数字)

  // 敵は哨戒機のみ。小説「企業艦隊の哨戒網」。
  // 超弩級戦艦(boss.js)はこの戦闘には出さない ― main.js 側で止めてある。
  ENEMY_TYPE: 'SOLDIER',
  // ★ 2割では船に取り付く機がほとんど見えなかった。
  //   9機中3機。常に2〜3機が船のまわりにいる、という圧のかかり方になる。
  HUNTER_RATIO: 0.34,     // このうち何割が貨物船を狙うか

  // 出港前の停泊距離。戦闘圏の内側でなければ「守る」が成立しない。
  // アルカディア(距離1900)の方角に置くので、遠景の村を背にして浮かぶ。
  PARK_DIST:      420,
};

let freighter    = null;
let escapeActive = false;
let escapeTime   = 0;      // 経過(秒)
let escapeLosses = 0;      // 失った僚機の数
let freighterHp  = 0;
// 'defend'(港を守る) → 'launch'(射出・追跡) → 'done'(決着。操縦を返す)
let escapePhase  = 'defend';
let launchDir    = null;       // 射出の向き。決まった一方向へまっすぐ出る
let launchSpeed  = 0;
let chaseTime    = 0;
let launchFlareLeft = 0;   // 点火の炎を出し続ける残り秒
let spoolSaid    = false;  // 主機の回り始めを予告したか
let hitCooldown  = 0;      // 被弾の音と光を出しすぎないための間隔

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

  // --- 噴射炎 ------------------------------------------------------
  // ★ 出港前は消えている。点火から徐々に伸ばす。
  //   「速くなった」を数字ではなく炎の長さで見せるための部品。
  //   3枚の円錐を重ね、内側ほど白く短くして芯を作る。
  const plume = new THREE.Group();
  const layers = [
    { r: 6.5, len: 34, color: 0xff9a3c, op: 0.55 },
    { r: 4.4, len: 24, color: 0xffd07a, op: 0.70 },
    { r: 2.4, len: 14, color: 0xfff4d6, op: 0.95 },
  ];
  for (const L of layers) {
    const geo = new THREE.ConeGeometry(L.r, L.len, 7, 1, true);
    geo.rotateX(Math.PI / 2);          // -Z ではなく +Z(船尾)へ伸ばす
    geo.translate(0, 0, L.len / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: L.color, transparent: true, opacity: L.op,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    plume.add(m);
  }
  plume.position.set(0, 0, 50);
  plume.scale.setScalar(0.001);        // 出港前は見えない
  plume.name = 'plume';
  g.add(plume);

  // 主機が焼ける熱。点火中だけ赤熱する板
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(8.5, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5a1e, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.position.set(0, 0, 50.5);
  glow.name = 'glow';
  g.add(glow);

  return g;
}

// 噴射炎の伸び具合。0=消灯 1=全開
function setPlume(level, speedRatio) {
  if (!freighter) return;
  const p = freighter.getObjectByName('plume');
  const gl = freighter.getObjectByName('glow');
  const v = Math.max(0, Math.min(level, 1));
  // 速いほど長く伸びる。太さは変えない ― 太くすると爆発に見える
  const stretch = 1.6 + Math.max(0, Math.min(speedRatio || 0, 1.4)) * 2.4;
  if (p) {
    // 揺らぎを混ぜる。一定だと作り物に見える
    const flicker = 0.88 + Math.random() * 0.24;
    p.scale.set(Math.max(0.001, v * flicker), Math.max(0.001, v * flicker),
                Math.max(0.001, v * (stretch + Math.random() * 0.5)));
  }
  if (gl) gl.material.opacity = v * (0.55 + Math.random() * 0.30);
}

// --- 始める ---------------------------------------------------------
function startEscape() {
  clearEscape();
  if (typeof scene === 'undefined' || !scene || !playerShip) return;

  freighter = buildFreighter();
  scene.add(freighter);
  parkAtColony();      // 出港前はアルカディアの縁に着けてある

  freighterHp  = ESCAPE.FREIGHTER_HP;
  escapeTime   = 0;
  escapeLosses = 0;
  escapeActive = true;
  escapePhase  = 'defend';
  launchSpeed  = 0;
  chaseTime    = 0;
  launchDir    = null;
  launchFlareLeft = 0;
  spoolSaid    = false;
  hitCooldown  = 0;
  if (typeof setSpeedOverride === 'function') setSpeedOverride(0);

  if (typeof missionTime !== 'undefined') missionTime = ESCAPE.DEFEND_SEC;

  // 敵は哨戒機だけにする。小説の「企業艦隊の哨戒網」に合わせる ―
  // 初戦にハウンド(追い回す)やスナイパー(遠距離)は出てこない。
  if (typeof setArchetypeLock === 'function') setArchetypeLock(ESCAPE.ENEMY_TYPE);
  // いま飛んでいる敵も哨戒機へ揃え直す
  if (typeof enemies !== 'undefined' && typeof assignArchetype === 'function') {
    for (const e of enemies) assignArchetype(e, ESCAPE.ENEMY_TYPE);
  }
  assignFreighterHunters();
}

// ★ 出港前の貨物船は、アルカディアの縁に着けておく。
//   コロニーは自機について来る遠景なので、貨物船も一緒に動かさないと
//   「あの村から出てくる船」に見えない。
//   射出したら追従をやめ、そこから先は本当に飛ぶ。
function parkAtColony() {
  if (!freighter || !playerShip) return;

  // ★ 距離の決め方を一度間違えた。
  //   最初はコロニーの縁(自機から約1900)に置いたが、そこは戦闘圏の外 ―
  //   守る対象が敵と同じ場所にいないし、噴射炎も点にしか見えなかった。
  //
  //   いまは「コロニーの方角に、戦える距離で」置く。
  //   自機から見るとアルカディアを背にした位置に浮かぶので、
  //   遠景の村とつながって見えるまま、手が届く場所にいる。
  const d = (typeof COLONY !== 'undefined') ? COLONY.DIR : { x: -0.30, y: 0.11, z: -0.95 };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  freighter.position.set(
    playerShip.position.x + (d.x / len) * ESCAPE.PARK_DIST,
    playerShip.position.y + (d.y / len) * ESCAPE.PARK_DIST - 30,
    playerShip.position.z + (d.z / len) * ESCAPE.PARK_DIST
  );
  freighter.lookAt(playerShip.position);
}

function clearEscape() {
  if (freighter && freighter.parent) freighter.parent.remove(freighter);
  freighter = null;
  escapeActive = false;
  // 敵のタイプの固定を解く。訓練飛行では3タイプが混ざるのが既定
  if (typeof setArchetypeLock === 'function') setArchetypeLock(null);
  if (typeof setSpeedOverride === 'function') setSpeedOverride(0);
  escapePhase = 'defend';
  // 貨物船を狙う印を外す。訓練飛行では全機が自機を狙う
  if (typeof enemies !== 'undefined') for (const e of enemies) e.huntsFreighter = false;
}

const escapeRunning = () => escapeActive && freighter !== null;

// 敵AI(scene.js)がこれを見て、貨物船へ向かうかどうかを決める
function freighterPosition() { return freighter ? freighter.position : null; }

// ★ 哨戒隊のうち何割が貨物船を狙うか。
//   全機が主人公を追いかけるのでは「守るものがある戦い」にならないし、
//   逆に全機が貨物船へ行くと、主人公は的にされず手応えが消える。
//   2割 ― 常に1〜2機が船に取り付いている、という圧のかかり方になる。
function assignFreighterHunters() {
  if (typeof enemies === 'undefined' || !enemies.length) return;
  const total = enemies.length;
  const want = Math.max(1, Math.round(total * ESCAPE.HUNTER_RATIO));

  for (const e of enemies) e.huntsFreighter = false;
  // 小隊がまるごと船へ行かないよう、等間隔で散らす
  for (let i = 0; i < want; i++) {
    enemies[Math.min(total - 1, Math.round(i * total / want))].huntsFreighter = true;
  }
}

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
  hitCooldown -= dt;
  if (near > 0) {
    const before = freighterHp;
    freighterHp -= ESCAPE.THREAT_DPS * near * dt;

    // ★ 削られていることを、数字以外でも見せる。
    //   毎コマ出すとうるさいので 0.55秒 に1回まで。
    if (hitCooldown <= 0) {
      hitCooldown = 0.55;
      if (typeof playFreighterHit === 'function') playFreighterHit();
      if (typeof spawnFlash === 'function' && typeof scene !== 'undefined' && scene) {
        // 船体のどこかに当たったように、位置を散らす
        const off = new THREE.Vector3(
          (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 70);
        spawnFlash(freighter.position.clone().add(off), 22, 0xffb060, 0.35);
      }
    }
    if (before >= ESCAPE.FREIGHTER_HP * 0.5 && freighterHp < ESCAPE.FREIGHTER_HP * 0.5) {
      if (typeof addCombatLog === 'function') addCombatLog(t('esc.hit'), 'warn');
      if (typeof radioSay === 'function') {
        radioSay('wing.n3', '貨物船に当たってる ― 誰か剥がせ', true);
      }
    }
  }
  if (freighterHp <= 0) {
    freighterHp = 0;
    if (typeof endMission === 'function') endMission('failed', t('esc.lost'));
    return;
  }

  if (escapePhase === 'defend')      updateDefendPhase(dt);
  else if (escapePhase === 'launch') updateLaunchPhase(dt);
  // 'done' は決着後。貨物船も自機も、もう誰も動かさない
}

// --- 前半:港で待つ貨物船を守る -------------------------------------
function updateDefendPhase(dt) {
  const progress = Math.min(escapeTime / ESCAPE.DEFEND_SEC, 1);

  // 港に着けたまま。コロニーが自機について来る遠景なので、
  // 貨物船も一緒に動かさないと村から離れて見えてしまう。
  // 「まだ出られない」ことを、動かないことで見せる。
  parkAtColony();
  updateWingmanLosses(dt, progress);

  // 残り時間を知らせる。数字を見なくても段取りが分かるように
  const left = ESCAPE.DEFEND_SEC - escapeTime;

  // 射出の3秒前から主機が回り始める。音と光で「もうすぐ出る」を予告する
  if (!spoolSaid && left <= 3.2) {
    spoolSaid = true;
    if (typeof playFreighterSpool === 'function') playFreighterSpool();
    if (typeof spawnFlash === 'function' && typeof scene !== 'undefined' && scene) {
      spawnFlash(freighter.position.clone(), 60, 0xffd9a0, 1.4);
    }
    if (typeof addCombatLog === 'function') addCombatLog(t('esc.spool'), 'warn');
  }

  // 予告のあいだ、主機に火が入っていく(まだ動かない)
  if (spoolSaid) setPlume(0.10 + (3.2 - Math.max(left, 0)) * 0.08);

  for (const mark of [60, 30, 10]) {
    if (left <= mark && left + dt > mark) {
      if (typeof addCombatLog === 'function') {
        addCombatLog(t('esc.count').replace('%s', String(mark)), 'warn');
      }
      if (typeof radioSay === 'function') {
        const say = { 60: ['wing.n3', 'あと一分。持たせろ'],
                      30: ['wing.n2', '三十秒! 三十秒!'],
                      10: ['wing.n3', '離れろ ― 噴射に巻き込まれるぞ'] }[mark];
        if (say) radioSay(say[0], say[1], true);
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
  // ★ 貨物船をここで動かしてはいけない。
  //   前は「自機の正面260の位置へ置き直してから射出」していたが、
  //   それは瞬間移動そのもので、ワープしたようにしか見えなかった。
  //   いまいる場所(アルカディアの縁)から、そのまま加速して出ていく。
  //
  //   ★ 向きは「自機から貨物船へ」の向き。
  //     前は「自機が向いている方向」にしていたが、それだと
  //     自機がたまたま進路の前方にいたとき、加速した貨物船に
  //     真後ろから轢かれる ― 実際に検証で 2秒地点で距離4まで来た。
  //     自機から船への向きにすれば、射出の瞬間に自機は必ず船の真後ろにいて、
  //     船は自機から遠ざかる一方になる。追い越されようがない。
  launchDir = new THREE.Vector3(0, 0, -1);
  if (playerShip) {
    const away = freighter.position.clone().sub(playerShip.position);
    if (away.lengthSq() > 1) launchDir.copy(away).normalize();
    else launchDir.applyQuaternion(playerShip.quaternion).normalize();  // 重なっているとき用
  }
  freighter.lookAt(freighter.position.clone().addScaledVector(launchDir, 100));

  if (typeof addCombatLog === 'function') {
    addCombatLog(t('esc.launch'), 'warn');
    // ★ 操作を取り上げるときは、必ずそれを言う。
    //   黙って舵を奪うと「操縦が壊れた」としか思えない。
    addCombatLog(t('esc.auto'), 'kill');
  }
  if (typeof radioSay === 'function') radioSay('wing.n3', '行った ― 追え、カイト', true);

  // --- 点火の見た目 ---------------------------------------------
  // 「いつ出たのか分からない」のが一番まずい。
  // 音・光・揺れ・尾を引く炎、全部いっぺんに出して、見逃しようがなくする。
  if (typeof playFreighterLaunch === 'function') playFreighterLaunch();
  if (typeof startShake === 'function') startShake(1.6);
  if (typeof scene !== 'undefined' && scene) {
    const back = freighter.position.clone().addScaledVector(launchDir, -52);
    if (typeof spawnFlash === 'function') {
      spawnFlash(back, 150, 0xffe9b0, 0.9);      // 主機の閃光
      spawnFlash(back, 90, 0xffffff, 0.45);
    }
    if (typeof spawnBlast === 'function') spawnBlast(back, 70, 0xffc070);
  }
  launchFlareLeft = 3.0;

  // 追いつけるように、機体が全力を出す(配分の操作は教えていないので自動)
  if (typeof setSpeedOverride === 'function') setSpeedOverride(ESCAPE.CHASE_MIN);
  if (typeof missionTime !== 'undefined') missionTime = ESCAPE.CHASE_SEC;
}

// --- 後半:射出された貨物船を追う -----------------------------------
function updateLaunchPhase(dt) {
  chaseTime += dt;

  // だんだん速くなる。いきなり消えると何が起きたか分からない
  // ★ ゆっくり効かせる。ease-in(t²)にすると、最初は動いていないほどなのに
  //   気づくと手が届かない速さになっている ― 「射出された」感じはここで出る。
  const t01 = Math.min(chaseTime / ESCAPE.LAUNCH_RAMP, 1);
  const ramp = t01 * t01;
  // ★ 加速しきったあとも、わずかに速くなり続ける。
  //   一定速度で飛ばすと「もう終わった」ように見え、実際そう報告された。
  //   ずっと押されているものは、ずっと速くなる。
  const extra = Math.max(0, chaseTime - ESCAPE.LAUNCH_RAMP) * ESCAPE.DRIFT_ACCEL;
  launchSpeed = ESCAPE.LAUNCH_SPEED * ramp + extra;
  freighter.position.addScaledVector(launchDir, launchSpeed * dt);

  // ★ 自機の速度は「貨物船の真後ろ CHASE_TRAIL に着ける」ように作る。
  //   前は「貨物船+9」の一本槍だったが、貨物船が285になると
  //   +9 は誤差でしかなく、しかも詰め続けて最後には船の中へ入ってしまう。
  //   離れていれば速く、近すぎれば緩める ― 位置を見て速度を決めるほうが、
  //   どんな速さになっても真後ろに収まる。
  if (typeof setSpeedOverride === 'function' && playerShip) {
    const gap = playerShip.position.distanceTo(freighter.position);
    const want = launchSpeed + (gap - ESCAPE.CHASE_TRAIL) * ESCAPE.CHASE_CATCH;
    setSpeedOverride(Math.max(ESCAPE.CHASE_MIN,
                     Math.min(want, launchSpeed + ESCAPE.CHASE_EXTRA)));
  }

  // 噴射炎。速いほど長く伸びる ― 長さそのものが速度計になる
  setPlume(Math.min(1, 0.35 + t01 * 1.4), launchSpeed / ESCAPE.LAUNCH_SPEED);

  // 噴射炎の尾。加速しているあいだ、後ろへ火の粉を落とし続ける ―
  // 点で光るより、線で残るほうが「速い」と分かる
  if (launchFlareLeft > 0 && typeof spawnFlash === 'function'
      && typeof scene !== 'undefined' && scene) {
    launchFlareLeft -= dt;
    if (Math.random() < 0.55) {
      const back = freighter.position.clone().addScaledVector(launchDir, -46);
      spawnFlash(back, 34 + Math.random() * 26, 0xffc070, 0.30);
    }
  }

  if (chaseTime >= ESCAPE.CHASE_SEC) {
    // ★ 追跡を終える。'done' にしておかないと escapeAutoPilot() が
    //   真のままで、リザルト画面のあいだも操縦が返ってこない。
    //   ここを抜けたら舵はプレイヤーのものに戻す。
    escapePhase = 'done';
    if (typeof setSpeedOverride === 'function') setSpeedOverride(0);
    if (typeof endMission === 'function') endMission('escaped');
  }
}

// --- 射出後の自動操縦 -------------------------------------------------
//
// ★「一度貨物船が射出されたらプレイヤーは射撃しかできない」
//   最後の追跡は操縦の腕を試す場面ではない。ここで見せたいのは
//   「置いていかれる船に必死でついていく」ことなので、
//   機首は機体が預かり、プレイヤーの手には引き金だけを残す。
//
//   操作を取り上げるのは本来やってはいけないことなので、
//   奪う範囲は最小にしてある ― 舵とロールと回避バーストだけ。
//   撃つ・狙う(照準は機首に付いてくる)・視点の切替は今までどおり効く。
function escapeAutoPilot() {
  return escapeRunning() && escapePhase === 'launch' && !!freighter;
}

const _aimInv = new THREE.Quaternion();
const _aimTo  = new THREE.Vector3();

// 貨物船へ機首を向けるための舵。turnView() にそのまま渡せる形で返す。
// 戻り値 { pitch, yaw } の範囲はキー入力と同じ −1〜+1。
function escapeAutoAim() {
  if (!escapeAutoPilot()) return null;
  if (!launchDir) return null;
  if (typeof playerShip === 'undefined' || !playerShip) return null;

  // ★ 狙うのは貨物船そのものではなく、その「真後ろの定位置」。
  //   船を直接狙わせると、横や前にいるときに船へ一直線に突っ込む ―
  //   追走ではなく体当たりに見えていた原因がこれ。
  //
  //   さらに、定位置までの向きに「船の進んでいる向き」を足す。
  //   ・遠いとき … 定位置までの向きが大きいので、そちらへ寄っていく
  //   ・着いたとき … 定位置までの向きがほぼ0になり、
  //                  残るのは船と同じ進行方向 = 真後ろを並んで飛ぶ
  //   足しておかないと、定位置に着いた瞬間に向きが決まらなくなって
  //   機首がふらつく(0ベクトルの角度は定義できない)。
  _aimTo.copy(freighter.position)
        .addScaledVector(launchDir, -ESCAPE.CHASE_TRAIL)   // 真後ろの定位置
        .sub(playerShip.position)                          // そこまでの向き
        .addScaledVector(launchDir, ESCAPE.CHASE_LEAD);    // 船の進む向きを混ぜる

  // 機体から見た座標へ移す。
  // 向きの逆回転を掛けると、前が −Z・上が +Y・左が −X になる ―
  // レーダーで敵の位置を出すときと同じやり方。
  _aimInv.copy(playerShip.quaternion).invert();
  _aimTo.applyQuaternion(_aimInv);

  const flat     = Math.sqrt(_aimTo.x * _aimTo.x + _aimTo.z * _aimTo.z);
  const yawErr   = Math.atan2(-_aimTo.x, -_aimTo.z);   // 左にいれば正
  const pitchErr = Math.atan2(_aimTo.y, flat);         // 上にいれば正

  // 角度をそのまま舵にすると、正面に来た瞬間に舵が0になって行き過ぎ、
  // 左右に揺れ続ける。3倍してから −1〜+1 に収めると、
  // 20度ほどずれた時点で目一杯・近づくにつれて緩む ―
  // 人が操縦したときの動きに近くなる。
  const hold = function (x) { return Math.max(-1, Math.min(1, x * 3)); };
  return { pitch: hold(pitchErr), yaw: hold(yawErr) };
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

// --- レーダー・画面マーカー用の情報 ---------------------------------
// boss.js の bossContact() と同じ形で返す。
// ★ 貨物船は「無条件で映る」。センサー配分にも熱にも左右されない ―
//   守る対象が見えないのは、遊びとして成立しない。
const _fTo  = new THREE.Vector3();
const _fInv = new THREE.Quaternion();
const _fNdc = new THREE.Vector3();
const _fView = new THREE.Vector3();

function freighterContact() {
  if (!escapeRunning() || !playerShip || typeof camera === 'undefined') return null;

  _fInv.copy(playerShip.quaternion).invert();
  _fTo.subVectors(freighter.position, playerShip.position);
  const dist = _fTo.length();
  const local = _fTo.clone().applyQuaternion(_fInv);

  const ndc = _fNdc.copy(freighter.position).project(camera);
  const inFront = camera.worldToLocal(_fView.copy(freighter.position)).z < 0;

  return {
    localX: local.x, localY: local.y, localZ: local.z,
    dist: dist,
    ndcX: ndc.x, ndcY: ndc.y,
    inFront: inFront,
    hpRatio: Math.max(0, freighterHp) / ESCAPE.FREIGHTER_HP,
    launching: escapePhase === 'launch',
  };
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
