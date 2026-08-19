// ===================================================================
// STEEL CRADLE ― 画面遷移(メインメニュー / ポーズ)
//
// このファイルの役目は「今どの画面を見せているか」の管理だけ。
// 戦闘そのものは main.js と scene.js が持っていて、ここは
// 「出撃してよい」「戦闘を止めてメニューへ戻す」と指示を出す側に徹する。
//
// 画面の状態(screenState)は3つ。main.js の tick() がこれを見て、
// 戦闘の計算を回すか、メニューの背景を回すかを決める。
//   'menu'    … タイトル画面。時間は減らず、敵も動かない
//   'mission' … 戦闘中。いつもの10分ミッション
//   'paused'  … 戦闘を一時停止して、続けるか中断するかを選んでいる
//
// ※ screenState そのものは main.js で宣言している(ゲームの状態は
//    main.js に集めておきたいため)。ここでは代入して切り替える。
// ===================================================================

// --- 画面の部品をつかまえておく -------------------------------------
const menuEl       = document.getElementById('menu');
const menuListEl   = document.getElementById('menu-list');
const menuDetailEl = document.getElementById('menu-detail');
const menuBuildEl  = document.getElementById('menu-build');

// ===================================================================
// メニューの中身
//
// ページ(root / story / multi / pause)ごとに項目を並べた表。
// ready:true の項目だけが実際に遊べる。それ以外は「準備中」の札を出し、
// 決定してもエラー音を鳴らして進まない。
//
// 仕様書2章「ゲームモード構成」と 9.4「マルチ対戦ルール」に対応する。
// ===================================================================
const MENU_PAGES = {

  // --- 一番上の画面 ---
  root: {
    items: [
      {
        label: 'TRAINING', jpKey: 'menu.training', tagKey: 'menu.training.tag',
        ready: true, detailKey: 'menu.training.desc',
        run: () => launchTraining(),
      },
      {
        label: 'LANGUAGE', jpKey: 'menu.language', tagKey: 'menu.training.tag',
        ready: true, detailKey: 'menu.language.desc',
        // 決定するたびに 日本語 ⇄ English。メニューを組み直して即座に反映する
        run: () => { toggleLanguage(); playPresetConfirm(); },
      },
      {
        label: 'GALLERY', jpKey: 'menu.gallery', tagKey: 'menu.training.tag',
        ready: true, detailKey: 'menu.gallery.desc',
        run: () => showGallery(),
      },
      {
        label: 'STORY', jpKey: 'menu.story', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'menu.story.desc', go: 'story',
      },
      {
        label: 'MULTIPLAYER', jpKey: 'menu.multi', tagKey: 'menu.soon', ready: false,
        detailKey: 'menu.multi.desc', go: 'multi',
      },
    ],
  },

  // --- ストーリー:三部構成(仕様書8章)---
  story: {
    items: [
      { label: 'PART I',   jpKey: 'story.part1', tagKey: 'story.chapter1', ready: true,
        detailKey: 'story.part1.desc', go: 'story_p1' },
      { label: 'PART II',  jpKey: 'story.part2', tagKey: 'menu.soon', ready: false,
        detailKey: 'story.part2.desc' },
      { label: 'PART III', jpKey: 'story.part3', tagKey: 'menu.soon', ready: false,
        detailKey: 'story.part3.desc' },
      { label: '← BACK', jpKey: 'menu.back', ready: true, back: true },
    ],
  },

  // --- 第一部の章立て ---
  story_p1: {
    items: [
      { label: 'CHAPTER 1', jpKey: 'story.ch1', tagKey: 'story.chapter1', ready: true,
        detailKey: 'story.ch1.desc', go: 'story_ch1' },
      { label: '← BACK', jpKey: 'menu.back', ready: true, back: 'story' },
    ],
  },

  // --- 一章のシーン選択 ---
  // ★ 通しで遊ぶ人のためではなく、作っている人のための入口。
  //   毎回シーン1からやり直すのは、確かめたい場所が後ろにあるほど苦しい。
  story_ch1: {
    items: [
      { label: 'SCENE 1', jpKey: 'story.s1', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'story.s1.desc', run: () => startStoryScene('ch1_s1_hill') },
      { label: 'SCENE 2', jpKey: 'story.s2', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'story.s2.desc', run: () => startStoryScene('ch1_s2_festival') },
      { label: 'SCENE 3', jpKey: 'story.s3', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'story.s3.desc', run: () => startStoryScene('ch1_s3_hangar') },
      { label: 'SCENE 4', jpKey: 'story.s4', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'story.s4.desc', run: () => startStoryScene('ch1_s4_launch') },
      { label: 'SORTIE',  jpKey: 'story.sortie', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'story.sortie.desc', run: () => launchStorySortie() },
      { label: '← BACK', jpKey: 'menu.back', ready: true, back: 'story_p1' },
    ],
  },

  // --- マルチ対戦:2モード制(仕様書9.4)---
  multi: {
    items: [
      { label: 'MODE A', jpKey: 'multi.a', tagKey: 'menu.soon', ready: false,
        detailKey: 'multi.a.desc' },
      { label: 'MODE B', jpKey: 'multi.b', tagKey: 'menu.soon', ready: false,
        detailKey: 'multi.b.desc' },
      { label: '← BACK', jpKey: 'menu.back', ready: true, back: true },
    ],
  },

  // --- 戦闘中に Esc を押したときの一時停止 ---
  pause: {
    items: [
      { label: 'RESUME', jpKey: 'pause.resume', tagKey: 'menu.training.tag', ready: true,
        detailKey: 'pause.resume.desc', run: () => resumeMission() },
      { label: 'ABORT',  jpKey: 'pause.abort',  tagKey: 'menu.training.tag', ready: true,
        detailKey: 'pause.abort.desc',  run: () => abortMission() },
    ],
  },
};

