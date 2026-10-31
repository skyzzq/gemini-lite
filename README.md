# Gemini Lite

一个只干一件事的 Chrome 扩展：让 Gemini 网页版的长报告别再卡死主线程。

它不改功能，不接管请求，也不收集数据。做的事情都在渲染层：把报告面板推迟到 DOM 建完之后再进布局树，把正文按块切开来渲染，再加几个能让你读完长报告的小开关。

先说测出来的数字。测试机是 Ryzen 9 8940HX / 32GB / 2560×1600@240Hz / Chrome 156.0.8078.79 / Windows 11，账号里一份 Deep Research 报告，面板内 25,045 个节点，377 个 `<math>` 公式，整页 74,252 个节点。

## 卡在哪

Gemini 的报告面板是一个绝对定位、`height: fit-content` 的容器。几万个节点和上百个 MathML 公式全塞在里面，没有高度上限，也没有自己的滚动容器。打开这种会话会看到：

- 某个 renderer 的主线程稳定跑满一个核，102–125%，线程状态一直是 `Running`；
- 页面滚不动也点不动，DevTools 里 `Runtime.evaluate("1+1")` 都要超时；
- 强制一次全文档布局 1054.6 ms；
- 内存只涨不降，涨到后来 Windows 自己的预警器出手，事件日志里出现 `RADAR_PRE_LEAK_64`，判定 `chrome.exe` 泄漏。

一开始我以为是 GPU 或者 canvas 的问题，查完发现都不是。GPU 进程常年 6% 上下，页面里 `<canvas>` 元素是 0 个。真正花钱的地方是把几万个节点连同 377 个公式一起丢给布局，而且内容每变一次就全量重算一遍。

## 怎么修的

| 做法 | 原因 |
|---|---|
| 延迟放出：面板先在 `display:none` 下把 DOM 建完，连续 6 秒没有新节点再放出来，45 秒兜底 | 边建边排是最贵的，光这一条就把 CPU 从 110% 压到个位数 |
| 分块渲染：给正文的直接子块加 `.gml-cv` 和 `contain-intrinsic-size: auto 240px` | 离屏块不参与布局，全树布局从 1054.6 ms 降到 97.2 ms，滚过一遍再测 30 ms |
| 收起和浮层只用 `:has()` 收 grid 列，不碰 `chat-window` 的类名 | 改类名 Gemini 会把面板 DOM 整个销毁，之后「显示报告」就没有对象可操作了 |
| 打开面板时记下 `.chat-history` 的 `scrollTop`，布局稳定后再还原 | Gemini 自己对高度变化有 autoscroll，不还原就把对话顶到最底部 |
| `@media print` 里把 `.gml-cv` 还原成 `content-visibility: visible` | 打印或存 PDF 时离屏块不会缺内容 |
| 字号五档 11/12/14/16/18 px，`.katex` 归一到 `1em` | KaTeX 自己把公式放大 1.21 倍，不处理就比正文大一号 |

右下角那个诊断面板默认是关的。它每秒读一次 `JSHeap`、算帧率、量一次强制布局，开着本身就有成本，需要查问题时再从设置里打开。

## 装

```bash
git clone https://github.com/skyzzq/gemini-lite.git
```

1. 打开 `chrome://extensions`
2. 右上角打开开发者模式
3. 点「加载已解压的扩展程序」，选仓库根目录（含 `manifest.json` 那一层）
4. 打开 <https://gemini.google.com>，`Ctrl+R` 一次

改过文件之后要先在 `chrome://extensions` 点这个扩展的 ⟳，再回页面 `Ctrl+R`。Chrome 不会给已经打开的标签页补注入 content script，这是它的行为，不是扩展的问题。

## 用

点工具栏图标进设置，也可以从 `chrome://extensions` 的「扩展程序选项」进：

| 开关 | 默认 | 说明 |
|---|---|---|
| 显示右下角调试面板 | 关 | 打开后每秒采样帧率、回调耗时、强制布局耗时、JS 堆 |
| 报告面板浮层显示 | 关 | 关就是 Gemini 自己的右侧栏，开是铺满整屏的浮层 |
| 折叠较早的对话轮次 | 关 | 只折屏幕外的旧轮次，滚回去会逐轮展开 |
| 字号 | 标准 14px | 五档：超小 11 / 小 12 / 标准 14 / 大 16 / 超大 18 |

