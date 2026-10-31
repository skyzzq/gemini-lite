# 发布指南：GitHub + Chrome Web Store

这份文档覆盖两件事：把代码放到 GitHub，以及把同一个 zip 上架到 Chrome 应用商店。
所有命令默认在**仓库根目录**（也就是 `manifest.json` 所在的那一层）执行。

占位符在第一次发布前整体替换掉：

| 占位符 | 换成 |
|---|---|
| GitHub 账号 | `skyzzq`（已填） |
| 仓库 | `skyzzq/gemini-lite`（已填） |
| 版权人 | `skyzzq`（已填） |

---

## 0. 发布前先备齐这三样

| 物料 | 规格 | 谁提供 |
|---|---|---|
| 打包 zip | 根目录直接是 `manifest.json`，不是再套一层文件夹 | `bash scripts/package.sh` 生成 |
| 截图 | 1280×800 或 640×400，PNG/JPEG，1–5 张 | 需要你在真实页面上截 |
| 隐私政策 URL | 一个能公开访问的 HTTPS 地址 | 用 GitHub Pages 托管 `docs/PRIVACY.md`（下面有步骤） |

截图建议就拍这三张，每张都能说明一个卖点：

1. 打开长报告时**面板正常显示、公式与正文同号**（对应"打开即用"）
2. 扩展弹窗（字号五档 + 三个开关）
3. 面板顶部的 `⤢ 默认位置` / `✕ 收起` 两个按钮，以及收起后**对话恢复满宽**

另外可以补两张可选宣传图（商店里叫 small promo tile / marquee），规格分别是 440×280 和 1400×560，仓库里已经生成好两个模板：`docs/store/promo-440x280.png`、`docs/store/marquee-1400x560.png`，你想换成别的文案随时重做。

---

## 1. 发布到 GitHub

### 1.1 先把仓库初始化好

如果这个目录还不是 git 仓库：

```bash
cd gemini-lite-ext              # manifest.json 所在目录
git init -b main
git add .
git commit -m "feat: Gemini Lite 1.3.0 — 长报告面板延迟进布局树 + 分块 content-visibility"
```

> 仓库根目录必须就是扩展根目录。把 `manifest.json` 套在一层子目录里，别人 clone 下来没法直接「加载已解压的扩展程序」，也会被商店判为无效包。

### 1.2 建远程仓库并推上去

用 GitHub CLI（推荐，一条命令搞定）：

```bash
gh auth login                      # 首次需要
gh repo create gemini-lite --public --source=. --remote=origin --push \
  --description "让 Gemini 网页版的长报告不再卡死主线程（Chrome 扩展）"
```

或者在网页上手动建空仓库，然后：

```bash
git remote add origin https://github.com/skyzzq/gemini-lite.git
git push -u origin main
```

### 1.3 补齐仓库信息（网页上点一下）

- **About**：把 `README.md` 开头那段话粘进 Description；Topics 建议填
  `chrome-extension`、`manifest-v3`、`gemini`、`performance`、`content-visibility`、`deep-research`
- **Releases**：按下一节打 tag 会自动生成
- **Issues**：建议打开，长报告类问题需要用户提供会话结构和节点数

### 1.4 用 tag 自动出包

`.github/workflows/release.yml` 已经写好：推 `v*` 形式的 tag 就会校验 `manifest.json` 的 version 与 tag 是否一致、打包、把 zip 挂到 Release。

```bash
git tag v1.3.0
git push origin v1.3.0
```

流水线完成后，Release 页面会多出一个 `gemini-lite-1.3.0.zip`，商店上传就用它。

> 版本号规则：`manifest.json` 里的 `version` 必须和 tag 去掉 `v` 之后完全一致，CI 会直接拦下来。

### 1.5 用 GitHub Pages 托管隐私政策

1. 仓库 → Settings → Pages
2. Source 选 `Deploy from a branch`，Branch 选 `main`，目录选 `/docs`
3. 保存后等一两分钟，地址是：

```
https://skyzzq.github.io/gemini-lite/PRIVACY.html
```

（Jekyll 会把 `docs/PRIVACY.md` 渲染成 `PRIVACY.html`；如果访问 404，把文件另存一份 `docs/PRIVACY.html` 更稳。）

这个 URL 下面上架时要用，商店会真的去抓。

---

## 2. 上架 Chrome 应用商店

### 2.1 注册开发者账号

1. 打开 <https://chrome.google.com/webstore/devconsole>
2. 用要长期维护的 Google 账号登录（**换账号很麻烦，一次选对**）
3. 付一次性 **$5** 注册费，填开发者名称（会公开显示）与联系邮箱
4. 邮箱必须验证，商店的审核结果、拒审原因都会发到这里

### 2.2 上传

1. Developer Dashboard → `New item`（或 `Add new item`）
2. 选择 `bash scripts/package.sh` 生成的 `dist/gemini-lite-<version>.zip`
3. 上传后进入 Store listing 页面逐项填写

### 2.3 Store listing 怎么填

文案已经写在 [`STORE-LISTING.md`](STORE-LISTING.md)，直接复制即可。几个硬限制：

