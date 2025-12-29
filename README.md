# DevKit Pro

一个强大的开发者工具集，支持 DDL/JSON 转 Go Struct、DDL 差异对比、Markdown 预览与导出等功能。

![Extension Icon](icons/icon128.png)

## ✨ 特性

### 🔄 DDL/JSON 转换器
- **多数据库支持**：MySQL、PostgreSQL、SQLite DDL 自动识别
- **JSON 转换**：支持嵌套对象的 JSON 转 Go struct
- **智能标签**：自动生成 `json` 和 `gorm` 标签
- **注释保留**：DDL 中的 COMMENT 自动转为行内注释
- **TableName 方法**：自动生成 GORM 的 TableName() 方法

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

点击顶部切换按钮在三种模式间切换：
- **转换器**：DDL/JSON 转 Go Struct
- **DDL 对比**：生成 ALTER 语句
- **Markdown**：预览与导出

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

## ⌨️ 快捷键

- `Cmd/Ctrl + Enter`：转换
- `Cmd/Ctrl + K`：清除
- `Esc`：关闭设置弹窗

## 🛠️ 技术栈

- Vanilla JavaScript
- [Marked.js](https://marked.js.org/) - Markdown 解析
- [Mermaid.js](https://mermaid.js.org/) - 图表渲染
- [html2canvas](https://html2canvas.hertzen.com/) - 图片导出
- Manifest V3

## 📁 项目结构

```
devkit-pro/
├── index.html              # 主界面
├── app.js                  # 主逻辑
├── style.css               # 样式
├── lib/                    # 第三方库
│   ├── marked.min.js
│   ├── mermaid.min.js
│   └── html2canvas.min.js
├── parsers/                # 解析器
│   ├── detector.js
│   ├── mysql-parser.js
│   ├── postgresql-parser.js
│   ├── sqlite-parser.js
│   ├── json-parser.js
│   └── markdown-renderer.js
├── generators/
│   ├── struct-generator.js
│   └── diff-engine.js
├── utils/
│   ├── type-mapper.js
│   ├── formatter.js
│   ├── exporter.js
│   ├── chart-exporter.js
│   └── markdown-exporter.js
└── config/
    └── settings.js
```

## 📄 许可证

MIT License

---

**开发者**: 白鹭 & Google Antigravity  
**仓库**: https://github.com/yourusername/devkit-pro
