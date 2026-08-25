# 每日内容推荐 QQ Bot — PRD

## 1. 项目概述

开发一个使用 **TypeScript + 腾讯云 SCF** 的轻量 QQ 官方机器人后端。

机器人每天从公开 GitHub 仓库读取按日期组织的 Markdown 内容，并向预设 QQ 群定时推送。

同时提供两个用户命令：

* `/今日谜题`
* `/历史谜题`

项目追求：

* 轻量
* 简洁
* 高复用
* 少依赖
* QQ 平台逻辑与业务逻辑解耦
* 本地调试方便
* 不引入数据库等不必要基础设施

---

# 2. 总体架构

系统分为三部分：

```text
                    GitHub Raw
                        │
                        │
                ┌───────▼────────┐
                │   Core Logic   │
                │                │
                │ ContentService │
                │ MessageBuilder │
                │ CommandService │
                │ DailyService   │
                └───────┬────────┘
                        │
                 ┌──────▼──────┐
                 │ QQ Adapter  │
                 │             │
                 │ Auth        │
                 │ API         │
                 │ WebHook     │
                 └──────┬──────┘
                        │
            ┌───────────┴───────────┐
            │                       │
      Tencent SCF               Local Scripts
            │                       │
      WebHook + Timer       Menu Setup / WS Debug
```

核心原则：

> Core Logic 不感知 SCF，不感知 WebHook，也不感知 WebSocket。

QQ Adapter 负责所有 QQ 平台相关逻辑。

SCF 和本地脚本只是不同的运行入口。

---

# 3. 部署架构

线上只部署一个 SCF 项目。

MVP 使用一个 SCF 事件函数，同时配置：

* Function URL：接收 QQ WebHook
* Timer Trigger：执行每日任务

不引入 API Gateway、消息队列或数据库。

Function URL 使用公开访问，安全校验由 QQ WebHook 的签名验证完成。

主要承担两类任务：

### HTTP / WebHook

QQ：

```text
QQ Server
    │
    ▼
SCF Function URL
    │
    ▼
QQ WebHook Adapter
    │
    ▼
Command Service
```

负责：

* QQ WebHook 验证
* QQ 事件接收
* `/今日谜题`
* `/历史谜题`
* 菜单点击发送的文本命令

普通事件使用 QQ WebHook 成功 ACK：

```json
{"op":12,"d":0}
```

回调地址校验 `op=13` 使用专用的 `plain_token + signature` 响应。

Webhook 普通事件在同一次 SCF 调用内完成轻量业务后返回成功 ACK。不得依赖响应返回后的裸 Promise，也不引入 SCF 自调用、独立消息队列或第二个函数。

### Timer

腾讯云定时触发器：

```text
SCF Timer
   │
   ▼
Daily Service
   │
   ├── GitHub Raw
   │
   ├── GROUP_IDS
   │
   └── QQ API
```

负责每日群消息推送以及库存检查。

---

# 4. 时间规则

业务时区固定：

```text
Asia/Shanghai
```

不允许直接依赖 SCF 运行环境的系统日期。

所有以下逻辑都必须显式按照 `Asia/Shanghai` 计算：

* 今天日期
* 星期几
* 历史/未来日期判断
* GitHub Markdown 文件名
* 未来七天库存

不增加 `TZ` 环境变量。

---

# 5. 定时推送

目标时间均为北京时间：

| 日期    | 推送时间  |
| ----- | ----- |
| 周一～周五 | 08:00 |
| 周六、周日 | 10:00 |

推荐创建两个 SCF Timer Trigger。

两个 Trigger 分别覆盖工作日与周末。部署时按照 SCF 控制台实际使用的时区配置 Cron；如果按 UTC 解释，则换算为 UTC 时间后配置。

Timer 的业务日期以函数执行时按照 `Asia/Shanghai` 计算的日期为准，不使用 Timer 事件中的创建时间字段。

业务代码自身仍然统一使用 `Asia/Shanghai`。

---

