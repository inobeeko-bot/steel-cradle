// ===================================================================
// STEEL CRADLE ― 言語(日本語 / English)
//
// 画面に出る文字は、すべてこのファイルの表に集める。
// コードの中に文字を直接書くと、英語版を足すときに
// 「どこに何が書いてあるか」を探し回ることになる。
//
// 表の書き方:
//   キー: ['日本語', 'English']
// 呼び出し方:
//   t('menu.training')        … いまの言語の文字を返す
//
// ※ コード内のコメントは日本語のままでよい。読むのは開発者だけなので。
// ===================================================================

// -------------------------------------------------------------------
// エラーの受け皿。lang.js はいちばん最初に読まれるので、ここに置く。
//
// どこかで拾い損ねたエラーを、必ず画面に出すためのもの。
// 黙って壊れると「たまに動かない」としか分からず、原因に辿り着けない。
// reportRuntimeError は main.js で定義されるので、それより前に起きた分は
// いったん貯めておき、あとでまとめて出す。
// -------------------------------------------------------------------
window.__earlyErrors = [];
window.addEventListener('error', (ev) => {
  // 画像やスクリプトの読み込み失敗も、ここに来る(ev.target がその要素)
  const src = ev.target && ev.target.src;
  const msg = src ? '読み込み失敗: ' + src
                  : (ev.message || String(ev.error));
  if (typeof reportRuntimeError === 'function') {
    reportRuntimeError('未処理', { message: msg });
  } else {
    window.__earlyErrors.push(msg);
  }
}, true);   // true = 子要素で起きた読み込み失敗も拾う

// 保存キー。次に開いたときも同じ言語で始まるようにする
const LANG_STORE_KEY = 'steel-cradle-lang';

// いまの言語。'ja' か 'en'
let currentLang = 'ja';

