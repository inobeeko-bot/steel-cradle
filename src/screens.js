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
        label: 'TRAINING', jp: '訓練飛行', tag: 'READY', ready: true,
        detail: '<b>10分 / 10撃墜</b>　演習空域での単機戦闘訓練。<br>' +
                '電力配分・熱・推進剤の三つを同時に回す感覚をつかむための課程。' +
                '撃墜数が規定に届けば任務達成、時間切れか機体喪失で失敗。',
        run: () => launchTraining(),
      },
      {
        label: 'GALLERY', jp: '機体資料', tag: 'READY', ready: true,
        detail: '<b>機体プロファイル</b>　登場する機体を回して眺めながら、諸元を確認できる。<br>' +
                '数値は実際の戦闘で使われている設定値をそのまま読み出しているので、' +
                '調整が入ればこの資料も一緒に変わる。',
        run: () => showGallery(),
      },
      {
        label: 'STORY', jp: 'ストーリー', tag: '準備中', ready: false,
        detail: '<b>三部作キャンペーン</b>　章立て形式。各章がひとつのコロニー攻略戦か防衛戦。<br>' +
                '終盤は同盟の選択でエンディングが分岐し、第二部末の結婚を経て第三部は子世代が主役になる。',
        go: 'story',
      },
      {
        label: 'MULTIPLAYER', jp: 'マルチ対戦', tag: '準備中', ready: false,
        detail: '<b>4チーム×4人 + 海賊ボット / 1試合10分</b>　揺り籠戦争20年間のどこかの戦い。<br>' +
                '資源が全チーム分ない設計のため、同盟と裏切りがルール抜きで自然に起きる。',
        go: 'multi',
      },
    ],
  },

  // --- ストーリー:三部構成(仕様書8章)---
  story: {
    items: [
      {
        label: 'PART I', jp: '黄昏のアルカディア', tag: '準備中', ready: false,
        detail: '企業連合軍によるアルカディア陥落。カイトは生存者と脱出艇で逃げ延び、' +
                '傭兵チームとして各地を転戦する。<br>' +
                '自分たちも「誰かの故郷」を落としていると気づく転換点を経て、' +
                'セラと共闘し<b>託宣改竄の痕跡</b>を発見して幕。',
      },
      {
        label: 'PART II', jp: 'バベルの墓標', tag: '準備中', ready: false,
        detail: '各コロニーの紋章を集める旅。真実を突きつけたカイトのもとに史上初の全勢力同盟が成立する。<br>' +
                'しかし20年の憎悪は消えず、内部から裏切りが発生。<b>紋章は強奪され、同盟は崩壊</b>する。',
      },
      {
        label: 'PART III', jp: 'プロメテウスの火', tag: '準備中', ready: false,
        detail: '親世代の子らが聖印と神器コアを継承し、散らばった紋章を奪還する巡礼へ。<br>' +
                'オリュンポス攻略戦、そして<b>レヴィアタン覚醒</b>。' +
                '人類が神の託宣に運命を委ねる時代を終わらせ、揺り籠を出る。',
      },
      { label: '← BACK', jp: '戻る', ready: true, detail: '', back: true },
    ],
  },

  // --- マルチ対戦:2モード制(仕様書9.4)---
  multi: {
    items: [
      {
        label: 'MODE A', jp: '託宣戦(トクセン)', tag: '準備中', ready: false,
        detail: '<b>政治と経済のゲーム</b>　資源ポイントを奪い合う椅子取り戦。<br>' +
                '0〜4分「拡張」で採取、4〜8分「均衡」で神器コアが中央に投下され同盟が形成される。' +
                '残り2分の<b>託宣フェーズ</b>で「存続可能なのは○チーム」が宣告され、同盟は強制的に崩壊する。',
      },
      {
        label: 'MODE B', jp: '旗艦戦(キカンセン)', tag: '準備中', ready: false,
        detail: '<b>兵站と火力のゲーム</b>　各チームに旗艦1隻。敵旗艦の動力コア破壊で勝利。<br>' +
                '旗艦は移動する拠点(リスポーン・補給・シールド傘)で、喪失は「兵站の死」を意味する。' +
                '10分で未決着なら全旗艦のシールドが停止し、裸のコア同士で必ず決着する。',
      },
      { label: '← BACK', jp: '戻る', ready: true, detail: '', back: true },
    ],
  },

  // --- 戦闘中に Esc を押したときの一時停止 ---
  pause: {
    items: [
      {
        label: 'RESUME', jp: '戦闘に戻る', tag: 'READY', ready: true,
        detail: '一時停止を解除して、そのまま戦闘を続ける。',
        run: () => resumeMission(),
      },
      {
        label: 'ABORT', jp: '任務中断', tag: 'READY', ready: true,
        detail: 'この出撃を打ち切ってメインメニューへ戻る。<b>戦果は記録されない。</b>',
        run: () => abortMission(),
      },
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
function buildMenu() {
  const page = MENU_PAGES[menuPage];
  menuListEl.innerHTML = '';

  page.items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'menu-item'
      + (i === menuIndex ? ' sel' : '')
      + (item.ready ? ' ready' : ' locked');

    // 英字の見出し / 日本語の副題 / 右端の札 の3つを並べる
    row.innerHTML =
      '<span class="en">' + item.label + '</span>' +
      '<span class="jp">' + item.jp + '</span>' +
      (item.tag ? '<span class="tag">' + item.tag + '</span>' : '');

    // マウスでも選べるようにしておく(キーボードと同じ動きにする)
    row.addEventListener('mouseenter', () => { menuIndex = i; buildMenu(); });
    row.addEventListener('click', () => { menuIndex = i; confirmMenu(); });

    menuListEl.appendChild(row);
  });

  menuDetailEl.innerHTML = page.items[menuIndex].detail || '';
}

