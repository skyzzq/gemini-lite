# Gemini Lite

一个只管一件事的 Chrome 扩展：**让 Gemini 网页版的长报告（Deep Research 面板）不再把主线程卡死。**

它不改功能、不接管请求、不收集数据。只做三件渲染层的事：把报告面板推迟到 DOM 建完之后再进布局树、把正文按块做 `content-visibility`、以及给你一个能读长报告的字号与浮层开关。

> 本机实测环境：AMD Ryzen 9 8940HX / 32 GB / 2560×1600@240Hz / Chrome 156.0.8078.79 / Windows 11，账号下的一份 Deep Research 报告（面板内 25,045 个节点、377 个 `<math>` 公式、整页 74,252 个节点）。

---

## 它解决什么问题

Gemini 的 Deep Research 报告面板是一个绝对定位、`height: fit-content` 的容器，里面塞着几万个节点和上百个 MathML 公式。打开这种会话时会出现：

- 某个渲染进程的主线程恒定跑满一个核（实测 **102–125%** 单核占用，线程状态一直是 `Running`）；
- 页面滚不动、点不动，连 DevTools 的 `Runtime.evaluate("1+1")` 都超时；
- 强制一次全文档布局要 **1054.6 ms**（加了分块 `content-visibility` 之后 97.2 ms，滚过一遍再测 **30 ms**）；
- 内存单向涨，Windows 自己的内存泄漏预警器（`RADAR_PRE_LEAK_64`）会判定 `chrome.exe` 泄漏。

**不是显卡不行，也不是 canvas。** 实测 GPU 进程占用常年在 6% 上下，页面里 `<canvas>` 元素数量是 0。真正的成本是「几万个节点 + 377 个公式一起参与布局，而且每次内容变化都重算一遍」。

## 它做了什么

| 手段 | 目的 |
|---|---|
| **延迟放出**：面板先在 `display:none` 下静默建完 DOM，节点数连续 3 次稳定（>800）或等满 20 秒后才放出 | 避免"边建边排"，这是 CPU 从 110% 降到个位数的关键 |
| **分块 `content-visibility`**：给报告正文的直接子块加 `.gml-cv` 和 `contain-intrinsic-size: auto 240px` | 离屏块不参与布局，实测全树布局从 1054.6 ms 降到 97.2 ms |
| **不碰 Gemini 的状态**：收起/浮层只用 `:has()` 收 grid 列，不改 `chat-window` 的类名 | 改类名会让 Gemini 把面板 DOM 整个销毁，之后就"显示报告"无对象可操作 |
| **滚动位置保持**：打开/切换面板时记下 `.chat-history` 的 `scrollTop`，布局稳定后还原 | Gemini 自己对高度变化有 autoscroll，不还原就会被顶到最底部 |
| **打印保底**：`@media print { .gml-cv { content-visibility: visible } }` | 打印/导出成 PDF 时内容不会因为是离屏块而缺失 |
| **字号五档**：11 / 12 / 14 / 16 / 18 px，公式跟随正文（`.katex` 归一到 `1em`） | KaTeX 默认给公式放大 1.21em，不处理就会比正文大一号 |

诊断面板（右下角）**默认关闭**：它每秒读 `JSHeap`、画帧率、量一次强制布局，开着本身就有开销。

## 安装（开发者模式）

```bash
git clone https://github.com/skyzzq/gemini-lite.git
```

1. 打开 `chrome://extensions`
2. 右上角打开「开发者模式」
3. 点「加载已解压的扩展程序」，选中仓库根目录（含 `manifest.json` 的那一层）
4. 打开 <https://gemini.google.com>，建议先 `Ctrl+R` 一次

> 改了文件之后：`chrome://extensions` 上点该扩展的 ⟳ 刷新图标，再回页面 `Ctrl+R`。Chrome 不会给已经打开的标签页补注入 content script。

## 使用

点工具栏图标打开设置（也可以从 `chrome://extensions` 的「扩展程序选项」进入）：

| 开关 | 默认 | 说明 |
|---|---|---|
| 显示右下角调试面板 | 关 | 打开后每秒采样：帧率、回调耗时、强制布局耗时、JS 堆 |
| 报告面板浮层显示 | 关 | 关 = 用 Gemini 自己的右侧栏；开 = 面板铺满整屏 |
| 折叠较早的对话轮次 | 关 | 只折叠屏幕外的旧轮次，滚动时逐轮展开 |
| 字号 | 标准（14px） | 五档：超小 11 / 小 12 / 标准 14 / 大 16 / 超大 18 |

报告面板顶部还有两个按钮：`⤢ 默认位置` / `⛶ 浮层`（在两种布局间切换）、`✕ 收起`（关掉面板并把对话放开到满宽）。

控制台里还有一个可以编排的入口：

```js
__gmlite.panel(true)      // 展开报告面板
__gmlite.panel(false)     // 收起（对话自动恢复满宽）
__gmlite.float(true)      // 切到浮层
__gmlite.fold(true, 8)    // 折叠除最后 8 轮以外的轮次
__gmlite.stats()          // 计数：轮次、折叠数、强制布局耗时
```

## 兼容性

- Chrome / Edge 111 及以上（用了 `content_scripts[].world: "MAIN"` 与 CSS `:has()`）
- 只在 `https://gemini.google.com/*` 与 `https://aistudio.google.com/*` 生效
- 权限只有一个 `storage`，用来存上面那几个开关

## 已知限制

- **导出到 Google 文档仍可能卡住**。那是网页自己把 5 万节点 + 377 个公式逐个转成 Docs 结构，扩展拦不住。替代做法：`Ctrl+P` 存成 PDF（已加 `@media print` 保底），或先 `__gmlite.float(false)` 退回原生栏再导出。
- **页面内 `Ctrl+F` 搜不到还没滚到的段落**。离屏块被 `content-visibility` 移出渲染树，浏览器原生查找看不到它们——这是拿"布局成本"换"可搜索范围"的取舍。需要全文搜索时先滚到底一遍。
- 面板的「延迟放出」门槛是启发式的（连续 3 次节点数不变且 >800，或 20 秒兜底）。极长的流式回答里，它可能等到写完了才放出面板。

## 开发

```
gemini-lite-ext/
├── manifest.json      # MV3
├── lite.js            # 页面内（MAIN world）的全部逻辑：CSS 注入、面板放出、字号、折叠、HUD
├── bridge.js          # ISOLATED world：把 chrome.storage 里的配置转成 postMessage
├── popup.html/.js     # 设置弹窗
├── icons/             # 16/32/48/128（icon1024.png 只用于预览，不随包发布）
└── docs/              # 发布指南、商店文案、隐私说明
```

`lite.js` 被拆成 12 段：配置 → CSS 注入 → 面板释放 → 顶部工具条 → HUD → rAF → 折叠 → 观察器 → 每秒 tick → 消息桥 → `window.__gmlite` → boot。改之前建议先读第 3 段（释放逻辑）和第 9 段（tick）。

打包发布包：

```bash
bash scripts/package.sh      # 生成 dist/gemini-lite-<version>.zip
```

## 发布

- GitHub 仓库与 Chrome 商店上架步骤：[`docs/PUBLISHING.md`](docs/PUBLISHING.md)
- 商店文案（简介 / 详细描述 / 权限说明）：[`docs/STORE-LISTING.md`](docs/STORE-LISTING.md)
- 隐私说明：[`docs/PRIVACY.md`](docs/PRIVACY.md)

## 许可

MIT，见 [`LICENSE`](LICENSE)。