# 6. 内容来源

内容来自公开 GitHub 仓库。

通过：

```text
CONTENT_BASE_URL
```

直接读取 GitHub Raw 文件。

例如：

```text
CONTENT_BASE_URL=https://raw.githubusercontent.com/user/repo/main/content
```

当天：

```text
2026-08-25
```

对应：

```text
${CONTENT_BASE_URL}/2026-08-25.md
```

不使用 GitHub API。

不 clone 仓库。

不需要 GitHub Token。

---

# 7. Markdown 文件格式

文件使用：

```text
YYYY-MM-DD.md
```

例如：

```text
2026-08-25.md
2026-08-26.md
2026-08-27.md
```

Markdown 顶部使用 YAML Front Matter。

谜题：

```md
---
type: puzzle
source: https://example.com/problem
---

这里是正文。
```

知识：

```md
---
type: knowledge
---

这里是正文。
```

故事：

```md
---
type: story
---

这里是正文。
```

---

# 8. Front Matter 定义

只定义两个字段。

## type

必填。

允许：

```text
puzzle
knowledge
story
```

对应：

| type      | 展示标题 |
| --------- | ---- |
| puzzle    | 今日谜题 |
| knowledge | 今日知识 |
| story     | 今日故事 |

其他值均视为内容配置错误。

## source

仅：

```text
type: puzzle
```

时必填。

knowledge 和 story 不要求 `source`。

如果 puzzle 缺少 source，则该文件视为无效内容。

---

# 9. 内容模型

Core 层统一解析成：

```ts
type ContentType = "puzzle" | "knowledge" | "story";

interface DailyContent {
  date: string;
  type: ContentType;
  source?: string;
  body: string;
}
```

`body` 必须保持原 Markdown 正文。

Front Matter 不包含在正文中。

---

# 10. Markdown 处理原则

第一版尽可能：

> 原封不动向 QQ Markdown 传递正文。

不主动：

* 转换标题
* 转换列表
* 修改代码块
* 修改链接
* 修改 Markdown 排版

QQ Markdown 兼容问题后续再处理。

为了便于未来增加转换逻辑，业务层仍然保留：

```text
Markdown正文
        │
        ▼
MessageBuilder
        │
        ▼
QQ Adapter
```

而不是让 GitHub 内容直接进入 QQ API。

---

# 11. 每日消息模板

统一结构：

```text
【今日XX】

正文

结尾
```

---

## 11.1 今日谜题

```text
【今日谜题】

{Markdown正文}

欢迎各位尝试实现，有任何疑问欢迎提问！

原题链接：{source}
```

---

## 11.2 今日知识

```text
【今日知识】

{Markdown正文}
```

无固定结尾。

---

## 11.3 今日故事

```text
【今日故事】

{Markdown正文}
```

无固定结尾。

---

# 12. 每日群推送

Timer Trigger 被触发后：

```text
获取北京时间今天日期
        │
        ▼
读取 YYYY-MM-DD.md
        │
        ├── 不存在 ──→ 跳过群推送
        │
        ▼
解析 Front Matter
        │
        ▼
校验内容
        │
        ▼
生成 QQ Markdown
        │
        ▼
遍历 GROUP_IDS
        │
        ▼
发送
```

只发送群聊。

每日推送使用 QQ 群主动消息 API，不携带用户消息的 `msg_id`。

不向普通用户发送每日私聊。

不 @ 全体成员。

---

# 13. GROUP_IDS

群 ID 不使用数据库。

统一放在：

```text
GROUP_IDS
```

环境变量。

建议格式：

```text
group_openid_1,group_openid_2,group_openid_3
```

程序启动时：

```ts
GROUP_IDS.split(",")
```

并执行：

* trim
* 去除空字符串

即可。

不引入额外配置系统。

---

# 14. 群发送容错

多个群的发送必须彼此独立。

例如：

```text
群 A → 成功
群 B → 失败
群 C → 成功
```

群 B 失败不能阻止群 C。

