// ===================================================================
// STEEL CRADLE ― 素材の置き場所(一元管理)
//
// 画像ファイルへのパスは、すべてこのファイルにだけ書く。
// あちこちのコードに文字列で散らばっていると、
// フォルダを整理したりファイルを差し替えたりするたびに、
// 直し漏れた1か所だけが「読み込めない」で落ちる。
// 探す場所をここ一つに決めておく。
//
// ファイル名に版数(_v3 / _v4 など)は付けない。
// どの版かは Git が覚えているので、採用した素材は常に正式名で置く。
//
// 命名と規格の詳細は assets/adv/ASSETS.md を参照。
// ===================================================================

const ADV_ASSETS = {

  // --- マップの背景 -------------------------------------------------
  // マップ1つにつき1フォルダ。奥から far → mid → near の3層。
  // シーン2の夜Verを足すときは maps/hill_night/ を作って、
  // ここに hill_night: { ... } を並べる。
  maps: {
    hill: {
      far:  'assets/adv/maps/hill/bg_hill_far.png',
      mid:  'assets/adv/maps/hill/bg_hill_mid.png',
      near: 'assets/adv/maps/hill/bg_hill_near.png',
    },
    // 第2章 収穫祭の夜。同じ丘だが時間帯が違うので、色替えではなく別マップ。
    // パレット原器も別(docs/art/bg_hill_night_master.png、48色)。
    hill_night: {
      far:  'assets/adv/maps/hill_night/bg_hill_night_far.png',
      mid:  'assets/adv/maps/hill_night/bg_hill_night_mid.png',
      near: 'assets/adv/maps/hill_night/bg_hill_night_near.png',
    },
  },

  // --- 人物 ---------------------------------------------------------
  // 48×48・底辺中央がピボット・右向きに描く(左向きは実行時に反転)。
  chars: {
    kite: {
      idle: 'assets/adv/chars/kite/kite_idle.png',   // 1コマ
      walk: 'assets/adv/chars/kite/kite_walk.png',   // 4コマ
    },
    grandpa: {
      idle: 'assets/adv/chars/grandpa/grandpa_idle.png',   // 1コマ(立ち姿)
      walk: 'assets/adv/chars/grandpa/grandpa_walk.png',   // 4コマ
      // 剪定の作業アニメ。2コマで、コマ幅だけ56pxと広い(鋏を差し出すぶん)
      work: 'assets/adv/chars/grandpa/grandpa_work.png',
    },
  },

  // --- 小物 ---------------------------------------------------------
  props: {
    ladder: 'assets/adv/props/prop_ladder.png',   // 30×92
  },
};
