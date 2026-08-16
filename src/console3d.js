// ===================================================================
// STEEL CRADLE / 計器盤(3D版)
//
// これまで計器はHTMLで作り、3Dの上に「重ねて」表示していた。
// そのやり方だと、どれだけ寄せても画面に貼った別物に見えてしまう。
// 機体が揺れても計器は動かないし、視点の傾きにも従わない。
//
// そこでコックピット視点では、計器を1枚の絵として canvas に描き、
// それを3Dの計器台に貼り付ける。こうすると計器は機体の一部になり、
//   ・機体が揺れれば一緒に揺れる
//   ・傾ければ一緒に傾く
//   ・遠近が付く(奥のほうがすぼまる)
// が、こちらで何もしなくても勝手に成立する。
//
// このファイルは「絵を描く」ことだけを受け持つ。
// どこに貼るかは scene.js、何を描くかの中身は main.js が渡す。
// ===================================================================

// 絵の大きさ(ピクセル)。大きいほど精細だが重くなる。
// 計器台は横長なので、それに合わせた比率にしてある。
// 大きさは「計器台の見えている帯」に合わせること。
// 計器台は画面下 COCKPIT.DASH_TOP ぶんしか見えていないので、
// 絵が縦長だと下がはみ出して切れる。横に長く・薄い比率にしてある。
const CONSOLE3D = {
  W: 2048,
  H: 286,

  // 配色。HTML版の CSS 変数と同じ考え方で揃えてある
  TEXT:  '#9fe1cb',
  DIM:   '#4a5b66',
  LINE:  '#1d2b36',
  WARN:  '#ff5a3c',
  AMBER: '#ffcf6a',
  FACE:  'rgba(5, 9, 13, 0.92)',   // 面板の地の色
};

let consoleCanvas = null;
let consoleCtx = null;

// 画面のちらつき用。破損表示のノイズを動かすのに使う
let consoleTick = 0;

// ===================================================================
// canvas を用意する(最初の1回だけ)
// ===================================================================
function initConsole3D() {
  if (consoleCanvas) return consoleCanvas;
  consoleCanvas = document.createElement('canvas');
  consoleCanvas.width = CONSOLE3D.W;
  consoleCanvas.height = CONSOLE3D.H;
  consoleCtx = consoleCanvas.getContext('2d');
  return consoleCanvas;
}

function getConsoleCanvas() { return consoleCanvas; }

// ===================================================================
// 部品:縦型ゲージ1本
//
// x,y は左上。ratio は 0〜1。
// HTML版と同じ「筒に目盛り、棒の上端に明るい線」の作りにしてある。
// ===================================================================
function drawGauge(g, o) {
  const { x, y, w, h, ratio, color, label, en, value, unit, keyText, broken, low } = o;

  // --- 筒の地 ---
  g.fillStyle = 'rgba(2, 4, 7, 0.88)';
  g.fillRect(x, y, w, h);

  // --- 目盛り。細かい線と長い線の2種類 ---
  g.strokeStyle = 'rgba(159,225,203,0.10)';
  g.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const ty = Math.round(y + h * (i / 10)) + 0.5;
    g.beginPath(); g.moveTo(x + 1, ty); g.lineTo(x + w - 1, ty); g.stroke();
  }
  g.strokeStyle = 'rgba(159,225,203,0.22)';
  for (let i = 1; i < 5; i++) {
    const ty = Math.round(y + h * (i / 5)) + 0.5;
    g.beginPath(); g.moveTo(x + 1, ty); g.lineTo(x + w * 0.45, ty); g.stroke();
  }

  // --- 棒 ---
  const barH = Math.max(0, Math.min(ratio, 1)) * h;
  if (barH > 0) {
    g.fillStyle = color;
    g.fillRect(x, y + h - barH, w, barH);
    // 上端の明るい線。「今どこを指しているか」がここで読める
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x, y + h - barH, w, 2);
  }

  // --- 枠 ---
  g.strokeStyle = broken ? '#7a2a1c' : CONSOLE3D.LINE;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // --- 破損時のノイズ ---
  if (broken) {
    g.fillStyle = 'rgba(255,255,255,0.16)';
    const off = (consoleTick * 7) % 5;
    for (let ny = y + off; ny < y + h; ny += 5) g.fillRect(x, ny, w, 1);
  }

  const cx = x + w / 2;

  // --- 操作キー(筒の上) ---
  if (keyText) {
    g.font = '15px monospace';
    g.textAlign = 'center';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(keyText, cx, y - 12);
  }

  // --- 数値 ---
  g.textAlign = 'center';
  g.font = 'bold 28px monospace';
  g.fillStyle = broken ? CONSOLE3D.WARN : (low ? CONSOLE3D.WARN : color);
  g.fillText(String(value), cx, y + h + 32);
  if (unit) {
    g.font = '15px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(unit, cx + 30, y + h + 32);
  }

  // --- 銘板 ---
  g.font = '17px sans-serif';
  g.fillStyle = broken ? CONSOLE3D.WARN : CONSOLE3D.TEXT;
  g.fillText(label, cx, y + h + 58);

  g.font = '12px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText(en, cx, y + h + 76);
  // 銘板の上の細い罫線
  g.strokeStyle = 'rgba(159,225,203,0.16)';
  g.beginPath();
  g.moveTo(cx - 32, y + h + 64.5); g.lineTo(cx + 32, y + h + 64.5);
  g.stroke();
}