失败只记录日志。

第一版不实现：

* 消息队列
* 数据库重试记录
* 持久化任务系统

---

# 15. 内容库存检查

每日 Timer Trigger 执行时，同时进行内容库存检查。

该检查与“今天有没有内容”相互独立。

即使今天：

```text
YYYY-MM-DD.md
```

不存在，仍然执行库存检查。

---

# 16. 未来七天定义

检查：

```text
明天
~
今天 + 7天
```

共七个日期。

例如今天：

```text
2026-08-25
```

检查：

```text
2026-08-26
2026-08-27
2026-08-28
2026-08-29
2026-08-30
2026-08-31
2026-09-01
```

---

# 17. 有效库存定义

只有满足以下条件才计为一份库存：

1. Markdown 文件存在
2. Front Matter 可以正常解析
3. type 合法
4. 如果 type=puzzle，则 source 存在

因此：

```text
HTTP 200
```

但 YAML 写错的文件不能算有效库存。

如果 GitHub 请求本身失败，则记录错误并跳过本次库存判断，不把网络故障误判为内容缺失。

---

# 18. 库存不足提醒

如果未来七天：

```text
有效内容数量 < 7
```

则私聊：

```text
ADMIN_OPENID
```

发送管理员警告。

管理员警告使用 QQ C2C 主动消息 API，不依赖收到用户消息时的 `msg_id`。

建议内容：

```text
【每日内容机器人提醒】

未来 7 天仅准备了 {count}/7 份内容。

缺少日期：
2026-08-29
2026-08-31

请及时补充 GitHub 内容。
```

每天检查。

如果连续多天库存不足，可以每天提醒。

第一版不做提醒去重。

---

# 19. `/今日谜题`

命令：

```text
/今日谜题
```

支持两种入口：

```text
用户输入 /今日谜题
```

以及：

```text
QQ 菜单 / 按钮触发
```

QQ Adapter 将不同 QQ 事件统一转换成：

```ts
Command.TodayPuzzle
```

Core 层不关心命令来自文字、菜单还是按钮。

---

# 20. `/今日谜题` — 当天是谜题

如果：

```text
type = puzzle
```

则与每日推送格式完全一致：

```text
【今日谜题】

{正文}

欢迎各位尝试实现，有任何疑问欢迎提问！

原题链接：{source}
```

---

# 21. `/今日谜题` — 当天不是谜题

例如今天是：

```text
type = knowledge
```

仍然返回今天真正的内容：

```text
【今日知识】

{正文}

今天没有谜题，休息一下吧
```

如果今天是 story：

```text
【今日故事】

{正文}

今天没有谜题，休息一下吧
```

即：

> `/今日谜题` 并不会寻找最近一道谜题。

它永远读取今天的内容。

---

# 22. `/今日谜题` — 今天没有内容

如果当天 Markdown 文件不存在，则返回：

```text
今天没有内容，休息一下吧。
```

而不是无响应。

---

# 23. `/历史谜题`

格式：

```text
/历史谜题 YYYY-MM-DD
```

例如：

```text
/历史谜题 2026-08-20
```

---

# 24. `/历史谜题` 无参数

如果用户只发送：

```text
/历史谜题
```

返回使用方法：

```text
使用方法：

/历史谜题 YYYY-MM-DD

例如：
/历史谜题 2026-08-20
```

---

# 25. 日期校验

只接受：

```text
YYYY-MM-DD
```

必须是真实日期。

例如以下均非法：

```text
2026-8-2
abc
2026-02-31
```

返回简短格式错误提示以及正确用法。

---

# 26. 禁止查看未来内容

比较日期时统一按照北京时间。

如果：

```text
请求日期 > 今天
```

则拒绝请求。

即使对应 Markdown 已经存在，也不能返回。

例如：

今天：

```text
2026-08-25
```

请求：

```text
/历史谜题 2026-08-26
```

必须拒绝。

建议返回：

```text
未来的谜题还不能偷看哦。
```

