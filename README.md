# DevKit Pro

一个强大的开发者工具集，支持 DDL/JSON 转 Go Struct、DDL 差异对比、Markdown 预览与导出等功能。

![Extension Icon](icons/icon128.png)

## ✨ 特性

### 🔄 DDL/JSON 转换器
- **多数据库支持**：MySQL、PostgreSQL、SQLite DDL 自动识别
- **JSON 转 Go Struct**：支持嵌套对象的 JSON 转 Go struct
- **JSON 转 Protocol Buffer**：支持 JSON 转 .proto 文件 message 定义
  - 智能类型映射（数值类型默认int32、浮点数默认float）
  - 灵活嵌套模式（嵌套或独立声明message）
  - 自动字段编号
  - Proto3语法
- **智能标签**：自动生成 `json` 和 `gorm` 标签
- **注释保留**：DDL 中的 COMMENT 自动转为行内注释
- **TableName 方法**：自动生成 GORM 的 TableName() 方法

### 🎨 极致的编辑体验
- **语法高亮**：基于 CodeMirror 5，支持 SQL、Go、Markdown、JSON 等多种语言
- **主题切换**：
  - 深色模式：Dracula (默认)、Material、Monokai
  - 浅色模式：Eclipse、Neo
- **字体选择**：JetBrains Mono、Fira Code、Source Code Pro

### ⚖️ DDL 差异对比
- 对比新旧 DDL 差异
- 自动生成 ALTER TABLE 语句
- 支持列新增、修改、删除检测

### 📝 Markdown 预览
- 实时 Markdown 渲染预览
- **Mermaid 图表支持**：流程图、时序图等
- **Mermaid 图表导出**：单独导出为 SVG/PNG
- **整页导出**：将整个预览内容导出为 PNG/JPG/SVG
- Typora 风格的渲染样式

### 🛠️ 开发者工具箱
集成常用开发工具，一站式解决日常需求：
- **时间戳转换**：Unix 时间戳 (秒/毫秒) ↔️ 日期时间，翻页时钟实时显示
- **Base64 编解码**：文本与 Base64 互转
- **URL 编解码**：URL 参数编码与解码
- **JWT 解析**：解析 JWT Token，显示 Header/Payload/过期状态
- **哈希计算**：MD5、SHA-1、SHA-256、SHA-512
- **ID 生成器**：批量生成 UUID v4、Snowflake ID、NanoID
- **密码生成器**：自定义长度与字符类型，批量生成安全密码
- **正则测试**：正则表达式匹配与替换测试
- **JSON Diff**：两段 JSON 结构化差异对比
- **颜色转换**：HEX / RGB / HSL 颜色格式互转
- **Cron 解析**：Cron 表达式含义解析与下次执行时间预览
- **代码对比**：可编辑内联 Diff 视图，输入即对比，支持差异导航(↑/↓)与全屏

### 📄 配置文件转换
支持多种配置格式互相转换：
- JSON ↔️ YAML ↔️ TOML ↔️ XML
- 输入任意格式，一键转换为目标格式
- 也可转为 Go Struct 或 Protocol Buffer

### ✨ 自动格式化
- 粘贴或输入后自动美化代码
- 支持 JSON、SQL (MySQL/PostgreSQL/SQLite)
- 可配置缩进（2空格、4空格、Tab）
- 可选择触发时机（总是/仅粘贴时/从不）

## 🚀 安装

### Chrome / Edge

1. 下载或克隆此仓库
2. 打开 `chrome://extensions/`
3. 开启右上角"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `devkit-pro` 目录

### Firefox

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时加载附加组件"
3. 选择 `manifest.json` 文件

## 📖 使用方法

### 模式切换

点击顶部切换按钮在四种模式间切换：
- **转换器**：DDL/JSON 转 Go Struct / Protocol Buffer
- **DDL 对比**：生成 ALTER 语句
- **Markdown**：预览与导出
- **工具箱**：时间戳、Base64、URL、JWT、哈希、ID生成、密码、正则、JSON Diff、颜色、Cron、代码对比

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
│   ├── diff-controller.js        # DDL 差异对比逻辑
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
│   ├── config-generator.js
│   └── diff-engine.js
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
