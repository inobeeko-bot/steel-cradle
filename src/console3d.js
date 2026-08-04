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
  g.fillStyle = s.radiatorOpen ? CONSOLE3D.TEXT : CONSOLE3D.DIM;
  g.fillText(s.radiatorOpen ? 'RAD OPEN' : 'RAD CLOSED', 265, 252);
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

  // --- 兵装(右寄り)---
  // 画面中央には光像式照準器の土台が立っていて、そこは隠れてしまう。
  // 兵装欄はその右へ逃がしてある。
  const wx = 1210;
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

  // --- 下段の情報行 ---
  const items = [
    ['SPEED', s.speed], ['TARGET', s.target], ['T-HEAT', s.tHeat + '%'],
    ['HULL', s.hull + '/' + s.hullMax], ['HEAT RATE', s.heatRate],
    ['PRESET', s.preset],
  ];
  if (s.empLeft > 0) items.push(['EMP', s.empLeft.toFixed(1) + 's']);

  let ix = 250;
  g.textAlign = 'left';
  for (const [k, v] of items) {
    g.font = '15px monospace';
    g.fillStyle = CONSOLE3D.DIM;
    g.fillText(k, ix, 274);
    const kw = g.measureText(k).width;
    g.font = 'bold 15px monospace';
    g.fillStyle = (k === 'EMP') ? '#7fd4ff' : CONSOLE3D.TEXT;
    g.fillText(String(v), ix + kw + 8, 274);
    ix += kw + 10 + g.measureText(String(v)).width + 28;
    // 仕切り線
    g.strokeStyle = 'rgba(159,225,203,0.12)';
    g.beginPath(); g.moveTo(ix - 14, 262); g.lineTo(ix - 14, 278); g.stroke();
  }

  return consoleCanvas;
}
