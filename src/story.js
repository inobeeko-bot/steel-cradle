// ===================================================================
// STEEL CRADLE ― ストーリー(サイドビューADVパート)
//
// 横一本の道を歩いて、物を調べ、人と話す。それだけの画面。
// 戦闘(3D)とは完全に別の層で、こちらはHTML/CSSだけで描く。
//
// 【座標について】
// このパートは 640×360 の「仮想解像度」で作る。背景のドット絵がその
// 大きさで描かれているので、座標も全部そこに合わせておくと、
// 絵の上の位置とコードの数字が1対1で対応して迷わない。
// 画面に出すときだけ整数倍に拡大する(下の ADV_CONFIG.BASE_* 参照)。
//
// このファイルの方針:
//   ・シーンは「データ」として書く(STORY_SCENES)。
//     新しいシーンを足すときはコードではなく表を足す。
//   ・会話は全スキップ可能(仕様書10章)。Esc でいつでも抜けられる。
// ===================================================================

// --- 画面の部品 -----------------------------------------------------
const storyEl        = document.getElementById('story');
const storyStageEl   = document.getElementById('story-stage');
const storyWorldEl   = document.getElementById('story-world');
const storyPromptEl  = document.getElementById('story-prompt');
const storyBoxEl     = document.getElementById('story-box');
const storySpeakerEl = document.getElementById('story-speaker');
const storyTextEl    = document.getElementById('story-text');
const storyFadeEl    = document.getElementById('story-fade');
const storyHintEl    = document.getElementById('story-hint');

// ===================================================================
// 調整値
//
// 数字はすべてここに集める。位置や速さを直したくなったとき、
// シーンの表や描画処理を探し回らなくて済むようにしておく。
// ===================================================================
const ADV_CONFIG = {
  // --- 仮想解像度。背景ドット絵の実寸 ---
  BASE_W: 640,
  BASE_H: 360,

  // --- 拡大 ---
  // 整数倍だけを使う。1.5倍などにするとドットの大きさが揃わず、
  // 拡大したドット絵特有のガタつき(모アレ)が出る。
  // 端に出る余白は黒帯にする。
  MIN_SCALE: 1,

  // --- 各層のスクロール率 ---
  // 1.0 = カメラと同じだけ動く(手前)。小さいほど遠くに見える。
  SCROLL: { far: 0.2, mid: 0.6, near: 1.0 },

  // --- 背景画像 ---
  LAYERS: [
    { key: 'far',  src: 'assets/adv/bg_hill_far.png'  },
    { key: 'mid',  src: 'assets/adv/bg_hill_mid.png'  },
    { key: 'near', src: 'assets/adv/bg_hill_near.png' },
  ],

  // --- 人物と操作(すべて仮想解像度の px)---
  // 歩く速さ(1秒あたり)。
  // コマ送りは距離に連動するので、ここを変えると脚の回転も一緒に変わる。
  // 55 なら 55 ÷ 7 ≒ 毎秒7.9コマ。端から端まで約12秒。
  WALK_SPEED:   55,
  // 人物の身長。カイトのドット絵の中身がちょうど46pxあるので、
  // まだ矩形のままの人物(祖父)もこれに揃える。
  CHAR_HEIGHT:  46,
  // 幅は身長からの比で出す。別々に持つと、身長だけ変えたとき
  // 縦長・横長にひしゃげてしまう。矩形の人物にだけ使う。
  CHAR_ASPECT: 0.32,

  // --- スプライト ---
  // コマは 48×48。中身は下端まで詰まっているので、
  // 「コマの底辺中央」がそのまま接地点になる。
  SPRITE: {
    FRAME_W: 48,
    FRAME_H: 48,
    IDLE: 'assets/adv/kite_idle.png',
    WALK: 'assets/adv/kite_walk_v4.png',
    // ドット絵は右向きに描かれている。左へ歩くときは水平反転して使う。
    // (もし素材が左向きだったら、ここを false にすれば反転が逆になる)
    FACES_RIGHT: true,
  },
  // --- 歩きのコマ送り ---
  //
  // コマは「時間」ではなく「進んだ距離」で送る。
  // 時間で送ると、移動速度を変えたとたんに脚の回転と進み方がずれ、
  // 足を広げたまま横滑りしているように見えてしまう。
  //
  // 歩行シートのコマ数。1周(=2歩)がこの枚数。
  WALK_FRAME_COUNT: 4,

  // その場での作業アニメ(祖父の剪定など)の毎秒コマ数。
  // 歩きと違って移動しないので、こちらは時間で送る。
  WORK_ANIM_FPS: 3,

  // WALK_STEP_PX = 何px進むごとに1コマ進めるか。
  // 4コマで1周(=2歩)なので、1歩は2コマ = WALK_STEP_PX × 2。
  // 身長46pxに対して1歩21px前後が自然なので、10px/コマで噛み合う。
  WALK_STEP_PX: 10,
  REACH:        34,    // 「調べる」が届く距離
  CAM_EDGE:   0.40,    // 画面のどこにカイトを置くか(0.5=中央)
  CAM_SMOOTH: 0.10,    // カメラの追従の緩さ
  TYPE_SPEED:   45,    // 1秒に何文字出すか

  // --- 会話ウィンドウ ---
  // 背景のドット絵が明るいので、枠が透けると文字が読めない。
  // 不透明度はここで調整する。
  BOX_OPACITY: 0.92,
};

