# DevKit Pro — Chrome Web Store 提交清单

你已完成：开发者账号注册。  
仓库已准备：隐私政策、商店文案、打包脚本。按下面在 Dashboard 操作即可。

## 1. 打 ZIP 包

在项目根目录执行：

```bash
bash scripts/pack-extension.sh
```

产物默认：`dist/DevKit-Pro-2.0.0.zip`  
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
| 隐私政策 URL | `https://github.com/egret135/DevKit-Pro/blob/main/docs/privacy-policy.md` |

## 4. Privacy practices（隐私问卷）

按 `store/listing.md` 中的权限说明与勾选建议填写。  
务必声明：内容本地处理、不上传服务器。

## 5. 截图建议（需你本地拍）

在扩展全屏打开后截取（Chrome 窗口或系统截图），建议至少 3 张：

1. **转换器**：DDL → Go Struct  
2. **Markdown**：预览含表格/公式或 Mermaid  
3. **工具箱或 JSON 工具**：任选一个代表性界面  

尺寸优先：1280×800 或 640×400。不要包含无关个人信息。

## 6. 提交审核

检查无报错后点 **提交审核**。首次审核常见数天～两周。  
邮件通知到开发者账号邮箱。

## 7. 以后更新

1. 修改 `manifest.json` 的 `version`（必须递增，如 `2.0.1`）  
2. `bash scripts/pack-extension.sh`  
3. 同一商品上传新包 → 提交审核  

---

## 我无法代你完成的部分

- 登录 Google 账号上传 ZIP  
- 在 Dashboard 点「提交审核」  
- 用本机 Chrome 拍官方要求的扩展截图（需你本机操作）

材料与 ZIP 脚本已在仓库就绪；隐私政策 push 到 `main` 后即可填上面的 GitHub URL。