// ===================================================================
// 部品:レーダースコープ
// HTML版と同じで、自機中心・機首が常に上。高さは記号で表す。
// ===================================================================
function drawRadar(g, cx, cy, r, s) {
  // --- 地 ---
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(12,30,24,0.55)');
  grad.addColorStop(1, 'rgba(4,8,12,0.92)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();

  // --- 走査線(回り続ける扇)---
  const sweep = (consoleTick * 1.9) % (Math.PI * 2);
  const sg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  sg.addColorStop(0, 'rgba(159,225,203,0.16)');
  sg.addColorStop(1, 'rgba(159,225,203,0.02)');
  g.fillStyle = sg;
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, r, sweep, sweep + 1.0);
  g.closePath(); g.fill();

  // --- 同心円と十字 ---
  g.strokeStyle = 'rgba(159,225,203,0.13)';
  g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, r * 0.5, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
  g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
  g.stroke();

  // --- 縁 ---
  g.strokeStyle = s.radarNoisy ? '#7a2a1c' : '#2a4550';
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();

  // --- 自機(中心の三角)---
  g.fillStyle = CONSOLE3D.TEXT;
  g.beginPath();
  g.moveTo(cx, cy - 8); g.lineTo(cx - 5, cy + 5); g.lineTo(cx + 5, cy + 5);
  g.closePath(); g.fill();

  // --- 輝点 ---
  const band = s.sensorRange * 0.05;
  const glyph = (ly) => (ly > band ? '▲' : (ly < -band ? '▼' : '◆'));
  const place = (c, color, size) => {
    let nx = c.localX / s.sensorRange;
    let ny = c.localZ / s.sensorRange;
    const rr = Math.hypot(nx, ny);
    if (rr > 0.94) { nx = (nx / rr) * 0.94; ny = (ny / rr) * 0.94; }
    g.font = size + 'px sans-serif';
    g.textAlign = 'center';
    g.fillStyle = color;
    g.fillText(glyph(c.localY), cx + nx * r, cy + ny * r + size * 0.35);
  };

  for (const c of s.contacts) place(c, c.hot ? CONSOLE3D.AMBER : '#ff6a4d', 20);

  // --- 戦艦 ---
  // 戦闘機とは別に受け取る(索敵半径に縛らずに映すため)。
  // 大きく青白い記号 + 四角い枠で、戦闘機の点と混ざらないようにする。
  if (s.capital) {
    const cap = s.capital;
    const capColor = cap.hot ? '#ff8b5a' : '#9ff6ff';
    place(cap, capColor, 30);
    // 位置を place と同じやり方で出し直して、枠を重ねる
    let nx = cap.localX / s.sensorRange;
    let ny = cap.localZ / s.sensorRange;
    const rr = Math.hypot(nx, ny);
    if (rr > 0.94) { nx = (nx / rr) * 0.94; ny = (ny / rr) * 0.94; }
    g.strokeStyle = capColor;
    g.lineWidth = 2;
    g.strokeRect(cx + nx * r - 13, cy + ny * r - 13, 26, 26);
  }

  // 迫るミサイルは白く点滅させる
  const blink = (Math.sin(consoleTick * 14) > 0);
  for (const m of s.inbound) {
    place(m, m.decoyed ? '#7f95a3' : (blink ? '#ffffff' : '#ff3a24'), 22);
  }

  // --- 目盛りラベル ---
  g.font = '13px monospace';
  g.textAlign = 'center';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('RANGE ' + Math.round(s.sensorRange) + '   SENSOR ' + Math.round(s.sensorPct) + '%',
             cx, cy + r + 24);
}

