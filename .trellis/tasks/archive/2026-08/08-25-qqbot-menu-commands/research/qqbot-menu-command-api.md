# Research: QQ Bot 自定义菜单 / 按钮 / 指令 (menu / button / command)

- **Query**: QQ 机器人开放平台 (api-v2) 的「自定义菜单 / 按钮 / 指令」机制，以及开发者如何通过 API 配置它们
- **Scope**: external (官方文档 https://bot.q.qq.com/wiki/develop/api-v2/)
- **Date**: 2026-08-25
- **Source docs last-updated**: 2026-07-21 ~ 2026-08-13（api-v2 autogen 文档；菜单/面板 API 文档标注 8/13/2026，属于新能力）

---

## 0. TL;DR（关键结论）

1. **「自定义菜单 / 按钮 / 指令」在 api-v2 里是三个不同、但都真实存在的机制**，官方术语分别是：
   - **自定义菜单 (menu)** — `GET/PUT /v2/menu`，仅 **C2C（单聊）**，全局对所有用户生效。
   - **指令面板 (panel)** — `/v2/panels` CRUD，支持 **c2c / group / channel / dm** 四种场景，可指定用户/群。
   - **消息按钮 / 内嵌键盘 (inline keyboard)** — 通过发送消息时的 `keyboard` 字段挂在**单条消息**上，点击后触发 `INTERACTION_CREATE` 回调事件。
2. **确实存在「用 API 设置菜单」的能力**：`PUT /v2/menu`（全局自定义菜单）与 `POST /v2/panels`（指令面板）。但这不是「发送一条指令来设置菜单」，而是**直接 HTTP REST 调用**，请求体是菜单/面板配置 JSON。
3. **不存在「注册斜杠指令」的 OpenAPI**（没有 Discord 风格的 command registry，没有 `POST /v2/bots/{id}/commands`）。`/今日谜题` 这类斜杠指令只是**文本约定**（以 `/` 开头的消息），由机器人自己解析（本项目的 `CommandRouter` 正是这么做的）。QQ 官方另有「快捷指令/快捷菜单」（`feature_id`），但那是在**管理端（控制台）配置**，无 API。
4. **两种触发方式落到 `/今日谜题` 的实现路径**：
   - **「填入输入框」模式（最简单，复用现有 `/` 指令流程）**：菜单项 `type=send_message`、面板项 `type=command`、按钮 `action.type=2`（指令按钮）都会把文本填入聊天输入框，用户点发送后走正常 `GROUP_AT_MESSAGE_CREATE` / `C2C_MESSAGE_CREATE` → `CommandRouter`。
   - **「回调」模式（需要新增事件处理）**：按钮 `action.type=1`（回调按钮）点击后平台推送 `INTERACTION_CREATE`（`type=11`），`data.resolved.button_data` 携带自定义 data，机器人需调 `PUT /interactions/{interaction_id}` 回应（3 秒超时）。

---

## 1. 三种机制概览

| 官方术语 | 对应英文/常量 | 生效场景 | 是否「持久配置」 | 能否通过 API 配置 | 触发后的回调 |
| --- | --- | --- | --- | --- | --- |
| 自定义菜单 | menu | 仅 C2C 单聊 | 是（全局，所有用户） | ✅ `GET/PUT /v2/menu` | `type=send_message` 只填输入框；`type=switch` 切换会发消息带 `ext`；`type=12` 快捷菜单回调 |
| 指令面板 | panel | c2c / group / channel / dm | 是（按场景/用户/群） | ✅ `/v2/panels` CRUD | `type=command` 点击后填输入框，无独立回调 |
| 消息按钮 / 内嵌键盘 | inline keyboard (`keyboard` 字段) | 单条消息（群/单聊/频道） | 否（随消息走） | ✅ 发送消息时带 `keyboard` 字段 | `INTERACTION_CREATE` `type=11`，需 `PUT /interactions/{id}` 回应 |

> 「斜杠指令 (slash command)」不是上面任何一种的注册实体——它是文本约定，见 §6。

---

## 2. 自定义菜单 (Custom Menu)

- **官方页面**：「自定义菜单与指令面板」章节（`/server-inter/menu-panel/`），子页 `v2_menu.get.html` / `v2_menu.put.html`。
- **说明**：自定义菜单展示在机器人**单聊窗口底部**，支持开关、发送消息、链接跳转、含子菜单的折叠项。设置后**对所有用户生效，不支持按用户区分**。**仅支持 C2C（单聊）场景**（群聊没有全局自定义菜单）。

### 2.1 端点

| 方法 | 路径 | 用途 | 频率限制 |
| --- | --- | --- | --- |
| GET | `/v2/menu` | 查询当前自定义菜单 | 30 QPM |
| PUT | `/v2/menu` | 修改（整体覆盖）自定义菜单 | 5 QPM |

### 2.2 `PUT /v2/menu` 请求体

顶层：`{ "menu": { "items": [MenuItem] } }`，传入会**整体覆盖**原有菜单。

**MenuItem**（一级按钮，最多 10 个，从左到右展示）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 按钮名称，最多 10 字符（1 个中文=2 字符） |
| `type` | string | `switch` / `send_message` / `link` / `menu` |
| `sub_menu_items` | SubMenuItem[] | 仅 `type=menu` 有效，最多 5 个，**不支持再嵌套** |
| `send_message` | string | 仅 `type=send_message`。用户点击后**该文本自动填入聊天输入框** |
| `link` | string | 仅 `type=link`，必须以 `https://` 开头 |
| `switch` | Switch | 仅 `type=switch`：`{ switch_id, default }`。切换后发一条消息，消息 `ext` 字段带 `"switch_id=1"`（开）或不带（关） |

**SubMenuItem**：`name`（≤14 字符）、`type`（仅 `send_message` / `link`）、`send_message`、`link`。

### 2.3 请求示例（PUT /v2/menu）

```json
{
  "menu": {
    "items": [
      { "type": "send_message", "name": "帮助", "send_message": "/help" },
      { "type": "link", "name": "官网", "link": "https://example.com" },
      {
        "type": "menu",
        "name": "更多",
        "sub_menu_items": [
          { "type": "send_message", "name": "设置", "send_message": "/settings" }
        ]
      }
    ]
  }
}
```

响应：`{ "version": 1 }`（版本号）。

### 2.4 响应（GET /v2/menu）

```json
{
  "menu": {
    "items": [
      { "type": "send_message", "name": "帮助", "send_message": "/help" }
    ]
  },
  "version": 1
}
```

未设置过菜单时 `menu` 字段为空。

### 2.5 错误码（菜单）

| 错误码 | 含义 |
| --- | --- |
| 40030008 | URL 格式错误（须 `https://`） |
| 40030013 | 超出数量限制 |
| 40030014 | 菜单类型不合法（`type` 仅 `switch/send_message/link/menu`） |
| 40030016 | 必填字段缺失 |
| 40030020 | 内容存在安全风险（菜单/面板内容需过内容安全） |

---

## 3. 指令面板 (Command Panel)

- **说明**：以面板形式展示「指令」或「链接」。支持 c2c / group / channel / dm 四种场景；c2c 和 group 支持 `target_type=specific`（指定用户/群），channel 和 dm 仅全局（`target_type=all`）。**一个机器人最多创建 20 个面板**。

### 3.1 端点

| 方法 | 路径 | 用途 | 频率限制 |
| --- | --- | --- | --- |
| POST | `/v2/panels` | 创建指令面板 | 10 QPM |
| GET | `/v2/panels` | 分页查询面板列表（`scope` 必填） | 30 QPM |
| GET | `/v2/panels/{panel_id}` | 查询面板详情 | — |
| PUT | `/v2/panels/{panel_id}` | 修改面板 | — |
| DELETE | `/v2/panels/{panel_id}` | 删除面板 | — |
| PUT | `/v2/panels/{panel_id}/target` | 增删面板关联对象（用户/群） | 60 QPM |

### 3.2 `POST /v2/panels` 请求体

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `scope` | string | ✅ | `c2c` / `group` / `channel` / `dm` |
| `target_type` | string | 否 | `all`（全局）/ `specific`（指定）。仅 c2c、group 支持 specific |
| `user_openids` | []string | 否 | c2c + specific 时有效，一次最多 20 个 |
| `group_openids` | []string | 否 | group + specific 时有效，一次最多 20 个 |
| `panel` | Panel | ✅ | `{ items: [PanelItem], remark?, version? }` |

**PanelItem**（一个面板最多 20 个元素）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 元素名称，≤14 字符。`type=command` 时**用户点击后该内容填入聊天输入框** |
| `desc` | string | 元素描述，≤30 字符，展示给用户 |
| `type` | string | `command`（指令）/ `link`（链接跳转） |
| `only_admin` | boolean | 是否仅管理员可点击 |
| `link` | string | 仅 `type=link` 有效，点击后浏览器打开 |

### 3.3 请求示例

**创建 group 指定群面板**（对应本项目「按钮触发 `/今日谜题`」场景）：

```json
{
  "scope": "group",
  "target_type": "specific",
  "group_openids": ["openid_group_001", "openid_group_002"],
  "panel": {
    "items": [
      { "type": "command", "name": "/今日谜题", "desc": "获取今日谜题" }
    ]
  }
}
```

响应：`{ "panel_id": "p_x8k2x8k2x8k2" }`。

### 3.4 响应（GET /v2/panels）

请求：`GET /v2/panels?scope=group&limit=20`（`scope` 必填，`cursor` 分页游标，`limit` 默认 20 最大 50）。

```json
{
  "records": [
    {
      "panel_id": "p_102030405_x8k2",
      "scope": "group",
      "target_type": "specific",
      "panel": {
        "items": [
          { "type": "command", "name": "/今日谜题", "desc": "获取今日谜题" }
        ]
      },
      "version": 1
    }
  ],
  "next_cursor": "",
  "is_end": true
}
```

### 3.5 `PUT /v2/panels/{panel_id}/target`（增删关联对象）

```json
{ "op": "add", "group_openids": ["openid_group_003"] }
```

`op` 为 `add` / `del`；`user_openids` 仅 c2c，`group_openids` 仅 group，一次最多 20 个。

### 3.6 面板相关错误码

40030008（URL 格式）、40030009（面板操作进行中）、40030011（scope 不合法）、40030012（target_type 不合法）、40030013（数量超限）、40030015（面板元素类型不合法，`type` 仅 command/link）、40030016（必填缺失）、40030018（场景不支持）、40030020（内容安全风险）、40030021（全局面板不支持指定关联对象）。

---

## 4. 消息按钮 / 内嵌键盘 (Inline Keyboard)

- **官方页面**：「消息交互」章节：`/server-inter/message/trans/overview.html` + 互动事件 + 互动事件响应。
- **说明**：在**发送消息**时通过 `keyboard` 字段附带按钮，按钮随消息展示在消息底部。**仅 markdown 消息（`msg_type=2`）支持消息按钮**（nodesdk 页面原文：「仅 markdown 消息支持消息按钮」）。
- `keyboard` 支持两种形式，**二选一**：
  - **模板**：`{ "id": "模板ID" }`（模板需先在平台**申请消息按钮组件模板**，申请时提供 InlineKeyboard JSON，得到模板 id）。
  - **自定义**：`{ "content": { "rows": [ { "buttons": [Button] } ] } }`。

### 4.1 发送群消息携带 keyboard（`POST /v2/groups/{group_openid}/messages`）

`keyboard` 字段与 `msg_type` / `markdown` / `content` 并列，不是独立的 msg_type（旧版的 `msg_type=10` 模板消息已被「keyboard 字段」取代）。

```json
{
  "msg_type": 2,
  "markdown": { "content": "## 每日签到\n\n今日签到成功！" },
  "keyboard": {
    "content": {
      "rows": [
        {
          "buttons": [
            {
              "id": "btn_signin",
              "render_data": { "label": "签到", "style": 1 },
              "action": {
                "type": 2,
                "permission": { "type": 2 },
                "data": "/签到",
                "enter": true
              }
            }
          ]
        }
      ]
    }
  },
  "msg_id": "ROBOT1.0_xxx",
  "msg_seq": 1
}
```

### 4.2 Button / Action 字段（api-v2 `Keyboard` schema）

**Button**：`id`（同键盘内唯一）、`render_data`、`action`。

**RenderData**：`label`（≤10 字符）、`visited_label`（点击后文字）、`style`（0=灰线框, 1=蓝线框, 2=白字, 3=蓝底白字）。

**Action**：

| 字段 | 说明 |
| --- | --- |
| `type` | **0=跳转按钮**（http 或小程序）；**1=回调按钮**（回调后台，`data` 传给后台）；**2=指令按钮**（自动在输入框插入 `@bot data`） |
| `permission` | `{ type, specify_user_ids, specify_role_ids }`，`type` 0=指定用户 / 1=管理员 / 2=所有人 |
| `data` | 回调数据，`type=1/2` 时必填（如 `/今日谜题`） |
| `click_limit` | 【已废弃】可点击次数限制 |
| `unsupport_tips` | 版本过低时提示文案 |
| `enter` | 指令按钮用：点击后**直接自动发送** data，**仅单聊可用**，默认 false（支持版本 8983） |
| `reply` | 指令按钮用：指令是否带引用回复本消息，默认 false |
| `anchor` | 指令按钮用，仅手机端 8983+ 单聊：`1` 唤起选图器 |

> 关键：`action.type=2`（指令按钮）+ `data="/今日谜题"` = 点击按钮 → 输入框自动填入 `@机器人 /今日谜题` →（`enter=true` 仅单聊可自动发送）→ 走正常的群 @ / 私聊消息流程。`action.type=1`（回调按钮）则触发 `INTERACTION_CREATE` 回调。

### 4.3 键盘相关错误码

305007（键盘样式参数错误）、40034029（内联键盘行/列超限）、40034106（消息不支持该指令类型）、40034108（指令参数长度超限）、40034109（指令参数解析失败）。

---

## 5. 互动事件与响应 (INTERACTION_CREATE)

### 5.1 事件元信息

- **事件名**：`INTERACTION_CREATE`
- **Intent**：`INTERACTION (1<<26)` —— 机器人需在事件订阅中开启该 intent 才能收到回调。
- **回应要求**：收到后须调 `PUT /interactions/{interaction_id}`，否则客户端一直 loading 直到超时。**仅 `type=11`（消息按钮）和 `type=12`（快捷菜单）需要回应**；其他类型（反馈、清空会话、进出故事集、切换模型、授权）无需回应。同一 `interaction_id` 只能回应一次，超时失效。

### 5.2 `type` 取值

| type | 含义 |
| --- | --- |
| 11 | 消息按钮回调 INLINE_KEYBOARD（用户点击消息中的内联键盘按钮） |
| 12 | 单聊快捷菜单回调 CALLBACK_COMMAND（用户点击单聊场景下的自定义菜单） |
| 13 | 消息反馈 MESSAGE_FEEDBACK（点赞/点踩） |
| 14 | 清空会话 CLEAR_SESSION |
| 15 | 进出故事集 IN_OUT_STORY |
| 16 | 切换模型 SWITCH_MODEL |
| 18 | 用户授权 USER_AUTHORIZE |
| 19 | 群授权 GROUP_AUTHORIZE |
| 20 | 群授权状态变更 GROUP_AUTHORIZE_STATUS |

### 5.3 事件体（`d` payload）关键字段

`id`、`type`、`scene`（c2c/group/guild）、`chat_type`（0=频道,1=群聊,2=单聊）、`timestamp`（RFC3339）、`guild_id`、`channel_id`、`user_openid`（仅单聊）、`group_openid`（仅群聊）、`group_member_openid`（仅群聊）、`data`、`version`、`application_id`。

**`data.resolved`（解析后的互动数据）**：

| 字段 | 说明 |
| --- | --- |
| `button_data` | 按钮的 `data` 字段值（发送消息按钮时设置）；消息反馈场景下为回调数据 |
| `button_id` | 按钮的 `id` 字段值 |
| `user_id` | 操作用户 ID（仅频道） |
| `feature_id` | 功能 ID（**仅快捷菜单有值，管理端设置**） |
| `message_id` | 操作的消息 ID |
| `feedback_opt` / `checked` | 仅 type=13 反馈 |
| `action` | type=15/16 的操作动作 |
| `message_scene` | 仅 type=13 |
| `authorize_data` | 仅 type=18/19 授权 |

### 5.4 事件示例（群聊消息按钮点击，type=11）

```json
{
  "application_id": "101984245",
  "chat_type": 1,
  "data": {
    "resolved": {
      "button_data": "eyJjb21tYW5kIjogInNhbXBsZSJ9"
    },
    "type": 11
  },
  "group_member_openid": "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
  "group_openid": "B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
  "id": "06915133-7aef-46ed-94f7-c50939e285ae",
  "scene": "group",
  "timestamp": "2026-07-20T21:53:54+08:00",
  "type": 11,
  "version": 1
}
```

### 5.5 回应：`PUT /interactions/{interaction_id}`

- **HTTP Method**：PUT；**频率限制**：50 QPS。
- `interaction_id` 取事件 `d.id`（**不带 `INTERACTION_CREATE:` 前缀**）。
- 请求体：`{ "code": 0 }`，`code` 取值 0=成功, 1=操作失败, 2=操作频繁, 3=重复操作, 4=没有权限, 5=仅管理员操作。
- 响应体：`{}`。
- 错误码：630001~630008（param invalid / get appid failed / appid invalid / set interaction data failed / …）。

```json
PUT /interactions/a1b2c3d4-e5f6-7890-abcd-ef1234567890
{ "code": 0 }
```

---

## 6. 「指令 / 斜杠指令 (slash command)」——没有注册 API

- **结论**：api-v2 **没有**「创建/列表/删除斜杠指令」的 OpenAPI（无 `POST /v2/bots/{bot_openid}/commands` 之类）。QQ 机器人不存在 Discord 那种「应用指令 (application command)」注册实体。
- `/今日谜题` 这类斜杠指令就是**以 `/` 开头的普通文本消息**，由机器人自己解析（本项目 `CommandRouter` 已实现：`raw.startsWith("/")` → 匹配 `今日谜题`）。
- QQ 官方确有「快捷指令 / 快捷菜单」概念，但它是**在开放平台管理端（bot.q.qq.com 控制台）配置**的：配置后用户点击会触发 `INTERACTION_CREATE` 的 `type=12`（CALLBACK_COMMAND），事件里 `data.resolved.feature_id` 携带功能 ID，文档明确标注「仅快捷菜单有值，**管理端设置**」。**没有 API 可以设置它**。
- 因此「把 `/今日谜题` 做成斜杠指令」有两种落地：
  1. **纯文本约定**（已实现）：用户手输 `/今日谜题`，机器人解析响应 —— 无需任何平台配置。
  2. **管理端快捷指令**（可选增强）：控制台配置，点击后收到 type=12 回调 —— 无 API，需人工在控制台配置。

---

## 7. `/今日谜题` 两种触发方式的落点

### 方式 A：按钮点击 → 填入输入框 → 复用现有指令流程（最省事）

- **群聊**：用「指令面板」`POST /v2/panels`，`scope=group` + `target_type=specific` + `group_openids`，`PanelItem { type:"command", name:"/今日谜题" }`。用户点击后面板项名称填入输入框 → 用户发送 → 正常 `GROUP_AT_MESSAGE_CREATE` → `CommandRouter.handle("/今日谜题")`。
- **单聊**：用「自定义菜单」`PUT /v2/menu`，`MenuItem { type:"send_message", name:"今日谜题", send_message:"/今日谜题" }`。用户点击后 `/今日谜题` 填入输入框 → 用户发送 → 正常 `C2C_MESSAGE_CREATE`。
- **单条消息按钮**：发送时带 `keyboard`，`Button.action { type:2, data:"/今日谜题" }`（指令按钮）。点击后输入框填入 `@bot /今日谜题`；`enter=true` 仅单聊可自动发送，群聊需用户手动点发送。

> 方式 A 完全复用现有 `CommandRouter` + `handleVerifiedEvent` 链路，**不新增事件类型处理**。

### 方式 B：按钮点击 → `INTERACTION_CREATE` 回调 → 新增响应逻辑

- 发送时 `Button.action { type:1, data:"<自定义>", permission:{type:2} }`（回调按钮）。
- 点击后收到 `INTERACTION_CREATE`（`type=11`），`data.resolved.button_data` = 自定义 data。
- 机器人需**新增**处理：验签 → 识别 `type=11` → 从 `button_data` 映射到命令（如 `data="/今日谜题"` → 调 `CommandRouter.handle` 或直接构建内容）→ 用消息发送接口回复 → 并调 `PUT /interactions/{interaction_id}` 收尾（3 秒内）。

> 方式 B 需要新增 `INTERACTION_CREATE` 事件分支与 `PUT /interactions/{id}` 回应，并订阅 `INTERACTION (1<<26)` intent。

---

## 8. 管理端 vs API（用户核心疑问的精确回答）

| 能力 | 是否可通过 API 配置 | 配置入口 |
| --- | --- | --- |
| 自定义菜单（单聊底部菜单栏） | ✅ **可以**（`GET/PUT /v2/menu`） | 仅 API（文档未见管理端等价说明，但管理端也可能有） |
| 指令面板（群/单聊/频道面板） | ✅ **可以**（`/v2/panels` CRUD） | 仅 API |
| 消息按钮 / 内嵌键盘 | ✅ 可以（发送消息 `keyboard` 字段）；「keyboard 模板」需先在平台**申请**模板得到 id | 消息接口 + 模板需控制台申请 |
| 斜杠指令（slash command） | ❌ **没有注册 API** | 文本约定（机器人自解析）或管理端「快捷指令」 |
| 快捷菜单/快捷指令（`feature_id`，触发 type=12） | ❌ 无 API | **管理端（bot.q.qq.com 控制台）** |

**回答用户的困惑**：用户以为「发送一条指令就能设置菜单」。准确说法是——**确实存在设置菜单/面板的 REST API**（`PUT /v2/menu`、`POST /v2/panels`），但它不是「发指令」，而是用 `Authorization: QQBot <access_token>` 直接调 HTTP 接口、请求体传配置 JSON。而「斜杠指令」本身没有 API，`/今日谜题` 是文本约定；「菜单/面板里放 `send_message` / `command` 项」本质上也是把 `/今日谜题` 这段文本填入输入框，最终还是走文本指令流程。

---

## 9. Endpoint 汇总表

| 方法 | 路径（相对 `https://api.bot.qq.com`） | 作用 | 频率限制 |
| --- | --- | --- | --- |
| GET | `/v2/menu` | 查询全局自定义菜单 | 30 QPM |
| PUT | `/v2/menu` | 修改全局自定义菜单（整体覆盖） | 5 QPM |
| POST | `/v2/panels` | 创建指令面板 | 10 QPM |
| GET | `/v2/panels` | 查询面板列表（scope 必填） | 30 QPM |
| GET | `/v2/panels/{panel_id}` | 查询面板详情 | — |
| PUT | `/v2/panels/{panel_id}` | 修改面板 | — |
| DELETE | `/v2/panels/{panel_id}` | 删除面板 | — |
| PUT | `/v2/panels/{panel_id}/target` | 增删面板关联对象 | 60 QPM |
| POST | `/v2/groups/{group_openid}/messages` | 发群消息（可带 `keyboard`） | 100 QPS |
| POST | `/v2/users/{user_openid}/messages` | 发单聊消息（可带 `keyboard`） | — |
| PUT | `/interactions/{interaction_id}` | 回应互动事件 | 50 QPS |

鉴权：所有接口用 `Authorization: QQBot <access_token>`（token 来源与现有 `QQBotAdapter` 一致，`POST /app/getAppAccessToken`）。

---

## 10. Caveats / 未确认点

1. **面板 `type=command` 的「指令文本」字段缺失/含糊**：文档 `PanelItem` schema 只有 `name`/`desc`/`type`/`only_admin`/`link`，**没有独立的 `command`/`data` 字段**。文档措辞「type=command 时用户点击后该内容会填入聊天输入框」，其中「该内容」应指 `name`（元素名称）。即面板指令项用 `name` 兼作显示名与填入文本。**实现前需实测确认**：`name="/今日谜题"` 是否既显示又填入；是否需要单独的命令文本字段（对照菜单项有独立的 `send_message` 字段，面板项却没有，疑为文档遗漏）。
2. **`enter=true`（指令按钮自动发送）仅单聊可用**，群聊的指令按钮（`action.type=2`）点击后只填输入框，用户仍需手动发送。
3. **消息按钮仅 markdown（`msg_type=2`）支持**；纯文本（`msg_type=0`）能否挂 `keyboard` 未明确（群消息示例均为 `msg_type=2`）。
4. **旧的 `msg_type=10`（键盘/模板消息）已不在当前 api-v2 发送类型表中**（现发送类型仅 0/2/7，另有已废弃的 ark `msg_type=3`）；键盘改为消息体上的 `keyboard` 字段。历史代码/SDK 若仍用 `msg_type=10` 需迁移。
5. **自定义菜单仅 C2C**：群聊没有「全局自定义菜单」；群聊按钮能力需用「指令面板」或「消息按钮 keyboard」。
6. **内容安全**：菜单/面板内容会过内容安全审核（40030020），含敏感词会被拒。
7. **能力时效**：菜单/面板 API 文档标注 2026-08-13 更新，属于较新能力；接口权限可能需在开放平台申请对应 API 权限（文档未列出所需接口权限名，实施时需在控制台「接口权限」确认）。
8. 文档部分小节（单聊消息、频道消息、群聊管理、频道管理）未在本轮逐一抓取，涉及「单聊发送带 keyboard」的 schema 与群聊对称，推断一致但未逐字核对。
