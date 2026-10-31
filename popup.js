/* Gemini Lite — 设置弹窗：只写 chrome.storage，页面侧由 bridge.js 推送 */
'use strict';

const DEFAULTS = { hud: false, float: false, fold: false, rafFps: 0, fontPx: 14, fontV: 2 };

const $ = (id) => document.getElementById(id);
const boxes = { hud: $('hud'), float: $('float'), fold: $('fold') };
const fontSel = $('font');

let cfg = { ...DEFAULTS };

const FONT_STEPS = [11, 12, 14, 16, 18];
function nearestFont(v) {
  const n = Number(v) || 14;
  let best = FONT_STEPS[0], d = Infinity;
  for (const s of FONT_STEPS) {
    const dd = Math.abs(s - n);
    if (dd < d) { d = dd; best = s; }
  }
  return String(best);
}

function read(done) {
  if (typeof chrome === 'undefined' || !chrome.storage) { if (done) done(); return; }
  chrome.storage.local.get({ cfg: DEFAULTS }, (s) => {
    cfg = { ...DEFAULTS, ...(s.cfg || {}) };
    for (const k of Object.keys(boxes)) boxes[k].checked = !!cfg[k];
    fontSel.value = nearestFont(cfg.fontPx);
    if (done) done();
  });
}

function write() {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.set({ cfg });
}

for (const [key, el] of Object.entries(boxes)) {
  el.addEventListener('change', () => {
    cfg[key] = el.checked;
    write();
  });
}

function cmd(name) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.set({ cmd: { name, at: Date.now() } });
}

fontSel.addEventListener('change', () => {
  cfg.fontPx = Number(fontSel.value) || 14;
  cfg.fontV = 2;
  write();
});

$('show').addEventListener('click', () => cmd('show'));
$('hide').addEventListener('click', () => cmd('hide'));

read();