// --- いま開いているページと、選んでいる行 ---
let menuPage  = 'root';
let menuIndex = 0;
let menuTime  = 0;     // メニュー背景をゆっくり動かすための時計(秒)

// サブメニューへ入る直前に、root のどの行にいたかを覚えておく。
// 戻ったときに一番上へ飛ばされると「どこを見ていたか」を見失うため。
let menuRootIndex = 0;

// ===================================================================
// メニューを組み立てて画面に出す
//
// innerHTML = 「この要素の中身を、このHTMLで丸ごと書き換える」指定。
// 項目は数が少ないので、選ぶたびに作り直しても速さは問題にならない。
// ===================================================================
// 行そのものを作り直す。ページを開いたときと、言語を変えたときだけ呼ぶ。
//
// ※ 選択が動くたびにここを呼んではいけない。
//   マウスを乗せた拍子に行を作り直すと、押している最中に要素が
//   入れ替わってクリックが成立しなくなる(実際そうなっていた)。
//   選択が動いただけのときは updateMenuSelection を使う。
function buildMenu() {
  const page = MENU_PAGES[menuPage];
  menuListEl.innerHTML = '';

  page.items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'menu-item' + (item.ready ? ' ready' : ' locked');

    // 英字の見出し / 日本語の副題 / 右端の札 の3つを並べる
    row.innerHTML =
      '<span class="en">' + item.label + '</span>' +
      '<span class="jp">' + (item.jpKey ? t(item.jpKey) : (item.jp || '')) + '</span>' +
      (item.tagKey ? '<span class="tag">' + t(item.tagKey) + '</span>' : '');

    // マウスでも選べるようにしておく(キーボードと同じ動きにする)。
    // 乗せたときは見た目だけ更新し、行は作り直さない。
    row.addEventListener('mouseenter', () => { menuIndex = i; updateMenuSelection(); });
    row.addEventListener('click', () => { menuIndex = i; confirmMenu(); });

    menuListEl.appendChild(row);
  });

  updateMenuSelection();
}

// 選択中の見た目と説明文だけを更新する。行の作り直しはしない
function updateMenuSelection() {
  const page = MENU_PAGES[menuPage];
  const rows = menuListEl.children;
  for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('sel', i === menuIndex);

  const cur = page.items[menuIndex];
  menuDetailEl.innerHTML = cur.detailKey ? t(cur.detailKey) : (cur.detail || '');
}