// ===================================================================
// 文字の表
// ===================================================================
const TEXT = {

  // --- メインメニュー ---------------------------------------------
  'menu.subtitle':      ['―鋼の揺り籠―', '— The Iron Cradle —'],
  'menu.hint':          ['<span>W / S</span> または <span>↑ ↓</span> で選択　<span>Enter</span> で決定　<span>Esc</span> で戻る',
                         '<span>W / S</span> or <span>↑ ↓</span> to select　<span>Enter</span> to confirm　<span>Esc</span> to go back'],

  'menu.training':      ['訓練飛行', 'Training Flight'],
  'menu.training.tag':  ['READY', 'READY'],
  'menu.training.desc': ['<b>10分 / 10撃墜</b>　演習空域での単機戦闘訓練。<br>電力配分・熱・推進剤の三つを同時に回す感覚をつかむための課程。撃墜数が規定に届けば任務達成、時間切れか機体喪失で失敗。',
                         '<b>10 minutes / 10 kills</b>　Solo combat drill in a practice range.<br>A course for learning to juggle power, heat and propellant at once. Reach the kill quota to succeed; run out of time or lose the ship and you fail.'],

  'menu.gallery':       ['機体資料', 'Craft Files'],
  'menu.gallery.desc':  ['<b>機体プロファイル</b>　登場する機体を回して眺めながら、諸元を確認できる。<br>数値は実際の戦闘で使われている設定値をそのまま読み出しているので、調整が入ればこの資料も一緒に変わる。',
                         '<b>Craft profiles</b>　Turn each craft on a stand and read its specifications.<br>The numbers are read straight from the values the game actually fights with, so tuning the game re-writes this file too.'],

  'menu.story':         ['ストーリー', 'Story'],
  'menu.story.desc':    ['<b>三部作キャンペーン</b>　章立て形式。各章がひとつのコロニー攻略戦か防衛戦。<br>終盤は同盟の選択でエンディングが分岐し、第二部末の結婚を経て第三部は子世代が主役になる。',
                         '<b>A trilogy campaign</b>　Told in chapters, each one an assault on or defence of a colony.<br>Late on, your choice of alliance splits the ending; a marriage closes Part II and the next generation leads Part III.'],

  'menu.multi':         ['マルチ対戦', 'Multiplayer'],
  'menu.multi.desc':    ['<b>4チーム×4人 + 海賊ボット / 1試合10分</b>　揺り籠戦争20年間のどこかの戦い。<br>資源が全チーム分ない設計のため、同盟と裏切りがルール抜きで自然に起きる。',
                         '<b>4 teams of 4 plus pirate bots / 10 minutes a match</b>　Somewhere in the twenty years of the Cradle War.<br>There is never enough resource for every team, so alliances and betrayals happen without any rule telling them to.'],

  'pause.resume':       ['戦闘に戻る', 'Resume'],
  'pause.resume.desc':  ['一時停止を解除して、そのまま戦闘を続ける。', 'Lift the pause and carry on fighting.'],
  'pause.abort':        ['任務中断', 'Abort'],
  'pause.abort.desc':   ['この出撃を打ち切ってメインメニューへ戻る。<b>戦果は記録されない。</b>',
                         'End this sortie and return to the main menu. <b>Nothing is recorded.</b>'],

  'menu.soon':          ['準備中', 'Coming soon'],
  'menu.back':          ['戻る', 'Back'],

  // --- ストーリーの章立て -----------------------------------------
  'wing.n1':            ['一番機', 'No.1'],
  'wing.n2':            ['二番機', 'No.2'],
  'wing.n3':            ['三番機', 'No.3'],
  'brief.title':        ['アルカディア脱出戦', 'The Arcadia Evacuation'],
  'brief.goal':         ['貨物船を港から出す', 'Get the freighter out of port'],
  'brief.goal2':        ['積載 三百十一名', '311 aboard'],
  'brief.enemy':        ['敵:企業連合 接収部隊', 'Hostiles: corporate seizure force'],
  'brief.friend':       ['僚機:旧式艇 三機', 'Wingmen: three old boats'],
  'brief.you':          ['本機:四番機 実弾なし', 'You: No.4, no live rounds'],
  'brief.call':         ['H:僚機 呼集 ― 三回まで', 'H: call the wingmen in — three times'],
  'power.locked':       ['配分 固定 ― 四系統 均等', 'Distribution locked'],
  'esc.hit':            ['貨物船 被弾 ― 損傷 半数', 'Freighter hit — half structure gone'],
  'esc.lost':           ['貨物船 轟沈 ― 三百十一名', 'Freighter lost — 311 aboard'],
  'esc.marker':         ['貨物船', 'FREIGHTER'],
  'esc.count':          ['射出まで %s 秒', '%s seconds to launch'],
  'esc.spool':          ['貨物船 主機 点火', 'Freighter main drive lit'],
  'esc.launch':         ['貨物船 射出 ― 追え', 'Freighter away — follow it'],
  'esc.down':           ['被撃墜', 'down'],
  'wing.call.on':       ['僚機 呼集', 'Wingmen called in'],
  'wing.call.rest':     ['残り %s 回', '%s left'],
  'wing.call.none':     ['応答なし ― 誰も残っていない', 'No answer — nobody left'],
  'wing.call.empty':    ['呼集 回数切れ', 'No calls left'],
  'wing.call.label':    ['呼集', 'CALL'],
  'esc.auto':           ['自動追尾 ― 操縦は機体が引き受ける。撃て',
                         'Auto-follow engaged — the boat flies itself. Just shoot'],
  'esc.win.title':      ['311 ABOARD', '311 ABOARD'],
  'esc.win.reason':     ['貨物船 離港 ― アルカディア 陥落', 'The freighter cleared port — Arcadia has fallen'],
  'story.chapter.select': ['章とシーンを選ぶ', 'Select chapter and scene'],
  'story.ch1':          ['一章 ― アルカディアの夜', 'Ch. 1 — The Night of Arcadia'],
  'story.ch1.desc':     ['収穫祭の夜、企業連合軍がアルカディアへ降りる。<br>シーンを選んで、そこから始められる。<b>一度見た場面を飛ばして確かめたいとき用。</b>'],
  'story.s1':           ['1 ― 林檎の丘', '1 — The Apple Hill'],
  'story.s1.desc':      ['夕暮れの果樹園。祖父の剪定。<br>まだ何も起きていない、最後の日常。'],
  'story.s2':           ['2 ― 収穫祭の夜', '2 — The Harvest Festival'],
  'story.s2.desc':      ['提灯の下の祭り。村人たちとの会話。<br>――そして<b>警報</b>。'],
  'story.s3':           ['3 ― 旧式艇四機', '3 — Four Old Boats'],
  'story.s3.desc':      ['旧ドックの格納庫。ベンとの会話、無線の通告。<br>祠の隔壁が<b>開いている</b>。'],
  'story.s4':           ['4 ― 発艦', '4 — Launch'],
  'story.s4.desc':      ['発艦筒。誰もいない。声だけが無線から来る。<br>出口はそのまま<b>3D戦闘</b>へ繋がる。'],
  'story.sortie':       ['戦闘だけ試す', 'Combat only'],
  'story.sortie.desc':  ['ADVを飛ばして、<b>旧式艇 四番機</b>での出撃だけを試す。<br>実弾なし(ビーム砲のみ)・右の推力偏向が渋い。調整の確認用。'],
  'story.part1':        ['黄昏のアルカディア', 'Arcadia at Dusk'],
  'story.part1.desc':   ['企業連合軍によるアルカディア陥落。カイトは生存者と脱出艇で逃げ延び、傭兵チームとして各地を転戦する。<br>自分たちも「誰かの故郷」を落としていると気づく転換点を経て、セラと共闘し<b>託宣改竄の痕跡</b>を発見して幕。',
                         'The Corporate Union takes Arcadia. Kaito escapes with the survivors and drifts into mercenary work.<br>He comes to see that the homes he burns were someone\'s Arcadia too, and the part closes when he and Sera find <b>traces of a doctored oracle</b>.'],
  'story.part2':        ['バベルの墓標', 'The Grave of Babel'],
  'story.part2.desc':   ['各コロニーの紋章を集める旅。真実を突きつけたカイトのもとに史上初の全勢力同盟が成立する。<br>しかし20年の憎悪は消えず、内部から裏切りが発生。<b>紋章は強奪され、同盟は崩壊</b>する。',
                         'A pilgrimage to gather the colonies\' emblems. The truth Kaito carries builds the first alliance of every faction.<br>Twenty years of hatred does not dissolve, though. Betrayal comes from inside: <b>the emblems are taken and the alliance falls apart</b>.'],
  'story.part3':        ['プロメテウスの火', 'The Fire of Prometheus'],
  'story.part3.desc':   ['親世代の子らが聖印と神器コアを継承し、散らばった紋章を奪還する巡礼へ。<br>オリュンポス攻略戦、そして<b>レヴィアタン覚醒</b>。人類が神の託宣に運命を委ねる時代を終わらせ、揺り籠を出る。',
                         'Their children inherit the sigils and the regalia cores, and set out to take the scattered emblems back.<br>The assault on Olympus, and then <b>Leviathan wakes</b>. Humanity ends the age of letting an oracle decide its fate, and leaves the cradle.'],
  'story.chapter1':     ['一章', 'Ch. 1'],

  // --- マルチ対戦の2モード ----------------------------------------
  'multi.a':            ['託宣戦(トクセン)', 'Oracle War'],
  'multi.a.desc':       ['<b>政治と経済のゲーム</b>　資源ポイントを奪い合う椅子取り戦。<br>0〜4分「拡張」で採取、4〜8分「均衡」で神器コアが中央に投下され同盟が形成される。残り2分の<b>託宣フェーズ</b>で「存続可能なのは○チーム」が宣告され、同盟は強制的に崩壊する。',
                         '<b>A game of politics and economics</b>　Musical chairs over resource points.<br>Minutes 0-4 are expansion; 4-8 are balance, when a regalia core drops in the centre and alliances form. In the last two minutes the <b>oracle phase</b> announces how many teams may survive, and every alliance breaks by force.'],
  'multi.b':            ['旗艦戦(キカンセン)', 'Flagship War'],
  'multi.b.desc':       ['<b>兵站と火力のゲーム</b>　各チームに旗艦1隻。敵旗艦の動力コア破壊で勝利。<br>旗艦は移動する拠点(リスポーン・補給・シールド傘)で、喪失は「兵站の死」を意味する。10分で未決着なら全旗艦のシールドが停止し、裸のコア同士で必ず決着する。',
                         '<b>A game of logistics and firepower</b>　One flagship per team; destroy the enemy\'s power core to win.<br>A flagship is a moving base - respawn, resupply, a shield umbrella - and losing it is the death of your logistics. If ten minutes pass undecided, every flagship\'s shields cut out and the bare cores settle it.'],

  // --- ギャラリー ---------------------------------------------------
  'gal.hint':           ['<span>W / S</span> または <span>↑ ↓</span> で機体切替　<span>Esc</span> で戻る',
                         '<span>W / S</span> or <span>↑ ↓</span> to change craft　<span>Esc</span> to go back'],
  'gal.player':         ['単座 汎用戦闘機 ― プレイヤー機', 'Single-seat multirole fighter — player craft'],
  'gal.enemyOf':        ['企業連合軍 ― ', 'Corporate Union — '],

  'gal.sec.structure':  ['STRUCTURE / 構造', 'STRUCTURE'],
  'gal.sec.power':      ['POWER / 電力', 'POWER'],
  'gal.sec.thermal':    ['THERMAL / 熱', 'THERMAL'],
  'gal.sec.propulsion': ['PROPULSION / 推進', 'PROPULSION'],
  'gal.sec.armament':   ['ARMAMENT / 主兵装', 'ARMAMENT'],
  'gal.sec.ordnance':   ['ORDNANCE / 投下兵装', 'ORDNANCE'],
  'gal.sec.counter':    ['COUNTERMEASURES / 対抗装備', 'COUNTERMEASURES'],
  'gal.sec.profile':    ['PROFILE / 概要', 'PROFILE'],
  'gal.sec.sensor':     ['SENSOR / 索敵', 'SENSOR'],
  'gal.sec.behaviour':  ['BEHAVIOUR / 機動', 'BEHAVIOUR'],

  'gal.designation':    ['制式名', 'Designation'],
  'gal.unassigned':     ['未設定', 'Unassigned'],
  'gal.noSpec':         ['(仕様書に記載なし)', '(not given in the design document)'],
  'gal.hullStages':     [' 段階', ' stages'],
  'gal.noRepair':       ['(戦闘中の修復は不可)', '(no repair during combat)'],
  'gal.shield':         ['シールド', 'Shield'],
  'gal.shieldRegen':    ['(配分1%につき毎秒 ', '(regenerates '],
  'gal.shieldRegen2':   [' 回復)', ' per second for every 1% allocated)'],
  'gal.powerSplit':     ['出力配分', 'Power split'],
  'gal.fourSystems':    ['4系統 合計 100%', '4 systems, 100% total'],
  'gal.fourNames':      ['(武器 / シールド / エンジン / センサー)', '(weapon / shield / engine / sensor)'],
  'gal.presets':        ['プリセット', 'Presets'],
  'gal.presetNames':    ['攻撃 / 防御 / 巡航', 'Attack / Defence / Cruise'],
  'gal.heatCap':        ['熱容量', 'Heat capacity'],
  'gal.warnAt':         ['(警戒 ', '(warning at '],
  'gal.radOpen':        ['ラジエーター展開', 'Radiator open'],
  'gal.radOpenNote':    ['(ただし敵センサーへの露出が増える)', '(but you show up further away)'],
  'gal.radClosed':      ['ラジエーター収納', 'Radiator stowed'],
  'gal.shutdown':       ['強制冷却', 'Forced cooldown'],
  'gal.shutdownAt':     ['熱 ', 'at heat '],
  'gal.shutdownFor':    [' で ', ' for '],
  'gal.secUnit':        ['秒 停止', 's shutdown'],
  'gal.helpless':       ['(この間は操作不能=無防備。−', '(no control, no defence. Cools at −'],
  'gal.perSecCool':     [' /秒で冷える)', ' per second)'],
  'gal.propellant':     ['推進剤', 'Propellant'],
  'gal.noResupply':     ['(戦闘中の補給なし)', '(no resupply during combat)'],
  'gal.burst':          ['回避バースト', 'Evasion burst'],
  'gal.perUse':         [' /回', ' per use'],
  'gal.heatPlus':       ['熱 +', 'heat +'],
  'gal.approxTimes':    [' ・ 約', ' · about '],
  'gal.times':          ['回)', ' uses)'],
  'gal.drift':          ['ドリフト', 'Drift'],
  'gal.driftDesc':      ['機首と進行方向を分離', 'Decouple nose from heading'],
  'gal.driftKey':       ['(Shift長押し)', '(hold Shift)'],
  'gal.rounds':         [' 発', ' rounds'],
  'gal.needPower':      [' ・ 要 武器電力 ', ' · needs weapon power '],
  'gal.flare':          ['フレア', 'Flares'],
  'gal.flareBurn':      ['(投下から ', '(burns for '],
  'gal.flareBurn2':     ['秒 燃焼)', 's after release)'],
  'gal.playerNote':     ['<b>熱は居場所である。</b>　排熱すると冷えるが、その熱は敵のセンサーとミサイルのシーカーにそのまま見えている。ラジエーターを開けば冷却は ',
                         '<b>Heat is a position.</b>　Venting cools you, and that heat is exactly what enemy sensors and missile seekers read. Opening the radiator makes cooling '],
  'gal.playerNote2':    ['倍になるが、被発見距離も伸び、フレアで騙せる確率も落ちる。冷やすか、隠れるか ― 同時には選べない。',
                         '× faster, but it also extends how far away you are seen and makes flares less likely to fool a missile. Cool down or stay hidden — never both.'],

  'gal.spawnRate':      ['出現比率', 'Spawn share'],
  'gal.spawnNote':      ['(撃墜されるたびに抽選)', '(drawn again on every respawn)'],
  'gal.colour':         ['識別色', 'Marking'],
  'gal.colourNote':     ['(遠くからでもタイプが分かる)', '(readable at a distance)'],
  'gal.fireInterval':   ['射撃間隔', 'Fire interval'],
  'gal.telegraph':      ['発射予告', 'Telegraph'],
  'gal.telegraphNote':  ['(光ってから避ける余地)', '(the glow is your warning)'],
  'gal.boltSpeed':      ['弾速', 'Bolt speed'],
  'gal.damage':         ['1発の威力', 'Damage per hit'],
  'gal.damageNote':     ['(自機のシールドを削る量の倍率)', '(multiplier on the shield damage you take)'],
  'gal.spread':         ['弾道の散り', 'Spread'],
  'gal.spreadNote':     ['(小さいほど正確)', '(smaller is more accurate)'],
  'gal.lead':           ['偏差の深さ', 'Lead depth'],
  'gal.leadNote':       ['(大きいほど置き撃ちしてくる)', '(higher means it aims where you will be)'],
  'gal.missile':        ['ミサイル', 'Missiles'],
  'gal.range':          ['射程 ', 'range '],
  'gal.interval':       [' ・ 間隔 ', ' · every '],
  'gal.bluff':          ['% はブラフ)', '% are bluffs)'],
  'gal.heatPerShot':    ['1射の発熱', 'Heat per shot'],
  'gal.vent':           ['排熱', 'Venting'],
  'gal.net':            ['(差引 ', '(net '],
  'gal.perShot':        [' /射)', ' per shot)'],
  'gal.forcedFor':      [' 秒', ' s'],
  'gal.defenceless':    ['(この間は無防備)', '(defenceless while it lasts)'],
  'gal.speeds':         ['接近 / 交戦 / 回避', 'Approach / Engage / Evade'],
  'gal.turnRate':       ['旋回性能', 'Turn rate'],
  'gal.engageRange':    ['交戦距離', 'Engagement range'],
  'gal.closerThan':     ['(', '(backs off inside '],
  'gal.backsOff':       [' より近いと下がる)', ')'],
  'gal.wander':         ['蛇行', 'Weave'],
  'gal.amp':            ['振幅 ', 'amplitude '],
  'gal.rate':           [' / 周期 ', ' / rate '],
  'gal.wanderNote':     ['(軌道を読ませないための揺らぎ)', '(so its track cannot be read)'],
  'gal.diveRun':        ['一撃離脱', 'Slashing attack'],
  'gal.diveBite':       ['秒 噛みつき → ', 's pressing → '],
  'gal.diveBreak':      ['秒 離脱', 's extending'],
  'gal.diveRear':       ['(自機の後方 ', '(aims '],
  'gal.diveRear2':      [' を狙う)', ' behind you)'],
  'gal.hull':           ['HULL', 'Hull'],
  'gal.respawn':        ['再出撃', 'Respawn'],
  'gal.respawnNote':    ['(演習空域のため無制限)', '(unlimited in a practice range)'],

  'arch.soldier':       ['ソルジャー', 'Soldier'],
  'arch.hound':         ['ハウンド', 'Hound'],
  'arch.sniper':        ['スナイパー', 'Sniper'],

  'arch.soldier.note':  ['<b>撃ちすぎて、自分で止まる。</b>　この機体は熱の扱いが下手で、撃ち続けると自分の熱で強制冷却に入り、数秒のあいだ無防備になる。青白く沈黙した瞬間が、こちらの取り分。3タイプで唯一まともなミサイルを積んでいるのもこの機体で、ロックされたときにフレアを切るかどうかの読み合いは主にここで起きる。',
                         '<b>It shoots itself to a standstill.</b>　This one handles heat badly: keep it firing and its own heat forces a cooldown, leaving it defenceless for a few seconds. That silence is your opening. It is also the only one of the three carrying missiles worth the name, so the question of whether to spend a flare on a lock is mostly asked here.'],
  'arch.hound.note':    ['<b>後ろを取りに来る。</b>　正面から来ず、脇から回り込んで自機の後方に貼りつく。一定時間で必ず抜けるが、すぐ戻ってくる。前を向いたままでは捉えられないので、後方ミラーと回避バーストで推進剤を削られる。撃ち合いではなく、位置の勝負を挑んでくる相手。',
                         '<b>It goes for your back.</b>　Never a frontal approach: it arcs in from the side and sits behind you. It always breaks off eventually, and always comes straight back. You cannot hold it in view facing forward, so it drains your propellant through the rear mirror and the evasion burst. This one fights you for position, not for hits.'],
  'arch.sniper.note':   ['<b>こちらの熱を見て撃つ。</b>　遠距離を保ち、詰めると下がりながら横へ逃げる。命中弾は重いが、撃つ前に青白い充填光が長く光る ― 見てから避けられる。熱を下げれば探知距離の外に出られ、この機体は撃つことすらできない。',
                         '<b>It shoots at your heat.</b>　It holds its distance, and slides away sideways when you close. Its hits are heavy, but a long blue-white charge glow gives you time to move. Cool down enough and you drop outside its detection range, where it cannot shoot at all.'],

  // --- 操作説明(Tabで開く表)---------------------------------------
  'help.grid': [
    '<b>操縦</b><div><span class="help-key">S</span> 機首上げ &nbsp; <span class="help-key">W</span> 機首下げ &nbsp; <span class="help-key">A / D</span> 左右へヨー &nbsp; <span class="help-key">Q / E</span> スナップロール &nbsp; <span class="help-key">Shift</span> ドリフト<span class="help-note">(長押し・機首と進行方向を切り離す)</span></div><b>射撃</b><div><span class="help-key">F</span> または <span class="help-key">P</span> 発射<span class="help-note">(右手用。機関砲は押しっぱなしで連射)</span> &nbsp; <span class="help-key">R</span> 主兵装切替<span class="help-note">(ビーム / 機関砲 / ミサイル)</span></div><b>投下</b><div><span class="help-key">B</span> 投下 &nbsp; <span class="help-key">N</span> BOMBS切替<span class="help-note">(パイロ / ボム / EMP)</span> &nbsp; <span class="help-key">C</span> フレア<span class="help-note">(ミサイルの熱を騙す。熱いほど効きにくい)</span></div><b>機動</b><div><span class="help-key">Space</span> 回避バースト<span class="help-note">(推進剤を焚いて真横へ跳ぶ)</span> &nbsp; <span class="help-key">Z</span> AUTO TRACK 入切<span class="help-note">(照準の自動追尾)</span></div><b>僚機</b><div><span class="help-key">H</span> 呼び寄せ<span class="help-note">(1回の出撃で3回まで。生きている僚機が自機のところへ来て、自機に近い敵を三機で狙う)</span></div><b>電力配分</b><div><span class="help-key">↑</span>武器 <span class="help-key">←</span>シールド <span class="help-key">→</span>エンジン <span class="help-key">↓</span>センサー<span class="help-note">(押すたび +10%。他から均等に奪う)</span> &nbsp; <span class="help-key">1</span> 攻撃 <span class="help-key">2</span> 防御 <span class="help-key">3</span> 巡航<span class="help-note">(プリセット)</span></div><b>熱管理</b><div><span class="help-key">V</span> ラジエーター<span class="help-note">(展開 → 収納 → AUTO の順に切替。展開すると冷えるが敵に見つかりやすい)</span></div><b>その他</b><div><span class="help-key">X</span> 視点切替<span class="help-note">(三人称 ⇄ コックピット)</span> &nbsp; <span class="help-key">Tab</span> この説明 &nbsp; <span class="help-key">Enter</span> 再出撃<span class="help-note">(ミッション終了後)</span> &nbsp; <span class="help-key">Esc</span> 一時停止<span class="help-note">(戦闘に戻る / 任務中断)</span></div>',
    '<b>FLIGHT</b><div><span class="help-key">S</span> nose up &nbsp; <span class="help-key">W</span> nose down &nbsp; <span class="help-key">A / D</span> yaw &nbsp; <span class="help-key">Q / E</span> snap roll &nbsp; <span class="help-key">Shift</span> drift<span class="help-note">(hold; uncouples the nose from your heading)</span></div><b>GUNS</b><div><span class="help-key">F</span> or <span class="help-key">P</span> fire<span class="help-note">(P is for the right hand. The cannon holds down to repeat)</span> &nbsp; <span class="help-key">R</span> change weapon<span class="help-note">(beam / cannon / missile)</span></div><b>ORDNANCE</b><div><span class="help-key">B</span> drop &nbsp; <span class="help-key">N</span> change bomb<span class="help-note">(pyro / bomb / EMP)</span> &nbsp; <span class="help-key">C</span> flare<span class="help-note">(fools the heat seeker on a missile; less effective the hotter you are)</span></div><b>MANOEUVRE</b><div><span class="help-key">Space</span> evasion burst<span class="help-note">(burns propellant to jump sideways)</span> &nbsp; <span class="help-key">Z</span> AUTO TRACK on/off<span class="help-note">(aim assist)</span></div><b>WINGMEN</b><div><span class="help-key">H</span> call them in<span class="help-note">(three times a sortie. Surviving wingmen close on you and all take the enemy nearest you)</span></div><b>POWER</b><div><span class="help-key">↑</span>weapon <span class="help-key">←</span>shield <span class="help-key">→</span>engine <span class="help-key">↓</span>sensor<span class="help-note">(+10% each press, taken evenly from the others)</span> &nbsp; <span class="help-key">1</span> attack <span class="help-key">2</span> defence <span class="help-key">3</span> cruise<span class="help-note">(presets)</span></div><b>HEAT</b><div><span class="help-key">V</span> radiator<span class="help-note">(open → stowed → AUTO. Open cools you but makes you easier to find)</span></div><b>OTHER</b><div><span class="help-key">X</span> view<span class="help-note">(third person ⇄ cockpit)</span> &nbsp; <span class="help-key">Tab</span> this panel &nbsp; <span class="help-key">Enter</span> sortie again<span class="help-note">(after the mission ends)</span> &nbsp; <span class="help-key">Esc</span> pause<span class="help-note">(resume / abort)</span></div>'],

  // --- HUD(計器)---------------------------------------------------
  'hud.helpToggle':     ['Tab で開閉', 'Tab to open'],
  'hud.shutdownMsg':    ['強制冷却中 ― 操作不能', 'Forced cooldown — no control'],
  'hud.weapon':         ['武器', 'WEAPON'],
  'hud.shield':         ['シールド', 'SHIELD'],
  'hud.hull':           ['装甲', 'HULL'],
  'hud.engine':         ['エンジン', 'ENGINE'],
  'hud.sensor':         ['センサー', 'SENSOR'],
  'hud.heat':           ['熱', 'HEAT'],
  'hud.propellant':     ['推進剤', 'PROP'],
  'hud.timeLeft':       ['残り時間', 'TIME'],
  'hud.kills':          ['撃墜', 'KILLS'],
  'hud.hits':           ['被弾', 'HITS'],
  'hud.help':           ['操作説明', 'CONTROLS'],
  'hud.beam':           ['ビーム砲', 'Beam cannon'],
  'hud.switch':         ['切替', 'switch'],
  'hud.shutdown':       ['強制冷却中 ― 操作不能', 'FORCED COOLDOWN — NO CONTROL'],
  'hud.hullFail':       ['機体構造 崩壊', 'HULL FAILURE'],
  'hud.resultHint':     ['Enter 再出撃　/　Esc メニューへ戻る', 'Enter to sortie again　/　Esc for the menu'],

  // --- ストーリー(ADVパート)---------------------------------------
  'adv.place.arcadia':  ['アルカディア / 農業区', 'Arcadia / Agricultural district'],
  'adv.title.hill':     ['第一部 一章 ― 林檎の丘', 'Part I, Ch. 1 — The Apple Hill'],
  'adv.move':           ['← →  /  A D:移動', '← →  /  A D  to walk'],
  'adv.interact':       ['E / Enter:調べる・話す', 'E / Enter  to examine or talk'],
  'adv.next':           ['Enter:次へ', 'Enter  for the next line'],
  'adv.goRight':        ['右へ:ドックへ向かう', 'Head right — to the dock'],
  'adv.hint':           ['<span>W / S</span> または <span>↑ ↓</span> で機体切替　<span>Esc</span> で戻る',
                         '<span>W / S</span> or <span>↑ ↓</span>　<span>Esc</span> to go back'],
  'adv.toBeContinued':  ['To be continued ―― ', 'To be continued —— '],
  'adv.scene2':         ['シーン2 ― 収穫祭の夜', 'Scene 2 — The night of the harvest festival'],
  // シーン1でカイトが言う「旧式艇四機、異常なし」を、そのまま題にしてある。
  'adv.scene3':         ['シーン3 ― 旧式艇四機', 'Scene 3 — Four old boats'],

  'adv.title.festival': ['第一部 一章 ― 収穫祭の夜', 'Part I, Ch. 1 — The Night of the Harvest Festival'],
  'adv.title.hangar':   ['第一部 一章 ― 旧式艇四機', 'Part I, Ch. 1 — Four Old Boats'],
  // シーン3の次。3D戦闘はフェーズ3なので、いまは題を出して終わる。
  'adv.scene4':         ['シーン4 ― 発艦', 'Scene 4 — Launch'],
  'adv.title.launch':   ['第一部 一章 ― 発艦', 'Part I, Ch. 1 — Launch'],
  'adv.place.launchbay':['旧ドック 発艦筒', 'Old Dock — Launch Bay'],
  'adv.label.suit':     ['与圧服の掛け', 'suit rack'],
  'adv.label.shrine':   ['祠の方角', 'toward the shrine'],
  'adv.label.nose':     ['四番機の機首', "No.4's nose"],
  'adv.label.log':      ['点検表', 'inspection log'],
  'adv.label.ladder':   ['タラップ', 'boarding ladder'],
  'adv.place.dock':     ['アルカディア / 旧ドック', 'Arcadia / The old dock'],

  'adv.name.kaito':     ['カイト', 'Kaito'],
  'adv.name.grandpa':   ['祖父', 'Grandfather'],
  // 収穫祭の村人。ヨナ婆さんの名は、屋台を調べたときの台詞に先に出てくる。
  'adv.name.yona':      ['ヨナ婆さん', 'Old Yona'],
  'adv.name.lisbeth':   ['リスベス', 'Lisbeth'],
  'adv.name.ben':       ['ベン', 'Ben'],
  'adv.label.house':    ['家の戸口', 'The door'],
  'adv.label.tree':     ['林檎の木', 'The apple tree'],
  'adv.label.shears':   ['剪定バサミ', 'The pruning shears'],
  'adv.label.stall':    ['林檎酒の屋台', 'The cider stall'],
  'adv.label.pumpkin':  ['南瓜', 'The pumpkins'],
  'adv.label.dock':     ['旧ドックの入口', 'The old dock'],
  'adv.label.boats':    ['一番機から三番機', 'Boats one to three'],
  'adv.label.myboat':   ['四番機', 'Boat four'],
  'adv.label.rack':     ['与圧服の棚', 'The suit rack'],
  'adv.label.bulkhead': ['奥の隔壁', 'The bulkhead at the back'],

  // --- 言語切り替え -------------------------------------------------
  'menu.language':      ['言語 / Language', 'Language / 言語'],
  'menu.language.desc': ['表示言語を切り替える。決定するたびに 日本語 ⇄ English が入れ替わる。<br>選んだ言語は次に開いたときも覚えている。',
                         'Switch the display language. Confirm to toggle between 日本語 and English.<br>Your choice is remembered next time.'],
  'lang.ja':            ['日本語', '日本語'],
  'lang.en':            ['English', 'English'],
};

