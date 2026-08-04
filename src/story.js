// ===================================================================
// STEEL CRADLE ― ストーリー(サイドビューADVパート)
//
// 横一本の道を歩いて、物を調べ、人と話す。それだけの画面。
// 戦闘(3D)とは完全に別の層で、こちらはHTML/CSSだけで描く。
//
// このファイルの方針:
//   ・シーンは「データ」として書く(STORY_SCENES)。
//     新しいシーンを足すときはコードではなく表を足す。
//   ・絵はまだ入れない。仕様どおり、単色の矩形+ラベルで置いておく。
//     あとでドット絵に差し替えるとき、位置と大きさはそのまま使える。
//   ・会話は全スキップ可能(仕様書10章)。Esc でいつでも抜けられる。
// ===================================================================

// --- 画面の部品 -----------------------------------------------------
const storyEl        = document.getElementById('story');
const storyWorldEl   = document.getElementById('story-world');
const storyPromptEl  = document.getElementById('story-prompt');
const storyBoxEl     = document.getElementById('story-box');
const storySpeakerEl = document.getElementById('story-speaker');
const storyTextEl    = document.getElementById('story-text');
const storyFadeEl    = document.getElementById('story-fade');
const storyHintEl    = document.getElementById('story-hint');

// ===================================================================
// 見た目の調整値
//
// 数字はすべてここに集める。位置や速さを直したくなったとき、
// シーンの表や描画処理を探し回らなくて済むようにしておく。
// ===================================================================
const ADV = {
  WALK_SPEED:   330,   // 歩く速さ(1秒あたりの横移動量)
  ACTOR_W:       46,   // カイトの矩形の幅(プレースホルダー)
  ACTOR_H:      132,   // 同じく高さ。画面に対してこれくらいないと豆粒に見える
  REACH:        130,   // 「調べる」が届く距離
  CAM_EDGE:    0.40,   // 画面のどこにカイトを置くか(0.5=中央)
  CAM_SMOOTH:  0.10,   // カメラの追従の緩さ(小さいほどぬるっと付いてくる)
  TYPE_SPEED:    45,   // 1秒に何文字出すか。0 にすると一気に出る
  GROUND_Y:     176,   // 地面の高さ(画面下からの距離)。会話枠より高くしておく
  // 遠景を地平の上へ持ち上げる量。0 だと手前の物と同じ高さに立ってしまい、
  // 「遠くの丘」ではなく「隣に建っている壁」に見える。
  FAR_LIFT:      40,
};