// --- 選択を上下に動かす ---------------------------------------------
// 端まで行ったら反対側へ回り込む(% は割った余り)
function moveMenu(delta) {
  const n = MENU_PAGES[menuPage].items.length;
  menuIndex = (menuIndex + delta + n) % n;
  updateMenuSelection();   // 行は作り直さない(クリックが壊れるため)
  playViewClick();
}

// --- ページを切り替える ---------------------------------------------
// root へ戻るときだけは、出て行った行を選び直す。
function openMenuPage(name) {
  if (name !== 'root' && menuPage === 'root') menuRootIndex = menuIndex;
  menuPage  = name;
  menuIndex = (name === 'root') ? menuRootIndex : 0;
  buildMenu();
}

// --- 決定 -----------------------------------------------------------
function confirmMenu() {
  const item = MENU_PAGES[menuPage].items[menuIndex];

  // back に行き先を書けば1つ前の階層へ戻る。書かなければ一番上へ
  if (item.back)          { playViewClick(); openMenuPage(item.back === true ? 'root' : item.back); return; }
  if (item.go)            { playPresetConfirm(); openMenuPage(item.go); return; }
  if (!item.ready)        { playDenied(); return; }   // 準備中の項目は進めない
  if (item.run)           { playPresetConfirm(); item.run(); }
}

// --- 戻る(Esc)-------------------------------------------------------
// どの画面から Esc を押したら、どこへ戻るか
const MENU_PARENT = {
  story_ch1: 'story_p1',
  story_p1:  'story',
};

function backMenu() {
  if (menuPage === 'root') { playDenied(); return; }   // これ以上は戻れない
  if (menuPage === 'pause') { resumeMission(); return; }
  playViewClick();
  openMenuPage(MENU_PARENT[menuPage] || 'root');
}

// ===================================================================
// 画面の切り替え
// ===================================================================

// --- メインメニューを開く(起動時と、任務中断/リザルトからの復帰)---
function showMenu(page) {
  screenState = 'menu';
  setCombatFrozen(true);      // 敵AIを止める
  applyViewMode(false);       // タイトル背景は三人称固定(自機が見えるほうが絵になる)
  resetFlight();              // 飛んでいる弾や破片を片付けて、自機を原点へ
  // 敵を隠すのは resetFlight の「あと」。
  // resetFlight は敵を初期配置に戻して表示も戻すので、先に隠すと押し戻されてしまう。
  setEnemiesHidden(true);
  keysHeld.clear();           // 戦闘中に押していたキーを引きずらない
  menuEl.classList.add('on');
  consoleEl.classList.add('menu-hidden');   // 計器を隠す
  consoleEl.classList.remove('failed');     // リザルト画面が残っていたら消す
  openMenuPage(page || 'root');
}

// --- メニューを閉じて戦闘画面へ ---
function hideMenu() {
  menuEl.classList.remove('on');
  consoleEl.classList.remove('menu-hidden');
}

// --- TRAINING を選んだ:実際に出撃する ---
function launchTraining() {
  launchSortie('standard', 'training');
}

// --- 物語からの出撃:カイトの当番機(旧式艇 四番機)---
// 実弾を積んでいないので、ビーム砲しか撃てない。右の推力偏向が渋い。
// 制限の根拠はすべてシーン3の台詞にある(src/ships.js のコメント参照)。
function launchStorySortie() {
  launchSortie('boat4', 'training');
}

