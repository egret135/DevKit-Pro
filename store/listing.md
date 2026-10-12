# Chrome Web Store 上架文案（复制到 Dashboard）

> 注意：Chrome 禁止在说明里堆砌关键词。短介绍写成一句自然话；详细介绍用完整句子，不要用逗号串一长串标签。

## 简短介绍 Short description（≤132 字符）

### 中文

在浏览器本地使用的开发者工作台，支持结构转换、文档预览和常用编码小工具，数据不离开本机。

### English（与 manifest.description 保持一致）

An offline workbench that helps developers convert schemas, preview Markdown, and handle common coding tasks locally.

---

## 详细介绍 Detailed description

### 中文

DevKit Pro 是一款在浏览器中本地运行的开发者工作台。你可以在同一界面里完成结构转换、文档预览和日常编码辅助，无需把内容上传到远端服务器。

主要功能包括：

把数据库表结构或 JSON 转成 Go 结构体与 Protocol Buffer 定义。  
对比两份 DDL，并生成可用的 ALTER 语句。  
实时预览 Markdown，支持图表与数学公式，也可导出图片或 PDF。  
格式化与对比 JSON，并提供时间戳、编解码、哈希、正则等常用小工具。  
在本地处理图片与音视频相关任务。

隐私说明：输入内容仅在本机处理。更多细节见隐私政策。  
开源地址：https://github.com/egret135/DevKit-Pro

### English

DevKit Pro is a developer workbench that runs entirely in your browser. It helps you convert data structures, preview documents, and finish everyday coding chores without sending your content to a remote server.

You can turn database schemas or JSON into Go structs and Protocol Buffer definitions.  
You can compare two DDL drafts and generate ALTER statements.  
You can preview Markdown with diagrams and math, then export images or PDF.  
You can format and compare JSON, and use small utilities such as timestamp conversion, encoding helpers, hashing, and regex testing.  
Image and media helpers also run locally on your device.

Privacy: your inputs stay on your device. See the privacy policy for details.  
Open source: https://github.com/egret135/DevKit-Pro

---

## 分类 Category

Developer Tools

## 语言 Language

- 主语言建议：中文（简体）或 English（按你的主要用户选择）
- 商店「简短介绍」务必用上面的自然句，不要再粘贴旧的关键词串

## 权限说明（Dashboard → Privacy practices / 单一用途说明）

**Single purpose（单一用途）：**
Provide an offline developer workbench for local schema conversion, document preview, and common coding utilities.

**Permission justifications：**

| Permission | Justification（可直接粘贴） |
|------------|------------------------------|
| storage | Store user preferences such as editor theme, font, and generator options on the device. |
| downloads | Save exported files (source code, images, PDF, media outputs) to the user’s computer when they choose Download/Export. |

**Data usage 勾选建议：**
- 不出售用户数据
- 不用于信用评判等无关目的
- 若问卷问到是否收集个人身份信息：一般选 **No**
- 用户内容是否离开设备：选 **No** / 仅本地处理
- 远程代码：选 **否**

## 隐私政策 URL

`https://cdn.jsdelivr.net/gh/egret135/DevKit-Pro@main/docs/privacy-policy.html`
