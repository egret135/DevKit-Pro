# DevKit Pro

一个强大的开发者工具集，支持 DDL/JSON 转 Go Struct、Markdown 预览与导出等功能。

![Extension Icon](icons/icon128.png)

## ✨ 特性

### 🔄 DDL/JSON 转换器
- **多数据库支持**：MySQL、PostgreSQL、SQLite DDL 自动识别；一次粘贴多张表、单行 DDL 均可
- **完整解析**：表级 `PRIMARY KEY`（含联合主键）、`UNIQUE` / `KEY` 索引、`CREATE INDEX`、`DEFAULT`、`COMMENT` 与 PostgreSQL `COMMENT ON`
- **三种输出**：Go Struct、Protocol Buffer（DDL 与 JSON 均可）、TypeScript interface
- **Go 生成选项**：
  - 可空字段：普通类型 / 指针 `*T` / `sql.Null*`
  - 标签：`json + gorm` / `json + db` / 仅 `json`，可选 `omitempty`
  - gorm 详细模式：`type`、`default`、`comment`、`index` / `uniqueIndex`
  - 命名遵循 Go 缩写规范（`user_id` → `UserID`）
  - 可选输出 `package` / `import` 头，导出时始终生成完整 `.go` 文件
- **JSON 类型推断**：合并数组内所有对象的字段（缺失字段标为可选），区分 `int64` / `float64`，识别 RFC3339 时间，相同结构自动复用，支持顶层数组
- **Protocol Buffer**：proto3，时间映射为 `google.protobuf.Timestamp`，DECIMAL 可映射为 `string`，可空字段可加 `optional`
- **注释保留**：DDL 中的表/字段注释自动转为代码注释
- **TableName 方法**：可选生成 GORM 的 TableName() 方法
- **结果导航**：输出多个结构时可一键跳转；转换失败时显示错误条并定位到出错行

### 🎨 极致的编辑体验
- **语法高亮**：基于 CodeMirror 5，支持 SQL、Go、Markdown、JSON 等多种语言
- **主题切换**：
  - 深色模式：Dracula (默认)、Material、Monokai
  - 浅色模式：Eclipse、Neo
- **字体选择**：JetBrains Mono、Fira Code、Source Code Pro

### 📝 Markdown 预览
- 实时 Markdown 渲染预览
- 编辑 / 分栏 / 预览三种视图，字数行数统计，编辑与预览同步滚动
- **Mermaid 图表支持**：流程图、时序图等
- **Mermaid 图表导出**：单独导出为 SVG/PNG
- **整页导出**：将整个预览内容导出为 PNG/JPG/SVG
- Typora 风格的渲染样式

### ⏱ 时间戳
- **Unix 时间戳转换**：秒 / 毫秒 ↔️ 日期时间，翻页时钟实时显示
- **多时区**：常用时区收藏、多时区对照与时区转换

### 🛠️ 开发者工具箱
集成常用开发工具，一站式解决日常需求：
- **Base64 编解码**：文本与 Base64 互转
- **URL 编解码**：URL 参数编码与解码
- **JWT 解析**：解析 JWT Token，显示 Header/Payload/过期状态
- **哈希计算**：MD5、SHA-1、SHA-256、SHA-512
- **ID 生成器**：批量生成 UUID v4、Snowflake ID、NanoID
- **密码生成器**：自定义长度与字符类型，批量生成安全密码
- **正则测试**：正则表达式匹配与替换测试
- **颜色工具**：HEX / RGB / HSL / HWB / OKLCH（含 Alpha）互转；WCAG 对比度、明暗阶梯与和谐色；屏幕取色与本地图片取色；最近颜色历史
- **Cron 解析**：Cron 表达式含义解析与下次执行时间预览
- **代码对比**：可编辑内联 Diff 视图，输入即对比；语法高亮（自动识别语言，可手动切换）、行内差异高亮，支持差异导航(↑/↓)与全屏