// --- 出撃の共通処理 ---
// ★ 機体は restartMission() より前に決める。
//   積み込む弾数を restartMission() が機体から引くので、順番を逆にすると
//   前の機体の弾を積んだまま飛ぶことになる。
function launchSortie(shipKey, bgm) {
  hideMenu();
  setEnemiesHidden(false);                          // 敵を戻す
  applyViewMode(OPTIONS.startView === 'cockpit');   // 好みの視点で出撃する
  screenState = 'mission';
  setShip(shipKey);          // ★ restartMission より前(理由は上)
  applyShipColors();         // 機体の塗色を反映する(scene.js)
  restartMission();          // 7パラメーター・弾数・戦果をすべて初期化して開始

  // 僚機。物語の出撃では一人で飛んでいない(シーン3「四機で村を守る」)
  if (typeof clearWingmen === 'function') clearWingmen();
  if (typeof clearEscape === 'function') clearEscape();
  if (typeof initRadio === 'function') initRadio();

  // ★ 熱の計器を出すかどうか。
  //   熱管理はまだ物語で教えていない(ヨナスの講義は第三章)。
  //   読み方を知らない計器が並んでいると、他の計器まで読まれなくなる。
  const teachesHeat = (typeof heatTaught !== 'function') || heatTaught();
  document.body.classList.toggle('no-heat', !teachesHeat);

  if (shipKey === 'boat4') {
    if (typeof spawnWingmen === 'function') spawnWingmen();
    if (typeof startEscape === 'function') startEscape();   // 貨物船を出す
    briefSortie();
    if (typeof radioSay === 'function') {
      setTimeout(() => radioSay('wing.n3', '編隊 組め。貨物船から離れるな', true), 5200);
    }
  }

  if (bgm) playBgm(bgm);     // 読み込みは非同期なので待たない
}

// --- 戦闘中に Esc:一時停止 ---
function pauseMission() {
  if (screenState !== 'mission' || missionState !== 'active') return;
  screenState = 'paused';
  setCombatFrozen(true);     // 敵を止める。景色はそのまま残す
  keysHeld.clear();          // 停止した瞬間に押していたキーを離した扱いにする
  menuEl.classList.add('on');
  openMenuPage('pause');
  duckBgm(0.35);             // BGM は消さずに音量だけ落とす
  playViewClick();
}

// --- 一時停止から戦闘へ戻る ---
function resumeMission() {
  if (screenState !== 'paused') return;
  screenState = 'mission';
  setCombatFrozen(false);
  menuEl.classList.remove('on');
  duckBgm(1);                // BGM の音量を戻す
  playViewClick();
}

// --- 任務中断:メインメニューへ ---
// --- 出撃したときに、いまどういう状況なのかを出す ---
// いきなり戦闘が始まると、何をしに来たのか分からない。
// 計器の戦闘ログに数行、間を置いて流す(音声は既存の読み上げに任せる)。
function briefSortie() {
  if (typeof addCombatLog !== 'function') return;
  // ★ 何をすれば達成なのかを最初に言う。
  //   前は「アルカディア防衛戦」と出していたが、これは嘘だった ―
  //   守る戦いではなく、貨物船を出すまでの時間稼ぎ。
  const lines = [
    [0,    t('brief.title'), 'warn'],
    [900,  t('brief.goal'),  'warn'],
    [1700, t('brief.goal2'), null],
    [2600, t('brief.enemy'), 'warn'],
    [3400, t('brief.friend'), null],
    [4200, t('brief.you'),   'warn'],
    // ★ 呼集は Tab の説明書きにも書いてあるが、初めての戦闘で
    //   説明書きを開く人はいない。使える手はここで一度言っておく。
    [5000, t('brief.call'),  'kill'],
  ];
  for (const [ms, text, kind] of lines) {
    setTimeout(() => {
      if (screenState === 'mission') addCombatLog(text, kind);
    }, ms);
  }
}

function abortMission() {
  missionState = 'aborted';   // 'active' 以外にしておく(戦闘の各処理が止まる)
  stopBgm();
  if (typeof clearWingmen === 'function') clearWingmen();
  if (typeof clearEscape === 'function') clearEscape();
  if (typeof clearRadio === 'function') clearRadio();
  showMenu('root');
}

// ===================================================================
// ギャラリー(機体プロファイル)
//
// 諸元はここに数字を書き写すのではなく、main.js / scene.js が実際に
// 使っている定数をそのまま読み出して並べる。
// 書き写すと、バランス調整のたびに資料だけ古くなって嘘をつくため。
// ===================================================================
const galleryEl      = document.getElementById('gallery');
const galIndexEl     = document.getElementById('gal-index');
const galNameEl      = document.getElementById('gal-name');
const galClassEl     = document.getElementById('gal-class');
const galBodyEl      = document.getElementById('gal-body');

let galleryIndex = 0;

