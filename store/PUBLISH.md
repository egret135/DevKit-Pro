# DevKit Pro — Chrome Web Store 提交清单

你已完成：开发者账号注册。  
仓库已准备：隐私政策、商店文案、打包脚本、宣传图模板。按下面在 Dashboard 操作即可。

## 0. 隐私政策托管（GitHub Pages）

1. Push 含 `docs/privacy-policy.html` 的提交到 `main`
2. GitHub 仓库 → **Settings → Pages**
3. Source: **Deploy from a branch** → Branch **`main`** → Folder **`/docs`** → Save
4. 数分钟后打开：`https://egret135.github.io/DevKit-Pro/privacy-policy.html`
5. 确认页面正常渲染（HTML），再把该 URL 填进 Dashboard 隐私政策字段

## 1. 打 ZIP 包

在项目根目录执行：

```bash
bash scripts/pack-extension.sh
```

产物：`dist/DevKit-Pro-<manifest.version>.zip`（版本号自动读取 `manifest.json`，当前为脚本打印的路径）。  
用「解压后加载」再测一遍：`chrome://extensions` → 加载已解压 → 选解压目录。

## 2. 打开开发者后台

https://chrome.google.com/webstore/devconsole

1. **新商品** → 上传 ZIP  
2. 可见性：公开 / 不公开（仅链接）按需选择  
3. 分发地区：默认可全球

## 3. 粘贴商店信息

文案见：`store/listing.md`

必填摘要：

| 字段 | 内容来源 |
|------|----------|
| 商品名称 | DevKit Pro |
| 简短介绍 | listing.md → Short description |
| 详细介绍 | listing.md → Detailed description |
| 类别 | Developer Tools |
| 语言 | 中文或 English |
| 图标 | `icons/icon128.png` |
| 截图 | 至少 1 张（建议 1280×800），见下方截图建议 |
| 小宣传图 | `store/assets/promo-small-440x280.png`（440×280，必填） |
| 隐私政策 URL | `https://egret135.github.io/DevKit-Pro/privacy-policy.html` |
| Single purpose | listing.md 中的英文单一用途句 |

## 4. Privacy practices（隐私问卷）

按 `store/listing.md` 中的权限说明与勾选建议填写。  
务必声明：内容本地处理、不上传服务器、未使用远程代码。

## 5. 截图与宣传图

### 小宣传图（必填）

仓库已提供：`store/assets/promo-small-440x280.png`（440×280）。上传到 Dashboard → Promotional images → Small。

### 截图（至少 1 张，建议 3 张）

在扩展全屏打开后截取（Chrome 窗口或系统截图），建议：

1. **转换器**：DDL → Go Struct  
2. **Markdown**：预览含表格/公式或 Mermaid  
3. **工具箱或媒体**：任选一个代表性界面  

尺寸优先：1280×800 或 640×400。不要包含无关个人信息。  
清单见：`store/ASSETS.md`

## 6. 提交审核

检查无报错后点 **提交审核**。首次审核常见数天～两周。  
邮件通知到开发者账号邮箱。

## 7. 以后更新

1. 修改 `manifest.json` 的 `version`（必须递增）  
2. `bash scripts/pack-extension.sh`  
3. 同一商品上传新包 → 提交审核  

## 8. 曾被拒过的问题

### 远程托管代码
若写 **Manifest V3 product contains remotely hosted code**：
- 不能引用 `fonts.googleapis.com` 等 CDN（已去掉 Google Fonts）
- 打包库里不能出现会加载的远程脚本地址。jsPDF 曾内置 `cdnjs.cloudflare.com/.../pdfobject.min.js`，2.0.3 已去掉
- 隐私页选「未使用远程代码」

### 说明关键字过多
若写 **产品说明中有过多关键字 / Too many keywords**：不要用逗号串一堆标签（如 `DDL/JSON, schema diff, Markdown+Mermaid...`）。请改用 `store/listing.md` 里的自然句短介绍与详细介绍，并确保 `manifest.json` 的 `description` 与短介绍一致。

### 单一用途
若写 **Single purpose**：保持 Dashboard 单一用途字段与 listing 一致；强调「一个本地开发者工作台」。若仍被拒，再考虑拆成结构转换工作台与媒体工具两个扩展。

---

## 我无法代你完成的部分

- 登录 Google 账号上传 ZIP  
- 在 Dashboard 点「提交审核」  
- 用本机 Chrome 拍官方要求的扩展截图（需你本机操作）  
- 在 GitHub 打开 Pages（Settings → Pages）

材料与 ZIP 脚本已在仓库就绪；Pages 启用且隐私 URL 可访问后再提交。