---

# 27. 历史日期没有文件

如果：

```text
YYYY-MM-DD.md
```

不存在：

```text
这一天没有内容。
```

---

# 28. 历史日期不是谜题

如果文件存在，但：

```text
type = knowledge
```

或：

```text
type = story
```

则不返回正文。

返回：

```text
这一天没有谜题。
```

`/历史谜题` 只用于查看真正的历史 puzzle。

---

# 29. 历史谜题消息格式

如果：

```text
type = puzzle
```

使用同一个 Puzzle Message Builder。

因此：

```text
定时推送谜题
/今日谜题
/历史谜题
```

三处禁止分别拼字符串。

统一：

```ts
buildPuzzleMessage(content)
```

确保格式永远一致。

---

# 30. QQ Adapter

QQ 平台相关代码全部位于 Adapter 层。

负责：

* Access Token 获取与缓存
* QQ API 调用
* WebHook 验证
* WebHook 签名验证
* QQ WebHook Event 解析
* 群消息发送
* C2C 私聊发送
* Markdown 消息发送
* QQ 事件转换为文本命令
* QQ API 错误统一处理

第一版直接使用 QQ Bot API：

```text
Access Token：https://bots.qq.com/app/getAppAccessToken
OpenAPI：     https://api.sgroup.qq.com
群消息：      /v2/groups/{group_openid}/messages
C2C 消息：    /v2/users/{openid}/messages
```

命令被动回复携带收到的 `msg_id`；定时群推送和管理员提醒不携带 `msg_id`。

Core 层禁止出现：

```text
group_openid
msg_id
interaction
QQ HTTP endpoint
AccessToken
```

等 QQ 平台实现细节。

---

# 31. SCF WebHook 入口

SCF HTTP 入口只负责：

```text
HTTP Request
      │
      ▼
QQ WebHook Adapter
      │
      ▼
Normalized Event
      │
      ▼
Command Service
```

入口行为：

* 验证 QQ WebHook 签名
* 处理 `op=13` 回调地址校验
* 将普通 QQ 事件转换为内部事件
* 处理事件并返回 `{"op":12,"d":0}` 成功 ACK
* 验签失败返回 HTTP 401

具体命令逻辑、内容读取和消息构建不写在 SCF Handler 中。

不得直接在 SCF Handler 中：

* 拼消息
* fetch GitHub
* 判断 type
* 判断日期
* 编写命令逻辑

SCF Handler 应尽可能薄。

---

# 32. SCF Timer 入口

Timer Handler 同样只负责：

```ts
await dailyService.run();
```

具体：

* 日期
* GitHub
* 消息构建
* 群发送
* 库存检查
* 管理员通知

全部由业务层完成。

Timer 任务执行完毕后返回成功结果。第一版不实现持久化重试和任务去重。

---

# 33. 环境变量

整个项目只允许配置以下五个业务环境变量：

```text
CONTENT_BASE_URL
GROUP_IDS
QQ_BOT_APP_ID
QQ_BOT_APP_SECRET
ADMIN_OPENID
```

不增加：

```text
CLIENT_SECRET
QQ_CLIENT_SECRET
GITHUB_TOKEN
TZ
DATABASE_URL
```

等配置。

---

# 34. 环境变量职责

### CONTENT_BASE_URL

GitHub Raw 内容目录。

### GROUP_IDS

所有需要每日推送的 QQ 群 OpenID。

### QQ_BOT_APP_ID

QQ Bot AppID。

### QQ_BOT_APP_SECRET

QQ Bot AppSecret。

### ADMIN_OPENID

管理员 C2C OpenID。

用于内容库存不足提醒。

---

# 35. 本地 `.env`

两个本地工具脚本都读取项目根目录：

```text
.env
```

字段与生产环境完全一致：

```env
CONTENT_BASE_URL=
GROUP_IDS=
QQ_BOT_APP_ID=
QQ_BOT_APP_SECRET=
ADMIN_OPENID=
```

