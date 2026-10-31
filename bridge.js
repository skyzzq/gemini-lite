/* Gemini Lite — 配置桥（ISOLATED world）
 *
 * MAIN world 的 lite.js 拿不到 chrome.storage，这里把它读出来，
 * 用 window.postMessage 交给页面；弹窗改设置后 storage.onChanged 再推一次。
 * 只做搬运，不碰 DOM，开销可以忽略。
 */
(function () {
  'use strict';

  const DEFAULTS = {
    hud: false,      // 右下角诊断面板：默认关闭
    float: false,    // false = Gemini 原生右侧栏（默认），true = 浮层
    fold: false,     // 折叠旧轮次
    rafFps: 0,       // 0 = 不接管 rAF
    fontPx: 14, fontV: 2,      // 面板字号
  };

  /* 弹窗把整份配置写在 cfg 这个键下，这里必须按同一个形状读，
     否则 get(DEFAULTS) 拿到的永远是默认值，勾选改了也没反应。 */
  /* 字号档位整体上移过一次：老配置（没有 fontV）读到时放大一档并写回，
     只做一次；不这么做的话，老用户存的 12px 会一直是 12px，感觉不到"变大"。 */
  const FONT_STEPS = [11, 12, 14, 16, 18];
  const bumpFont = (v) => {
    const n = Number(v) || 12;
    let idx = 0, best = Infinity;
    FONT_STEPS.forEach((s, i) => { const d = Math.abs(s - n); if (d < best) { best = d; idx = i; } });
    return FONT_STEPS[Math.min(idx + 1, FONT_STEPS.length - 1)];
  };

  const pushCfg = () => {
    try {
      chrome.storage.local.get({ cfg: DEFAULTS }, (s) => {
        const raw = s.cfg || {};
        if (raw.fontV !== 2) {
          const next = Object.assign({}, DEFAULTS, raw, { fontPx: bumpFont(raw.fontPx), fontV: 2 });
          window.postMessage({ __gmlite_cfg: next }, '*');
          chrome.storage.local.set({ cfg: next });
          return;
        }
        window.postMessage({ __gmlite_cfg: Object.assign({}, DEFAULTS, raw) }, '*');
      });
    } catch (e) {}
  };

  const pushCmd = (name) => {
    try { window.postMessage({ __gmlite_cmd: name }, '*'); } catch (e) {}
  };

  pushCfg();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.cfg) pushCfg();
      if (changes.cmd && changes.cmd.newValue && changes.cmd.newValue.name) {
        pushCmd(changes.cmd.newValue.name);
      }
    });
  } catch (e) {}

  // 页面侧想主动要一次配置；另外把页面上点 × 关 HUD 的真实状态写回 storage
  /* 页面侧改了字号：写回 storage，走同一条 onChanged 回流，状态只有一份 */
  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const set = ev.data && ev.data.__gmlite_set;
    if (!set || typeof set !== 'object') return;
    try {
      chrome.storage.local.get({ cfg: DEFAULTS }, (s) => {
        const next = Object.assign({}, DEFAULTS, s.cfg || {}, set);
        chrome.storage.local.set({ cfg: next });
      });
    } catch (e) {}
  }, true);

  window.addEventListener('message', (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.__gmlite_want_cfg) { pushCfg(); return; }
    if (d.__gmlite_state && typeof d.__gmlite_state.hud === 'boolean') {
      chrome.storage.local.get({ cfg: DEFAULTS }, (s) => {
        const cfg = Object.assign({}, DEFAULTS, s.cfg || {});
        if (cfg.hud !== d.__gmlite_state.hud) {
          cfg.hud = d.__gmlite_state.hud;
          chrome.storage.local.set({ cfg });
        }
      });
    }
  });
})();
