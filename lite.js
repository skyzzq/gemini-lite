/* Gemini Lite — 运行在页面 MAIN world。
 *
 * 唯一真正解决卡死的那一刀：报告面板（<deep-research-immersive-panel>，
 * 内含 5.6 万节点 / 680 个 MathML 公式）不要在构建期参与布局——
 * 先 display:none 让 DOM 静默长完，节点数稳定后再一次性显示。
 * 实测：110% CPU 卡死 -> 加载期 41.8% -> 稳定后 0%。
 *
 * 其余功能默认全部关掉，不替 Google 干多余的活：
 *   hud=false   不做每秒强制布局采样
 *   rafFps=0    不接管 requestAnimationFrame
 *   fold=false  不用 MutationObserver 盯整棵树
 */
(function () {
  'use strict';
  if (window.__GMLITE__) return;
  window.__GMLITE__ = true;

  /* ============================================================
   * 1. 配置
   * ============================================================ */
  const DEFAULTS = {
    hud: false,
    float: false,   // 默认就用 Gemini 自己的右侧栏，浮层由按钮手动切
    fold: false,
    keep: 8,
    rafFps: 0,
    fontPx: 14,      // 整体上移一档后的"标准"
    fontV: 2,        // 档位表版本：旧配置读进来时迁移一次
  };
  /* 配置只有一个来源：扩展弹窗 → chrome.storage → bridge.js → postMessage。
     localStorage 时代的残留不再读，避免两处状态打架。 */
  const CFG = Object.assign({}, DEFAULTS);
  CFG.hud = false;    // 诊断只能从扩展弹窗打开，避免沿用旧版本留下的 true
  CFG.rafFps = 0;     // 同上：默认不接管 rAF

  /* ============================================================
   * 2. CSS —— 立刻注入，不等 manifest 的 css 字段
   *    （content_scripts 配 world:"MAIN" 时 css 字段会被静默忽略）
   * ============================================================ */
  const CSS_TEXT = `
/* 只做三件事：延迟放出面板、浮层定位、正文字号。
   任何 max-width / min-width / box-sizing / width 都不碰 —— 那会把
   Gemini 的 flex、grid 和表格排布打乱，出现错位和黑块。 */
:root { --gml-font: 12px; }

/* 等待期：只在 <html> 上挂 gml-wait 时藏起来。
   这样"显示"只需摘掉这个祖先标记，面板回到 Gemini 自己的 display，
   不与它的 position/height/滚动容器打架。 */
html.gml-wait deep-research-immersive-panel,
html.gml-wait immersive-panel,
deep-research-immersive-panel.gml-off,
immersive-panel.gml-off {
  display: none !important;
}

/* 放出后：不改 display（交回 Gemini 自己的），只给一个有界高度 + 自己的滚动条。
   Gemini 的原生面板是 position:absolute; height:fit-content，
   没有高度上限就没有滚动容器 —— 5.6 万节点会一路铺到底，
   既滚不动，也要为整棵树付绘制成本（这就是"打开很慢"）。 */
deep-research-immersive-panel.gml-live,
immersive-panel.gml-live {
  height: 100% !important;
  max-height: 100% !important;
  overflow: auto !important;
}

/* 报告正文的大块：离屏的不参与布局/绘制。
   实测这份报告 72 个块、24k 节点，整树强制布局 1054.6ms → 197.5ms（5.3 倍）。
   contain-intrinsic-size 先给一个均值兜底，块被渲染过一次后浏览器自己记住真实高度。 */
.gml-cv {
  content-visibility: auto !important;
}

/* 面板开合会改对话区高度，浏览器的 scroll anchoring 会挑一个锚点元素保持可见，
   表现就是"自己滚到别处"。这里把这几个滚动容器上的锚定关掉。 */
.chat-history,
.chat-history-scroll-container {
  overflow-anchor: none !important;
}

/* Gemini 用 chat-window 的 immersives-mode 决定 grid 列（527px + 剩余）。
   面板被我们藏起来（.gml-off）或改成浮层（.gml-float）时，那一列必须收掉，
   否则对话永远只有半屏宽。用 :has 在样式层解决，不改 Gemini 的类名 ——
   改类名会让它的状态机把面板整个销毁，之后就没法再"显示报告"了。 */
chat-window.immersives-mode:has(immersive-panel.gml-off),
chat-window.immersives-mode:has(deep-research-immersive-panel.gml-off),
chat-window.immersives-mode:has(immersive-panel.gml-float),
chat-window.immersives-mode:has(deep-research-immersive-panel.gml-float) {
  grid-template-columns: 1fr !important;
}

/* 打印 / 导出 PDF 时必须全部渲染，否则只有首屏 */
@media print {
  .gml-cv { content-visibility: visible !important; }
}

deep-research-immersive-panel.gml-live.gml-float,
immersive-panel.gml-live.gml-float {
  position: fixed !important;
  left: 12px !important;
  right: 12px !important;
  display: block !important;   /* 只有浮层自己接管 display */
  height: auto !important;
  overflow: auto !important;
  top: 12px !important;
  bottom: 12px !important;
  width: auto !important;
  max-width: none !important;
  z-index: 2147482000 !important;
  background: Canvas !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.35) !important;
}

/* 字号只施加在正文类元素上，图标、按钮、输入框一律不动 */
deep-research-immersive-panel.gml-live p,
deep-research-immersive-panel.gml-live li,
deep-research-immersive-panel.gml-live td,
deep-research-immersive-panel.gml-live th,
deep-research-immersive-panel.gml-live h1,
deep-research-immersive-panel.gml-live h2,
deep-research-immersive-panel.gml-live h3,
deep-research-immersive-panel.gml-live h4,
deep-research-immersive-panel.gml-live h5,
deep-research-immersive-panel.gml-live h6,
deep-research-immersive-panel.gml-live blockquote,
deep-research-immersive-panel.gml-live pre,
deep-research-immersive-panel.gml-live code,
immersive-panel.gml-live p,
immersive-panel.gml-live li,
immersive-panel.gml-live td,
immersive-panel.gml-live th,
immersive-panel.gml-live h1,
immersive-panel.gml-live h2,
immersive-panel.gml-live h3,
immersive-panel.gml-live h4,
immersive-panel.gml-live h5,
immersive-panel.gml-live h6,
immersive-panel.gml-live blockquote,
immersive-panel.gml-live pre,
immersive-panel.gml-live code {
  font-size: var(--gml-font) !important;
  line-height: 1.45 !important;
}

/* KaTeX 默认给 .katex 设了 1.21em，比正文大一号；
   这里是让它和正文同高，上下标仍由 KaTeX 内部的 scriptlevel 缩小。 */
deep-research-immersive-panel.gml-live .katex,
immersive-panel.gml-live .katex {
  font-size: 1em !important;
}

deep-research-immersive-panel.gml-live math,
deep-research-immersive-panel.gml-live math *,
immersive-panel.gml-live math,
immersive-panel.gml-live math * {
  font-size: inherit !important;
}

/* 长代码不撑破面板，只在 pre 上开横向滚动，不动宽度 */
deep-research-immersive-panel.gml-live pre,
immersive-panel.gml-live pre {
  overflow-x: auto !important;
}

/* 折叠（默认关闭）：命中的是对话轮次，不是报告面板 */
.gml-folded {
  content-visibility: hidden !important;
  contain-intrinsic-size: auto 500px !important;
}

/* 打印/导出成 PDF 时让浮层回到文档流，否则整块 fixed 会被漏掉 */
@media print {
  deep-research-immersive-panel.gml-live.gml-float,
  immersive-panel.gml-live.gml-float {
    position: static !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
}

::-webkit-scrollbar {
  width: 14px !important;
  height: 14px !important;
}
::-webkit-scrollbar-thumb {
  background: rgba(120,140,180,0.75) !important;
  border-radius: 7px !important;
  border: 2px solid transparent !important;
  background-clip: padding-box !important;
}
::-webkit-scrollbar-track {
  background: rgba(120,120,120,0.15) !important;
}
::-webkit-scrollbar-corner {
  background: rgba(120,120,120,0.15) !important;
}
`;

  (function injectCSS() {
    /* 先把面板挡在布局树外，必须在注入样式的同时完成 */
    try { document.documentElement.classList.add('gml-wait'); } catch (e) {}
    const put = (root) => {
      if (document.getElementById('gmlite-style')) return;
      const s = document.createElement('style');
      s.id = 'gmlite-style';
      s.textContent = CSS_TEXT;
      (root || document.head || document.documentElement).appendChild(s);
    };
    if (document.head) put(document.head);
    else if (document.documentElement) put(document.documentElement);
    else {
      const mo = new MutationObserver(() => {
        if (document.documentElement) { mo.disconnect(); put(document.documentElement); }
      });
      mo.observe(document, { childList: true, subtree: true });
    }
  })();

  /* 五档：11/12/14/16/18（比上一版整体放大一档）。
     工具条下拉与 popup 必须共用这张表，否则"标准"会落错像素。 */
  const FONT_STEPS = [11, 12, 14, 16, 18];
  const FONT_OPTIONS = [[11, '字号：超小'], [12, '字号：小'], [14, '字号：标准'], [16, '字号：大'], [18, '字号：超大']];
  function nearestFont(v) {
    const n = Number(v) || 14;
    let best = FONT_STEPS[0], d = Infinity;
    for (const step of FONT_STEPS) {
      const dd = Math.abs(step - n);
      if (dd < d) { d = dd; best = step; }
    }
    return best;
  }

  function applyFont() {
    try {
      document.documentElement.style.setProperty('--gml-font', (CFG.fontPx || 14) + 'px');
    } catch (e) {}
  }
  applyFont();

  /* ============================================================
   * 3. 面板：延迟放进布局树 + 浮层切换
   * ============================================================ */
  const PANEL_SEL = 'deep-research-immersive-panel, immersive-panel';
  const PANEL_LIVE = 'deep-research-immersive-panel.gml-live, immersive-panel.gml-live';

  let floatOn = CFG.float === true;
  /* 用户收起的是"当前这一份报告"，不是一个全局开关。
     用 WeakMap 记住「收起那一刻的节点数」：同一个面板节点里换了一份新报告
     （节点数变了）就当作新内容，自动重新放出 —— 否则收起一次之后，
     再点开新报告会被这条记录一直挡着，表现就是"回复无法展开"。 */
  let hiddenAt = new WeakMap();
  const rememberHidden = (el) => hiddenAt.set(el, el.getElementsByTagName('*').length);
  const forgetHidden = () => { hiddenAt = new WeakMap(); };

  function setFloat(on) {
    floatOn = !!on;
    const keep = captureScroll();
    for (const el of document.querySelectorAll(PANEL_SEL)) {
      el.classList.toggle('gml-float', floatOn);
    }
    /* 浮层 = 对话该占满整行；默认位置 = 两列。改完列宽会把对话挤动，所以还原滚动位置。 */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      /* 不再派发 window 的 resize：Gemini 对它会 autoscroll 到最底部，
         把用户正在看的位置冲掉。列宽变化由 CSS 自己完成，这里只还原滚动。 */
      restoreScroll(keep);
    }));
    return floatOn;
  }

  /* 给报告正文的分块加 content-visibility，离屏块不参与布局。
     用固定均值做 contain-intrinsic-size：不读 scrollHeight，避免为了测尺寸
     反而先付一次全树布局；块真正渲染过一次后浏览器会记住它的高度。 */
  const CV_EST = 240;
  function decorateForSpeed(panel) {
    try {
      const blocks = panel.querySelectorAll('.markdown-main-panel > *');
      for (const b of blocks) {
        if (b.dataset.gmlCv === '1') continue;
        b.style.setProperty('contain-intrinsic-size', 'auto ' + CV_EST + 'px');
        b.classList.add('gml-cv');
        b.dataset.gmlCv = '1';
      }
    } catch (e) {}
  }

  /* 面板张着的时候还在流式追加内容（新报告边生成边长）。
     只靠放出那一刻扫一遍，后来的块全都裸奔，布局成本又回来了 ——
     所以挂一个防抖 MutationObserver 持续补标记。 */
  let cvObs = null, cvTimer = 0;
  function watchBlocks() {
    if (cvObs) return;
    const run = () => {
      cvTimer = 0;
      for (const p of document.querySelectorAll(PANEL_SEL)) {
        if (p.classList.contains('gml-live')) decorateForSpeed(p);
      }
    };
    cvObs = new MutationObserver(() => {
      if (cvTimer) return;
      cvTimer = setTimeout(run, 300);
    });
    cvObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  /* 对话区的滚动位置：面板张开会改高度，Gemini 会把对话滚到底部。
     这里在张开的瞬间记下位置，布局稳定后再放回去，并在稍后补两次，
     给 Gemini 自己的 autoscroll 留出时间窗；用户一旦自己滚了就立刻停手。 */
  const KEEP_SEL = '.chat-history, .chat-history-scroll-container, .chat-window, .conversation-container';
  let userTouched = false;
  for (const t of ['wheel', 'touchstart', 'keydown', 'mousedown']) {
    window.addEventListener(t, () => { userTouched = true; }, { capture: true, passive: true });
  }
  function captureScroll() {
    const keep = [];
    try {
      for (const el of document.querySelectorAll(KEEP_SEL)) {
        if (el.scrollHeight > el.clientHeight + 4) keep.push([el, el.scrollTop]);
      }
    } catch (e) {}
    return keep;
  }
  function restoreScroll(keep) {
    if (!keep || !keep.length) return;
    userTouched = false;
    const put = () => {
      if (userTouched) return;
      for (const [el, top] of keep) {
        if (!el.isConnected) continue;
        if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
      }
    };
    put();
    setTimeout(put, 200);
    setTimeout(put, 600);
    setTimeout(put, 1200);
  }

  /* Gemini 用 chat-window 上的 immersives-mode 决定 grid 列：
     有它 = 527px + 1055px 两列（对话被压窄），没有它 = 单列满宽。
     面板 display:none 后这个类还在，对话就一直窄着 —— 这就是"收起后没恢复全页"。
     规则：只有「面板可见且不是浮层」时才该有两列。 */
  function showPanel(on) {
    const els = document.querySelectorAll(PANEL_SEL);
    for (const el of els) {
      if (on) {
        el.classList.add('gml-live');
        el.classList.remove('gml-off');
        if (floatOn) el.classList.add('gml-float');
      } else {
        el.classList.remove('gml-live', 'gml-float');
        el.classList.add('gml-off');
      }
    }
    if (on) {
      /* 摘掉祖先上的等待标记 —— 这是"让面板进入布局树"的唯一动作 */
      try { document.documentElement.classList.remove('gml-wait'); } catch (e) {}
    }
    if (on && els.length) { try { ensureToolbar(); } catch (e) {} }
    if (on) {
      /* display:none 期间尺寸为 0，Angular 的 ResizeObserver 收到 0 不会重测，
         放出后连发两帧 rAF 再 dispatch resize，让横向滚动容器重算 scrollWidth。 */
      if (els.length) {
        decorateForSpeed(els[0]);
        try { watchBlocks(); } catch (e) {}
        /* 记下对话区当前的滚动位置：面板进布局树会改变可用高度，
           Gemini 自己又会把对话滚到底部（它对 resize/高度变化有 autoscroll），
           所以这里既不去派发 window 的 resize，也在布局后把位置还原。 */
        const keep = captureScroll();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          try {
            for (const el of els) {
              el.dispatchEvent(new Event('scroll'));
              for (const h of el.querySelectorAll('horizontal-scroll-wrapper, .horizontal-scroll-wrapper')) {
                if (h.scrollWidth > h.clientWidth) h.dispatchEvent(new Event('scroll'));
              }
            }
          } catch (e) {}
          restoreScroll(keep);
        }));
      }
    }
    return els.length;
  }

  /* 看守器：面板是异步长出来的，只有「长完了」才让进布局树。
     面板显示后每轮只是两次 querySelectorAll，几乎零成本。 */
  (function watcher() {
    const seen = new WeakMap();
    setInterval(() => {
      const els = document.querySelectorAll(PANEL_SEL);
      if (!els.length) return;
      for (const p of els) {
        if (p.classList.contains('gml-live')) { seen.delete(p); continue; }
        const n = p.getElementsByTagName('*').length;
        if (hiddenAt.has(p)) {
          const was = hiddenAt.get(p);
          /* 节点数变了 = 又长出一份新报告，玩家的"收起"不再适用 */
          const fresh = n !== was && (n > was * 1.2 + 20 || n < was * 0.8);
          /* Gemini 展开面板时会挂 ng-animating：这也是"用户又要看"的信号 */
          const opening = p.classList.contains('ng-animating');
          if (!fresh && !opening) continue;
          hiddenAt.delete(p);
        }
        const now = Date.now();
        const st = seen.get(p) || { last: -1, stable: 0, since: now, grew: now };
        if (n === st.last) st.stable++;
        else { st.stable = 0; st.last = n; st.grew = now; }
        seen.set(p, st);
        /* 太早放出来 = 边建边布局，5.6 万节点会一直重排（实测又回到 125% CPU）。
           要连续 3 次（约 2.1s）节点数不变才算长完；超过 20s 还没稳定就兜底放行。 */
        /* 判据只有两条，都是为了别在"还在生成"的时候把它放进布局树：
           ① 连续 6 秒没有新节点（网络停顿会让计数短暂不动，2.1s 根本不够，
              实测提前放出立刻回到 134% CPU 把主线程占死）；
           ② 45 秒兜底，避免某些报告一直缓慢增长导致面板永远不出现。 */
        const idle = n > 0 && now - (st.grew || st.since) > 6000;
        const giveUp = now - st.since > 45000;
        if (idle || giveUp) { showPanel(true); seen.delete(p); try { sync(); } catch (e) {} }
      }
    }, 700);
  })();

  /* ============================================================
   * 4. 面板顶部的两个按钮（默认位置 / 收起）
   * ============================================================ */
  let toolbar = null, btnFloat = null, btnHide = null, fontSel = null;
  let btnExport = null, exportMenu = null, exportWrap = null, exportTimer = 0;

  function btnCss() {
    return 'padding:6px 13px;border-radius:8px;cursor:pointer;' +
      'border:1px solid rgba(255,255,255,.28);background:rgba(40,44,52,.96);' +
      'color:#e8eaed;font:600 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.45);pointer-events:auto;-webkit-user-select:none;';
  }

  function flashExport(msg) {
    if (!btnExport) return;
    exportMenu.style.display = 'none';
    btnExport.textContent = msg;
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => {
      exportTimer = 0;
      if (btnExport) btnExport.textContent = '⤓ 导出';
    }, 1200);
  }

  /* 点面板别处 / 按 Esc 就把菜单收起来 */
  function closeExportOnOutside(ev) {
    if (!exportMenu || exportMenu.style.display !== 'flex') return;
    if (exportWrap && exportWrap.contains(ev.target)) return;
    exportMenu.style.display = 'none';
  }
  document.addEventListener('pointerdown', closeExportOnOutside, true);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && exportMenu) exportMenu.style.display = 'none';
  }, true);

  function ensureToolbar() {
    if (toolbar && toolbar.isConnected) return;
    const pnl = document.querySelector(PANEL_SEL);
    if (!pnl) return;

    toolbar = document.createElement('div');
    toolbar.setAttribute('data-gmlbar', '1');
    toolbar.style.cssText =
      'position:absolute;top:10px;left:0;right:0;pointer-events:none;' +
      'z-index:2147483500;display:flex;justify-content:center;gap:8px;';

    btnFloat = document.createElement('button');
    btnFloat.type = 'button';
    btnFloat.style.cssText = btnCss();
    btnFloat.title = '在浮层和 Gemini 默认位置之间切换';
    btnFloat.textContent = floatOn ? '⤢ 默认位置' : '⛶ 浮层';
    btnFloat.onclick = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      setFloat(!floatOn);
      sync();
    };
    btnFloat.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);

    btnHide = document.createElement('button');
    btnHide.type = 'button';
    btnHide.style.cssText = btnCss();
    btnHide.title = '收起报告面板（可从扩展图标重新打开）';
    btnHide.textContent = '✕ 收起';
    btnHide.onclick = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      for (const el of document.querySelectorAll(PANEL_SEL)) rememberHidden(el);
      showPanel(false);
      sync();
    };
    btnHide.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);

    /* 面板上的字号档位：写回 storage，由 bridge 推给页面，重开页面后仍然是这一档 */
    fontSel = document.createElement('select');
    fontSel.setAttribute('data-gmlfont', '1');
    fontSel.title = '报告字号';
    fontSel.style.cssText = btnCss() + ';cursor:pointer;padding:5px 6px;';
    /* 档位表只此一份：FONT_STEPS 与 LABELS 必须同序，否则"标准"会落到 12px 而不是 14px */
    for (const [v, t] of FONT_OPTIONS) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = t;
      fontSel.appendChild(o);
    }
    fontSel.value = String(nearestFont(CFG.fontPx || 14));
    fontSel.onchange = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      const px = Number(fontSel.value) || 12;
      CFG.fontPx = px;
      applyFont();
      try { window.postMessage({ __gmlite_set: { fontPx: px } }, '*'); } catch (e) {}
      sync();
    };
    fontSel.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);

    /* 导出：全部在页面本地完成。Gemini 自带的「导出到 Google 文档」会把整棵
       报告 DOM 交给 Docs API，几百个公式逐个转码，主线程必死 —— 这里直接
       序列化成文本下载，不联网、不转码。 */
    exportWrap = document.createElement('span');
    exportWrap.style.cssText = 'position:relative;display:inline-block;';

    btnExport = document.createElement('button');
    btnExport.type = 'button';
    btnExport.style.cssText = btnCss();
    btnExport.title = '导出这份报告（本地生成，不走 Google 文档）';
    btnExport.textContent = '⤓ 导出';
    btnExport.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);

    exportMenu = document.createElement('div');
    exportMenu.setAttribute('data-gmlexport', '1');
    exportMenu.style.cssText =
      'position:absolute;top:calc(100% + 6px);right:0;width:200px;display:none;' +
      'flex-direction:column;gap:2px;padding:6px;border-radius:10px;z-index:2147483600;' +
      'background:rgba(32,35,42,.98);border:1px solid rgba(255,255,255,.18);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.5);pointer-events:auto;';
    exportMenu.addEventListener('mousedown', (ev) => ev.stopPropagation(), true);

    const EXPORTS = [
      ['Markdown (.md)', () => window.__gmExport.saveMarkdown()],
      ['Word (.docx)', () => window.__gmExport.saveDocx()],
      ['网页 (.html)', () => window.__gmExport.saveHtml()],
      ['复制 Markdown', () => window.__gmExport.copyMarkdown()]
    ];
    for (const item of EXPORTS) {
      const label = item[0], fn = item[1];
      const it = document.createElement('button');
      it.type = 'button';
      it.textContent = label;
      it.style.cssText = 'display:block;width:100%;text-align:left;cursor:pointer;' +
        'padding:7px 10px;border-radius:7px;border:0;background:transparent;' +
        'color:#e8eaed;font:500 12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;';
      it.onmouseenter = () => { it.style.background = 'rgba(255,255,255,.10)'; };
      it.onmouseleave = () => { it.style.background = 'transparent'; };
      it.onclick = (ev) => {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        if (!window.__gmExport) { flashExport('未就绪'); return; }
        try {
          const r = fn();
          /* copyMarkdown 返回 Promise：剪贴板被拒时也不能变成未捕获拒绝 */
          if (r && typeof r.catch === 'function') {
            r.then(() => flashExport('✓ 已复制'), () => flashExport('复制被拒'));
          } else {
            flashExport('✓ 已导出');
          }
        } catch (e) {
          console.warn('[Gemini Lite] 导出失败', e);
          flashExport('导出失败');
        }
      };
      exportMenu.appendChild(it);
    }

    btnExport.onclick = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      exportMenu.style.display = exportMenu.style.display === 'flex' ? 'none' : 'flex';
    };

    exportWrap.append(btnExport, exportMenu);
    toolbar.append(btnFloat, fontSel, exportWrap, btnHide);

    pnl.insertBefore(toolbar, pnl.firstChild);
  }

  /* ============================================================
   * 5. HUD —— 默认关闭，只从扩展弹窗打开
   * ============================================================ */
  let hud = null, line1 = null, line2 = null, line3 = null, btnRaf = null, btnFold = null, btnPanel = null;
  const stat = { rawFrames: 0, callbacks: 0, costMs: 0, reflowMs: -1, longTasks: 0, folded: 0, rounds: 0 };
  let lo = null, lt = null;

  function buildHUD() {
    if (hud || !document.body) return;
    hud = document.createElement('div');
    hud.style.cssText =
      'position:fixed;right:14px;bottom:14px;z-index:2147483000;' +
      'font:11.5px/1.55 ui-monospace,Consolas,monospace;' +
      'background:rgba(18,20,26,.94);color:#dfe3e8;border:1px solid rgba(255,255,255,.15);' +
      'border-radius:10px;padding:9px 11px;box-shadow:0 8px 28px rgba(0,0,0,.5);min-width:196px;';
    const mk = () => { const d = document.createElement('div'); d.style.cssText = 'white-space:pre'; return d; };
    line1 = mk(); line2 = mk(); line3 = mk();
    hud.append(line1, line2, line3);

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    const bs = 'flex:1;font:inherit;color:#dfe3e8;cursor:pointer;background:rgba(255,255,255,.09);' +
      'border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:3px 6px;';

    btnRaf = document.createElement('button');
    btnRaf.style.cssText = bs;
    btnRaf.onclick = () => {
      const seq = [0, 60, 120, 240];
      CFG.rafFps = seq[(seq.indexOf(CFG.rafFps) + 1) % seq.length];
      syncRaf();
      sync();
    };

    btnFold = document.createElement('button');
    btnFold.style.cssText = bs;
    btnFold.onclick = () => {
      CFG.fold = !CFG.fold;
      syncFold();
      sync();
    };

    btnPanel = document.createElement('button');
    btnPanel.style.cssText = bs;
    btnPanel.onclick = () => {
      const live = !!document.querySelector(PANEL_LIVE);
      if (live) for (const el of document.querySelectorAll(PANEL_SEL)) rememberHidden(el);
      else forgetHidden();
      showPanel(!live);
      sync();
    };

    const x = document.createElement('button');
    x.textContent = '×';
    x.style.cssText = bs + 'width:24px;flex:0 0 auto';
    x.onclick = () => setHud(false);

    bar.append(btnRaf, btnFold, btnPanel, x);
    hud.appendChild(bar);
    document.body.appendChild(hud);
    sync();
  }

  function destroyHUD() {
    if (hud) { try { hud.remove(); } catch (e) {} }
    hud = line1 = line2 = line3 = btnRaf = btnFold = btnPanel = null;
  }

  function setHud(on) {
    CFG.hud = !!on;
    if (CFG.hud) buildHUD();
    else destroyHUD();
    syncObservers();
    /* 页面里点 × 也能让弹窗里的勾选跟着变：把真实值回写给 bridge */
    try { window.postMessage({ __gmlite_state: { hud: CFG.hud } }, '*'); } catch (e) {}
  }


  function sync() {
    if (fontSel) {
      const want = String(nearestFont(CFG.fontPx));
      if (want !== fontSel.value) fontSel.value = want;
    }
    if (btnRaf) btnRaf.textContent = CFG.rafFps ? ('限帧 ' + CFG.rafFps) : '限帧 关';
    if (btnFold) btnFold.textContent = CFG.fold ? '折叠 开' : '折叠 关';
    if (btnPanel) btnPanel.textContent = document.querySelector(PANEL_LIVE) ? '报告 显示' : '报告 隐藏';
    if (btnFloat) btnFloat.textContent = floatOn ? '⤢ 默认位置' : '⛶ 浮层';
  }

  /* ============================================================
   * 6. rAF 限帧 —— 默认不接管
   * ============================================================ */
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCancel = window.cancelAnimationFrame.bind(window);
  const q = new Map();
  let nid = 1, sched = false, lastRun = 0, rafOn = false;

  function pump() {
    sched = false;
    const now = performance.now();
    if (CFG.rafFps > 0 && now - lastRun < (1000 / CFG.rafFps) - 0.4) { schedule(); return; }
    lastRun = now;
    const batch = [];
    for (const cb of q.values()) batch.push(cb);
    q.clear();
    if (!batch.length) return;
    const t0 = performance.now();
    for (const cb of batch) { try { cb(now); } catch (e) {} }
    stat.costMs += performance.now() - t0;
    stat.callbacks += batch.length;
  }
  function schedule() {
    if (sched || q.size === 0) return;
    sched = true;
    nativeRAF(pump);
  }
  const rafWrap = function (cb) {
    if (typeof cb !== 'function') return 0;
    const id = nid++;
    q.set(id, cb);
    schedule();
    return id;
  };
  const cancelWrap = function (id) {
    if (q.delete(id)) return;
    nativeCancel(id);
  };

  function syncRaf() {
    if (CFG.rafFps > 0 && !rafOn) {
      rafOn = true;
      window.requestAnimationFrame = rafWrap;
      window.cancelAnimationFrame = cancelWrap;
    } else if (CFG.rafFps <= 0 && rafOn) {
      rafOn = false;
      q.clear();
      window.requestAnimationFrame = nativeRAF;
      window.cancelAnimationFrame = nativeCancel;
    }
  }

  /* ============================================================
   * 7. 轮次折叠 —— 默认关闭，关着就不装观察器
   * ============================================================ */
  const ROUND_SEL = 'in-place-response-shell.conversation-container, pending-request.conversation-container';
  let foldMO = null, foldT = null;

  function applyFold() {
    if (!CFG.fold) return;
    let list = Array.from(document.querySelectorAll(ROUND_SEL));
    if (list.length < 2) list = Array.from(document.querySelectorAll('.conversation-container'));
    stat.rounds = list.length;
    const hotFrom = Math.max(0, list.length - CFG.keep);
    let folded = 0;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (i < hotFrom) {
        if (!el.classList.contains('gml-folded')) el.classList.add('gml-folded');
        folded++;
      } else if (el.classList.contains('gml-folded')) {
        el.classList.remove('gml-folded');
      }
    }
    stat.folded = folded;
  }

  function scheduleFold(d) {
    if (!CFG.fold) return;
    if (foldT) clearTimeout(foldT);
    foldT = setTimeout(() => { foldT = null; applyFold(); }, d || 800);
  }

  function syncFold() {
    if (CFG.fold && !foldMO) {
      if (!document.body) { setTimeout(syncFold, 100); return; }
      foldMO = new MutationObserver(() => scheduleFold(900));
      foldMO.observe(document.body, { childList: true, subtree: true });
      scheduleFold(200);
    } else if (!CFG.fold && foldMO) {
      foldMO.disconnect();
      foldMO = null;
    }
  }

  /* ============================================================
   * 8. 观察器：只在 HUD 打开时才装
   * ============================================================ */
  function syncObservers() {
    if (CFG.hud && !lo) {
      try {
        lo = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const s = (e.scripts || []).slice().sort((a, b) => b.duration - a.duration)[0];
            if (!s) continue;
            window.__gmlLoAF = (window.__gmlLoAF || []);
            window.__gmlLoAF.push(Math.round(e.duration) + '|' + String(s.sourceFunctionName || 'anon').slice(0, 26));
            while (window.__gmlLoAF.length > 40) window.__gmlLoAF.shift();
          }
        });
        lo.observe({ type: 'long-animation-frame', buffered: true });
      } catch (e) { lo = null; }
      try {
        lt = new PerformanceObserver((l) => { stat.longTasks += l.getEntries().length; });
        lt.observe({ entryTypes: ['longtask'] });
      } catch (e) { lt = null; }
    } else if (!CFG.hud) {
      if (lo) { try { lo.disconnect(); } catch (e) {} lo = null; }
      if (lt) { try { lt.disconnect(); } catch (e) {} lt = null; }
    }
  }

  /* ============================================================
   * 9. 每秒采样 —— 只有 HUD 打开才跑
   * ============================================================ */
  setInterval(() => {
    if (!toolbar) { try { ensureToolbar(); } catch (e) {} }
    if (!CFG.hud || !hud) return;

    let reflow = -1;
    try {
      const t = performance.now();
      void document.body.offsetHeight;
      reflow = Math.round((performance.now() - t) * 10) / 10;
    } catch (e) {}
    stat.reflowMs = reflow;

    sync();
    if (line1) {
      line1.textContent = '回调 ' + stat.callbacks + '/s   耗时 ' + Math.round(stat.costMs) + 'ms/s\n' +
        '强制reflow ' + reflow + 'ms';
      line2.textContent = '轮次 ' + stat.rounds + '  折叠 ' + stat.folded + '\n长任务 ' + stat.longTasks;
      line3.textContent = 'JS堆 ' + (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : '?') + 'MB';
    }
    stat.rawFrames = 0; stat.callbacks = 0; stat.costMs = 0;
  }, 1000);

  /* ============================================================
   * 10. 外部配置 / 命令（来自扩展弹窗，经 bridge.js 转发）
   * ============================================================ */
  function applyCfg(c) {
    if (!c || typeof c !== 'object') return;
    if ('hud' in c) setHud(!!c.hud);
    if ('float' in c) { setFloat(!!c.float); sync(); }
    if ('fold' in c) { CFG.fold = !!c.fold; syncFold(); sync(); }
    if ('rafFps' in c) { CFG.rafFps = c.rafFps | 0; syncRaf(); sync(); }
    if ('keep' in c) CFG.keep = c.keep | 0;
    if ('fontPx' in c) { CFG.fontPx = c.fontPx || 14; applyFont(); }
  }

  /* ============================================================
   * 11. Console 接口
   * ============================================================ */
  window.__gmlite = {
    panel: (on) => {
      if (on) forgetHidden();
      else for (const el of document.querySelectorAll(PANEL_SEL)) rememberHidden(el);
      showPanel(!!on); sync();
    },
    float: (on) => { setFloat(!!on); sync(); return floatOn; },
    hud: (on) => { setHud(!!on); return CFG.hud; },
    fps: (n) => { CFG.rafFps = n | 0; syncRaf(); sync(); },
    fold: (on, keep) => { CFG.fold = !!on; if (keep != null) CFG.keep = keep | 0; syncFold(); sync(); },
    cfg: () => Object.assign({}, CFG),
    stats: () => Object.assign({}, stat),
    reflow: () => { const t = performance.now(); void document.body.offsetHeight; return performance.now() - t; },
  };

  /* ============================================================
   * 12. 启动
   * ============================================================ */
  (function boot() {
    const go = () => { try { ensureToolbar(); } catch (e) {} };
    if (document.body) { go(); return; }
    /* document_start 时还没有 body：等 DOMContentLoaded，不再 60ms 轮询 */
    document.addEventListener('DOMContentLoaded', go, { once: true });
  })();

  try { window.postMessage({ __gmlite_want_cfg: true }, '*'); } catch (e) {}
})();