### 🖼️ 图片工具
- **图片 ⇄ Base64**：编码 / 解码两个标签页，批量编码（最多 20 张，单张 ≤ 20MB）；一键切换 Data URI / 纯 Base64 / CSS / HTML / Markdown 片段；SVG 可改用更短的 URL 编码；显示原始与编码后体积及膨胀比例，超过 100KB 提示不宜内联；解码端粘贴即解码，兼容纯 Base64、URL-safe、缺失填充与 `url("data:...")` 包装，按文件头识别真实类型并给出具体错误
- **格式转换**：PNG / JPEG / WebP / AVIF（浏览器支持时）/ ICO / BMP 互转，改参数即实时出结果并显示体积变化；转 JPEG/BMP 时透明区域可填充白/黑/自定义底色；按宽、按高或百分比缩放（可锁定比例），ICO 可选 16/32/48/256 多尺寸；批量最多 30 张，逐个下载或打包 ZIP，输出保留原文件名
- **图片压缩**：按质量或按目标体积（如 ≤ 200KB，自动二分查找最高可用质量，不够时可自动缩小尺寸）压缩；最大边长限制（3840 / 2560 / 1920 / 1280 / 自定义）；输出格式可选自动（在 WebP / AVIF / JPEG 中取最小，透明图不选 JPEG）、保持原格式或指定格式；不变大保护；拖动分割线对比压缩前后并支持 1:1 查看细节；批量最多 30 张，汇总节省体积，逐个下载或打包 ZIP
- **裁剪 / 缩放 / 水印**：左侧大画布、右侧裁剪 / 调整 / 水印 / 导出四个标签页；撤销重做（Ctrl+Z / Ctrl+Shift+Z）与操作步骤显示；裁剪支持自由、原始、1:1、4:3、16:9 等比例，三分线、8 个手柄、画布空白处重新框选与方向键微调；旋转 90° 与水平 / 垂直翻转；按像素、百分比或长边限制缩放，常用尺寸预设与插值质量选择；文字 / 图片水印实时预览，平铺（角度、间距可调）或单个（九宫格定位、画布上直接拖动），字体、粗体、描边、阴影；导出 PNG / JPEG / WebP / AVIF，自定义文件名、预估体积、复制到剪贴板；批量加水印（最多 50 张）并打包 ZIP
- **二维码**：生成 / 识别双标签；文本、URL、Wi‑Fi、名片模板；纠错等级、尺寸、前景/背景色、静区边距、模块圆角、中心 Logo（自动建议 H 纠错）；导出 PNG / SVG、复制图片；最近 10 条历史可点回；识别支持定位框、复制 / 打开链接 / 填入生成，大图先缩再识别
- **Favicon 生成**：左源图与选项、右预览与导出；尺寸包（标准 / Apple / Android maskable / 全套）可叠加；Contain / Cover、边距与透明或实色背景；标签栏与圆形 / 圆角方形预览；逐尺寸 PNG、多尺寸 `.ico`、ZIP（含 `site.webmanifest`）、可配路径前缀与 apple-touch / manifest / theme-color 片段
- **占位图生成**：左尺寸与样式、右预览与导出；预设（16:9 / 4:3 / 1:1 / 社媒 / 横幅）与锁比例；纯色 / 渐变 / 棋盘 / 斜纹；字号、粗体、对角线尺寸水印；PNG / JPEG / WebP 下载与复制图片；Data URI / HTML / Markdown / CSS 片段；批量宽度包 ZIP
- **图片 Diff**：上排 A / B 双卡，下排差异结果 + 设置；改参数即自动对比（Worker 防卡死）；对齐方式（以 A / 以 B / 适应画布），长边超过 4096 自动降采样；差异图 / 滑动对比 / 洋葱皮三视图；灵敏度预设、抗锯齿、差异色与底图透明度、仅差异蒙版；统计不匹配像素；下载差异 PNG、A|Diff|B 并排图、复制到剪贴板
- **EXIF 查看 / 清除**：左预览右元数据；相机 / 镜头 / 拍摄时间 / 曝光 / GPS 概览；字段分组与搜索；行内复制；导出 JSON / CSV / Markdown；GPS 隐私高亮与 OpenStreetMap 外链；按 Orientation 纠正预览；JPEG / PNG / WebP 尽量无损剥离元数据（需要纠正方向时烘焙像素），或重编码清除并显示体积变化；批量最多 30 张，打包 ZIP

