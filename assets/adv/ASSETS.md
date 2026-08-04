# ADVパート 素材規約

サイドビューADVパート（`src/story.js`）が読み込む画像の置き場所と決まりごと。

**ここに置くのは、ゲームが実際に読み込むファイルだけ。** 制作途中のプレビューや
合成見本は `docs/art/` へ置く。読まれないファイルが混ざると、
どれが本番用か分からなくなる。

---

## フォルダ構造

```
assets/adv/
├── ASSETS.md                        … このファイル
├── maps/
│   └── hill/                        … マップ1つにつき1フォルダ
│       ├── bg_hill_far.png
│       ├── bg_hill_mid.png
│       └── bg_hill_near.png
├── chars/
│   ├── kite/
│   │   ├── kite_idle.png
│   │   └── kite_walk.png
│   └── grandpa/
│       ├── grandpa_idle.png
│       ├── grandpa_walk.png
│       └── grandpa_work.png
└── props/
    └── prop_ladder.png
```

シーン2の夜Verのように、同じ場所の別バージョンを足すときは
`maps/hill_night/` のようにマップごと新しいフォルダを作る。

---

## 命名規則

**1. 版数のサフィックスは付けない。**
`kite_walk_v4.png` ではなく `kite_walk.png`。
どの版かは Git が覚えているので、ファイル名に刻む必要はない。
差し替えるときは正式名のまま上書きしてコミットする。

**2. フォルダの外でも意味が分かる名前にする。**
`hill/far.png` ではなく `hill/bg_hill_far.png`。
エラーログやデバッガにファイル名だけが出たとき、どこの何か分かるようにする。

**3. 種類が名前の先頭に来る。**
`bg_`（背景）/ `prop_`（小物）。人物はキャラ名が先頭。

---

## パスの参照

**コードにパスを直接書かない。** すべて `src/assets.js` の `ADV_ASSETS` に集約する。

```js
// 良い
storyActorEl.style.backgroundImage = 'url(' + ADV_ASSETS.chars.kite.walk + ')';

// 悪い(フォルダを整理したとき、ここだけ直し漏れる)
storyActorEl.style.backgroundImage = 'url(assets/adv/chars/kite/kite_walk.png)';
```

素材を足したら、まず `src/assets.js` に登録してから使う。

---

## パレット規約

第1章のパレット原器は **`docs/art/bg_hill_master.png`**。
実測で **48色ちょうど**（透明部分を除く、640×360）。

新しい素材は、この48色に寄せて作る。原器に無い色を増やすと、
同じ画面に並べたときにその部分だけ浮いて見える。

夜Verなど時間帯が変わる場合は、原器を色替えして新しい原器を作り、
そのマップの素材はすべて新しい原器に寄せる。

---

## キャラクター規格

| 項目 | 決まり |
|---|---|
| コマの大きさ | **48×48**（例外: `grandpa_work.png` は鋏を差し出すぶん **56×48**） |
| ピボット | **コマの底辺中央**。この点が地面（`groundY`）に乗る |
| 下の余白 | **0**。足の裏をコマの最下段に接するように描く |
| 向き | **右向きで描く**。左向きは実行時に水平反転して作る |
| 歩きのコマ数 | **4コマ**で1周（＝2歩）。`ADV_CONFIG.WALK_FRAME_COUNT` |
| 歩きの中身 | 4コマのうち2コマは**脚が揃った通過コマ**にする。全コマで同じ足が前だと、足を開いたまま横滑りして見える |
| 身長 | 中身の高さは **46px** 前後（`ADV_CONFIG.CHAR_HEIGHT`） |

コマ送りは時間ではなく**進んだ距離**で進める（`ADV_CONFIG.WALK_STEP_PX`）。
速度をどう変えても足が滑らないようにするため。

### 拡大について

画面表示は **整数倍のみ**（`floor(画面高 ÷ 360)`）。あまりは黒帯。
補間は禁止（CSS の `image-rendering: pixelated`）。
半端な倍率で拡大するとドットの大きさが揃わず、絵が汚れる。
