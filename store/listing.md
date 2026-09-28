# Chrome Web Store 上架文案（复制到 Dashboard）

## 简短介绍 Short description（≤132 字符）

### 中文（建议主语言若面向中文用户）

离线开发工具箱：DDL/JSON 转 Go 与 Protobuf、DDL 对比、Markdown+Mermaid、JSON 工具、图片与音视频处理。

### English（manifest / 英文商店页）

Offline developer toolkit: DDL/JSON to Go & Protobuf, schema diff, Markdown+Mermaid, JSON tools, image & media utilities.

---

## 详细介绍 Detailed description

### 中文

DevKit Pro 是一款在浏览器本地运行的开发者工具箱，无需联网即可完成日常编码辅助工作。

**核心能力**
• DDL / JSON 一键生成 Go Struct 与 Protocol Buffer
• DDL Schema 差异对比，自动生成 ALTER 语句
• Markdown 实时预览：Mermaid 图表、KaTeX 公式、导出图片/PDF
• JSON 格式化、对比与结构化高亮
• 工具箱：时间戳、Base64、URL、JWT、哈希、UUID、密码、正则、颜色、Cron、代码 Diff 等
• 配置互转：JSON / YAML / TOML / XML
• 图片工具与音视频工具（本地处理）

**隐私**
你的代码与文件只在本地处理，不会上传到我们的服务器。详见隐私政策。

**开源**
https://github.com/egret135/DevKit-Pro

### English

DevKit Pro is an offline-first developer toolkit that runs entirely in your browser.

**Highlights**
• Convert DDL / JSON to Go structs and Protocol Buffers
• Diff DDL schemas and generate ALTER statements
• Markdown preview with Mermaid, KaTeX math, and image/PDF export
• JSON format & structural compare
• Toolbox: timestamp, Base64, URL, JWT, hash, UUID, password, regex, color, Cron, code diff, and more
• Config convert: JSON / YAML / TOML / XML
• Image tools and media tools (processed locally)

**Privacy**
Your code and files stay on your device. See our privacy policy for details.

**Open source**
https://github.com/egret135/DevKit-Pro

---

## 分类 Category

Developer Tools

## 语言 Language

- 主语言建议：中文（简体）或 English（按你的主要用户选择）
- 可同时提供中英文商店描述（上面两套均可粘贴）

## 权限说明（Dashboard → Privacy practices / 单一用途说明）

**Single purpose（单一用途，英文建议）：**
Provide an offline suite of developer utilities for code conversion, schema diff, Markdown preview, JSON tooling, and local media helpers.

**Permission justifications：**

| Permission | Justification（可直接粘贴） |
|------------|------------------------------|
| storage | Store user preferences such as editor theme, font, and generator options on the device. |
| clipboardWrite | Copy generated code and tool results to the clipboard when the user clicks Copy. |
| downloads | Save exported files (source code, images, PDF, media outputs) to the user’s computer when they choose Download/Export. |

**Data usage 勾选建议：**
- 不出售用户数据
- 不用于信用评判等无关目的
- 若问卷问到是否收集个人身份信息：一般选 **No**（本扩展不收集账号/邮箱等；仅本地偏好）
- 用户内容是否离开设备：选 **No** / 仅本地处理

## 隐私政策 URL

推送到 GitHub 后使用（任选其一）：

1. **推荐（可读性好）：**  
   `https://github.com/egret135/DevKit-Pro/blob/main/docs/privacy-policy.md`

2. 若启用 GitHub Pages（Settings → Pages → Deploy from branch → `/docs`）：  
   `https://egret135.github.io/DevKit-Pro/privacy-policy.html`  
   （需再提供 HTML 版时可用；当前 Markdown 链接通常已满足商店要求）
