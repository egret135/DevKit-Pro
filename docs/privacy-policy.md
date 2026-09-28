# DevKit Pro Privacy Policy / 隐私政策

**Last updated / 更新日期:** 2026-09-28  
**Product / 产品:** DevKit Pro (Chrome Extension)  
**Developer / 开发者:** egret135  
**Contact / 联系:** Open an issue at [github.com/egret135/DevKit-Pro](https://github.com/egret135/DevKit-Pro/issues)

---

## English

### Overview

DevKit Pro is an **offline-first** developer toolkit that runs entirely in your browser. It does **not** operate a backend server for processing your content, and it does **not** sell or share your data with advertisers.

### Data we store locally

The extension may store the following **on your device only**:

| Data | Purpose | Storage |
|------|---------|---------|
| Editor preferences (theme, font, indent) | Remember UI settings | `chrome.storage` / `localStorage` |
| Generation options (e.g. package name, TableName) | Remember converter settings | `chrome.storage` / `localStorage` |
| Draft Markdown text (optional session cache) | Restore unfinished input | `localStorage` |

You can clear this data by clearing the extension’s site data, uninstalling the extension, or using in-app clear/reset actions where available.

### Data we do **not** collect

- We do **not** upload your DDL, JSON, Markdown, images, audio/video, passwords, tokens, or other tool inputs to our servers.
- We do **not** use analytics SDKs, advertising trackers, or third-party tracking pixels.
- We do **not** require an account to use the extension.

Processing (formatting, conversion, preview, export, hashing, etc.) happens **locally in the browser**.

### Permissions explained

| Permission | Why it is needed |
|------------|------------------|
| `storage` | Save preferences and options on your device |
| `clipboardWrite` | Copy generated code / results when you click Copy |
| `downloads` | Save exported files (e.g. Go/Protobuf, PNG/PDF, images) to your computer when you choose to download |

The extension opens its own page when you click the toolbar icon. It does not request broad access to browse your web history or read arbitrary websites.

### Third-party libraries

Bundled open-source libraries (e.g. CodeMirror, Marked, Mermaid, KaTeX, MediaInfo WASM) run **locally** inside the extension. They are not used to phone home with your content.

### Children’s privacy

DevKit Pro is intended for developers and is not directed at children under 13.

### Changes

We may update this policy when features or permissions change. The “Last updated” date at the top will be revised accordingly. Continued use after changes means you accept the updated policy.

### Contact

Questions about privacy: please open a GitHub issue on the project repository linked above.

---

## 中文

### 概述

DevKit Pro 是一款**以本地运行为主**的开发者工具扩展，在浏览器内完成处理。我们**没有**用于处理你内容的后台服务器，也**不会**向广告商出售或共享你的数据。

### 本地存储的数据

扩展可能**仅在你的设备上**保存：

| 数据 | 用途 | 存储位置 |
|------|------|----------|
| 编辑器偏好（主题、字体、缩进等） | 记住界面设置 | `chrome.storage` / `localStorage` |
| 生成选项（包名、TableName 等） | 记住转换器配置 | `chrome.storage` / `localStorage` |
| Markdown 草稿（可选会话缓存） | 恢复未完成输入 | `localStorage` |

可通过清除扩展站点数据、卸载扩展，或使用应用内清空/重置来删除上述数据。

### 我们不收集的内容

- **不会**将你的 DDL、JSON、Markdown、图片、音视频、密码、Token 等输入上传到我们的服务器。
- **不使用**分析 SDK、广告追踪或第三方追踪像素。
- **不需要**注册账号即可使用。

格式化、转换、预览、导出、哈希等处理均在**浏览器本地**完成。

### 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 在本地保存偏好与选项 |
| `clipboardWrite` | 在你点击「复制」时写入剪贴板 |
| `downloads` | 在你选择导出/下载时保存文件到本机 |

点击工具栏图标会打开扩展自身页面；扩展不申请读取浏览历史或任意网站内容的广泛权限。

### 第三方库

打包的开源库（如 CodeMirror、Marked、Mermaid、KaTeX、MediaInfo WASM 等）均在扩展内**本地运行**，不会将你的内容回传。

### 儿童隐私

本产品面向开发者，不针对 13 岁以下儿童。

### 政策变更

功能或权限变更时，我们可能更新本政策，并修订文首更新日期。继续使用即表示你接受更新后的政策。

### 联系方式

隐私相关问题请通过上方 GitHub 仓库提交 Issue。
