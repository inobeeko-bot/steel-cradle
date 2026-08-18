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
  // どのマップの絵を使うかは、シーンごとに scene.map で指定する。
  // ここでは層の順番(奥→手前)だけを決めておく。
  LAYER_ORDER: ['far', 'mid', 'near'],

  // --- 人物と操作(すべて仮想解像度の px)---
  // 歩く速さ(1秒あたり)。
  // コマ送りは距離に連動するので、ここだけ上げると脚の回転も一緒に速くなる。
  // 「足の動きの割に進まない」を直すには、下の WALK_STEP_PX も一緒に上げて
  // 1コマあたりの移動距離を増やす必要がある。
  // 78 なら端から端まで約8秒(55のときは12秒)。
  WALK_SPEED:   78,
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
    IDLE: ADV_ASSETS.chars.kite.idle,
    WALK: ADV_ASSETS.chars.kite.walk,
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
  //
  // 大きくすると「1コマで長く進む」= 歩幅が広くなり、
  // 同じ速さでも脚の回転はゆっくりになる。
  // 10 では脚を細かく動かす割に進まなかったので 13 にしてある
  // (1歩26px。速度78と合わせて毎秒6コマで、10のときの5.5とほぼ同じ回転)。
  WALK_STEP_PX: 13,
  REACH:        34,    // 「調べる」が届く距離
  CAM_EDGE:   0.40,    // 画面のどこにカイトを置くか(0.5=中央)
  CAM_SMOOTH: 0.10,    // カメラの追従の緩さ
  TYPE_SPEED:   45,    // 1秒に何文字出すか

  // --- 開発用 ---
  // true にすると、調べられるものの判定範囲を四角で表示する。
  // 通常は false。遊んでいる最中は F3 で切り替えられる。
  DEBUG_SHOW_HITBOXES: false,

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

  // 脚立の絵。底辺を地面に接地させ、祖父の背面に描く
  LADDER: { src: ADV_ASSETS.props.ladder, w: 30, h: 92 },

  // 脚立の縦方向の描画倍率
  LADDER_SCALE_Y: 1.5,

  // 足を乗せる踏み桟。脚立の画像の上から何pxか。
  // 桟は上から y = 20, 29, 38, 47, 56, 65, 74, 83 に並んでいる。
  // 20 = いちばん上の桟。
  STAND_RUNG_Y: 20,
};

// 足場の高さ(px)。地面からどれだけ持ち上げるか。
//
// 脚立の倍率と、足を乗せる桟の位置から自動で出す。
// 数字を2か所に書くと、片方だけ直したときに祖父が脚立から浮く/沈む ―
// 実際に倍率を変えるたびにその危険があったので、片方から導くようにした。
//   足場 = (脚立の高さ92 − 桟の位置) × 倍率
//        = (92 − 20) × 1.5 = 108
GRANDPA_POS.LIFT_Y =
  Math.round((GRANDPA_POS.LADDER.h - GRANDPA_POS.STAND_RUNG_Y) * GRANDPA_POS.LADDER_SCALE_Y);