// ===================================================================
// シーンの表
//
// props     … 背景に置く物。examine があるものだけ調べられる
// npc       … 話しかけられる相手。talks は「何回目か」で中身が変わる
// exit      … 右端の出口。unlock のフラグが立つまで通れない
// ===================================================================
const STORY_SCENES = {

  ch1_s1_hill: {
    title: '第一部 一章 ― 林檎の丘',
    place: 'アルカディア / 農業区',
    width: 4100,          // 道の全長
    start: 520,           // カイトの初期位置(家の戸口の少し右)

    // 黄昏のパレット。収穫祭当日の昼下がり〜夕方
    sky:    ['#3a2a3c', '#8a5a3e', '#d8925a'],   // 上 → 中 → 下
    ground: '#241c22',

    // --- 背景(調べられない飾り)---
    // far は遠景でゆっくり流れ、near は手前で速く流れる(パララックス)
    scenery: [
      // 遠くの丘。横に広く、背は低く。稜線のつもり
      { layer: 'far',  x:  320, w:  900, h: 150, color: '#2a2436', label: '' },
      { layer: 'far',  x: 1250, w: 1100, h: 210, color: '#272132', label: '' },
      // 丘の遠景に旧ドック。ここが次のシーンの行き先になる
      { layer: 'far',  x: 2800, w:  620, h: 330, color: '#1a1726', label: '旧ドック' },
      { layer: 'far',  x: 3700, w:  800, h: 180, color: '#2a2436', label: '' },
      { layer: 'near', x: 2270, w:  300, h: 100, color: '#3a2f34', label: '柵' },
      // 村人のシルエット(背景。話しかけられない)
      { layer: 'near', x: 2400, w:  34, h:  96, color: '#4a3a3a', label: '' },
      { layer: 'near', x: 2460, w:  34, h: 104, color: '#4a3a3a', label: '' },
      { layer: 'near', x: 2516, w:  30, h:  88, color: '#4a3a3a', label: '' },
    ],

    // --- 調べられる物 ---
    props: [
      {
        id: 'examine_house', x: 300, w: 200, h: 240,
        color: '#4a3a34', label: '家の戸口',
        first: [
          { who: 'カイト', text: '鍵なんてかけたことがない。この村で盗みをやる奴は、翌朝には村じゅうの朝飯当番にされる' },
        ],
      },
      {
        id: 'examine_tree', x: 1200, w: 250, h: 430,
        color: '#3d5140', label: '林檎の木',
        first: [
          { who: 'カイト', text: '実はまだ固いな。……祭りには間に合わないか' },
        ],
        repeat: [
          { who: 'カイト', text: 'じいちゃんが六十年かけた木だ。俺より年上の先輩ってわけ' },
        ],
      },
      {
        id: 'examine_shears', x: 1380, w: 44, h: 34,
        color: '#7a7f86', label: '剪定バサミ',
        first: [
          { who: 'カイト', text: 'じいちゃんの商売道具。……俺が触ると、なぜか翌日に刃が曇るらしい。濡れ衣だと思う' },
        ],
      },
    ],

    // --- 祖父(メインの会話。3段階で進み、3回目で出口が開く)---
    npc: {
      id: 'grandpa', x: 1700, w: 48, h: 122,
      color: '#6b5240', label: '祖父',

      talks: [
        // gp_talk_1
        { flag: 'gp1_done', lines: [
          { who: '祖父',   text: 'おう、カイト。当番はどうした' },
          { who: 'カイト', text: '旧式艇四機、異常なし。異常があったこともない' },
          { who: '祖父',   text: '結構。暇な防衛隊は良い防衛隊だ' },
          { who: 'カイト', text: 'じいちゃん、それ毎回言うね' },
          { who: '祖父',   text: '毎回本当だからな。……ほれ、そこの枝を押さえろ。祭りの前に、こいつの寝癖を直しちまう', se: 'snip' },
        ]},
        // gp_talk_2
        { flag: 'gp2_done', lines: [
          { who: 'カイト', text: 'なあ。学校の端末でさ、建設者の年表を見たんだ。〈十二使徒〉。……五番目だけ、空欄だった' },
          { who: '祖父',   text: 'ほう' },
          { who: 'カイト', text: '事故死、記録焼失。名前も残ってない。……うちと同じ名字だって、昔言わなかったっけ' },
          { who: '祖父',   text: '名前ってのはな、実の入ってない殻みたいなもんだ', note: '(剪定の手を止めずに)' },
          { who: '祖父',   text: '――だが、殻がなけりゃ実は守れん' },
          { who: 'カイト', text: '……つまり?' },
          { who: '祖父',   text: 'つまり、枝を押さえろ。話は実が入ってからだ' },
        ]},
        // gp_talk_3(ここで出口が開く)
        { flag: 'gp3_done', lines: [
          { who: '祖父',   text: 'よし、上がりだ。今夜は祭りだぞ、カイト' },
          { who: 'カイト', text: '収穫祭って言っても、林檎はまだ固いのにな' },
          { who: '祖父',   text: '固い実を祝うのさ。育ってる最中ってことだからな。……ドックの格納庫、灯りを落としてこい。それでお前の当番も上がりだ' },
          { who: 'カイト', text: 'はいよ。……じいちゃん、祭りで飲みすぎるなよ' },
          { who: '祖父',   text: '約束はできん' },
        ]},
      ],

      // 3回目のあとに話しかけたとき
      repeat: [
        { who: '祖父', text: '行け行け。灯りは落とせ、酒は俺が落とす' },
      ],
    },

    // --- 出口(右端)---
    exit: {
      x: 3860,
      unlock: 'gp3_done',
      blocked: [
        { who: 'カイト', text: '……先にじいちゃんの手伝いだな。呼ばれてる気がする' },
      ],
      // 出口を通ったあとの行き先。まだ無いので予告だけ出す
      nextTitle: 'シーン2 ― 収穫祭の夜',
    },

    // --- 開幕の地の文(自動再生)---
    opening: [
      { text: 'アルカディアには、本物の林檎の木があった。' },
      { text: '直径六キロの回転体の内壁に土を敷き、鏡で採った陽光を軸から降らせる。' },
      { text: '――地図には、載っていない村。' },
    ],
  },
};