// ===================================================================
// 部品:横棒のメーター(進捗や割合を1行で見せる)
// ===================================================================
function drawBar(g, x, y, w, h, ratio, color) {
  g.fillStyle = 'rgba(2,4,7,0.85)';
  g.fillRect(x, y, w, h);
  const fill = Math.max(0, Math.min(ratio, 1)) * w;
  if (fill > 0) { g.fillStyle = color; g.fillRect(x, y, fill, h); }
  g.strokeStyle = CONSOLE3D.LINE;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ===================================================================
// 部品:上級者向けの数値欄(ラベル + 値 + 単位)
// ===================================================================
function drawReadout(g, x, y, label, value, unit, color) {
  g.textAlign = 'left';
  g.font = '13px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText(label, x, y);

  g.font = 'bold 20px monospace';
  g.fillStyle = color || CONSOLE3D.TEXT;
  g.fillText(value, x + 108, y + 1);

  if (unit) {
    g.font = '12px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(unit, x + 108 + g.measureText(value).width * 0.62 + 12, y + 1);
  }
}

// ===================================================================
// 上級者向け計器
//
// 7パラメーターの「現在値」は左右のゲージが見せている。
// こちらはその一段上 ― 現在値からは読み取れない、
// 「このままだとどうなるか」を出す欄。
//
//   OVERHEAT  … 今の熱収支のままで、あと何秒でシャットダウンするか
//   LOCK      … ロックの進み具合(ミサイルを撃てるまで)
//   DRIFT     … 機首と進行方向のずれ。振り向き撃ちの度合い
//   RANGE     … いちばん近い敵との距離
//   CLOSURE   … その敵との接近率。+なら詰まっている、−なら離されている
//   BURST     … 推進剤で回避バーストがあと何回撃てるか
//   AMMO      … 全兵装の残弾(選んでいない武器も含めて)
// ===================================================================
function drawAdvanced(g, x, y, s) {
  // 枠の見出し
  g.textAlign = 'left';
  g.font = '12px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('FLIGHT DATA', x, y - 10);
  g.strokeStyle = 'rgba(159,225,203,0.18)';
  g.beginPath(); g.moveTo(x, y - 4.5); g.lineTo(x + 360, y - 4.5); g.stroke();

  // --- OVERHEAT:何秒でシャットダウンするか ---
  // 熱が下がっているときは「――」。上がっているときだけ意味を持つ。
  let ohText = '――', ohColor = CONSOLE3D.DIM;
  if (s.heatToShutdown !== null) {
    ohText = s.heatToShutdown.toFixed(1);
    ohColor = s.heatToShutdown < 8 ? CONSOLE3D.WARN
            : (s.heatToShutdown < 20 ? CONSOLE3D.AMBER : CONSOLE3D.TEXT);
  }
  drawReadout(g, x, y + 18, 'OVERHEAT', ohText, s.heatToShutdown !== null ? 's' : '', ohColor);

  // --- LOCK:ロックの進み具合 ---
  const lockOn = (s.aimState === 'LOCKED');
  drawReadout(g, x, y + 48, 'LOCK',
    lockOn ? 'LOCKED' : (s.aimState === 'TRACKING' ? 'TRACK' : '----'),
    '', lockOn ? CONSOLE3D.WARN : (s.aimState === 'TRACKING' ? CONSOLE3D.AMBER : CONSOLE3D.DIM));
  drawBar(g, x + 218, y + 36, 140, 10, s.lockProgress,
          lockOn ? CONSOLE3D.WARN : CONSOLE3D.AMBER);

  // --- DRIFT:機首と進行方向のずれ ---
  drawReadout(g, x, y + 78, 'DRIFT', Math.round(s.driftAngle) + '°', '',
    s.driftAngle > 25 ? '#8fd8ff' : CONSOLE3D.TEXT);

  // --- RANGE / CLOSURE ---
  drawReadout(g, x + 190, y + 78, 'RANGE',
    s.targetValid ? String(Math.round(s.targetDist)) : '----', '', CONSOLE3D.TEXT);

  let clText = '----', clColor = CONSOLE3D.DIM;
  if (s.targetValid) {
    const c = Math.round(s.closure);
    clText = (c > 0 ? '+' : '') + c;
    clColor = c > 0 ? CONSOLE3D.AMBER : '#8fd8ff';   // 詰まっている/離されている
  }
  drawReadout(g, x, y + 108, 'CLOSURE', clText, '', clColor);

  // --- BURST:あと何回噴射できるか ---
  drawReadout(g, x + 190, y + 108, 'BURST', String(s.burstsLeft), '',
    s.burstsLeft <= 2 ? CONSOLE3D.WARN : '#c77dff');

  // --- AMMO:全兵装の残弾 ---
  g.font = '12px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('AMMO', x, y + 136);
  let ax = x + 108;
  for (const a of s.allAmmo) {
    g.font = '11px monospace';
    g.fillStyle = a.selected ? CONSOLE3D.TEXT : CONSOLE3D.DIM;
    g.fillText(a.name, ax, y + 130);
    g.font = 'bold 15px monospace';
    g.fillStyle = a.low ? CONSOLE3D.WARN : (a.selected ? CONSOLE3D.TEXT : '#6d818c');
    g.fillText(a.value, ax, y + 148);
    ax += 62;
  }
}

// 見出し(小さな見出し+下線)。区画の頭に置く
function drawHeading(g, x, y, w, text) {
  g.textAlign = 'left';
  g.font = '12px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText(text, x, y - 10);
  g.strokeStyle = 'rgba(159,225,203,0.18)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, y - 4.5); g.lineTo(x + w, y - 4.5); g.stroke();
}

// ===================================================================
// 熱の内訳
//
// 熱ゲージは「今いくつ溜まっているか」しか見せない。
// 熱が上がるのか下がるのかは、発熱(武器+エンジン)と放熱の差で決まる。
// その3つを並べて見せると、どちらを削れば冷えるのかが一目で決まる。
// ===================================================================
function drawHeatBudget(g, x, y, s) {
  drawHeading(g, x, y, 150, 'HEAT BUDGET');

  const scale = 34;   // この値を「棒いっぱい」とする(毎秒の熱)
  const rows = [
    ['WPN',  s.heatFromWeapon, CONSOLE3D.WARN],
    ['ENG',  s.heatFromEngine, CONSOLE3D.AMBER],
    ['VENT', -s.heatVent,      '#8fd8ff'],
  ];
  let ry = y + 12;
  for (const [name, val, col] of rows) {
    g.textAlign = 'left';
    g.font = '11px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(name, x, ry + 8);
    drawBar(g, x + 40, ry, 66, 9, Math.abs(val) / scale, col);
    g.font = '12px monospace';
    g.fillStyle = col;
    g.textAlign = 'right';
    g.fillText((val >= 0 ? '+' : '') + val.toFixed(1), x + 150, ry + 9);
    ry += 16;
  }

  // 差し引き。ここが正なら熱は溜まっていく
  const net = s.heatFromWeapon + s.heatFromEngine - s.heatVent;
  g.textAlign = 'left';
  g.font = '11px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('NET', x, ry + 12);
  g.textAlign = 'right';
  g.font = 'bold 17px monospace';
  g.fillStyle = net > 0 ? CONSOLE3D.WARN : '#8fd8ff';
  g.fillText((net >= 0 ? '+' : '') + net.toFixed(1) + '/s', x + 150, ry + 13);
}

// ===================================================================
// 被(ひ)ロック警戒
//
// 「こちらが狙っているか」ではなく「こちらが狙われているか」。
// 撃たれる前に必ず予告が出るので、この欄が変わった瞬間が回避の合図になる。
// ===================================================================
function drawThreat(g, x, y, s) {
  drawHeading(g, x, y, 190, 'THREAT');

  // --- 被探知 ---
  // 自機の熱が、敵にどこまで見つかるかを決める。
  // 冷やせば近づかれるまで見つからない ― 熱を下げる意味がここにも出る。
  g.textAlign = 'left';
  g.font = '11px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('DETECT', x, y + 88);
  g.font = 'bold 15px monospace';
  g.fillStyle = s.detect.seen ? CONSOLE3D.WARN : '#8fd8ff';
  g.fillText(s.detect.seen ? 'SEEN' : 'COLD', x + 62, y + 88);
  // 何メートルまで見つかるか
  g.font = '13px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.textAlign = 'right';
  g.fillText(Math.round(s.detect.range) + 'm', x + 186, y + 88);
  g.textAlign = 'left';

  const t = s.threat;
  const map = {
    CLEAR:   { text: 'CLEAR',   color: CONSOLE3D.DIM,   blink: false },
    TRACK:   { text: 'TRACKED', color: CONSOLE3D.AMBER, blink: false },
    LOCK:    { text: 'LOCKED',  color: CONSOLE3D.WARN,  blink: true },
    MISSILE: { text: 'MISSILE', color: '#ffffff',       blink: true },
  };
  const m = map[t.level] || map.CLEAR;
  const on = !m.blink || (Math.sin(consoleTick * 12) > -0.2);

  // 枠。危険なときだけ縁が点く
  g.strokeStyle = (t.level === 'CLEAR') ? CONSOLE3D.LINE
                : (on ? m.color : 'rgba(0,0,0,0)');
  g.lineWidth = 2;
  g.strokeRect(x + 0.5, y + 6.5, 186, 40);

  g.textAlign = 'center';
  g.font = 'bold 24px monospace';
  g.fillStyle = on ? m.color : 'rgba(0,0,0,0)';
  g.fillText(m.text, x + 93, y + 34);

  // 何機に狙われているか
  g.textAlign = 'left';
  g.font = '12px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('ENGAGED BY', x, y + 66);
  g.font = 'bold 16px monospace';
  g.fillStyle = t.count > 0 ? CONSOLE3D.AMBER : CONSOLE3D.DIM;
  g.fillText(String(t.count), x + 106, y + 66);
}

// ===================================================================
// 目標の状態
//
// いちばん近い敵の中身。熱と、パイロ弾の効き(放熱不能)が見える。
// 残弾はセンサーに十分電力を回しているときだけ読める ―
// 「センサーへ配ると相手の手札が見える」という利得を作るため。
// ===================================================================
function drawTargetBlock(g, x, y, s) {
  drawHeading(g, x, y, 190, 'TARGET');

  const e = s.enemyInfo;
  if (!e.valid) {
    g.textAlign = 'left';
    g.font = '16px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText('NO CONTACT', x, y + 22);
    return;
  }

  // 状態
  const stMap = { approach: 'APPROACH', attack: 'ATTACK', evade: 'EVADE' };
  let stText = stMap[e.state] || '----';
  let stColor = CONSOLE3D.TEXT;
  if (e.heatDown) { stText = 'OVERHEAT'; stColor = CONSOLE3D.AMBER; }
  else if (e.empLeft > 0) { stText = 'EMP DOWN'; stColor = '#7fd4ff'; }
  g.textAlign = 'left';
  g.font = 'bold 16px monospace';
  g.fillStyle = stColor;
  g.fillText(stText, x, y + 18);

  // 敵の熱
  g.font = '11px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('T-HEAT', x, y + 40);
  drawBar(g, x + 56, y + 30, 92, 11, e.heat / 100,
          e.heat >= 70 ? CONSOLE3D.WARN : (e.heat >= 35 ? CONSOLE3D.AMBER : '#5f8f7c'));
  g.textAlign = 'right';
  g.font = '13px monospace';
  g.fillStyle = e.ventDown ? '#ff7a2a' : CONSOLE3D.DIM;
  // ▼ は放熱不能(パイロ弾が効いている)の印
  g.fillText(Math.round(e.heat) + (e.ventDown ? ' ▼' : ''), x + 190, y + 40);

  // 敵の残弾。センサーが足りないと読めない
  g.textAlign = 'left';
  g.font = '11px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('MSL', x, y + 62);
  g.fillText('FLR', x + 96, y + 62);
  g.font = 'bold 15px monospace';
  if (s.canReadEnemyAmmo) {
    g.fillStyle = CONSOLE3D.TEXT;
    g.fillText(String(e.missileAmmo), x + 40, y + 62);
    g.fillText(String(e.flareAmmo), x + 136, y + 62);
  } else {
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText('--', x + 40, y + 62);
    g.fillText('--', x + 136, y + 62);
  }
}

// ===================================================================
// 戦績と補給の見通し(右端の細い欄)
// ===================================================================
function drawScoreStrip(g, x, y, s) {
  drawHeading(g, x, y, 96, 'MISSION');

  const rows = [
    ['KILLS', s.kills + '/' + s.killGoal, CONSOLE3D.TEXT],
    ['HITS',  String(s.hitsTaken),        s.hitsTaken > 0 ? CONSOLE3D.AMBER : CONSOLE3D.DIM],
    // シールドが満タンに戻るまでの秒数。撤退の判断に使う
    ['S-FULL', s.shieldToFull === null ? '--' : Math.round(s.shieldToFull) + 's',
      s.shieldToFull === null ? CONSOLE3D.DIM : '#8fd8ff'],
  ];
  let ry = y + 16;
  for (const [k, v, c] of rows) {
    g.textAlign = 'left';
    g.font = '11px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(k, x, ry);
    g.textAlign = 'right';
    g.font = 'bold 15px monospace';
    g.fillStyle = c;
    g.fillText(v, x + 96, ry);
    ry += 22;
  }
}

// ===================================================================
// 計器盤ぜんぶを1枚に描く
// main.js が毎コマ、今の状態(s)を渡して呼ぶ。
// ===================================================================
function drawConsole3D(s, dt) {
  if (!consoleCtx) initConsole3D();
  const g = consoleCtx;
  const W = CONSOLE3D.W, H = CONSOLE3D.H;
  consoleTick += (dt || 0.016);

  // --- 面板の地 ---
  g.clearRect(0, 0, W, H);
  g.fillStyle = CONSOLE3D.FACE;
  g.fillRect(0, 0, W, H);

  // 上辺の縁取り。ここから下が機械の面、という境目
  const trim = g.createLinearGradient(0, 0, W, 0);
  trim.addColorStop(0, 'rgba(60,106,96,0)');
  trim.addColorStop(0.5, 'rgba(120,200,180,0.55)');
  trim.addColorStop(1, 'rgba(60,106,96,0)');
  g.fillStyle = trim;
  g.fillRect(0, 0, W, 3);

  // 面全体にうっすら走査線
  g.fillStyle = 'rgba(159,225,203,0.028)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);

  // --- レーダー(左端)---
  drawRadar(g, 112, 118, 92, s);

  // --- 熱(その右)---
  drawGauge(g, {
    x: 248, y: 34, w: 34, h: 118,
    ratio: s.heat / 100,
    color: 'hsl(' + (30 - 30 * (s.heat / 100)) + ', 90%, ' + (30 + 34 * (s.heat / 100)) + '%)',
    label: '熱', en: 'HEAT', value: Math.round(s.heat), unit: '%',
    keyText: 'V', broken: s.broken.heat, low: s.heat >= 80,
  });
  // ラジエーターの状態
  g.font = '13px monospace';
  g.textAlign = 'center';
  g.fillStyle = (s.radiatorMode === 'auto') ? CONSOLE3D.AMBER
              : (s.radiatorOpen ? CONSOLE3D.TEXT : CONSOLE3D.DIM);
  g.fillText((s.radiatorMode === 'auto')
    ? ('AUTO ' + (s.radiatorOpen ? '▲' : '▼'))
    : (s.radiatorOpen ? 'RAD OPEN' : 'RAD CLOSED'), 265, 252);
  // 危険域の赤線(80%)
  g.strokeStyle = 'rgba(255,90,60,0.55)';
  g.beginPath();
  const warnY = 34 + 118 * 0.2;
  g.moveTo(248, warnY); g.lineTo(282, warnY); g.stroke();

  // --- 電力配分4本(中央)---
  const sysDefs = [
    { key: 'weapon', label: '武器',    en: 'WEAPON', hue: 8,   k: '↑' },
    { key: 'shield', label: 'シールド', en: 'SHIELD', hue: 200, k: '←' },
    { key: 'engine', label: 'エンジン', en: 'ENGINE', hue: 40,  k: '→' },
    { key: 'sensor', label: 'センサー', en: 'SENSOR', hue: 130, k: '↓' },
  ];
  const px0 = 470, pgap = 92;
  sysDefs.forEach((d, i) => {
    const v = s.power[d.key];
    const light = Math.min(20 + v * 0.75, 72);
    const sat = Math.min(45 + v * 1.2, 95);
    drawGauge(g, {
      x: px0 + i * pgap, y: 34, w: 34, h: 118,
      ratio: v / 100, color: 'hsl(' + d.hue + ',' + sat + '%,' + light + '%)',
      label: d.label, en: d.en, value: v, unit: '%',
      keyText: d.k, broken: s.broken[d.key], low: false,
    });
  });

  // --- 中央の空きに置く計器 ---
  // 照準器の土台をなくしたので、中央も使える。
  drawHeatBudget(g, 300, 46, s);      // 熱の内訳(熱ゲージのすぐ右)
  drawThreat(g, 820, 46, s);          // 被ロック警戒
  drawTargetBlock(g, 820, 148, s);    // 目標の状態

  // --- 上級者向け計器 ---
  drawAdvanced(g, 1090, 46, s);

  // --- 兵装(右寄り)---
  // 飛行データのさらに右。土台にも推進剤ゲージにもかからない位置。
  const wx = 1500;
  g.textAlign = 'left';
  g.font = 'bold 22px monospace';
  g.fillStyle = s.weapon.isBeam ? CONSOLE3D.TEXT : CONSOLE3D.AMBER;
  g.fillText(s.weapon.label, wx, 56);
  g.font = '14px sans-serif';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText(s.weapon.jp, wx, 76);

  g.font = 'bold 40px monospace';
  g.fillStyle = s.weapon.low ? CONSOLE3D.WARN : CONSOLE3D.TEXT;
  g.fillText(s.weapon.ammo, wx, 122);

  g.font = '14px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('熱 ' + s.weapon.heatText + '   R 切替', wx, 146);

  // 兵装の左に色帯
  g.fillStyle = s.weapon.low ? CONSOLE3D.WARN
              : (s.weapon.isBeam ? CONSOLE3D.TEXT : CONSOLE3D.AMBER);
  g.fillRect(wx - 14, 36, 3, 116);

  // BOMBS と FLARE
  g.strokeStyle = CONSOLE3D.LINE;
  g.beginPath(); g.moveTo(wx, 162.5); g.lineTo(wx + 230, 162.5); g.stroke();
  g.font = '15px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('BOMBS ' + s.bomb.label, wx, 188);
  g.font = 'bold 22px monospace';
  g.fillStyle = s.bomb.low ? CONSOLE3D.WARN : '#fff0b0';
  g.fillText(String(s.bomb.ammo), wx + 150, 188);
  g.font = '13px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('B/N', wx + 195, 188);

  g.font = '15px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('FLARE', wx, 218);
  g.font = 'bold 22px monospace';
  g.fillStyle = s.flareLow ? CONSOLE3D.WARN : '#fff0b0';
  g.fillText(String(s.flare), wx + 150, 218);
  g.font = '13px monospace';
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('C', wx + 195, 218);

  // --- 推進剤とシールド(右端)---
  drawGauge(g, {
    x: 1760, y: 34, w: 34, h: 118,
    ratio: s.propellant / 100,
    color: 'hsl(275, 70%, ' + Math.min(22 + 38 * (s.propellant / 100), 85) + '%)',
    label: '推進剤', en: 'PROPELLANT', value: Math.round(s.propellant), unit: '%',
    keyText: 'Space', broken: s.broken.propellant, low: s.propellant < 20,
  });
  drawGauge(g, {
    x: 1900, y: 34, w: 34, h: 118,
    ratio: s.shieldHp / 100,
    color: 'hsl(200, 75%, ' + (22 + 38 * (s.shieldHp / 100)) + '%)',
    label: 'シールド', en: 'SHIELD HP', value: s.shieldShown, unit: '%',
    keyText: '', broken: s.broken.shieldhp, low: s.shieldHp < 30,
  });
  g.font = '13px monospace';
  g.textAlign = 'center';
  g.fillStyle = s.shieldRegen > 0 ? '#8fd8ff' : CONSOLE3D.DIM;
  g.fillText('+' + s.shieldRegen.toFixed(1) + '/s', 1917, 252);
  g.fillStyle = CONSOLE3D.DIM;
  g.fillText('BURST −8', 1777, 252);

  // --- 右端の細い欄:戦績 ---
  drawScoreStrip(g, 1950, 46, s);

  // --- 下段の情報行 ---
  const items = [
    ['SPEED', s.speed], ['TARGET', s.target], ['T-HEAT', s.tHeat + '%'],
    ['HULL', s.hull + '/' + s.hullMax], ['HEAT RATE', s.heatRate],
    ['PRESET', s.preset],
  ];
  items.push(['A-TRK', s.autoTrack ? 'ON' : 'OFF']);
  if (s.empLeft > 0) items.push(['EMP', s.empLeft.toFixed(1) + 's']);
  // 回収した機材の効果。効いているときだけ欄が増える(EMPと同じ扱い)
  if (s.salvageBuff) items.push(['SALVAGE', s.salvageBuff]);

  let ix = 250;
  g.textAlign = 'left';
  for (const [k, v] of items) {
    g.font = '15px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(k, ix, 274);
    const kw = g.measureText(k).width;
    g.font = 'bold 15px monospace';
    g.fillStyle = (k === 'EMP') ? '#7fd4ff'
                : (k === 'SALVAGE') ? '#9ff6ff' : CONSOLE3D.TEXT;
    g.fillText(String(v), ix + kw + 8, 274);
    ix += kw + 10 + g.measureText(String(v)).width + 28;
    // 仕切り線
    g.strokeStyle = 'rgba(159,225,203,0.12)';
    g.beginPath(); g.moveTo(ix - 14, 262); g.lineTo(ix - 14, 278); g.stroke();
  }

  return consoleCanvas;
}