| 字段 | 限制 | 注意 |
|---|---|---|
| 名称 | ≤ 45 字符 | 别写 "Gemini" 以外的官方暗示，名称里不要带 Google |
| 简介（Summary） | ≤ 132 字符 | 写清"解决什么"，不要堆关键词 |
| 详细描述 | ≤ 16,000 字符 | 用 `STORE-LISTING.md` 那版，末尾保留非官方声明 |
| 类别 | — | `Tools`（工具），不要选 `Productivity` 之外的花哨分类 |
| 语言 | — | 中文（简体）；英文版可留空，等有精力再补 |
| 图标 | 128×128 | 用 `icons/icon128.png` |
| 截图 | 1280×800 / 640×400 | 至少 1 张，建议 3 张 |

### 2.4 Privacy practices 这一页最容易被打回

逐项照抄：

- **Single purpose（单一用途）**：
  > Gemini Lite 只有一个用途：降低 Gemini 网页版中长报告面板（Deep Research）的渲染开销，让页面能正常滚动与输入。它不修改 Gemini 的任何内容或数据，也不与其他站点交互。
- **权限理由**
  - `storage`：
    > 用于保存用户自己选的四个开关（字号、是否浮层、是否折叠、是否显示调试面板）。不涉及任何个人数据。
  - 站点访问 `https://gemini.google.com/*`、`https://aistudio.google.com/*`：
    > 扩展的全部功能都在这些页面的 DOM 上生效（给报告面板加延迟释放与分块渲染样式），必须在这两个域上运行。
- **远程代码**：`No, I am not using remote code`（代码全部随包发布，没有 `eval`、没有远端脚本）
- **数据使用**：全部**不勾**（不收集、不出售、不传输任何用户数据）；如果商店强制要求至少声明一项，勾「Authentication information」是错的，应该走 `None of the above`
- **隐私政策 URL**：第 1.5 节那个 Pages 地址

### 2.5 提交审核

1. 右上角 `Submit for review`
2. 状态会经历 `Pending review` → `In review` → `Published` / `Rejected`
3. 首次审核通常 1–3 个工作日，遇到节假日会更久

**如果被要求补充说明**，最常见的两条与对应答复：

| 审核提问 | 建议答复 |
|---|---|
| 「为什么需要访问 gemini.google.com 的页面内容？」 | 说明扩展只读 DOM、只在报告面板上添加 CSS 类与延迟释放逻辑，不读取对话内容、不发请求。可附 README 的「它做了什么」一节。 |
| 「`world: "MAIN"` 是什么？」 | 说明需要在页面主世界里劫持/测量渲染时机（读取 `document` 布局耗时、注入样式），隔离世界做不到；不执行任何远端代码。 |

### 2.6 发布范围

- `Public`：所有人可见可搜
- `Unlisted`：只有拿到链接的人能装（适合先给朋友试用）
- `Private`：仅指定测试账号

第一次建议先 `Unlisted` 跑一周，确认没人反馈"打开面板更慢"再转 `Public`。

### 2.7 之后每次更新

1. 改 `manifest.json` 的 `version`（必须比线上大，同版本不能重复上传）
2. 更新 `CHANGELOG.md`
3. `bash scripts/package.sh`
4. 商店 → 该条目 → `Package` → `Upload new package`
5. 如果权限、站点范围、用途有变化，`Privacy practices` 要跟着改，否则会被打回
6. 提交审核 → 通过后自动滚雪球式发布（也可以选定时发布）

---

## 3. 发布检查清单

- [ ] `manifest.json` 的 `version` 已递增，且与 `CHANGELOG.md` 顶部一致
- [ ] `node --check lite.js bridge.js popup.js` 全部通过
- [ ] 在 `chrome://extensions` 用「加载已解压的扩展程序」试过一遍：面板能放出、字号能切、收起后对话满宽
- [ ] `scripts/package.sh` 出的 zip 解压后根目录就是 `manifest.json`
- [ ] 截图是**真实界面**（商店明确禁止用效果图冒充截图）
- [ ] 隐私政策 URL 能打开
- [ ] 描述里没有 "官方 / official / Google 出品" 之类暗示
- [ ] README 里的截图与体积说明与实际一致

## 4. 常见拒审原因（按出现频率）

1. **单一用途不清晰**：把"还能翻译、还能去广告"之类的功能都塞进来。这个扩展只做渲染优化，描述里不要提别的。
2. **权限说明太空**：`storage` 也要写清楚存了什么。
3. **截图与功能不符**：截图必须来自真实页面。
4. **隐私政策打不开**：URL 404 是最常见的低级失误。
5. **商标问题**：名称/图标/描述让人误以为是 Google 官方产品。名称用 `Gemini Lite` 可以，但详细描述末尾请保留：

   > Gemini Lite is an independent project and is not affiliated with, endorsed by, or sponsored by Google LLC. Gemini is a trademark of Google LLC.

6. **上传包结构错误**：zip 里多套一层文件夹，或者把 `node_modules`、`.git` 打进去。

---

## 5. 一页速查

```bash
# 本地验证
node --check lite.js && node --check bridge.js && node --check popup.js

# 打包
bash scripts/package.sh          # → dist/gemini-lite-<version>.zip

# 首次发布
gh repo create gemini-lite --public --source=. --remote=origin --push
git tag v1.3.0 && git push origin v1.3.0

# 之后发版
# 1) 改 manifest.json version + CHANGELOG.md
# 2) bash scripts/package.sh
# 3) 商店 Developer Dashboard 上传 zip
```