// ===================================================================
// いまの状態
// ===================================================================
let storyScene   = null;    // 表示中のシーン(STORY_SCENES の中身)
let storyFlags   = null;    // 立ったフラグの集合
let storyX       = 0;       // カイトの位置
let storyCamX    = 0;       // カメラの位置
let storyKeys    = null;    // 押しっぱなしのキー
let storyTime    = 0;       // シーンが始まってからの秒数
let storyTalkCount = null;  // 「その相手と何回話したか」の記録

// 会話の状態
let storyLines   = null;    // 表示中の行の配列。null なら会話していない
let storyIndex   = 0;       // 何行目を出しているか
let storyTyped   = 0;       // 何文字まで出したか(1文字ずつ出す演出)

// 画面の部品の実体。位置を毎コマ書き換えるので、作ったら覚えておく
let storyProps   = null;    // { data, el } の配列
let storyActorEl = null;
let storyNpcEl   = null;
let storyExitEl  = null;
let storyMarkEl  = null;    // 調べられる物の上に出る「▲」

// チュートリアルの出し分け
let storyHintShown = null;

// ===================================================================
// シーンを開く
// ===================================================================
function startStoryScene(id) {
  const scene = STORY_SCENES[id];
  if (!scene) { console.warn('シーンが見つからない: ' + id); return; }

  storyScene     = scene;
  storyFlags     = new Set();
  storyTalkCount = {};
  storyKeys      = new Set();
  storyX         = scene.start;
  storyCamX      = 0;
  storyTime      = 0;
  storyHintShown = new Set();
  storyLines     = null;

  screenState = 'story';
  menuEl.classList.remove('on');
  galleryEl.classList.remove('on');
  consoleEl.classList.add('menu-hidden');   // 計器は出さない
  storyEl.classList.add('on');

  buildStoryScene(scene);
  storyFadeEl.style.opacity = '1';   // 暗転から始めて、開幕でゆっくり明ける

  // 開幕の地の文。少し待ってから出す
  setTimeout(() => {
    if (screenState === 'story') openStoryLines(scene.opening.map(l => ({ who: '', text: l.text })));
  }, 900);
}

// シーンを閉じてメインメニューへ戻る
function exitStory() {
  storyEl.classList.remove('on');
  storyScene = null;
  storyLines = null;
  showMenu('root');
}

