# 每日内容推荐 QQ Bot

一个使用 TypeScript + 腾讯云 SCF 的轻量 QQ 官方机器人。

机器人从 GitHub Raw 读取 `YYYY-MM-DD.md` 内容，在工作日 08:00、周末 10:00（北京时间）向配置的 QQ 群推送，并支持：

```text
/今日谜题
/历史谜题 YYYY-MM-DD
/历史谜题 YYYYMMDD
/历史谜题 MMDD（自动使用当前年份）
```

## 配置

线上和本地工具统一使用以下五个业务变量：

```env
CONTENT_BASE_URL=https://raw.githubusercontent.com/user/repo/main/content
GROUP_IDS=group_openid_1,group_openid_2
QQ_BOT_APP_ID=
QQ_BOT_APP_SECRET=
ADMIN_OPENID=
```

内容文件示例：

```md
---
type: puzzle
source: https://example.com/problem
---

Markdown 正文
```

支持的 `type`：`puzzle`、`knowledge`、`story`。谜题必须填写 `source`。

## 本地命令

```bash
npm install
npm test
npm run typecheck
npm run setup:menu
npm run debug:ws
```

`setup:menu` 配置 QQ 菜单和群组面板；`debug:ws` 只监听并打印 WebSocket Event，不执行机器人业务。

### 开启本地工具

先在项目根目录创建 `.env`，并填写 QQ Bot 的 AppID 和 AppSecret：

```bash
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

然后在 QQ Bot 管理后台将事件接收模式切换为 WebSocket，并启动调试监听器：

```bash
npm run debug:ws
```

让机器人在目标群中接收一条消息，终端会打印 `userOpenid` 和 `groupOpenid`。将目标群的 `groupOpenid` 填入 `.env` 的 `GROUP_IDS`，多个群用逗号分隔：

```env
GROUP_IDS=group_openid_1,group_openid_2
```

停止调试监听器后，运行下面的命令配置 QQ 菜单和群组面板：

```bash
npm run setup:menu
```

菜单配置完成后即可再次运行 `npm run debug:ws`；本地工具不会启动完整机器人业务，生产运行仍使用 SCF ZIP。

## 构建 SCF ZIP

执行：

```bash
npm run build:scf
```

生成：

```text
dist-scf/qqbot-scf.zip
```

该 ZIP 可以直接上传到腾讯云 SCF。函数 Handler 使用：

```text
index.main_handler
```

函数类型选择事件函数，并配置 Function URL 与两个 Timer Trigger。Function URL 使用公开访问，QQ WebHook 签名由应用校验。

## 目录边界

```text
src/       业务逻辑、内容读取、QQ 适配和 WebHook 验签
scf/       腾讯云 SCF 入口
scripts/   本地菜单、WebSocket 调试和构建脚本
test/      单元测试与入口测试
```