const STORY_SCENES = {

  ch1_s1_hill: {
    titleKey: 'adv.title.hill',
    placeKey: 'adv.place.arcadia',
    map: 'hill',          // 背景に使う絵(ADV_ASSETS.maps のどれか)

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
        id: 'examine_house', x: 118, markX: 56, markH: 78, labelKey: 'adv.label.house',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: '鍵なんてかけたことがない。この村で盗みをやる奴は、翌朝には村じゅうの朝飯当番にされる', en: "We've never locked it. Steal anything in this village and by morning you're on breakfast duty for everyone." } },
        ],
      },
      {
        id: 'examine_tree', x: 215, markX: 208, markH: 118, labelKey: 'adv.label.tree',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: '実はまだ固いな。……祭りには間に合わないか', en: "Still hard. …They won't be ready for the festival." } },
        ],
        repeat: [
          { whoKey: 'adv.name.kaito', text: { ja: 'じいちゃんが六十年かけた木だ。俺より年上の先輩ってわけ', en: "Grandpa spent sixty years on this tree. It's my senior, technically." } },
        ],
      },
      {
        id: 'examine_shears', x: 250, markX: 252, markH: 16, labelKey: 'adv.label.shears',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: 'じいちゃんの商売道具。……俺が触ると、なぜか翌日に刃が曇るらしい。濡れ衣だと思う', en: "Grandpa's tools. …He says the blades cloud over the day after I touch them. I maintain my innocence." } },
        ],
      },
    ],

    // --- 舞台にいる人たち。書いた順に奥から手前へ並ぶ ---
    npcs: [{
      // 祖父(メインの会話。3段階で進み、3回目で出口が開く)
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

      // 足場の高さ。脚立の上に立つぶんだけ足元を持ち上げる
      liftY: GRANDPA_POS.LIFT_Y,
      ladder: GRANDPA_POS.LADDER,

      // ふだんの姿:剪定の作業アニメ(2コマ)。コマ幅が48ではなく56なので、
      // シートごとに幅を持たせてある。
      work: { src: ADV_ASSETS.chars.grandpa.work, frames: 2, w: 56, h: 48 },

      // 手を止めているときの姿。専用の立ち絵(1コマ)。
      // 以前は歩行シートの通過コマを借りていたが、本来の素材に差し替えた。
      idle: ADV_ASSETS.chars.grandpa.idle,

      // ふだん向いている先。木のほうを見ながら剪定している。
      // 会話が終わるとこの向きへ戻る。
      faceX: 215,

      // このフラグが立ったら剪定をやめて立ち姿になる。
      // gp_talk_3 で「よし、上がりだ」と言って仕事を切り上げるため。
      doneFlag: 'gp3_done',
      labelKey: 'adv.name.grandpa',

      talks: [
        // gp_talk_1
        { flag: 'gp1_done', lines: [
          { whoKey: 'adv.name.grandpa',   text: { ja: 'おう、カイト。当番はどうした', en: "Kaito. How was the watch?" } },
          { whoKey: 'adv.name.kaito', text: { ja: '旧式艇四機、異常なし。異常があったこともない', en: "Four old boats, nothing to report. There's never been anything to report." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '結構。暇な防衛隊は良い防衛隊だ', en: "Good. A bored defence force is a good defence force." } },
          { whoKey: 'adv.name.kaito', text: { ja: 'じいちゃん、それ毎回言うね', en: "You say that every time." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '毎回本当だからな。……ほれ、ぼさっとしてないで脚立を押さえろ。祭りの前に、こいつの寝癖を直しちまう', en: "Because it's true every time. …Now stop standing there and hold the ladder. I'll get this one's hair straightened before the festival." }, se: 'snip' },
        ]},
        // gp_talk_2
        { flag: 'gp2_done', lines: [
          { whoKey: 'adv.name.kaito', text: { ja: 'なあ。学校の端末でさ、建設者の年表を見たんだ。〈十二使徒〉。……五番目だけ、空欄だった', en: "Hey. I pulled up the founders' timeline on the school terminal. The Twelve Apostles. …The fifth one was blank." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: 'ほう', en: "Hm." } },
          { whoKey: 'adv.name.kaito', text: { ja: '事故死、記録焼失。名前も残ってない。……うちと同じ名字だって、昔言わなかったっけ', en: "Died in an accident, records burned. Not even a name left. …Didn't you once say it was our surname?" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '名前ってのはな、実の入ってない殻みたいなもんだ', en: "A name is a husk with no fruit in it." }, note: { ja: '(剪定の手を止めずに)', en: "(without stopping the shears)" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '――だが、殻がなけりゃ実は守れん', en: "—But without the husk, nothing protects the fruit." } },
          { whoKey: 'adv.name.kaito', text: { ja: '……つまり?', en: "…Meaning?" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: 'つまり、手ぇ離すなよ。話は実が入ってからだ', en: "Meaning don't let go. We'll talk when there's fruit." } },
        ]},
        // gp_talk_3(ここで出口が開く)
        { flag: 'gp3_done', lines: [
          { whoKey: 'adv.name.grandpa',   text: { ja: 'よし、上がりだ。今夜は祭りだぞ、カイト', en: "Right, that's us done. Festival tonight, Kaito." } },
          { whoKey: 'adv.name.kaito', text: { ja: '収穫祭って言っても、林檎はまだ固いのにな', en: "Some harvest festival. The apples are still hard." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '固い実を祝うのさ。育ってる最中ってことだからな。……ドックの格納庫、灯りを落としてこい。それでお前の当番も上がりだ', en: "We celebrate the hard ones. It means they're still growing. …Go put the hangar lights out at the dock. Then your watch is done too." } },
          { whoKey: 'adv.name.kaito', text: { ja: 'はいよ。……じいちゃん、祭りで飲みすぎるなよ', en: "Sure. …Don't drink too much tonight." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '約束はできん', en: "No promises." } },
        ]},
      ],

      // 3回目のあとに話しかけたとき
      repeat: [
        { whoKey: 'adv.name.grandpa', text: { ja: '行け行け。灯りは落とせ、酒は俺が落とす', en: "Go on, go on. You drop the lights, I'll drop the drink." } },
      ],
    }],

    // --- 出口(右端)---
    exit: {
      x: 628,             // near層の右端。ここを越えるとシーン2へ
      unlock: 'gp3_done',
      blocked: [
        { whoKey: 'adv.name.kaito', text: { ja: '……先にじいちゃんの手伝いだな。呼ばれてる気がする', en: "…Better help Grandpa first. I get the feeling I'm being called." } },
      ],
      nextTitleKey: 'adv.scene2',
      nextScene: 'ch1_s2_festival',   // 題を出したあと、続けてこのシーンへ
    },

    // --- 開幕の地の文(自動再生)---
    opening: [
      { text: { ja: 'アルカディアには、本物の林檎の木があった。', en: "Arcadia had a real apple tree." } },
      { text: { ja: '直径六キロの回転体の内壁に土を敷き、鏡で採った陽光を軸から降らせる。', en: "Soil laid on the inner wall of a six-kilometre drum, sunlight caught by mirrors and poured down the axis." } },
      { text: { ja: '――地図には、載っていない村。', en: "—A village that was on no map." } },
    ],
  },


  // ===================================================================
  // 一章 シーン2 ― 収穫祭の夜
  //
  // 小説パート「二 七分間」の冒頭にあたる。
  //   「警報は収穫祭の夜に鳴った」
  // 平和な場面として始まり、祖父との3回目の会話の途中で警報が鳴る。
  // プレイヤーが村を「失うに値するもの」として見終えてから鳴らすのが要点。
  // ===================================================================
  ch1_s2_festival: {
    titleKey: 'adv.title.festival',
    placeKey: 'adv.place.arcadia',
    map: 'hill_night',

    width: ADV_CONFIG.BASE_W,   // 1画面ぶん。横スクロールしない
    start: 60,                  // 左から来る(格納庫の灯りを落とした帰り)

    // --- 接地ライン ---
    // 背景の上に線を重ね、カイトの立ち絵を並べて目で合わせた実測値。
    // (pixel_kobo の ground_overlay で確認。自動抽出はできない ―
    //  near層の輪郭上端は草や土手を含むので、歩行線とは一致しない)
    groundY: [
      [   0, 352 ],
      [  80, 349 ],
      [ 160, 345 ],
      [ 240, 341 ],   // 木の根元。ここがいちばん高い
      [ 320, 343 ],
      [ 400, 345 ],
      [ 480, 348 ],
      [ 560, 351 ],
      [ 640, 353 ],
    ],

    // --- 調べられる物 ---
    props: [
      {
        id: 'examine_stall', x: 110, markX: 75, markH: 72, labelKey: 'adv.label.stall',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: '今年もヨナ婆さんの林檎酒か。去年は三杯で記憶が飛んだ', en: "Old Yona's cider again. Three cups last year and the evening simply stopped." } },
        ],
        repeat: [
          { whoKey: 'adv.name.kaito', text: { ja: '……二杯までにしとこう', en: "…Two cups. Two." } },
        ],
      },
      {
        id: 'examine_pumpkin', x: 200, markX: 215, markH: 26, labelKey: 'adv.label.pumpkin',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: '一個で旧式艇の推進剤タンクより重いな。……比べる意味はないけど', en: "Heavier than a fuel tank off one of our boats. …Not that anyone's comparing." } },
        ],
      },
      {
        id: 'examine_tree_night', x: 285, markX: 262, markH: 112, labelKey: 'adv.label.tree',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: '昼間は固かったのにな。灯りをぶら下げると、実ってるように見える', en: "They were hard this afternoon. Hang enough lanterns and they look ripe." } },
        ],
        repeat: [
          { whoKey: 'adv.name.kaito', text: { ja: 'じいちゃんの木だ。今夜だけは、村のもんってことになってる', en: "Grandpa's tree. For one night a year it belongs to the whole village." } },
        ],
      },
      {
        id: 'examine_dock', x: 490, markX: 502, markH: 46, labelKey: 'adv.label.dock',
        first: [
          { whoKey: 'adv.name.kaito', text: { ja: '格納庫の灯りは落としてきた。これで当番も上がり', en: "Hangar lights are out. That's my watch finished." } },
          { whoKey: 'adv.name.kaito', text: { ja: 'あの奥に祠がある。三重の隔壁の向こう。鍵はじいちゃんの首から下がってるやつ、ひとつきり', en: "The shrine's back there. Three bulkheads deep. One key, and it hangs around Grandpa's neck." } },
        ],
        repeat: [
          { whoKey: 'adv.name.kaito', text: { ja: '何が封じてあるのか、村の誰も知らない。訊いても、じいちゃんは剪定の話を始める', en: "Nobody in the village knows what's sealed in there. Ask Grandpa and he starts talking about pruning." } },
        ],
      },
    ],

    // --- 舞台にいる人たち ---
    //
    // 立ち位置は、調べられる物とぶつからないように離してある。
    // 「調べる」が届く距離は REACH = 34px なので、それより近いと
    // どちらを狙ったのか分からなくなる。
    //   屋台110 / 南瓜200 / 木285 / ドック490 / 出口628
    //   ヨナ155(屋台から45) リスベス243(南瓜から43・木から42)
    //   祖父330(木から45) ベン560(ドックから70・出口から68)
    npcs: [
    {
      // ヨナ婆さん。屋台で林檎酒を注いでいる。
      // 名前は屋台を調べたときの台詞に先に出てくる ―
      // 先に名前だけ聞かせておいて、あとで本人に会わせる。
      id: 'yona', x: 155,
      idle: ADV_ASSETS.chars.yona.idle,
      faceX: 110,                 // 自分の屋台のほうを向いている
      labelKey: 'adv.name.yona',
      talks: [
        { flag: 'yona_1_done', lines: [
          { whoKey: 'adv.name.yona',  text: { ja: 'カイトかい。ほら、一杯持っておいき', en: "That you, Kaito? Here, take a cup." } },
          { whoKey: 'adv.name.kaito', text: { ja: '……去年の記憶が無いんだけど', en: "…I don't remember last year." } },
          { whoKey: 'adv.name.yona',  text: { ja: 'そりゃ結構。覚えてない夜は、良い夜だったってことさ', en: "Good. A night you can't remember was a good night." } },
        ]},
        { flag: 'yona_2_done', lines: [
          { whoKey: 'adv.name.yona',  text: { ja: 'あんたが膝までしかなかった頃から、この樽で注いでる', en: "I've poured from this barrel since you came up to my knee." } },
          { whoKey: 'adv.name.yona',  text: { ja: '樽は樫だよ。あたしより先に壊れやしない', en: "It's oak. It won't go before I do." } },
        ]},
      ],
      repeat: [
        { whoKey: 'adv.name.yona', text: { ja: 'おかわりは自分で注ぎな', en: "Refills you pour yourself." } },
      ],
    },
    {
      // リスベス。麦わら帽子。提灯を吊るし終えたところ。
      id: 'lisbeth', x: 243,
      idle: ADV_ASSETS.chars.lisbeth.idle,
      faceX: 285,                 // 木に吊るした提灯を見上げている
      labelKey: 'adv.name.lisbeth',
      talks: [
        { flag: 'lis_1_done', lines: [
          { whoKey: 'adv.name.lisbeth', text: { ja: '提灯、あたしが吊るしたんだから。ちゃんと見て', en: "I hung those lanterns. You'd better look at them." } },
          { whoKey: 'adv.name.kaito',   text: { ja: '見てる。……ちょっと右が多くないか', en: "I'm looking. …Bit heavy on the right, isn't it." } },
          { whoKey: 'adv.name.lisbeth', text: { ja: '風の向き。落ちてこないほうに寄せたの', en: "That's the wind. I put them where they won't come down." } },
        ]},
        { flag: 'lis_2_done', lines: [
          { whoKey: 'adv.name.lisbeth', text: { ja: '来年はもっと増やす。軸の端からでも見えるくらい', en: "More next year. Enough to see from the far end of the axis." } },
        ]},
      ],
      repeat: [
        { whoKey: 'adv.name.lisbeth', text: { ja: '踊らないなら、せめて突っ立ってないで', en: "If you're not dancing, at least don't just stand there." } },
      ],
    },
    {
      // 祖父。今夜は仕事をしていないので立ち姿のまま(脚立も作業アニメも無い)
      id: 'grandpa', x: 330,
      idle: ADV_ASSETS.chars.grandpa.idle,
      faceX: 285,              // 自分の木のほうを見ている
      doneFlag: 'gp2_3_done',
      labelKey: 'adv.name.grandpa',

      talks: [
        // 1回目
        { flag: 'gp2_1_done', lines: [
          { whoKey: 'adv.name.grandpa',   text: { ja: 'おう、来たか。灯りは落としたな', en: "There you are. Lights out?" } },
          { whoKey: 'adv.name.kaito', text: { ja: '落とした。……格納庫、埃っぽかったよ', en: "Out. …That hangar's filthy, by the way." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '掃除は明日でいい。今日は飲め', en: "Sweep it tomorrow. Tonight you drink." } },
        ]},

        // 2回目 ― 御守りの話。小説「一 林檎の木」の台詞をここに置く
        { flag: 'gp2_2_done', lines: [
          { whoKey: 'adv.name.kaito', text: { ja: 'なあ。その首から下げてるやつ、結局なんなんだ', en: "That thing round your neck. What is it, actually?" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '御守りだ', en: "A charm." } },
          { whoKey: 'adv.name.kaito', text: { ja: 'それは知ってる。何の御守りだよ', en: "I know that. A charm for what?" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '……名前ってのはな、実の入ってない殻みたいなもんだ', en: "…A name is a husk with no fruit in it." } },
          { whoKey: 'adv.name.kaito', text: { ja: 'なんだそれ', en: "What's that supposed to mean?" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: 'だが、殻がなけりゃ実は守れん。それだけ覚えとけ', en: "But without the husk you can't protect the fruit. Just remember that much." } },
        ]},

        // 3回目 ― ここで警報が鳴る
        { flag: 'gp2_3_done', lines: [
          { whoKey: 'adv.name.grandpa',   text: { ja: 'カイト。お前、十九になったな', en: "Kaito. You turned nineteen." } },
          { whoKey: 'adv.name.kaito', text: { ja: '急にどうした', en: "Where did that come from?" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: 'いや。……ちょうど、俺が親父からこれを渡された齢だ', en: "Nothing. …It's the age my father handed me this, that's all." } },
          { text: { ja: '――警報。', en: "—The alarm." } },
          { text: { ja: '提灯の灯りが、いっせいに揺れた。軸の方向で、何かが減速噴射を焚いている。隠す気のない光だった。', en: "Every lantern swung at once. Somewhere along the axis, something was burning a deceleration blast. It was not trying to hide." } },
          { whoKey: 'adv.name.kaito', text: { ja: '……訓練の日程、今日じゃない', en: "…There's no drill scheduled tonight." } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '……', en: "…" } },
          { whoKey: 'adv.name.grandpa',   text: { ja: '走れ。格納庫だ', en: "Run. Get to the hangar." } },
        ]},
      ],

      // 3回目のあとに話しかけたとき
      repeat: [
        { whoKey: 'adv.name.grandpa', text: { ja: '行け。俺は祠を開ける', en: "Go. I'll open the shrine." } },
      ],
    },
    {
      // ベン。カイトと同じ防衛隊で、今夜は非番。
      // ★ この人の台詞が、このシーンの仕掛け。
      //   「何も起きない」と言わせておいて、直後に警報を鳴らす。
      //   シーン1の祖父の「暇な防衛隊は良い防衛隊だ」への返しにもなっている。
      id: 'ben', x: 560,
      idle: ADV_ASSETS.chars.ben.idle,
      faceX: 490,                 // 旧ドックのほうを見ている
      labelKey: 'adv.name.ben',
      talks: [
        { flag: 'ben_1_done', lines: [
          { whoKey: 'adv.name.ben',   text: { ja: 'よう。当番上がったか', en: "Hey. Watch over?" } },
          { whoKey: 'adv.name.kaito', text: { ja: '上がった。お前は最初から非番だろ', en: "Over. You've been off since this morning." } },
          { whoKey: 'adv.name.ben',   text: { ja: '交渉の結果だ', en: "Negotiated." } },
        ]},
        { flag: 'ben_2_done', lines: [
          { whoKey: 'adv.name.ben',   text: { ja: 'なあ。俺たち、入隊してから何回発砲した?', en: "Serious question. How many times have we fired since we enlisted?" } },
          { whoKey: 'adv.name.kaito', text: { ja: '訓練を除けば、ゼロ', en: "Not counting drills? Zero." } },
          { whoKey: 'adv.name.ben',   text: { ja: 'だろ。ここは何も起きない。だから俺はここが好きなんだ', en: "Right. Nothing happens here. That's why I like it." } },
        ]},
      ],
      repeat: [
        { whoKey: 'adv.name.ben', text: { ja: '飲め飲め。明日の点検は俺がやっとく', en: "Drink up. I'll take tomorrow's inspection." } },
      ],
    },
    ],

    // --- 出口(右端)= 旧ドックの格納庫へ ---
    exit: {
      x: 628,
      unlock: 'gp2_3_done',
      blocked: [
        { whoKey: 'adv.name.kaito', text: { ja: '……じいちゃんに一杯付き合ってからだな', en: "…One drink with Grandpa first." } },
      ],
      nextTitleKey: 'adv.scene3',
      // シーン3(戦闘)は未実装。題を出して終わる。
    },

    // --- 開幕の地の文 ---
    opening: [
      { text: { ja: '収穫祭の夜は、軸から吊るした提灯で明るかった。', en: "The night of the harvest festival was bright with lanterns strung from the axis." } },
      { text: { ja: '鏡面帆はとうに畳まれている。内壁の空を満たしているのは、村が自分で灯した火だけだ。', en: "The mirror sails were long since furled. The sky on the inner wall held nothing but the fires the village had lit for itself." } },
      { text: { ja: '――地図にない村の、地図にない祭り。', en: "—A festival that was on no map, in a village that was on no map." } },
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
let storyExitEl   = null;
let storyMarkEl   = null;
let storyPlateLayerEl = null;   // 名前板を置く層(キャラの変換を受けない)
let storyPlates   = null;       // { el, at() } の配列。at() が位置を返す
let storyHitboxEls = null;      // 開発用の判定表示

let storyHintShown = null;

// 歩きアニメの状態
let storyAnimTime  = 0;    // コマを進めるための時計
let storyAnimFrame = 0;    // いま何コマ目か
let storyWalking   = false;

// ===================================================================
// 舞台にいるNPCたち
//
// ★ ひとりぶんの状態を、まとめて1つのオブジェクトに持つ。
//   以前は祖父ひとりしかいなかったので、作業アニメの時計も
//   頭の高さも、モジュールの変数1本で足りていた。
//   村人が並ぶとそれでは足りない ―― 2人目の絵が1人目の時計で動いてしまう。
//
//   { def, el, ladderEl, workTime, workFrame, topY }
//     def      … STORY_SCENES に書いてある定義そのもの
//     el       … 画面上の要素
//     ladderEl … その人が持ち込む小物(祖父の脚立)。無ければ null
//     workTime / workFrame … 作業アニメの時計とコマ番号。人ごとに独立
//     topY     … 名前板を出す高さ。描画のたびに更新する
// ===================================================================
let storyNpcs = null;         // 上の形の配列
let storyTalkingNpc = null;   // いま話しかけている相手(会話が閉じたら null)

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
// 頭上の名前板(全キャラ共通)
//
// キャラの要素の子にすると、左を向いたときの水平反転(scaleX(-1))を
// 一緒に受けて文字が鏡文字になる。
// そこで名前板は別の層に置き、キャラの位置だけを毎コマ写して、
// 文字自体はいつも正立で描く。
//
// at() は「いまその人物がどこにいるか」を返す関数。
// キャラが動いても増えても、この仕組みひとつで足りる。
// ===================================================================
function addNamePlate(text, at) {
  if (!text) return;
  const el = document.createElement('div');
  el.className = 'story-plate';
  el.textContent = text;
  storyPlateLayerEl.appendChild(el);
  storyPlates.push({ el: el, at: at });
}

function updateNamePlates(S) {
  for (const p of storyPlates) {
    const pos = p.at();
    if (!pos) { p.el.style.display = 'none'; continue; }
    p.el.style.display = '';
    p.el.style.left = Math.round((pos.x - storyCamX) * S) + 'px';
    p.el.style.top  = Math.round((pos.topY - 12) * S) + 'px';
  }
}

// ===================================================================
// 開発用:調べられるものの判定範囲を四角で描く
// ===================================================================
function renderStoryHitboxes(S) {
  const on = ADV_CONFIG.DEBUG_SHOW_HITBOXES;
  for (const h of storyHitboxEls) {
    h.el.style.display = on ? '' : 'none';
    if (!on) continue;
    const R = ADV_CONFIG.REACH;
    const gy = storyGroundY(h.x);
    h.el.style.left   = Math.round((h.x - R - storyCamX) * S) + 'px';
    h.el.style.width  = (R * 2 * S) + 'px';
    h.el.style.top    = Math.round((gy - 54) * S) + 'px';
    h.el.style.height = (54 * S) + 'px';
  }
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
    if (screenState === 'story') openStoryLines(scene.opening.map(l => ({ text: l.text })));
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
  const mapArt = ADV_ASSETS.maps[scene.map];
  for (const key of ADV_CONFIG.LAYER_ORDER) {
    const el = document.createElement('img');
    el.className = 'story-layer';
    el.src = mapArt[key];
    el.alt = '';
    el.draggable = false;
    storyWorldEl.appendChild(el);
    storyLayerEls.push({ key: key, el: el });
  }

  // --- NPCたち ---
  // 書いてある順に足す。あとから足した要素が手前に出るので、
  // 奥に立たせたい人を先に書く。
  storyNpcs = [];
  storyTalkingNpc = null;
  for (const n of scene.npcs) {
    // その人が持ち込む小物(祖父の脚立)。本人より先に足して背面へ回す
    let ladderEl = null;
    if (n.ladder) {
      ladderEl = document.createElement('div');
      ladderEl.className = 'story-prop-sprite';
      ladderEl.style.backgroundImage = 'url(' + n.ladder.src + ')';
      storyWorldEl.appendChild(ladderEl);
    }

    const el = document.createElement('div');
    el.className = 'story-actor npc' + ((n.idle || n.work) ? ' sprite' : '');
    if (!n.idle && !n.work) el.style.background = n.color;
    storyWorldEl.appendChild(el);

    // ふだん向いている方角(祖父なら自分の木のほう)
    if (n.faceX !== undefined) faceActorTowards(el, n.x, n.faceX);

    storyNpcs.push({ def: n, el: el, ladderEl: ladderEl,
                     workTime: 0, workFrame: 0, topY: 0 });
  }

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

  // --- 開発用の判定表示 ---
  storyHitboxEls = [];
  for (const p of scene.props) {
    const el = document.createElement('div');
    el.className = 'story-hitbox';
    el.innerHTML = '<span>' + t(p.labelKey) + '</span>';
    el.style.display = 'none';
    storyWorldEl.appendChild(el);
    storyHitboxEls.push({ el: el, x: p.x });
  }
  for (const npc of storyNpcs) {
    const el = document.createElement('div');
    el.className = 'story-hitbox';
    el.innerHTML = '<span>' + t(npc.def.labelKey) + '</span>';
    el.style.display = 'none';
    storyWorldEl.appendChild(el);
    storyHitboxEls.push({ el: el, x: npc.def.x });
  }

  // --- 名前板の層。キャラより手前、かつキャラの変換を受けない場所に置く ---
  storyPlateLayerEl = document.createElement('div');
  storyPlateLayerEl.className = 'story-plate-layer';
  storyWorldEl.appendChild(storyPlateLayerEl);
  storyPlates = [];
  // NPCの名前板。いる高さは描画のたびに変わるので、そのつど取りに行く。
  // ★ npc を for の中で受け取ること。let で束ねた変数をそのまま使わないと、
  //   全員の名前板が最後のひとりの高さを見に行ってしまう。
  for (const npc of storyNpcs) {
    addNamePlate(t(npc.def.labelKey), () => ({ x: npc.def.x, topY: npc.topY }));
  }

  storyHintEl.textContent = t(scene.placeKey) + '　/　' + t(scene.titleKey);
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
  for (const npc of storyNpcs) {
    const n = npc.def;
    const dn = Math.abs(n.x - storyX);
    if (dn < bestD) {
      bestD = dn;
      best = { kind: 'npc', data: n, npc: npc, x: n.x,
               markH: (n.idle || n.work) ? ADV_CONFIG.CHAR_HEIGHT : charHeight(n.scale) };
    }
  }

  return best;
}

// ===================================================================
// 会話を開く / 進める / 閉じる
// ===================================================================
function openStoryLines(lines) {
  if (!lines || !lines.length) return;
  // 話しかけられたNPCだけが、こちらへ向き直る。
  // 隣に立っている村人まで一斉に振り向いたら不気味なので、相手を限る。
  if (storyTalkingNpc) {
    faceActorTowards(storyTalkingNpc.el, storyTalkingNpc.def.x, storyX);
  }
  storyLines = lines;
  storyIndex = 0;
  storyTyped = 0;
  storyBoxEl.classList.add('on');
  renderStoryLine();
}

// その行の話者名。地の文(whoKey なし)なら空
function lineSpeaker(line) { return line.whoKey ? t(line.whoKey) : ''; }
// その行の本文。note があれば前に付ける
function lineText(line) {
  return (line.note ? tv(line.note) + ' ' : '') + tv(line.text);
}

function renderStoryLine() {
  const line = storyLines[storyIndex];
  const who = lineSpeaker(line);
  storyBoxEl.classList.toggle('narration', !who);
  storySpeakerEl.textContent = who;
  storySpeakerEl.style.display = who ? '' : 'none';
  storyTextEl.textContent = '';
  storyTyped = 0;
}

function advanceStory() {
  if (!storyLines) return;
  const full = lineText(storyLines[storyIndex]);

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
  if (storyTalkingNpc) {
    const n = storyTalkingNpc.def;
    if (n.faceX !== undefined) faceActorTowards(storyTalkingNpc.el, n.x, n.faceX);
    storyTalkingNpc = null;
  }
}

// ===================================================================
// 調べる / 話しかける
// ===================================================================
function interactStory() {
  // ★ この変数を t という名前にしてはいけない。
  //   翻訳関数 t() を覆い隠してしまい、下の t('adv.next') が
  //   「オブジェクトを関数として呼ぶ」ことになって例外になる。
  //   実際そうなっていて、チュートリアルの案内2つが一度も出ていなかった。
  const target = nearestStoryTarget();
  if (!target) return;

  if (target.kind === 'prop') {
    const seen = storyTalkCount[target.data.id] || 0;
    storyTalkCount[target.data.id] = seen + 1;
    const lines = (seen > 0 && target.data.repeat) ? target.data.repeat : target.data.first;
    openStoryLines(lines);
    return;
  }

  const npc = target.data;
  storyTalkingNpc = target.npc;          // 誰と話しているか。向き直る処理が使う
  // 村人には順番に進む話が無く、repeat だけのことがある
  const talks = npc.talks || [];
  const step = storyTalkCount[npc.id] || 0;

  if (step < talks.length) {
    const talk = talks[step];
    storyTalkCount[npc.id] = step + 1;
    storyFlags.add(talk.flag);
    openStoryLines(talk.lines);

    if (step === 0) showStoryHint('enter', t('adv.next'));
    if (talk.flag === storyScene.exit.unlock) {
      storyExitEl.classList.add('open');
      showStoryHint('exit', t('adv.goRight'));
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

  if (storyTime > 2.0) showStoryHint('move', t('adv.move'));

  // --- 1文字ずつ出す ---
  if (storyLines && storyLines !== 'leaving') {
    const full = lineText(storyLines[storyIndex]);
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
    showStoryHint('interact', t('adv.interact'));
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
  for (const npc of storyNpcs) renderStoryNpc(npc, dt, S);
  updateNamePlates(S);
  renderStoryHitboxes(S);

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
function renderStoryNpc(npc, dt, S) {
  const n  = npc.def;
  const el = npc.el;

  // 手を止める条件は2つ。
  //   ・話しかけられている間
  //   ・仕事を終えたあと(gp_talk_3 の「よし、上がりだ」以降)
  // 終わったと言った本人が、その後ろで剪定を続けていたら台詞が嘘になる。
  const done = !!(n.doneFlag && storyFlags.has(n.doneFlag));
  const talking = !!storyLines || done;

  // --- 脚立。底辺を地面に接地させ、縦だけ引き伸ばす ---
  if (npc.ladderEl && n.ladder) {
    const lh = Math.round(n.ladder.h * GRANDPA_POS.LADDER_SCALE_Y);
    npc.ladderEl.style.width  = (n.ladder.w * S) + 'px';
    npc.ladderEl.style.height = (lh * S) + 'px';
    npc.ladderEl.style.backgroundSize = (n.ladder.w * S) + 'px ' + (lh * S) + 'px';
    npc.ladderEl.style.left = Math.round((n.x - storyCamX - n.ladder.w / 2) * S) + 'px';
    npc.ladderEl.style.top  = Math.round((storyGroundY(n.x) - lh) * S) + 'px';
  }

  if (n.work && !talking) {
    // --- 作業中 ---
    // ★ 時計は npc ごとに持つ。共通の変数にすると、2人が別々の速さで
    //   作業していても片方の時計でしかコマが進まない。
    npc.workTime += dt;
    const per = 1 / ADV_CONFIG.WORK_ANIM_FPS;
    while (npc.workTime >= per) {
      npc.workTime -= per;
      npc.workFrame = (npc.workFrame + 1) % n.work.frames;
    }
    placeStoryActor(el, n.x, n.work.w, n.work.h, n.liftY);
    npc.topY = storyGroundY(n.x) - (n.liftY || 0) - n.work.h;
    el.style.backgroundImage = 'url(' + n.work.src + ')';
    el.style.backgroundSize =
      (n.work.w * n.work.frames * S) + 'px ' + (n.work.h * S) + 'px';
    el.style.backgroundPosition = (-npc.workFrame * n.work.w * S) + 'px 0px';

  } else if (n.idle) {
    // --- 手を止めている(会話中、または仕事を終えたあと)---
    // 1コマだけの絵なので、コマ送りの計算はいらない。
    const W = ADV_CONFIG.SPRITE.FRAME_W, H = ADV_CONFIG.SPRITE.FRAME_H;
    placeStoryActor(el, n.x, W, H, n.liftY);
    npc.topY = storyGroundY(n.x) - (n.liftY || 0) - H;
    el.style.backgroundImage = 'url(' + n.idle + ')';
    el.style.backgroundSize = (W * S) + 'px ' + (H * S) + 'px';
    el.style.backgroundPosition = '0px 0px';

  } else {
    placeStoryActor(el, n.x, charWidth(n.scale), charHeight(n.scale));
    npc.topY = storyGroundY(n.x) - charHeight(n.scale);
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
  // ★ 次のシーンの情報は、いまのうちに控えておく。
  //   下の setTimeout が動く頃には exitStory() が storyScene を null にしている。
  const titleKey = storyScene.exit.nextTitleKey;
  const nextId   = storyScene.exit.nextScene || null;

  storyLines = 'leaving';
  storyFadeEl.style.transition = 'opacity 2s';
  storyFadeEl.style.opacity = '1';
  storyBoxEl.classList.remove('on');
  storyMarkEl.classList.remove('on');

  setTimeout(() => {
    storyPromptEl.textContent =
      (nextId ? '' : t('adv.toBeContinued')) + t(titleKey);
    storyPromptEl.classList.add('on', 'big');
  }, 1600);

  setTimeout(() => {
    storyPromptEl.classList.remove('on', 'big');
    storyFadeEl.style.transition = '';

    // 次のシーンがあれば、そのまま続ける。
    // 無ければ「To be continued」を出してメニューへ戻る(いままでの動き)。
    if (nextId && STORY_SCENES[nextId]) {
      startStoryScene(nextId);
    } else {
      exitStory();
    }
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

  // F3 … 開発用。判定範囲の表示を切り替える
  if (event.key === 'F3') {
    event.preventDefault();
    ADV_CONFIG.DEBUG_SHOW_HITBOXES = !ADV_CONFIG.DEBUG_SHOW_HITBOXES;
    console.log('当たり判定の表示: ' + (ADV_CONFIG.DEBUG_SHOW_HITBOXES ? 'ON' : 'OFF'));
    return;
  }

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