// --- 表を組み立てる小道具 -------------------------------------------
// sec = 見出し、row = 1行。文字列を継ぎ足していくだけの単純な作り。
const galSec = (t)          => '<div class="gal-sec">' + t + '</div>';
const galRow = (k, v, note) => '<div class="gal-row"><span>' + k + '</span><b>' + v +
                               (note ? ' <em>' + note + '</em>' : '') + '</b></div>';

// 弾数の表示。Infinity は「∞」と出す
const galAmmo = (n) => (n === Infinity) ? '∞' : String(n);

const CRAFT = [
  {
    key: 'player',
    name: 'PLAYER FIGHTER',
    clsKey: 'gal.player',
    build: () =>
      galSec(t('gal.sec.structure')) +
      galRow(t('gal.designation'), t('gal.unassigned'), t('gal.noSpec')) +
      galRow(t('gal.hull'), HULL.MAX_DAMAGE + t('gal.hullStages'), t('gal.noRepair')) +
      galRow(t('gal.shield'), SHIELD.MAX,
             t('gal.shieldRegen') + SHIELD.REGEN_PER_POWER + t('gal.shieldRegen2')) +

      galSec(t('gal.sec.power')) +
      galRow(t('gal.powerSplit'), t('gal.fourSystems'), t('gal.fourNames')) +
      galRow(t('gal.presets'), t('gal.presetNames'), '(1 / 2 / 3)') +

      galSec(t('gal.sec.thermal')) +
      galRow(t('gal.heatCap'), HEAT.MAX, t('gal.warnAt') + HEAT.WARN + ')') +
      galRow(t('gal.radOpen'), '−' + HEAT.VENT_RADIATOR + ' /s', t('gal.radOpenNote')) +
      galRow(t('gal.radClosed'), '−' + HEAT.VENT_BASE + ' /s') +
      galRow(t('gal.shutdown'),
             t('gal.shutdownAt') + HEAT.MAX + t('gal.shutdownFor') + HEAT.SHUTDOWN_SEC + t('gal.secUnit'),
             t('gal.helpless') + HEAT.VENT_SHUTDOWN + t('gal.perSecCool')) +

      galSec(t('gal.sec.propulsion')) +
      galRow(t('gal.propellant'), PROP.MAX, t('gal.noResupply')) +
      galRow(t('gal.burst'), PROP.BURST_COST + t('gal.perUse'),
             t('gal.heatPlus') + PROP.BURST_HEAT + t('gal.approxTimes') +
             Math.floor(PROP.MAX / PROP.BURST_COST) + t('gal.times')) +
      galRow(t('gal.drift'), t('gal.driftDesc'), t('gal.driftKey')) +

      galSec(t('gal.sec.armament')) +
      WEAPONS.map((w) => galRow(w.label, galAmmo(w.ammo) + t('gal.rounds'),
        t('gal.heatPlus') + w.heat + (w.minPower ? t('gal.needPower') + w.minPower + '%' : ''))).join('') +

      galSec(t('gal.sec.ordnance')) +
      BOMBS.map((b) => galRow(b.label, galAmmo(b.ammo) + t('gal.rounds'),
        t('gal.heatPlus') + b.heat + (b.minPower ? t('gal.needPower') + b.minPower + '%' : ''))).join('') +

      galSec(t('gal.sec.counter')) +
      galRow(t('gal.flare'), FLARE.COUNT + t('gal.rounds'),
             t('gal.flareBurn') + FLARE.LIFE + t('gal.flareBurn2')) +

      '<div class="gal-note">' + t('gal.playerNote') +
      (HEAT.VENT_RADIATOR / HEAT.VENT_BASE).toFixed(1) + t('gal.playerNote2') + '</div>',
  },
];

const ARCH_NOTE_KEYS = {
  SOLDIER: 'arch.soldier.note', HOUND: 'arch.hound.note', SNIPER: 'arch.sniper.note',
};

