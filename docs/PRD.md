# 每日题目推荐 QQ Bot Worker 项目 PRD

## 1. 项目概述

### 1.1 项目目标

开发一个基于 Cloudflare Worker 的 QQ Bot 后端，用于每日向指定 QQ 群推送编程题目、知识分享或技术故事。

机器人内容来源于公开 GitHub 仓库中的 Markdown 文件，通过 Cloudflare Cron Trigger 定时读取，并通过 QQ Bot WebHook/API 完成消息发送。

项目强调：

* 代码轻量
* 逻辑清晰
* 高复用
* QQ Bot 适配层与业务逻辑解耦
* 方便未来扩展其他消息平台

---

# 2. 技术方案

## 2.1 技术栈

* TypeScript
* Cloudflare Workers
* Cloudflare Cron Trigger
* QQ Bot API
* GitHub Raw Content API

---

## 2.2 整体架构

```
                 GitHub Repository
                       |
                       |
                Markdown Content
                       |
                       |
              Cloudflare Worker
                       |
        --------------------------------
        |                              |
 QQ Bot Adapter                  Business Logic
        |                              |
        |                         Content Service
        |                         Message Builder
        |
 QQ Bot API
        |
        |
     QQ 用户
```

---

# 3. 项目结构设计

项目分为两层：

## 3.1 QQ Bot 兼容层（Adapter Layer）

负责：

* 接收 QQ Bot WebHook 请求
* 解析 QQ Bot 事件
* 调用 QQ Bot API 发送消息
* 屏蔽 QQ 平台细节

目标：

业务代码不直接依赖 QQ API。

---

## 3.2 业务逻辑层（Application Layer）

负责：

* 获取每日内容
* 解析 Markdown
* 根据内容类型生成消息
* 处理机器人指令
* 管理每日推送逻辑

---

# 4. 内容管理

## 4.1 GitHub 内容仓库

仓库公开。

Worker 使用 GitHub Raw URL 读取 Markdown 文件。

文件命名规则：

```
YYYY-MM-DD.md
```

例如：

```
2026-08-23.md
2026-08-24.md
```

---

# 4.2 Markdown 格式

文件顶部包含 YAML Front Matter。

示例：

```md
---
type: puzzle
source: https://example.com/problem
---

这里是 Markdown 正文。

支持 Markdown 格式。
```

---

## 4.3 YAML 字段定义

### type

必填。

允许值：

| 值         | 含义   |
| --------- | ---- |
| puzzle    | 今日谜题 |
| knowledge | 今日知识 |
| story     | 今日故事 |

---

### source

可选。

规则：

* type 为 puzzle 时必须存在
* 其他类型无需填写

用途：

保存原题链接。

---

# 5. 每日消息推送

## 5.1 推送时间

使用 Cloudflare Cron Trigger。

时间：

| 日期  | 时间    |
| --- | ----- |
| 工作日 | 08:00 |
| 周末  | 10:00 |

---

## 5.2 推送范围

只向配置中的 QQ 群发送。

群 ID：

直接配置在 Cloudflare Worker 环境变量中。

不使用数据库保存。

---

## 5.3 消息模板

统一格式：

```
【今日XX】

Markdown正文

结尾内容
```

---

## 5.4 不同类型模板

### puzzle

标题：

```
【今日谜题】
```

结尾：

```
欢迎各位使用尝试实现，有任何疑问欢迎提问！

原题链接：
source
```

---

### knowledge

标题：

```
【今日知识】
```

结尾：

空。

---

### story

标题：

```
【今日故事】
```

结尾：

空。

---

## 5.5 Markdown处理

第一版：

尝试完整保留 Markdown 内容。

如果 QQ Markdown 存在兼容问题，再增加转换层。

---

# 6. QQ Bot 指令

## 6.1 今日谜题

命令：

```
/今日谜题
```

支持：

* QQ 官方指令
* QQ 按钮触发

---

## 6.2 指令逻辑

收到命令后：

读取当天 Markdown。

如果：

```
type=puzzle
```

返回正常今日谜题消息。

如果：

```
type=knowledge
```

或：

```
type=story
```

返回对应今日内容。

但是结尾增加：

```
今天没有谜题，休息一下吧
```

---

# 6.3 历史谜题

命令：

```
/历史谜题
```

---

## 参数规则

### 无参数

返回：

```
使用方法：

/历史谜题 YYYY-MM-DD
```

---

### 有日期

例如：

```
/历史谜题 2026-08-20
```

读取：

```
2026-08-20.md
```

---

## 限制

禁止查看未来日期。

例如：

当前日期：

```
2026-08-23
```

请求：

```
/历史谜题 2026-08-30
```

拒绝。

---

# 7. 内容检查机制

每日推送前：

检查当天内容。

---

## 7.1 当天不存在内容

情况：

```
2026-08-23.md
不存在
```

处理：

* 不发送群消息
* 不发送错误消息

---

## 7.2 内容库存检查

每天发送时：

检查未来 7 天内容数量。

规则：

如果：

```
未来7天可用内容 < 7份
```

则：

向管理员私聊发送警告。

---

警告对象：

管理员 QQ ID。

配置在 Worker 环境变量中。

---

警告内容：

示例：

```
每日题目机器人提醒：

未来一周内容不足7份，请及时补充 GitHub 内容。
```

---

# 8. 环境变量设计

Cloudflare Worker Variables：

## QQ 配置

```
QQ_BOT_ID
QQ_BOT_SECRET
```

- `QQ_BOT_ID`：开放平台 AppID。
- `QQ_BOT_SECRET`：开放平台 AppSecret，同时用于 access_token 换取（作为 clientSecret）与 Webhook Ed25519 签名校验。

---

## 群配置

```
GROUP_IDS
```

格式：

JSON 数组。

例如：

```json
[
 "123456",
 "789012"
]
```

---

## 管理员

```
ADMIN_OPENID
```

---

## GitHub

```
CONTENT_BASE_URL
```

例如：

```
https://raw.githubusercontent.com/user/repo/main/content/
```

---

# 9. 非功能要求

## 9.1 性能

要求：

* Worker 冷启动快速
* 单次请求逻辑简单
* 不保存大量状态

---

## 9.2 可维护性

要求：

业务逻辑不能直接调用 QQ API。

推荐：

```
DailyService
      |
MessageBuilder
      |
QQSender
```

---

## 9.3 扩展性

未来可支持：

* Telegram
* Discord
* 企业微信

只需新增 Adapter。

---

# 10. 第一版本范围（MVP）

必须实现：

* [x] Cloudflare Worker 部署
* [x] Cron Trigger 定时任务
* [x] GitHub Markdown读取
* [x] YAML解析
* [x] 三种内容类型
* [x] 群每日推送
* [x] /今日谜题
* [x] /历史谜题
* [x] 管理员库存不足提醒
* [x] TypeScript实现
* [x] QQ Adapter 与业务逻辑分离

暂不实现：

* 用户系统
* Web 管理后台
* 数据库存储
* AI自动回答
* 消息队列
* 复杂权限管理

---

# 11. 后续优化方向

可能扩展：

* 题目标签系统
* 难度等级
* 用户答题统计
* AI 解题助手