// --- 選択を上下に動かす ---------------------------------------------
// 端まで行ったら反対側へ回り込む(% は割った余り)
function moveMenu(delta) {
  const n = MENU_PAGES[menuPage].items.length;
  menuIndex = (menuIndex + delta + n) % n;
  buildMenu();
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

  if (item.back)          { playViewClick(); openMenuPage('root'); return; }
  if (item.go)            { playPresetConfirm(); openMenuPage(item.go); return; }
  if (!item.ready)        { playDenied(); return; }   // 準備中の項目は進めない
  if (item.run)           { playPresetConfirm(); item.run(); }
}

// --- 戻る(Esc)-------------------------------------------------------
function backMenu() {
  if (menuPage === 'root') { playDenied(); return; }   // これ以上は戻れない
  if (menuPage === 'pause') { resumeMission(); return; }
  playViewClick();
  openMenuPage('root');
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
  hideMenu();
  setEnemiesHidden(false);                          // 敵を戻す
  applyViewMode(OPTIONS.startView === 'cockpit');   // 好みの視点で出撃する
  screenState = 'mission';
  restartMission();          // 7パラメーター・弾数・戦果をすべて初期化して開始
}

// --- 戦闘中に Esc:一時停止 ---
function pauseMission() {
  if (screenState !== 'mission' || missionState !== 'active') return;
  screenState = 'paused';
  setCombatFrozen(true);     // 敵を止める。景色はそのまま残す
  keysHeld.clear();          // 停止した瞬間に押していたキーを離した扱いにする
  menuEl.classList.add('on');
  openMenuPage('pause');
  playViewClick();
}

// --- 一時停止から戦闘へ戻る ---
function resumeMission() {
  if (screenState !== 'paused') return;
  screenState = 'mission';
  setCombatFrozen(false);
  menuEl.classList.remove('on');
  playViewClick();
}