### 🎬 音视频工具
- **录屏 / 录制**：左来源与画质、右预览舞台；屏幕/窗口或摄像头（可选设备）；麦克风 / 系统声与电平条；分辨率上限、帧率、码率；REC 计时与暂停蒙层；Space 暂停、Esc 停止；完成后回放与 WebM 下载、本页历史（最多 8 条）
- **视频截帧**：左视频与时间轴、右截帧导出；更换视频；步进（1 帧 / 0.1s / 1s / 5s）与 ←/→；缩放导出；PNG / JPEG / WebP；复制图片；多帧列表打包 ZIP
- **视频转 GIF**：左视频与导出区间、右参数与预览；双标时间轴 / 设为起终点 / 预览区间；帧率 · 宽度 · 质量；帧数预估与上限截断；确定进度与取消；下载 / 复制 / 大图预览
- **视频压缩**：左源视频预览、右参数与结果；分辨率 · 码率 · 帧率 · 音轨芯片；体积预估与增减提示；WebCodecs 本地转码 H.264/AAC MP4；确定进度与取消；下载
- **音频剪切**：通栏波形选区（拖把手 / 平移 / 点波形贴边）；试听播放头；起点归零 / 终点对齐全长；导出 WAV / MP3 与码率；体积预估与文件名
- **音频转换**：左源音频与迷你波形、右参数与试听；目标 WAV / MP3 与码率芯片；体积预估；分块进度；下载与文件名持久化
- **媒体信息**：左源文件与本地预览、右摘要芯片与分轨明细；轨道筛选 / 字段搜索；中文常用标签；复制摘要或 JSON；MediaInfo 沙箱本地解析

### 📄 配置文件转换
支持多种配置格式互相转换：
- JSON ↔️ YAML ↔️ TOML ↔️ XML
- 输入任意格式，一键转换为目标格式
- 也可转为 Go Struct、Protocol Buffer 或 TypeScript

### ✨ 自动格式化
- 粘贴或输入后自动美化代码
- 支持 JSON、SQL (MySQL/PostgreSQL/SQLite)
- 可配置缩进（2空格、4空格、Tab）
- 可选择触发时机（总是/仅粘贴时/从不）

## 🚀 安装

### Chrome 应用商店（推荐）

上架材料与提交流程见 [`store/PUBLISH.md`](store/PUBLISH.md)。本地打发布包：

```bash
bash scripts/pack-extension.sh
```

### Chrome / Edge（开发者模式）

1. 下载或克隆此仓库
2. 打开 `chrome://extensions/`
3. 开启右上角"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `DevKit-Pro` 目录

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `manifest.json` 文件

## 📖 使用方法

### 模式切换

点击顶部切换按钮在不同模式间切换：
- **转换器**：DDL/JSON 转 Go Struct / Protocol Buffer / TypeScript
- **Markdown**：预览与导出
- **时间戳**：Unix 时间戳转换与多时区
- **工具箱**：Base64、URL、JWT、哈希、ID生成、密码、正则、颜色、Cron、代码对比

### 编辑器设置

点击顶部的 ⚙️ 图标可以打开设置面板：
- **外观**：切换编辑器主题和字体
- **生成设置**：配置 Go Struct 的生成选项（包名、表名生成等）

### DDL 转换示例

**输入**（MySQL DDL）：
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
  username VARCHAR(100) NOT NULL COMMENT '用户名',
  create_time DATETIME COMMENT '创建时间'
);
```

**输出**：
```go
type Users struct {
    ID         int64     `json:"id" gorm:"column:id;primaryKey;autoIncrement"`  // 用户ID
    Username   string    `json:"username" gorm:"column:username;not null"`      // 用户名
    CreateTime time.Time `json:"create_time" gorm:"column:create_time"`         // 创建时间
}
```

### JSON 转 Protocol Buffer 示例

**输入**（JSON）：
```json
{
  "id": 1001,
  "username": "alice",
  "age": 28,
  "tags": ["vip", "verified"],
  "profile": {
    "avatar": "https://example.com/avatar.png",
    "bio": "Software Engineer"
  }
}
```

**输出**（独立声明模式）：
```protobuf
syntax = "proto3";