// ===================================================================
// 文字を引く
//
// 表に無いキーはキー名をそのまま返す。
// 空欄で落ちるより、どのキーが足りないか画面で分かるほうがよい。
// ===================================================================
function t(key) {
  const row = TEXT[key];
  if (!row) return key;
  return (currentLang === 'en') ? row[1] : row[0];
}

// シーンの台詞のように、表ではなくその場に両方書いてある文字を引く。
//   { ja: '…', en: '…' } でも、ただの文字列でも受け取れる
function tv(value) {
  if (value && typeof value === 'object') {
    return (currentLang === 'en') ? (value.en || value.ja) : value.ja;
  }
  return value;
}

// ===================================================================
// 言語を切り替える
// ===================================================================
function setLanguage(lang) {
  currentLang = (lang === 'en') ? 'en' : 'ja';
  try { localStorage.setItem(LANG_STORE_KEY, currentLang); } catch (e) { /* 保存できなくても動く */ }
  document.documentElement.lang = currentLang;
  applyLangToDom();

  // HTMLに直接書いてある文字は applyLangToDom で片付くが、
  // メニューやギャラリーのように JS が組み立てている画面は
  // 作り直さないと古い言語のまま残る。
  // 誰が作り直すかは各画面側に決めてもらう(この関数を用意しておくだけ)。
  if (typeof onLanguageChanged === 'function') onLanguageChanged();
}

function toggleLanguage() {
  setLanguage(currentLang === 'ja' ? 'en' : 'ja');
}

function currentLanguage() { return currentLang; }

// ===================================================================
// HTMLに書いてある文字を差し替える
//
// data-i18n="キー" が付いた要素を探して、中身を入れ替える。
// 中に <span> などの飾りが入っているものは data-i18n-html を使う。
// ===================================================================
function applyLangToDom() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
}

// --- 起動時に、前回選んだ言語を思い出す ---
try {
  const saved = localStorage.getItem(LANG_STORE_KEY);
  if (saved === 'en' || saved === 'ja') currentLang = saved;
} catch (e) { /* 読めなくても日本語で始まる */ }
document.documentElement.lang = currentLang;