// ===================================================================
// 画面を組み立てる
//
// 背景・物・人を一度だけ作って並べる。あとは毎コマ位置だけ動かす。
// ===================================================================
function buildStoryScene(scene) {
  storyWorldEl.innerHTML = '';

  // --- 空(グラデーション)と地面 ---
  storyEl.style.setProperty('--sky-top', scene.sky[0]);
  storyEl.style.setProperty('--sky-mid', scene.sky[1]);
  storyEl.style.setProperty('--sky-bot', scene.sky[2]);
  storyEl.style.setProperty('--ground', scene.ground);
  storyEl.style.setProperty('--ground-h', ADV.GROUND_Y + 'px');

  // --- 背景の飾り ---
  for (const s of scene.scenery) {
    const el = document.createElement('div');
    el.className = 'story-scenery ' + s.layer;
    el.style.left   = s.x + 'px';
    el.style.width  = s.w + 'px';
    el.style.height = s.h + 'px';
    el.style.background = s.color;
    // 遠景だけ地平より上に置いて、奥にあるように見せる
    el.style.bottom = (ADV.GROUND_Y + (s.layer === 'far' ? ADV.FAR_LIFT : 0)) + 'px';
    if (s.label) el.innerHTML = '<span>' + s.label + '</span>';
    el.dataset.layer = s.layer;
    storyWorldEl.appendChild(el);
  }

  // --- 調べられる物 ---
  storyProps = [];
  for (const p of scene.props) {
    const el = document.createElement('div');
    el.className = 'story-prop';
    el.style.left   = (p.x - p.w / 2) + 'px';
    el.style.width  = p.w + 'px';
    el.style.height = p.h + 'px';
    el.style.background = p.color;
    el.style.bottom = ADV.GROUND_Y + 'px';
    el.innerHTML = '<span>' + p.label + '</span>';
    storyWorldEl.appendChild(el);
    storyProps.push({ data: p, el: el });
  }

  // --- 祖父 ---
  const n = scene.npc;
  storyNpcEl = document.createElement('div');
  storyNpcEl.className = 'story-actor npc';
  storyNpcEl.style.left   = (n.x - n.w / 2) + 'px';
  storyNpcEl.style.width  = n.w + 'px';
  storyNpcEl.style.height = n.h + 'px';
  storyNpcEl.style.background = n.color;
  storyNpcEl.style.bottom = ADV.GROUND_Y + 'px';
  storyNpcEl.innerHTML = '<span>' + n.label + '</span>';
  storyWorldEl.appendChild(storyNpcEl);

  // --- 出口の目印 ---
  storyExitEl = document.createElement('div');
  storyExitEl.className = 'story-exit';
  storyExitEl.style.left = scene.exit.x + 'px';
  storyExitEl.style.bottom = ADV.GROUND_Y + 'px';
  storyWorldEl.appendChild(storyExitEl);

  // --- カイト ---
  storyActorEl = document.createElement('div');
  storyActorEl.className = 'story-actor kaito';
  storyActorEl.style.width  = ADV.ACTOR_W + 'px';
  storyActorEl.style.height = ADV.ACTOR_H + 'px';
  storyActorEl.style.bottom = ADV.GROUND_Y + 'px';
  storyWorldEl.appendChild(storyActorEl);

  // --- 調べられるものを指す印 ---
  storyMarkEl = document.createElement('div');
  storyMarkEl.className = 'story-mark';
  storyMarkEl.textContent = '▲';
  storyWorldEl.appendChild(storyMarkEl);

  storyHintEl.textContent = scene.place + '　/　' + scene.title;
}

// ===================================================================
// いちばん近い「調べられるもの」を探す
//
// 会話中は探さない。届く範囲(REACH)に入っているものだけを返す。
// ===================================================================
function nearestStoryTarget() {
  if (!storyScene) return null;
  let best = null, bestD = ADV.REACH;

  for (const p of storyProps) {
    const d = Math.abs(p.data.x - storyX);
    if (d < bestD) { bestD = d; best = { kind: 'prop', data: p.data, x: p.data.x }; }
  }
  const n = storyScene.npc;
  const dn = Math.abs(n.x - storyX);
  if (dn < bestD) { bestD = dn; best = { kind: 'npc', data: n, x: n.x }; }

  return best;
}

// ===================================================================
// 会話を開く / 進める / 閉じる
// ===================================================================
function openStoryLines(lines) {
  if (!lines || !lines.length) return;
  storyLines = lines;
  storyIndex = 0;
  storyTyped = 0;
  storyBoxEl.classList.add('on');
  renderStoryLine();
}