for (const key of Object.keys(AI_ARCHETYPES)) {
  const A = AI_ARCHETYPES[key];
  CRAFT.push({
    key: key,
    name: A.LABEL,
    clsKey: null,
    cls: () => t('gal.enemyOf') + t('arch.' + key.toLowerCase()),
    build: () =>
      galSec(t('gal.sec.profile')) +
      galRow(t('gal.spawnRate'), archWeightPercent(key) + ' %', t('gal.spawnNote')) +
      galRow(t('gal.hull'), A.MAX_HP) +
      galRow(t('gal.colour'), '#' + A.COLOR.BODY.toString(16).padStart(6, '0'), t('gal.colourNote')) +

      galSec(t('gal.sec.armament')) +
      galRow(t('gal.fireInterval'), A.FIRE.INTERVAL + ' s') +
      galRow(t('gal.telegraph'), A.FIRE.TELEGRAPH + ' s', t('gal.telegraphNote')) +
      galRow(t('gal.boltSpeed'), A.BOLT.SPEED) +
      galRow(t('gal.damage'), '×' + A.BOLT.DAMAGE_MULT, t('gal.damageNote')) +
      galRow(t('gal.spread'), '×' + A.BOLT.SPREAD_MULT, t('gal.spreadNote')) +
      galRow(t('gal.lead'), '×' + A.BOLT.LEAD_MULT, t('gal.leadNote')) +
      galRow(t('gal.missile'), A.MISSILE.AMMO + t('gal.rounds'),
             '(' + t('gal.range') + A.MISSILE.RANGE + t('gal.interval') + A.MISSILE.INTERVAL + 's · ' +
             Math.round(A.MISSILE.BLUFF * 100) + t('gal.bluff')) +

      galSec(t('gal.sec.thermal')) +
      galRow(t('gal.heatCap'), A.HEAT.MAX) +
      galRow(t('gal.heatPerShot'), '+' + A.FIRE.HEAT) +
      galRow(t('gal.vent'), '−' + A.HEAT.VENT + ' /s',
             t('gal.net') + ((A.FIRE.HEAT - A.HEAT.VENT * A.FIRE.INTERVAL) >= 0 ? '+' : '') +
             (A.FIRE.HEAT - A.HEAT.VENT * A.FIRE.INTERVAL).toFixed(1) + t('gal.perShot')) +
      galRow(t('gal.shutdown'), A.HEAT.SHUTDOWN_SEC + t('gal.forcedFor'), t('gal.defenceless')) +

      galSec(t('gal.sec.behaviour')) +
      galRow(t('gal.speeds'), A.SPEED.APPROACH + ' / ' + A.SPEED.ATTACK + ' / ' + A.SPEED.EVADE) +
      galRow(t('gal.turnRate'), A.TURN_RATE + ' rad/s') +
      galRow(t('gal.engageRange'), A.RANGE.ATTACK,
             t('gal.closerThan') + A.RANGE.TOO_CLOSE + t('gal.backsOff')) +
      galRow(t('gal.wander'), t('gal.amp') + A.WANDER.AMP + t('gal.rate') + A.WANDER.RATE,
             t('gal.wanderNote')) +
      (A.DIVE
        ? galRow(t('gal.diveRun'),
                 A.DIVE.RUN_SEC + t('gal.diveBite') + A.DIVE.EXTEND_SEC + t('gal.diveBreak'),
                 t('gal.diveRear') + A.DIVE.REAR_OFFSET + t('gal.diveRear2'))
        : '') +

      '<div class="gal-note">' + t(ARCH_NOTE_KEYS[key]) + '</div>',
  });
}

// 出現比率を % で出す。WEIGHT の合計に対する割合
function archWeightPercent(key) {
  let total = 0;
  for (const k of Object.keys(AI_ARCHETYPES)) total += AI_ARCHETYPES[k].WEIGHT;
  return Math.round(AI_ARCHETYPES[key].WEIGHT / total * 100);
}

// --- ギャラリーを開く / 閉じる ---------------------------------------
function showGallery() {
  menuRootIndex = menuIndex;   // 戻ってきたときに GALLERY の行へ戻れるように
  screenState = 'gallery';
  galleryIndex = 0;
  menuEl.classList.remove('on');
  galleryEl.classList.add('on');
  buildGallery();
}

