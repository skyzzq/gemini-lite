# Gemini Lite

让 Gemini 网页版的长报告不再卡死主线程。只改渲染层，不动功能，不收集数据。

## 功能

| 功能 | 说明 |
|---|---|
| 面板延迟放出 | 先在 `display:none` 下建完 DOM，连续 6 秒无新节点才放出，45 秒兜底 |
| 正文分块渲染 | 给正文块加 `.gml-cv` + `contain-intrinsic-size:auto 240px`，离屏不参与布局 |
| 位置切换 | 面板在 Gemini 原生右侧栏与整屏浮层之间一键切换，收起时对话恢复满宽 |
| 字号五档 | 超小 11 / 小 12 / 标准 14 / 大 16 / 超大 18，公式跟随正文 |
| 本地导出 | Markdown / Word(.docx) / 单文件 HTML / 复制 Markdown，公式保留 TeX 或 MathML |
| 调试面板 | 帧率、回调耗时、强制布局耗时、JS 堆，默认关闭 |

## 效果

同一份 Deep Research 报告（面板内 25,045 节点，377 个 `<math>`，整页 74,252 节点）：

| 指标 | 优化前 | 优化后 |
|---|---|---|
| 主线程占用 | 102–125%，恒定满载 | 个位数，闲置接近 0 |
| 一次全文档布局 | 1054.6 ms | 97.2 ms（滚过一遍 30 ms） |
| 页面可操作性 | `Runtime.evaluate("1+1")` 超时 | 正常 |

不是显卡或 canvas 的问题：GPU 进程常年 6%，页面里 `<canvas>` 是 0 个。

## 安装

1. 打开 `chrome://extensions`，右上角开启开发者模式
2. 「加载已解压的扩展程序」，选本仓库根目录（含 `manifest.json` 那层）
3. 打开 <https://gemini.google.com>，`Ctrl+R`

改过文件后先在 `chrome://extensions` 点扩展的 ⟳，再回页面 `Ctrl+R`。

## 使用

工具栏图标打开设置：

| 开关 | 默认 |
|---|---|
| 显示右下角调试面板 | 关 |
| 报告面板浮层显示 | 关（用 Gemini 原生右侧栏） |
| 折叠较早的对话轮次 | 关 |
| 字号 | 标准 14px |

面板顶部按钮：`⤢ 默认位置` / `⛶ 浮层`、字号下拉、`⤓ 导出`、`✕ 收起`。

### 导出

全部本地生成，不联网，只导报告正文（`.markdown-main-panel`）。

| 选项 | 公式 |
|---|---|
| `Markdown (.md)` | 行内 `$tex$`，独立 `$$ tex $$` |
| `Word (.docx)` | 纯文本 TeX |
| `网页 (.html)` | 原生 MathML |
| `复制 Markdown` | 同上 |

公式优先取 KaTeX 的 `<annotation encoding="application/x-tex">`；用 `output:'html'` 渲染的公式没有 TeX 源（实测 518 个里 114 个有），这类退化成显示文字。

控制台接口：

```js
__gmlite.panel(true)   // 展开面板
__gmlite.float(true)   // 切浮层
__gmlite.fold(true, 8) // 折叠除最后 8 轮
__gmlite.stats()       // 轮次 / 折叠数 / 布局耗时
```

## 已知限制

- Gemini 自带的「导出到 Google 文档」仍可能卡住，请用 `⤓ 导出` 或 `Ctrl+P` 存 PDF。
- 页面内 `Ctrl+F` 搜不到未滚到的段落，离屏块不在渲染树里。
- 放出延迟是启发式的，面板通常比内容停止增长晚几秒出现。

## 兼容性

Chrome / Edge 111+（依赖 `world:"MAIN"` 与 `:has()`），仅在 `gemini.google.com` 与 `aistudio.google.com` 生效，权限只有 `storage`。

## 开发

```
manifest.json  lite.js（页面内主逻辑）  export.js（导出）  bridge.js（配置桥）  popup.html/js  icons/  docs/
```

`lite.js` 分 12 段，改动主要落在「面板释放」和「每秒 tick」两段。

```bash
bash scripts/package.sh    # 生成 dist/gemini-lite-<version>.zip
```

发布与上架：[`docs/PUBLISHING.md`](docs/PUBLISHING.md)｜商店文案：[`docs/STORE-LISTING.md`](docs/STORE-LISTING.md)｜隐私：[`docs/PRIVACY.md`](docs/PRIVACY.md)

MIT，见 [`LICENSE`](LICENSE)。