不设计单独的调试配置格式。

---

# 36. 本地工具一：群组菜单设置脚本

提供：

```text
scripts/setup-menu.ts
```

用途：

配置 QQ Bot 群组菜单 / Panel。

该脚本：

* 仅本地运行
* 不部署到 SCF
* 读取 `.env`
* 获取 QQ Access Token
* 调用 QQ Bot 菜单相关 API
* 打印请求结果
* 成功后退出

它是：

> 一次性配置工具。

不是后台服务。

---

# 37. 菜单内容

第一版菜单只围绕两个命令：

```text
今日谜题
历史谜题
```

对应业务命令：

```text
/今日谜题
/历史谜题
```

菜单点击本质上发送对应的命令文本；QQ Adapter 负责把菜单发送的命令与用户手工输入的命令统一交给 Command Service。

第一版不单独设计复杂的 Interaction 领域模型。

业务层统一得到：

```ts
TodayPuzzle
HistoryPuzzle
```

---

# 38. Menu Script 与线上代码复用

`setup-menu.ts` 不重复实现 QQ 鉴权。

必须复用：

```text
QQ Auth
QQ API Client
QQ Types
```

例如：

```text
scripts/setup-menu.ts
        │
        ▼
src/qq/client.ts
```

而不是创建第二套 QQ API 实现。

---

# 39. 本地工具二：WebSocket 调试监听器

提供：

```text
scripts/debug-ws.ts
```

用途：

> 在开发阶段获取真实 QQ WebSocket Event，并方便查看用户、群组和消息 ID。

使用前开发者在 QQ Bot 后台将事件接收模式切换到 WebSocket。

此切换操作由开发者完成。

脚本本身不负责修改 Bot 接入模式。

---

# 40. WebSocket 调试器职责

脚本只负责：

```text
连接 QQ WebSocket
        │
        ▼
鉴权
        │
        ▼
订阅必要事件
        │
        ▼
保持 heartbeat
        │
        ▼
接收事件
        │
        ▼
打印日志
```

---

# 41. WebSocket 调试器禁止承担业务

该脚本不：

* 回复消息
* 调用 DailyService
* 执行 `/今日谜题`
* 执行 `/历史谜题`
* 推送群消息
* 修改菜单
* 访问 GitHub 内容
* 保存任何数据

它只是：

> QQ Event Inspector。

---

# 42. WebSocket 日志

收到事件时至少打印：

```text
时间
事件类型
消息内容
message id
用户 openid
群 group_openid
原始事件
```

能够获取则打印。

目标是方便开发者快速确认：

```text
这个群的 ID 是什么？
这个人的 OpenID 是什么？
QQ 实际发来了什么事件？
按钮点击事件长什么样？
```

---

# 43. WebSocket 调试体验

推荐：

```bash
npm run debug:ws
```

启动。

退出：

```text
Ctrl+C
```

断线应进行简单重连。

但不需要实现生产级：

* 高可用
* Session 持久化
* 分布式 Sharding
* 长期运行监控

因为它只是开发工具。

---

# 44. 菜单设置体验

推荐：

```bash
npm run setup:menu
```

执行一次即可。

菜单需要修改时再次运行。

---

# 45. 推荐项目结构

```text
project/
│
├── src/
│   │
│   ├── core/
│   │   ├── content.ts
│   │   ├── content-source.ts
│   │   ├── message-builder.ts
│   │   ├── command-service.ts
│   │   ├── daily-service.ts
│   │   └── date.ts
│   │
│   ├── qq/
│   │   ├── auth.ts
│   │   ├── client.ts
│   │   ├── webhook.ts
│   │   ├── sender.ts
│   │   ├── commands.ts
│   │   └── types.ts
│   │
│   ├── config.ts
│   └── ...
│
├── scf/
│   └── index.ts
│
├── scripts/
│   ├── setup-menu.ts
│   └── debug-ws.ts
│
├── package.json
├── tsconfig.json
└── .env.example
```

不要求严格按照此目录命名。