function hideGallery() {
  screenState = 'menu';
  galleryEl.classList.remove('on');
  exitGalleryView();        // scene.js:カメラと機体の状態を戦闘用に戻す
  showMenu('root');
  playViewClick();
}

// --- 表示中の機体を組み立て直す ---
function buildGallery() {
  const c = CRAFT[galleryIndex];
  galIndexEl.textContent =
    String(galleryIndex + 1).padStart(2, '0') + ' / ' + String(CRAFT.length).padStart(2, '0');
  galNameEl.textContent  = c.name;
  galClassEl.textContent = c.clsKey ? t(c.clsKey) : c.cls();
  galBodyEl.innerHTML    = c.build();
  galBodyEl.scrollTop    = 0;   // 機体を変えたら資料も先頭に戻す
}

// --- 機体を切り替える ---
function moveGallery(delta) {
  const n = CRAFT.length;
  galleryIndex = (galleryIndex + delta + n) % n;
  buildGallery();
  playViewClick();
}

// ===================================================================
// メニュー背景を動かす
//
// 止まった絵をタイトルに出すと死んで見えるので、自機をゆっくり巡航させ、
// 首をわずかに振らせて星と塵を流す。sin() で行ったり来たりさせるだけ。
// main.js の tick() から、メニュー中だけ毎コマ呼ばれる。
// ===================================================================
function updateMenuBackdrop(dt) {
  menuTime += dt;
  // 振れ幅は小さく、周期は長く。酔わない程度の「漂っている」感じを狙う
  const yaw   = Math.sin(menuTime * 0.11) * 0.30;
  const pitch = Math.sin(menuTime * 0.07) * 0.14;
  turnView(dt, pitch, yaw, 0);
  updateFlight(dt, 14);      // エンジン14%相当のゆっくりした巡航
}

// ===================================================================
// メニュー中のキー操作
//
// main.js のキー処理より先に呼ばれるよう、こちらを後から登録する…
// のではなく、main.js 側の先頭で「メニュー中なら何もしない」と
// 判断させている。ここは純粋にメニューの操作だけを引き受ける。
// ===================================================================
window.addEventListener('keydown', (event) => {
  if (screenState === 'mission') {
    // 戦闘中に効くのは Esc だけ。
    // 交戦中なら一時停止、リザルト表示中ならメインメニューへ戻る。
    if (event.key === 'Escape') {
      event.preventDefault();
      if (missionState === 'active') pauseMission();
      else                           showMenu('root');
    }
    return;
  }

  // ストーリー中のキーは story.js が受け持つ。ここでは何もしない
  if (screenState === 'story') return;

  resumeAudio();   // メニューでの最初のキー入力で音を起こす

  const k = event.key;

  // --- ギャラリー中:上下で機体切替、Esc でメニューへ ---
  if (screenState === 'gallery') {
    if (k === 'ArrowUp'   || k.toLowerCase() === 'w') { event.preventDefault(); moveGallery(-1); return; }
    if (k === 'ArrowDown' || k.toLowerCase() === 's') { event.preventDefault(); moveGallery(+1); return; }
    if (k === 'Escape' || k === 'Enter')              { event.preventDefault(); hideGallery(); return; }
    return;
  }

  if (k === 'ArrowUp'   || k.toLowerCase() === 'w') { event.preventDefault(); moveMenu(-1); return; }
  if (k === 'ArrowDown' || k.toLowerCase() === 's') { event.preventDefault(); moveMenu(+1); return; }
  if (k === 'Enter' || k === ' ')                   { event.preventDefault(); confirmMenu(); return; }
  if (k === 'Escape')                               { event.preventDefault(); backMenu(); return; }
});

// ===================================================================
// 言語が変わったときに呼ばれる(lang.js から)
//
// HTMLに書いてある文字は lang.js が直してくれるが、
// ここで組み立てている画面は作り直さないと古い言語のまま残る。
// ===================================================================
function onLanguageChanged() {
  if (screenState === 'menu' || screenState === 'paused') buildMenu();
  if (screenState === 'gallery') buildGallery();
}

// --- 起動 -----------------------------------------------------------
menuBuildEl.textContent = BUILD;
showMenu('root');
console.log('MAIN MENU ONLINE');