// ===================================================================
// シーンの表
//
// 座標はすべて 640×360 の仮想解像度。背景の絵と同じ物差し。
//   x … 左からの距離
//   y … 上からの距離(接地ラインを表す groundY で使う)
// ===================================================================
// ===================================================================
// 祖父の剪定位置
//
// 座標で決め打ちせず、背景の絵の上で
//   ・脚立は幹の右端のすぐ右(隙間は幹の幅の半分まで)
//   ・鋏の先端が樹冠下端の葉に 2〜4px 重なる
// という見た目の条件を満たすように合わせ込んだ値。
// 基準にした実測値は下の npc のコメントに残してある。
// ===================================================================
const GRANDPA_POS = {
  X: 254,          // 脚立の中心(幹の右端235 + 19)

  // 足場の高さ(px)。地面からこれだけ持ち上げる。
  //
  // 必要な高さは実測から 83px と出ている:
  //   地面に立つと鋏の先端は y=270(足元313 − 43)。葉の下端は y=190。
  //   83 上げると先端は y=187 となり、葉に 3px 重なる(条件は2〜4px)。
  //   ※81 だと 1px しか重ならないので足りない。
  //
  // ただし脚立の絵(prop_ladder_v2.png)が assets に無く、
  // いま持ち上げると祖父が宙に浮く。絵が入ったらここを 83 にする。
  LIFT_Y: 0,

  // 脚立の縦方向の描画倍率(1.25倍まで許容)。絵が入るまで未使用。
  LADDER_SCALE_Y: 1.0,
};