function renderStoryLine() {
  const line = storyLines[storyIndex];
  // 話者が空なら地の文。枠の見た目を変える
  storyBoxEl.classList.toggle('narration', !line.who);
  storySpeakerEl.textContent = line.who || '';
  storySpeakerEl.style.display = line.who ? '' : 'none';
  storyTextEl.textContent = '';
  storyTyped = 0;
}

// 次の行へ。1文字ずつ出している途中なら、まず全部出す
function advanceStory() {
  if (!storyLines) return;
  const line = storyLines[storyIndex];
  const full = (line.note ? line.note + ' ' : '') + line.text;

  if (storyTyped < full.length) { storyTyped = full.length; storyTextEl.textContent = full; return; }

  storyIndex += 1;
  if (storyIndex >= storyLines.length) { closeStoryLines(); return; }
  renderStoryLine();
  playViewClick();
}

function closeStoryLines() {
  storyLines = null;
  storyBoxEl.classList.remove('on');
}

// ===================================================================
// 調べる / 話しかける
// ===================================================================
function interactStory() {
  const t = nearestStoryTarget();
  if (!t) return;

  if (t.kind === 'prop') {
    const seen = storyTalkCount[t.data.id] || 0;
    storyTalkCount[t.data.id] = seen + 1;
    // 2回目以降の台詞があればそちらを出す
    const lines = (seen > 0 && t.data.repeat) ? t.data.repeat : t.data.first;
    openStoryLines(lines);
    return;
  }

  // --- 祖父 ---
  const npc = t.data;
  const step = storyTalkCount[npc.id] || 0;

  if (step < npc.talks.length) {
    const talk = npc.talks[step];
    storyTalkCount[npc.id] = step + 1;
    storyFlags.add(talk.flag);
    openStoryLines(talk.lines);

    // gp_talk_1 の最中だけ「Enter:次へ」を出す(仕様書のチュートリアル表)
    if (step === 0) showStoryHint('enter', 'Enter:次へ');
    // 3回目まで終わったら出口が開く
    if (talk.flag === storyScene.exit.unlock) {
      storyExitEl.classList.add('open');
      showStoryHint('exit', '右へ:ドックへ向かう');
    }
  } else {
    openStoryLines(npc.repeat);
  }
}

// ===================================================================
// チュートリアルの表示
//
// 同じものを二度出さないよう、一度出した種類は覚えておく。
// ===================================================================
function showStoryHint(key, text) {
  if (storyHintShown.has(key)) return;
  storyHintShown.add(key);
  storyPromptEl.textContent = text;
  storyPromptEl.classList.add('on');
  clearTimeout(showStoryHint._timer);
  showStoryHint._timer = setTimeout(() => storyPromptEl.classList.remove('on'), 4200);
}