package model;

// Profile message
message Profile {
  string avatar = 1;
  string bio    = 2;
}

// User message
message User {
  int32            id       = 1;
  string           username = 2;
  int32            age      = 3;
  repeated string  tags     = 4;
  Profile          profile  = 5;
}
```

### Markdown 预览与导出

1. 切换到 **Markdown** 模式
2. 在左侧输入 Markdown 文本
3. 右侧实时预览渲染效果
4. 点击 **导出图片** 按钮选择格式（PNG/JPG/SVG）

支持 Mermaid 图表：
```markdown
\`\`\`mermaid
flowchart TD
    A[开始] --> B[处理]
    B --> C[结束]
\`\`\`
```

### ⛶ 全屏模式
- **应用全屏**：点击顶部全屏按钮，整个页面进入浏览器全屏
- **代码对比全屏**：代码对比工具栏内置独立全屏按钮
- 按 `Esc` 退出全屏

## ⌨️ 快捷键

- `Cmd/Ctrl + Enter`：转换
- `Cmd/Ctrl + K`：清除
- `Esc`：关闭设置弹窗 / 退出全屏

## 🛠️ 技术栈

- Vanilla JavaScript
- [CodeMirror 5](https://codemirror.net/5/) - 代码编辑器
- [Marked.js](https://marked.js.org/) - Markdown 解析
- [Mermaid.js](https://mermaid.js.org/) - 图表渲染
- [html2canvas](https://html2canvas.hertzen.com/) - 图片导出
- [Prism.js](https://prismjs.com/) - 代码高亮
- [Prettier](https://prettier.io/) - 代码格式化
- Manifest V3

## 📁 项目结构

```
devkit-pro/
├── index.html              # 主界面
├── app.js                  # 应用调度器 (共享状态、模式切换、设置)
├── style.css               # 样式
├── manifest.json           # 扩展配置
├── controllers/            # 功能控制器 (DevKit 命名空间)
│   ├── converter-controller.js   # DDL/JSON 转换逻辑
│   └── markdown-controller.js    # Markdown 预览/导出逻辑
├── lib/                    # 第三方库
│   ├── codemirror/         # 编辑器核心及模式
│   ├── marked.min.js
│   ├── mermaid.min.js
│   ├── html2canvas.min.js
│   ├── sql-formatter.min.js
│   ├── js-yaml.min.js
│   ├── toml.min.js
│   └── fast-xml-parser.min.js
├── parsers/                # 解析器
│   ├── detector.js
│   ├── mysql-parser.js
│   ├── postgresql-parser.js
│   ├── sqlite-parser.js
│   ├── json-parser.js
│   ├── protobuf-parser.js
│   ├── yaml-parser.js
│   ├── toml-parser.js
│   ├── xml-parser.js
│   └── markdown-renderer.js
├── generators/
│   ├── struct-generator.js
│   ├── protobuf-generator.js
│   └── config-generator.js
├── utils/
│   ├── editor-manager.js   # 编辑器管理
│   ├── type-mapper.js
│   ├── protobuf-type-mapper.js
│   ├── formatter.js
│   ├── exporter.js
│   ├── chart-exporter.js
│   ├── markdown-exporter.js
│   ├── auto-formatter.js
│   ├── code-block-enhancer.js
│   ├── markdown-code-formatter.js
│   └── image-lightbox.js
├── tools/
│   └── toolbox.js          # 开发者工具箱
└── config/
    └── settings.js
```

## 📄 许可证

MIT License

---

**开发者**: 白鹭 & Google Antigravity  
**仓库**: https://github.com/egret135/DevKit-Pro