核心要求是：

```text
Core
QQ Adapter
SCF Entry
Local Scripts
```

边界清晰。

---

# 46. SCF 构建产物

提供一条命令生成可以直接上传到腾讯云 SCF 的 ZIP：

```bash
npm run build:scf
```

输出：

```text
dist-scf/qqbot-scf.zip
```

ZIP 根目录至少包含：

```text
index.js
```

SCF Handler 配置为：

```text
index.main_handler
```

构建命令负责 TypeScript 打包和 ZIP 生成；不要求额外手动整理部署目录。

生产 ZIP 只包含：

```text
index.js
```

以及打包所需的必要运行时代码。

明确排除：

```text
scripts/setup-menu.ts
scripts/debug-ws.ts
.env
```

本地辅助脚本不得进入 SCF 部署包。

SCF 运行时固定使用 Node.js 20.19，构建 target 使用 `node20`。

---

# 47. GitHub 内容读取抽象

Core 不直接写死 GitHub URL 拼接。

定义类似：

```ts
interface ContentSource {
  get(date: string): Promise<DailyContent | null>;
}
```

文件不存在或文件内容无效时返回 `null`；GitHub 网络请求失败时抛出错误，由调用方记录日志并结束本次对应处理。

第一版实现：

```text
RawGitHubContentSource
```

这样以后即使内容迁移到：

* COS
* R2
* 自建服务器
* 本地文件

业务逻辑也无需修改。

---

# 48. QQ 消息发送抽象

业务层只需要：

```ts
interface BotMessenger {
  sendGroup(
    groupId: string,
    message: Message,
    options?: { replyToMsgId?: string },
  ): Promise<void>;
  sendUser(userId: string, message: Message): Promise<void>;
}
```

带 `replyToMsgId` 时表示命令的被动回复；不带时表示定时任务的主动群消息。管理员库存提醒使用主动 C2C 消息。

QQ Adapter 实现：

```text
QQMessenger
```

DailyService 不直接知道 QQ API Endpoint。

---

# 49. MessageBuilder

所有消息模板集中管理。

例如：

```text
buildDailyMessage()
buildPuzzleMessage()
buildNoPuzzleDailyMessage()
buildInventoryWarning()
```

禁止模板字符串散落在：

* WebHook Handler
* Timer Handler
* QQ Client
* Script

中。

---

# 50. 错误处理

## GitHub 文件不存在

`404`

视为：

```text
ContentNotFound
```

不是系统错误。

## GitHub 网络错误

记录 error 日志。

本次内容处理失败。

## YAML 错误

记录：

```text
日期
错误原因
```

该文件视为无效内容。

## QQ 单群发送失败

记录：

```text
group_openid
status
response
```

继续处理其他群。

## 管理员消息失败

只记录日志。

不继续重试。

GitHub 网络错误不会被当作内容缺失，也不会触发库存不足提醒。

---

# 51. 日志原则

SCF 使用 stdout / stderr。

至少区分：

```text
INFO
WARN
ERROR
```

重要日志示例：

```text
[INFO] Daily push started: 2026-08-25
[INFO] Loaded content: puzzle
[INFO] Group message sent: xxx
[ERROR] Group message failed: xxx
[WARN] Content inventory: 5/7
[INFO] Admin warning sent
```

禁止日志输出：

```text
QQ_BOT_APP_SECRET
Access Token 完整值
```

---

# 52. 不使用持久化存储

第一版不使用：

* MySQL
* PostgreSQL
* Redis
* D1
* KV
* COS 数据库存储
* 本地持久化

GitHub 本身就是唯一内容来源。

群和管理员配置全部来自环境变量。

---

# 53. 第一版明确不实现

不实现：

* 用户系统
* 用户订阅
* 群配置后台
* 权限管理后台
* AI 自动回答
* 自动出题
* 数据库
* 消息队列
* 答题统计
* 排行榜
* Web 管理页面
* 自动发现群 ID
* 自动发现管理员 ID