// ===================================================================
// 毎コマの更新(main.js の tick から呼ばれる)
// ===================================================================
function updateStory(dt) {
  if (!storyScene) return;
  storyTime += dt;

  // --- 暗転から明ける ---
  const fade = Math.max(0, 1 - storyTime / 2.0);
  storyFadeEl.style.opacity = String(fade);

  // --- 開始2秒後に移動の説明を出す ---
  if (storyTime > 2.0) showStoryHint('move', '← →  /  A D:移動');

  // --- 1文字ずつ出す ---
  if (storyLines) {
    const line = storyLines[storyIndex];
    const full = (line.note ? line.note + ' ' : '') + line.text;
    if (storyTyped < full.length) {
      storyTyped = Math.min(full.length, storyTyped + ADV.TYPE_SPEED * dt);
      storyTextEl.textContent = full.slice(0, Math.floor(storyTyped));
    }
  }

  // --- 移動(会話中は動けない)---
  if (!storyLines) {
    let dir = 0;
    if (storyKeys.has('arrowleft')  || storyKeys.has('a')) dir -= 1;
    if (storyKeys.has('arrowright') || storyKeys.has('d')) dir += 1;
    if (dir !== 0) {
      storyX += dir * ADV.WALK_SPEED * dt;
      storyActorEl.classList.toggle('flip', dir < 0);
      storyActorEl.classList.add('walking');
    } else {
      storyActorEl.classList.remove('walking');
    }
    // 道の外へ出ないようにする
    storyX = Math.max(60, Math.min(storyScene.width - 60, storyX));

    // --- 出口の判定 ---
    const exit = storyScene.exit;
    if (storyX >= exit.x) {
      if (storyFlags.has(exit.unlock)) { leaveStoryScene(); }
      else { storyX = exit.x - 4; openStoryLines(exit.blocked); }
    }
  }

  // --- 調べられるものが近くにあるか ---
  const target = (!storyLines) ? nearestStoryTarget() : null;
  if (target) {
    storyMarkEl.style.left = target.x + 'px';
    storyMarkEl.style.bottom = (ADV.GROUND_Y + (target.data.h || 60) + 14) + 'px';
    storyMarkEl.classList.add('on');
    showStoryHint('interact', 'E / Enter:調べる・話す');
  } else {
    storyMarkEl.classList.remove('on');
  }

  // --- カメラ ---
  // カイトを画面の少し左寄りに置き、道の端では止める
  const viewW = storyEl.clientWidth;
  let want = storyX - viewW * ADV.CAM_EDGE;
  want = Math.max(0, Math.min(storyScene.width - viewW, want));
  storyCamX += (want - storyCamX) * (1 - Math.exp(-dt / ADV.CAM_SMOOTH));

  storyWorldEl.style.transform = 'translateX(' + (-storyCamX) + 'px)';
  storyActorEl.style.left = (storyX - ADV.ACTOR_W / 2) + 'px';

  // 遠景はカメラより遅く動かす(パララックス)。
  // 手前と同じ速さで流すと、書き割りが貼りついているように見える。
  for (const el of storyWorldEl.querySelectorAll('.story-scenery.far')) {
    el.style.transform = 'translateX(' + (storyCamX * 0.55) + 'px)';
  }
  for (const el of storyWorldEl.querySelectorAll('.story-scenery.near')) {
    el.style.transform = 'translateX(' + (storyCamX * 0.12) + 'px)';
  }
}

// ===================================================================
// 出口を抜けた:次のシーンへ
//
// シーン2はまだ無いので、予告だけ出してメニューへ戻る。
// ===================================================================
function leaveStoryScene() {
  storyLines = 'leaving';   // 操作を止めるための目印(配列でないので描画はされない)
  storyFadeEl.style.transition = 'opacity 2s';
  storyFadeEl.style.opacity = '1';
  storyBoxEl.classList.remove('on');
  storyMarkEl.classList.remove('on');

  setTimeout(() => {
    storyPromptEl.textContent = 'To be continued ―― ' + storyScene.exit.nextTitle;
    storyPromptEl.classList.add('on', 'big');
  }, 1600);

  setTimeout(() => {
    storyPromptEl.classList.remove('on', 'big');
    storyFadeEl.style.transition = '';
    exitStory();
  }, 5200);
}

// ===================================================================
// キー操作
// ===================================================================
window.addEventListener('keydown', (event) => {
  if (screenState !== 'story') return;
  const k = event.key.toLowerCase();
  storyKeys.add(k);

  resumeAudio();

  // 会話中でも移動中でも、Esc でメニューへ戻れる(会話は全スキップ可能)
  if (event.key === 'Escape') { event.preventDefault(); exitStory(); return; }

  if (event.key === 'Enter' || k === 'e' || event.key === ' ') {
    event.preventDefault();
    if (storyLines === 'leaving') return;
    if (storyLines) advanceStory();
    else            interactStory();
  }
  if (event.key.startsWith('Arrow')) event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  if (!storyKeys) return;
  storyKeys.delete(event.key.toLowerCase());
});
