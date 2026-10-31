# 更新日志

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`。
Chrome 商店同一份 `version` 只能上传一次，改完 manifest 里的 `version` 再打包。

## 1.3.2

- 修复：新报告边生成边被提前放出，主线程又被占满（实测 134% CPU / 3.4GB）。判据改成「连续 6 秒没有新节点」才放出（原先是 3 轮≈2.1s 节点数不变，网络停顿就够触发），另加 45 秒兜底，避免缓慢增长的报告永远不出现
- 新增：面板可见之后持续给新长出来的正文块补 `content-visibility` 标记（防抖 MutationObserver，300ms）。此前只在放出那一刻扫一遍，流式追加的块全是裸布局
- 放出后仍会清 `html.gml-wait`，不改变"摘标记=进布局树"这个唯一动作

## 1.3.1

- 修复：收起过一次之后，再点开新报告无法展开。原先用 `WeakSet` 记住"被收起的面板节点"，而 Gemini 在同一节点里换新报告，这条记录会永久挡住放出逻辑。改为 `WeakMap` 记「收起那一刻的节点数」：节点数变化（新报告）或出现 `ng-animating`（用户又展开）就自动放出
- 修复：面板上字号下拉的档位表与 `FONT_STEPS` 不同步（还是旧的 10/11/12/14/16），选「标准」会落到 12px。现在工具条与 popup 共用同一张 `FONT_OPTIONS` 表

## 1.3.0

- 字号整体上移一档：11 / 12 / 14 / 16 / 18，默认「标准」= 14px
- 老配置（`cfg.fontV` 缺失）读入时自动放大一档并写回，只迁移一次
- 新图标：白色四角星 + 深色圆角底，四角透明
- 修复：`setFloat()` 里仍在派发 `window.resize`，触发 Gemini autoscroll，把对话顶到最底部
- 修复：字号迁移原先写在页面侧且被 `DEFAULTS.fontV` 短路，永远不会执行 → 移到 `bridge.js` 按 storage 原值判断
- 修复：`popup.js` 在没有 `chrome.storage` 的环境下直接抛异常
- `minimum_chrome_version` 标注为 111（`world: "MAIN"` 与 `:has()` 的下限）

## 1.2.8

- 「收起 / 浮层」时用 `chat-window.immersives-mode:has(…gml-off | …gml-float) { grid-template-columns: 1fr }` 收掉面板占的那一列，对话恢复满宽
- 不再改 Gemini 的 `immersives-mode` 类名（改它会让状态机把面板 DOM 销毁，之后无法再"显示报告"）
- 移除悬空的 `syncChatMode()` 调用（函数已删，仍被调用会 ReferenceError）

## 1.2.7

- 报告正文按块加 `content-visibility: auto`（`.gml-cv`）+ `contain-intrinsic-size: auto 240px`
- 全树布局本机实测 1054.6 ms → 97.2 ms，滚动后 30 ms
- `@media print` 下恢复 `content-visibility: visible`，保证打印/存 PDF 不缺内容

## 1.2.6

- 打开/切换面板时保持 `.chat-history` 的滚动位置（`captureScroll` / `restoreScroll`）
- `.chat-history`、`.chat-history-scroll-container` 加 `overflow-anchor: none`

## 1.2.5

- 公式字号归一：`.katex { font-size: 1em }`，修掉公式比正文大一号（KaTeX 默认 1.21em）
- 工具条新增字号下拉，五档，改完即时生效并写回 storage

## 1.2.4

- 去掉扩展自身的固定开销：不再包装 `setTimeout/setInterval/queueMicrotask/fetch/Promise.then`，不再每秒强制全文档布局，rAF 接管默认关闭

## 1.2.0

- 新增设置弹窗（`popup.html`）+ `bridge.js` 配置桥；诊断面板默认关闭
- 面板延迟放出改为「节点数连续 3 次稳定且 >800，或 20 秒兜底」

## 1.1.0

- 首版：面板延迟进布局树、浮层/默认位置切换、诊断面板