第一版也不实现：

* 消息智能拆分
* Markdown 自动降级
* 多渠道通知
* 提醒去重

群和用户 ID 通过本地 WebSocket Debug Script 获取。

---

# 54. package scripts

期望至少提供：

```json
{
  "scripts": {
    "build:scf": "...",
    "typecheck": "...",
    "setup:menu": "...",
    "debug:ws": "..."
  }
}
```

可根据具体工具链增加：

```text
test
lint
dev
```

但第一版不为了工具链复杂度而增加不必要依赖。

---

# 55. 代码质量要求

代码目标不是搭建一个通用 QQ Bot Framework。

而是：

> 用尽可能小而可靠的代码完成当前需求，同时保持合理抽象。

优先：

```text
简单函数
小型类型
显式数据流
组合
接口边界
```

避免：

```text
大型 Class hierarchy
复杂 DI Container
Plugin System
Event Bus
Repository Pattern 滥用
过度领域建模
```

---

# 56. 依赖原则

能使用 Web Platform / Node 原生能力完成的，不增加依赖。

必要依赖例如：

* YAML Front Matter 解析
* WebSocket 客户端

可以引入成熟的小型库。

不为了简单 HTTP 请求增加大型 SDK。

QQ Bot API 优先使用原生：

```ts
fetch()
```

封装。

---

# 57. MVP 验收标准

项目完成后必须能够做到：

* [ ] 使用 TypeScript 编写
* [ ] 部署至腾讯云 SCF
* [ ] QQ WebHook 可以正常接收事件
* [ ] WebHook 校验正常
* [ ] 普通 WebHook 事件返回 `{"op":12,"d":0}` 成功 ACK
* [ ] 工作日北京时间 08:00 自动执行
* [ ] 周末北京时间 10:00 自动执行
* [ ] 正确读取 GitHub Raw Markdown
* [ ] 正确解析 type/source
* [ ] puzzle 必须校验 source
* [ ] 正确发送 puzzle
* [ ] 正确发送 knowledge
* [ ] 正确发送 story
* [ ] 当日无文件时不进行群推送
* [ ] 每次定时执行检查未来七天库存
* [ ] 库存少于七份时私聊 ADMIN_OPENID
* [ ] 所有 GROUP_IDS 均能独立推送
* [ ] `/今日谜题` 正常工作
* [ ] 当天不是谜题时仍返回当天内容并追加提示
* [ ] `/历史谜题` 无参数返回用法
* [ ] `/历史谜题 YYYY-MM-DD` 可以读取历史谜题
* [ ] `/历史谜题` 无法读取未来内容
* [ ] 非 puzzle 历史日期不会作为谜题返回
* [ ] QQ 菜单/按钮和 Slash Command 共用同一业务逻辑
* [ ] `npm run setup:menu` 可以完成菜单设置
* [ ] `npm run debug:ws` 可以实时打印 QQ WebSocket Event
* [ ] `npm run build:scf` 生成可以直接上传到 SCF 的 ZIP
* [ ] WebSocket Debug 可以用于识别用户和群组 OpenID
* [ ] 本地两个辅助脚本不会部署至 SCF
* [ ] 线上只需要五个业务环境变量

---

# 58. 最终环境变量清单

最终只需要：

```env
CONTENT_BASE_URL=
GROUP_IDS=
QQ_BOT_APP_ID=
QQ_BOT_APP_SECRET=
ADMIN_OPENID=
```

这是本项目完整的业务配置面。

---

# 59. 最终产品定位

本项目不是：

> 一个通用 QQ Bot 框架。

而是：

> 一个以 GitHub Markdown 为内容源、腾讯云 SCF 为运行环境、QQ 官方机器人为消息入口和出口的轻量每日内容分发服务。

线上保持无状态、简单、可靠。

本地通过两个独立开发工具解决：

```text
菜单配置
+
WebSocket Event 调试 / OpenID 获取
```

从而不把调试复杂度带入生产环境。