// --- 任務中断:メインメニューへ ---
function abortMission() {
  missionState = 'aborted';   // 'active' 以外にしておく(戦闘の各処理が止まる)
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
    cls: '単座 汎用戦闘機 ― プレイヤー機',
    build: () =>
      galSec('STRUCTURE / 構造') +
      galRow('制式名', '未設定', '(仕様書に記載なし)') +
      galRow('HULL', HULL.MAX_DAMAGE + ' 段階', '(戦闘中の修復は不可)') +
      galRow('シールド', SHIELD.MAX,
             '(配分1%につき毎秒 ' + SHIELD.REGEN_PER_POWER + ' 回復)') +

      galSec('POWER / 電力') +
      galRow('出力配分', '4系統 合計 100%', '(武器 / シールド / エンジン / センサー)') +
      galRow('プリセット', '攻撃 / 防御 / 巡航', '(1 / 2 / 3)') +

      galSec('THERMAL / 熱') +
      galRow('熱容量', HEAT.MAX, '(警戒 ' + HEAT.WARN + ')') +
      galRow('ラジエーター展開', '−' + HEAT.VENT_RADIATOR + ' /秒',
             '(ただし敵センサーへの露出が増える)') +
      galRow('ラジエーター収納', '−' + HEAT.VENT_BASE + ' /秒') +
      galRow('強制冷却', '熱 ' + HEAT.MAX + ' で ' + HEAT.SHUTDOWN_SEC + '秒 停止',
             '(この間は操作不能=無防備。−' + HEAT.VENT_SHUTDOWN + ' /秒で冷える)') +

      galSec('PROPULSION / 推進') +
      galRow('推進剤', PROP.MAX, '(戦闘中の補給なし)') +
      galRow('回避バースト', PROP.BURST_COST + ' /回',
             '(熱 +' + PROP.BURST_HEAT + ' ・ 約' + Math.floor(PROP.MAX / PROP.BURST_COST) + '回)') +
      galRow('ドリフト', '機首と進行方向を分離', '(Shift長押し)') +

      galSec('ARMAMENT / 主兵装') +
      WEAPONS.map((w) => galRow(w.label + ' / ' + w.jp,
        galAmmo(w.ammo) + ' 発',
        '熱 +' + w.heat + (w.minPower ? ' ・ 要 武器電力 ' + w.minPower + '%' : ''))).join('') +

      galSec('ORDNANCE / 投下兵装') +
      BOMBS.map((b) => galRow(b.label + ' / ' + b.jp,
        galAmmo(b.ammo) + ' 発',
        '熱 +' + b.heat + (b.minPower ? ' ・ 要 武器電力 ' + b.minPower + '%' : ''))).join('') +

      galSec('COUNTERMEASURES / 対抗装備') +
      galRow('フレア', FLARE.COUNT + ' 発',
             '(投下から ' + FLARE.LIFE + '秒 燃焼)') +

      '<div class="gal-note">' +
      '<b>熱は居場所である。</b>　排熱すると冷えるが、その熱は敵のセンサーとミサイルのシーカーに' +
      'そのまま見えている。ラジエーターを開けば冷却は ' +
      (HEAT.VENT_RADIATOR / HEAT.VENT_BASE).toFixed(1) + '倍になるが、被発見距離も伸び、' +
      'フレアで騙せる確率も落ちる。冷やすか、隠れるか ― 同時には選べない。' +
      '</div>',
  },
  {
    key: 'enemy',
    name: 'HOSTILE FIGHTER',
    cls: '企業連合軍 ― 単座 戦闘機',
    build: () =>
      galSec('STRUCTURE / 構造') +
      galRow('HULL', ENEMY.MAX_HP) +
      galRow('再出撃', ENEMY.RESPAWN_SEC + ' 秒', '(演習空域のため無制限)') +

      galSec('SENSOR / 索敵') +
      galRow('基本探知', ENEMY_SENSOR.BASE_RANGE, '(こちらが冷えているとき)') +
      galRow('最大探知', ENEMY_SENSOR.HEAT_RANGE, '(こちらが高熱のとき)') +
      galRow('偏差精度', ENEMY_SENSOR.LEAD_COLD + ' → ' + ENEMY_SENSOR.LEAD_HOT,
             '(冷 → 熱。高いほど正確に置き撃ちされる)') +
      galRow('射撃のばらつき', ENEMY_SENSOR.SPREAD_COLD + ' → ' + ENEMY_SENSOR.SPREAD_HOT,
             '(熱いほど散らない)') +

      galSec('ARMAMENT / 兵装') +
      galRow('機関砲', '速度 ' + ENEMY_BOLT.SPEED, '(射程 ' + AI.ATTACK_RANGE + ' で交戦)') +
      galRow('ミサイル', ENEMY_MISSILE.AMMO + ' 発',
             '(射程 ' + ENEMY_MISSILE.RANGE + ' ・ 間隔 ' + ENEMY_MISSILE.INTERVAL + '秒)') +
      galRow('発射予告', ENEMY_MISSILE.TELEGRAPH + ' 秒',
             '(うち ' + Math.round(ENEMY_MISSILE.BLUFF_CHANCE * 100) + '% はブラフ)') +
      galRow('フレア', ENEMY_MISSILE.FLARE_AMMO + ' 発',
             '(こちらのミサイルも騙される)') +

      galSec('THERMAL / 熱') +
      galRow('熱容量', ENEMY_HEAT.MAX) +
      galRow('排熱', '−' + ENEMY_HEAT.VENT + ' /秒') +
      galRow('強制冷却', ENEMY_HEAT.MAX + ' 到達で ' + ENEMY_HEAT.SHUTDOWN_SEC + '秒',
             '(パイロ弾で誘発できる)') +

      galSec('BEHAVIOUR / 機動') +
      galRow('接近 / 交戦 / 回避', AI.APPROACH_SPEED + ' / ' + AI.ATTACK_SPEED + ' / ' + AI.EVADE_SPEED) +
      galRow('旋回性能', AI.TURN_RATE + ' rad/秒') +
      galRow('離脱距離', AI.BREAK_RANGE, '(近づきすぎると ' + AI.TOO_CLOSE + ' で離れる)') +

      '<div class="gal-note">' +
      '<b>相手もこちらを探している。</b>　この機体の探知距離は固定ではなく、' +
      'こちらの熱で ' + ENEMY_SENSOR.BASE_RANGE + ' から ' + ENEMY_SENSOR.HEAT_RANGE +
      ' まで伸びる。撃たれ方が急に正確になったときは、たいてい自分が熱いせいである。' +
      '</div>',
  },
];

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
  galClassEl.textContent = c.cls;
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

// --- 起動 -----------------------------------------------------------
menuBuildEl.textContent = BUILD;
showMenu('root');
console.log('MAIN MENU ONLINE');