面板顶部还有一排按钮：位置切换（`⤢ 默认位置` / `⛶ 浮层`）、字号下拉、`⤓ 导出`、`✕ 收起`。收起之后对话会恢复满宽。

### 导出

`⤓ 导出` 有四个选项，都在本地生成，不联网：

| 选项 | 拿到什么 | 公式 |
|---|---|---|
| `Markdown (.md)` | 标题、列表、引用、表格、带语言标记的代码块、链接、图片，都是标准 Markdown | 行内 `$tex$`，独立 `$$ tex $$` |
| `Word (.docx)` | 能被 Word 直接打开的 OOXML，标题加粗放大，代码等宽，表格一行一行排 | 纯文本 TeX |
| `网页 (.html)` | 单文件带样式，双击就能看 | 原生 MathML，浏览器自己排 |
| `复制 Markdown` | 进剪贴板，粘到 Obsidian 或 Notion | 同上 |

只导报告正文（`.markdown-main-panel`），Gemini 自己的面板工具条和左栏对话不会混进去。

公式优先取 KaTeX 留在 `<annotation encoding="application/x-tex">` 里的原始 TeX。但页面里很多公式是 `output:'html'` 渲染的，压根没有 TeX 源：某份报告里 518 个 `.katex`，只有 114 个带 annotation。这类会退化成它显示出来的字，比如 `P∥Q`，总比把公式整条丢掉好。

控制台里也能直接调：

```js
__gmlite.panel(true)      // 展开报告面板
__gmlite.panel(false)     // 收起，对话恢复满宽
__gmlite.float(true)      // 切到浮层
__gmlite.fold(true, 8)    // 折叠除最后 8 轮以外的轮次
__gmlite.stats()          // 轮次、折叠数、强制布局耗时
```

## 兼容性

Chrome 和 Edge 111 以上。用了 `content_scripts[].world: "MAIN"` 和 CSS `:has()`，这两样是 111 的分界线。只在 `gemini.google.com` 和 `aistudio.google.com` 生效，权限只有一个 `storage`，存的就是上面那几个开关。

## 已知限制

Gemini 自带的「导出到 Google 文档」还是可能卡住。那是网页自己把五万节点和几百个公式逐个转成 Docs 结构，扩展拦不住，建议改用 `⤓ 导出` 或者 `Ctrl+P` 存 PDF。

页面内 `Ctrl+F` 搜不到还没滚到的段落。离屏块被 `content-visibility` 移出了渲染树，浏览器原生查找看不见它们。要全文搜就先滚到底一遍，这是我拿布局开销换可搜索范围的取舍。

放出面板的门槛是启发式的。Deep Research 报告是分批注入的，所以面板通常比内容停下来的时刻晚几秒出现。之前用「2 秒节点数不变」判断，网络一停顿就误判成建完了，结果又卡回 134%，所以改成了现在的 6 秒。

## 开发

```
gemini-lite-ext/
├── manifest.json      # MV3
├── lite.js            # 页面内（MAIN world）：CSS 注入、面板放出、工具条、字号、折叠、HUD
├── export.js          # 页面内（MAIN world）：DOM → Markdown / docx / 单文件 HTML，含最小 zip 打包
├── bridge.js          # ISOLATED world：把 chrome.storage 里的配置转成 postMessage
├── popup.html/.js     # 设置弹窗
├── icons/             # 16/32/48/128，icon1024.png 只用于预览，不随包发布
└── docs/              # 发布指南、商店文案、隐私说明
```

`lite.js` 分成 12 段：配置、CSS 注入、面板释放、顶部工具条、HUD、rAF、折叠、观察器、每秒 tick、消息桥、`window.__gmlite`、boot。要改的话先看第 3 段和第 9 段，其余大多是可以不碰的枝叶。

打包：

```bash
bash scripts/package.sh      # 生成 dist/gemini-lite-<version>.zip
```

## 发布

- GitHub 与 Chrome 商店上架流程：[`docs/PUBLISHING.md`](docs/PUBLISHING.md)
- 商店文案：[`docs/STORE-LISTING.md`](docs/STORE-LISTING.md)
- 隐私说明：[`docs/PRIVACY.md`](docs/PRIVACY.md)

## 许可

MIT，见 [`LICENSE`](LICENSE)。