const STORY_SCENES = {

  ch1_s1_hill: {
    title: '第一部 一章 ― 林檎の丘',
    place: 'アルカディア / 農業区',

    // 当面はマップ論理幅 = near層の幅。つまり1画面ぶんで、横スクロールしない。
    // 横に広げるときは、この幅を伸ばしてセグメントを足す。
    width: ADV_CONFIG.BASE_W,
    start: 150,           // カイトの初期位置(家の戸口の前あたり)

    // --- 接地ライン ---
    // 小道は平らではないので、1本の水平線では足元が浮く/沈む。
    // 「この x では上から何 px が地面か」を数点だけ置き、間は直線で繋ぐ。
    // 数字は背景の絵の上に実際に線を描いて合わせた実測値。
    // 形式は [x, y] の配列。
    groundY: [
      [   0, 333 ],
      [  60, 327 ],
      [ 120, 319 ],
      [ 180, 314 ],
      [ 215, 312 ],   // 木の根元。ここがいちばん高い
      [ 280, 314 ],
      [ 340, 318 ],
      [ 420, 323 ],
      [ 500, 329 ],
      [ 570, 333 ],
      [ 640, 337 ],
    ],

    // --- 調べられる物 ---
    // 絵の上に立体は置かない(背景に描かれている)。
    // ここにあるのは「立つと調べられる場所」と、印を出す位置だけ。
    //   x     … カイトがここに立つと調べられる
    //   markX … 「▲」を出す位置(省略すると x と同じ)。
    //           戸口のように、立ち位置と物の位置がずれるものに使う
    //   markH … 印を物のどれくらい上に出すか
    props: [
      {
        id: 'examine_house', x: 118, markX: 56, markH: 78, label: '家の戸口',
        first: [
          { who: 'カイト', text: '鍵なんてかけたことがない。この村で盗みをやる奴は、翌朝には村じゅうの朝飯当番にされる' },
        ],
      },
      {
        id: 'examine_tree', x: 215, markX: 208, markH: 118, label: '林檎の木',
        first: [
          { who: 'カイト', text: '実はまだ固いな。……祭りには間に合わないか' },
        ],
        repeat: [
          { who: 'カイト', text: 'じいちゃんが六十年かけた木だ。俺より年上の先輩ってわけ' },
        ],
      },
      {
        id: 'examine_shears', x: 250, markX: 252, markH: 16, label: '剪定バサミ',
        first: [
          { who: 'カイト', text: 'じいちゃんの商売道具。……俺が触ると、なぜか翌日に刃が曇るらしい。濡れ衣だと思う' },
        ],
      },
    ],

    // --- 祖父(メインの会話。3段階で進み、3回目で出口が開く)---
    npc: {
      // --- 剪定位置(背景の絵を実測して合わせ込んだ値)---
      //
      // 合わせ込みに使った基準(bg_hill_near.png をピクセル単位で計測):
      //   幹の右端 ……… x = 235(幹の幅は約40。脚立との隙間は半分=20まで)
      //   樹冠下端の葉 … x240〜260 のあたりで y = 190〜196
      //   x250 の地面 … y = 313
      //   鋏の先端 ……… コマの中で、足元から43px上・中心から11px 差し出した側
      //
      // X は「脚立の中心」。幹の右端から19px右なので、隙間の条件(≦20)を満たす。
      // 左を向いているので、鋏の先端は x = X − 11 = 243 に来る。
      // そこの葉の下端は y = 190。
      id: 'grandpa', x: GRANDPA_POS.X,

      // 足場の高さ。脚立の上に立つぶんだけ足元を持ち上げる。
      liftY: GRANDPA_POS.LIFT_Y,

      // ふだんの姿:剪定の作業アニメ(2コマ)。コマ幅が48ではなく56なので、
      // シートごとに幅を持たせてある。
      work: { src: 'assets/adv/grandpa_work.png', frames: 2, w: 56, h: 48 },

      // 話しかけられている間の姿。歩行シートには「立ち」のコマが無いので、
      // 脚がいちばん揃って見える通過コマ(添字1)を borrow している。
      sprite: 'assets/adv/grandpa_walk_v4.png',
      standFrame: 1,

      // ふだん向いている先。木のほうを見ながら剪定している。
      // 会話が終わるとこの向きへ戻る。
      faceX: 215,
      label: '祖父',

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
      x: 628,             // near層の右端。ここを越えるとシーン2へ
      unlock: 'gp3_done',
      blocked: [
        { who: 'カイト', text: '……先にじいちゃんの手伝いだな。呼ばれてる気がする' },
      ],
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
let storyScene   = null;    // 表示中のシーン
let storyFlags   = null;    // 立ったフラグの集合
let storyX       = 0;       // カイトの位置(仮想px)
let storyCamX    = 0;       // カメラの位置(仮想px)
let storyKeys    = null;    // 押しっぱなしのキー
let storyTime    = 0;       // シーンが始まってからの秒数
let storyTalkCount = null;  // 「その相手と何回話したか」の記録
let storyScale   = 1;       // いまの拡大率(整数)

// 会話の状態
let storyLines   = null;    // 表示中の行の配列。null なら会話していない
let storyIndex   = 0;
let storyTyped   = 0;

// 画面の部品の実体
let storyLayerEls = null;   // { key, el } の配列
let storyActorEl  = null;
let storyNpcEl    = null;
let storyExitEl   = null;
let storyMarkEl   = null;

let storyHintShown = null;

// 歩きアニメの状態
let storyAnimTime  = 0;    // コマを進めるための時計
let storyAnimFrame = 0;    // いま何コマ目か
let storyWalking   = false;

// NPCの作業アニメの状態
let storyWorkTime  = 0;
let storyWorkFrame = 0;

// ===================================================================
// 拡大率を決めて、舞台の大きさを合わせる
//
// 画面の高さを 360 で割った整数が拡大率。1.5倍のような半端な倍率を
// 使うと、1ドットが2画素になったり3画素になったりしてガタつくので、
// 必ず切り捨てて整数にする。あまった領域は黒帯として残す。
// ===================================================================
function layoutStoryStage() {
  if (!storyEl.classList.contains('on')) return;

  const vw = storyEl.clientWidth;
  const vh = storyEl.clientHeight;
  // 縦にも横にも収まる整数倍を選ぶ
  const byH = Math.floor(vh / ADV_CONFIG.BASE_H);
  const byW = Math.floor(vw / ADV_CONFIG.BASE_W);
  storyScale = Math.max(ADV_CONFIG.MIN_SCALE, Math.min(byH, byW));

  const w = ADV_CONFIG.BASE_W * storyScale;
  const h = ADV_CONFIG.BASE_H * storyScale;
  storyStageEl.style.width  = w + 'px';
  storyStageEl.style.height = h + 'px';
  storyStageEl.style.left   = Math.floor((vw - w) / 2) + 'px';
  storyStageEl.style.top    = Math.floor((vh - h) / 2) + 'px';

  // 背景画像も同じ倍率に拡大する
  if (storyLayerEls) {
    for (const L of storyLayerEls) {
      L.el.style.width  = (ADV_CONFIG.BASE_W * storyScale) + 'px';
      L.el.style.height = (ADV_CONFIG.BASE_H * storyScale) + 'px';
    }
  }
  // 文字まわりも倍率に合わせる(1倍のとき小さくなりすぎないよう下限あり)
  storyStageEl.style.setProperty('--adv-scale', String(storyScale));
}

window.addEventListener('resize', layoutStoryStage);

// ===================================================================
// 地面の高さを求める
//
// groundY に置いた数点の間を直線で繋いで、その x での地面の高さを返す。
// 道が傾いているので、1本の水平線だと人物が浮いたり沈んだりする。
// ===================================================================
function storyGroundY(x) {
  const line = storyScene && storyScene.groundY;
  if (!line || !line.length) return ADV_CONFIG.BASE_H - 40;

  if (x <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    if (x <= line[i][0]) {
      const a = line[i - 1], b = line[i];
      const t = (x - a[0]) / (b[0] - a[0]);   // 0〜1 の比率
      return a[1] + (b[1] - a[1]) * t;        // 直線で繋ぐ
    }
  }
  return line[line.length - 1][1];
}

// ===================================================================
// 人物を「ある地点のほう」へ向かせる(全NPC共通)
//
// 素材は右向きに描かれているので、左を向かせたいときだけ反転する。
// 会話のたびに向き直る処理を1か所にまとめておくと、
// NPCが増えても同じ1行で済む。
// ===================================================================
function faceActorTowards(el, selfX, targetX) {
  const wantLeft = (targetX < selfX);
  el.classList.toggle('flip', ADV_CONFIG.SPRITE.FACES_RIGHT ? wantLeft : !wantLeft);
}

// 人物の身長と幅。scale は「その人物が基準の何倍か」
function charHeight(scale) { return ADV_CONFIG.CHAR_HEIGHT * (scale || 1); }
function charWidth(scale)  { return Math.round(charHeight(scale) * ADV_CONFIG.CHAR_ASPECT); }

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
  layoutStoryStage();
  storyFadeEl.style.opacity = '1';   // 暗転から始めて、開幕でゆっくり明ける

  setTimeout(() => {
    if (screenState === 'story') openStoryLines(scene.opening.map(l => ({ who: '', text: l.text })));
  }, 900);
}

function exitStory() {
  storyEl.classList.remove('on');
  storyScene = null;
  storyLines = null;
  showMenu('root');
}

// ===================================================================
// 画面を組み立てる
// ===================================================================
function buildStoryScene(scene) {
  storyWorldEl.innerHTML = '';

  // --- 背景3層 ---
  // 奥から順に重ねる。img タグで置き、CSS で「ドットをぼかさない」指定をする。
  storyLayerEls = [];
  for (const layer of ADV_CONFIG.LAYERS) {
    const el = document.createElement('img');
    el.className = 'story-layer';
    el.src = layer.src;
    el.alt = '';
    el.draggable = false;
    storyWorldEl.appendChild(el);
    storyLayerEls.push({ key: layer.key, el: el });
  }

  // --- 祖父 ---
  const n = scene.npc;
  storyNpcEl = document.createElement('div');
  storyNpcEl.className = 'story-actor npc' + ((n.sprite || n.work) ? ' sprite' : '');
  if (!n.sprite && !n.work) storyNpcEl.style.background = n.color;
  storyNpcEl.innerHTML = '<span>' + n.label + '</span>';
  storyWorldEl.appendChild(storyNpcEl);
  storyWorkTime  = 0;
  storyWorkFrame = 0;
  // ふだんは作業しながら、決まった方角(木)を向いている
  if (n.faceX !== undefined) faceActorTowards(storyNpcEl, n.x, n.faceX);

  // --- 出口の目印 ---
  storyExitEl = document.createElement('div');
  storyExitEl.className = 'story-exit';
  storyWorldEl.appendChild(storyExitEl);

  // --- カイト(ドット絵のスプライト)---
  // 1枚の絵を横にずらして使う(スプライトシート)。
  // コマごとに画像を差し替えるより、切り替えが速くて描画も安定する。
  storyActorEl = document.createElement('div');
  storyActorEl.className = 'story-actor kaito sprite';
  storyWorldEl.appendChild(storyActorEl);
  storyAnimTime  = 0;
  storyAnimFrame = 0;
  storyWalking   = null;   // 最初の1回で必ず idle を貼るため、あえて未定義にしておく

  // --- 調べられるものを指す印 ---
  storyMarkEl = document.createElement('div');
  storyMarkEl.className = 'story-mark';
  storyMarkEl.textContent = '▲';
  storyWorldEl.appendChild(storyMarkEl);

  storyHintEl.textContent = scene.place + '　/　' + scene.title;
  storyBoxEl.style.setProperty('--box-opacity', String(ADV_CONFIG.BOX_OPACITY));
}

// ===================================================================
// いちばん近い「調べられるもの」を探す
// ===================================================================
function nearestStoryTarget() {
  if (!storyScene) return null;
  let best = null, bestD = ADV_CONFIG.REACH;

  for (const p of storyScene.props) {
    const d = Math.abs(p.x - storyX);
    if (d < bestD) {
      bestD = d;
      best = { kind: 'prop', data: p, x: (p.markX !== undefined) ? p.markX : p.x, markH: p.markH };
    }
  }
  const n = storyScene.npc;
  const dn = Math.abs(n.x - storyX);
  if (dn < bestD) {
    bestD = dn;
    best = { kind: 'npc', data: n, x: n.x,
             markH: (n.sprite || n.work) ? ADV_CONFIG.CHAR_HEIGHT : charHeight(n.scale) };
  }

  return best;
}

// ===================================================================
// 会話を開く / 進める / 閉じる
// ===================================================================
function openStoryLines(lines) {
  if (!lines || !lines.length) return;
  // 話しかけられたNPCは、相手のほうへ向き直る
  if (storyScene && storyScene.npc && storyNpcEl) {
    faceActorTowards(storyNpcEl, storyScene.npc.x, storyX);
  }
  storyLines = lines;
  storyIndex = 0;
  storyTyped = 0;
  storyBoxEl.classList.add('on');
  renderStoryLine();
}

function renderStoryLine() {
  const line = storyLines[storyIndex];
  storyBoxEl.classList.toggle('narration', !line.who);
  storySpeakerEl.textContent = line.who || '';
  storySpeakerEl.style.display = line.who ? '' : 'none';
  storyTextEl.textContent = '';
  storyTyped = 0;
}

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
  // ふだんの向き(祖父なら木のほう)へ戻す
  const n = storyScene && storyScene.npc;
  if (n && n.faceX !== undefined && storyNpcEl) faceActorTowards(storyNpcEl, n.x, n.faceX);
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
    const lines = (seen > 0 && t.data.repeat) ? t.data.repeat : t.data.first;
    openStoryLines(lines);
    return;
  }

  const npc = t.data;
  const step = storyTalkCount[npc.id] || 0;

  if (step < npc.talks.length) {
    const talk = npc.talks[step];
    storyTalkCount[npc.id] = step + 1;
    storyFlags.add(talk.flag);
    openStoryLines(talk.lines);

    if (step === 0) showStoryHint('enter', 'Enter:次へ');
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
  const S = storyScale;

  // --- 暗転から明ける ---
  storyFadeEl.style.opacity = String(Math.max(0, 1 - storyTime / 2.0));

  if (storyTime > 2.0) showStoryHint('move', '← →  /  A D:移動');

  // --- 1文字ずつ出す ---
  if (storyLines && storyLines !== 'leaving') {
    const line = storyLines[storyIndex];
    const full = (line.note ? line.note + ' ' : '') + line.text;
    if (storyTyped < full.length) {
      storyTyped = Math.min(full.length, storyTyped + ADV_CONFIG.TYPE_SPEED * dt);
      storyTextEl.textContent = full.slice(0, Math.floor(storyTyped));
    }
  }

  // --- 移動(会話中は動けない)---
  if (!storyLines) {
    let dir = 0;
    if (storyKeys.has('arrowleft')  || storyKeys.has('a')) dir -= 1;
    if (storyKeys.has('arrowright') || storyKeys.has('d')) dir += 1;
    let moved = 0;
    if (dir !== 0) {
      moved = dir * ADV_CONFIG.WALK_SPEED * dt;
      storyX += moved;
      // 素材の向きと進む向きが違うときだけ反転する
      const faceLeft = (dir < 0);
      storyActorEl.classList.toggle('flip', ADV_CONFIG.SPRITE.FACES_RIGHT ? faceLeft : !faceLeft);
    }
    setStoryWalking(dir !== 0, Math.abs(moved));
    storyX = Math.max(12, Math.min(storyScene.width - 8, storyX));

    const exit = storyScene.exit;
    if (storyX >= exit.x) {
      if (storyFlags.has(exit.unlock)) { leaveStoryScene(); }
      else { storyX = exit.x - 2; openStoryLines(exit.blocked); }
    }
  }

  if (storyLines) setStoryWalking(false, 0);   // 会話中は立ち止まる

  // --- 調べられるものが近くにあるか ---
  const target = (!storyLines) ? nearestStoryTarget() : null;
  if (target) {
    storyMarkEl.style.left   = (target.x * S) + 'px';
    storyMarkEl.style.top    = ((storyGroundY(target.x) - (target.markH || 40) - 12) * S) + 'px';
    storyMarkEl.classList.add('on');
    showStoryHint('interact', 'E / Enter:調べる・話す');
  } else {
    storyMarkEl.classList.remove('on');
  }

  // --- カメラ ---
  // いまはマップ幅=画面幅なので動かないが、横に広げたときにそのまま効く
  let want = storyX - ADV_CONFIG.BASE_W * ADV_CONFIG.CAM_EDGE;
  want = Math.max(0, Math.min(storyScene.width - ADV_CONFIG.BASE_W, want));
  storyCamX += (want - storyCamX) * (1 - Math.exp(-dt / ADV_CONFIG.CAM_SMOOTH));

  // --- 背景3層をスクロール率どおりに動かす ---
  for (const L of storyLayerEls) {
    const rate = ADV_CONFIG.SCROLL[L.key];
    // 拡大後の画素にきっちり合わせる(小数だとドットの縁がにじむ)
    const px = Math.round(-storyCamX * rate * S);
    L.el.style.transform = 'translateX(' + px + 'px)';
  }

  // --- 人物を地面の上に置く ---
  // カイトはコマの実寸(48×48)で置く。コマの底辺中央が接地点なので、
  // 上端 = 地面 − コマの高さ、左端 = x − コマ幅の半分 でぴたりと合う。
  const SPW = ADV_CONFIG.SPRITE.FRAME_W, SPH = ADV_CONFIG.SPRITE.FRAME_H;
  placeStoryActor(storyActorEl, storyX, SPW, SPH);
  renderStoryNpc(storyScene.npc, dt, S);

  // --- 出口の目印 ---
  storyExitEl.style.left   = Math.round((storyScene.exit.x - storyCamX) * S) + 'px';
  storyExitEl.style.top    = Math.round((storyGroundY(storyScene.exit.x) - 60) * S) + 'px';
  storyExitEl.style.height = (60 * S) + 'px';
}

// ===================================================================
// 歩き ⇄ 待機 の切り替えと、歩きのコマ送り
//
// 混ぜたり間を作ったりはしない。押した瞬間に歩き、離した瞬間に止まる ―
// 操作にすぐ絵が付いてくるほうが、この手の画面は気持ちがよい。
//
// distance = このコマで実際に進んだ距離(px)。
// これを溜めて、WALK_STEP_PX ぶん溜まるたびに1コマ進める。
// 進んだぶんだけ脚が動くので、速さをどう変えても足は滑らない。
// ===================================================================
function setStoryWalking(walking, distance) {
  const SP = ADV_CONFIG.SPRITE;

  if (walking !== storyWalking) {
    storyWalking = walking;
    storyActorEl.style.backgroundImage = 'url(' + (walking ? SP.WALK : SP.IDLE) + ')';
    storyAnimTime  = 0;
    storyAnimFrame = 0;
  }

  if (walking) {
    storyAnimTime += distance;                     // ここには「距離」が溜まる
    const per = ADV_CONFIG.WALK_STEP_PX;
    while (storyAnimTime >= per) {
      storyAnimTime -= per;
      storyAnimFrame = (storyAnimFrame + 1) % ADV_CONFIG.WALK_FRAME_COUNT;
    }
  } else {
    storyAnimFrame = 0;
  }

  // シートの何コマ目を出すか。拡大率をかけた画素で指定する
  const S = storyScale;
  storyActorEl.style.backgroundSize =
    (SP.FRAME_W * (walking ? ADV_CONFIG.WALK_FRAME_COUNT : 1) * S) + 'px ' +
    (SP.FRAME_H * S) + 'px';
  storyActorEl.style.backgroundPosition = (-storyAnimFrame * SP.FRAME_W * S) + 'px 0px';
}

// ===================================================================
// NPCを描く
//
// ふだんは作業アニメ(2コマループ)、話しかけられている間は立ち姿。
// 作業シートとはコマ幅が違うので、どちらを出すかで寸法も切り替える。
// ===================================================================
function renderStoryNpc(n, dt, S) {
  const talking = !!storyLines;

  if (n.work && !talking) {
    // --- 作業中 ---
    storyWorkTime += dt;
    const per = 1 / ADV_CONFIG.WORK_ANIM_FPS;
    while (storyWorkTime >= per) {
      storyWorkTime -= per;
      storyWorkFrame = (storyWorkFrame + 1) % n.work.frames;
    }
    placeStoryActor(storyNpcEl, n.x, n.work.w, n.work.h, n.liftY);
    storyNpcEl.style.backgroundImage = 'url(' + n.work.src + ')';
    storyNpcEl.style.backgroundSize =
      (n.work.w * n.work.frames * S) + 'px ' + (n.work.h * S) + 'px';
    storyNpcEl.style.backgroundPosition = (-storyWorkFrame * n.work.w * S) + 'px 0px';

  } else if (n.sprite) {
    // --- 会話中(手を止めてこちらを向いている)---
    const W = ADV_CONFIG.SPRITE.FRAME_W, H = ADV_CONFIG.SPRITE.FRAME_H;
    placeStoryActor(storyNpcEl, n.x, W, H, n.liftY);
    storyNpcEl.style.backgroundImage = 'url(' + n.sprite + ')';
    storyNpcEl.style.backgroundSize =
      (W * ADV_CONFIG.WALK_FRAME_COUNT * S) + 'px ' + (H * S) + 'px';
    storyNpcEl.style.backgroundPosition = (-(n.standFrame || 0) * W * S) + 'px 0px';

  } else {
    placeStoryActor(storyNpcEl, n.x, charWidth(n.scale), charHeight(n.scale));
  }
}

// 人物を、その x の地面の高さに立たせる。
// 位置は拡大後の画素へ丸める ― 小数のままだと、ドット絵の上で
// 人物だけが半画素ずれて滲んで見える。
function placeStoryActor(el, x, w, h, liftY) {
  const S = storyScale;
  const gy = storyGroundY(x) - (liftY || 0);   // 足場の上に立つぶんだけ上げる
  el.style.width  = (w * S) + 'px';
  el.style.height = (h * S) + 'px';
  el.style.left   = Math.round((x - storyCamX - w / 2) * S) + 'px';
  el.style.top    = Math.round((gy - h) * S) + 'px';
}

// ===================================================================
// 出口を抜けた:次のシーンへ
// ===================================================================
function leaveStoryScene() {
  storyLines = 'leaving';
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
