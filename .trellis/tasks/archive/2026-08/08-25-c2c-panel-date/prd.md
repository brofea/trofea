# 私聊指令面板 + 历史谜题日期格式优化

## Goal

解决两个用户体验问题：
1. 私聊中无法通过 `/` 触发指令联想（需要 API 为每个用户设置指令面板）
2. 历史谜题命令日期格式过于严格，不支持简写格式

## What I already know

### 问题 1：私聊指令面板
- **现状**：群聊指令面板已配置（`scripts/setup-menu.ts`），私聊只有底部按钮，输入 `/` 无联想
- **原因**：QQ Bot API 要求为每个私聊用户单独调用 `PUT /v2/users/{user_openid}/panels/commands`
- **文档**：https://bot.q.qq.com/wiki/develop/api-v2/server-inter/menu-panel/
- **事件**：`C2C_MESSAGE_CREATE` 事件已处理（`src/bootstrap.ts` L33）

### 问题 2：历史谜题日期格式
- **现状**：只接受 `YYYY-MM-DD` 格式（`src/utils/date.ts` L28）
- **测试验证**：本地测试 `/历史谜题 2026-08-25` 能正确返回内容（190 字符 markdown）
- **用户反馈**：实际部署后 `/历史谜题 2026-08-25` 没有返回（可能是 SCF 环境问题或错误被吞掉）
- **期望格式**：
  - `20260825` → `2026-08-25`
  - `0825` → 自动补当前年份 → `2026-08-25`
  - 保持 `2026-08-25` 兼容

## Assumptions (temporary)

- 用户已在腾讯云 SCF 配置环境变量（`QQ_BOT_APP_SECRET` 等）
- API 调用 `PUT /v2/users/{user_openid}/panels/commands` 是幂等的（重复调用无副作用）
- 历史谜题在部署环境没有返回可能是错误日志不足导致

## Decisions

1. **私聊面板触发时机**：每次收到 `C2C_MESSAGE_CREATE` 都调用 API（无状态记录）
   - 理由：API 幂等，Serverless 友好，实现简单
2. **错误处理策略**：API 失败仅记录警告日志，不影响消息回复
   - 理由：保证用户体验连续性，下次消息会自动重试
3. **日期解析边界**：`MMDD` 格式始终使用当前年份
   - 理由：逻辑简单可预测，跨年查询可用完整格式 `YYYYMMDD`
   - 未来日期由现有逻辑处理（提示"未来的谜题还不能偷看哦"）

## Requirements

### 功能点 1：私聊用户自动设置指令面板
- 在 `C2C_MESSAGE_CREATE` 事件处理开始时调用 `PUT /v2/users/{user_openid}/panels/commands`
- 面板配置与群聊一致：
  ```json
  {
    "items": [
      {"type": "command", "name": "/今日谜题", "desc": "获取今日谜题"},
      {"type": "command", "name": "/历史谜题", "desc": "查看历史谜题"}
    ]
  }
  ```
- API 调用失败时：
  - 记录 `console.warn` 日志（包含 user_openid、错误信息）
  - 继续处理用户消息，不中断正常流程

### 功能点 2：历史谜题日期格式优化
- 扩展 `parseDateString` 函数支持三种格式：
  - `YYYY-MM-DD`（现有，保持兼容）
  - `YYYYMMDD`（8 位数字）→ 插入 `-` 后转为 `YYYY-MM-DD`
  - `MMDD`（4 位数字）→ 补当前年份 + 插入 `-` → `YYYY-MM-DD`
- 日期有效性验证（2 月 31 日等非法日期返回 null）
- 更新使用说明：
  ```
  使用方法：
  
  /历史谜题 YYYY-MM-DD
  /历史谜题 YYYYMMDD
  /历史谜题 MMDD（自动使用当前年份）
  
  例如：
  /历史谜题 2026-08-20
  /历史谜题 20260820
  /历史谜题 0820
  ```

### 功能点 3：错误日志增强
- `handleHistory` 命令处理中添加日志：
  - 日期解析失败：记录输入值
  - 内容获取失败：记录 URL 和错误类型
  - 消息发送失败：已有日志（`src/bootstrap.ts` L50）

## Acceptance Criteria

- [ ] 私聊用户发送消息后，输入 `/` 能看到指令联想（需人工测试）
- [ ] `/历史谜题 20260825` 返回正确内容
- [ ] `/历史谜题 0825` 返回当前年份对应日期的内容
- [ ] `/历史谜题 2026-08-25` 仍正常工作（向后兼容）
- [ ] `/历史谜题 0231` 返回格式错误提示（2月31日非法）
- [ ] `/历史谜题` 无参数时返回更新后的使用说明（包含三种格式）
- [ ] 私聊面板 API 失败时记录日志但不中断消息处理
- [ ] 所有现有测试通过
- [ ] 新增 `test/date.test.ts` 测试用例：
  - `parseDateString("20260825")` 成功
  - `parseDateString("0825")` 使用当前年份
  - `parseDateString("0231")` 返回 null（非法日期）
  - `parseDateString("1301")` 返回 null（13月）

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 持久化记录哪些用户已设置面板（方案：每次都调用，依赖 API 幂等性）
- 复杂的日期解析（如相对日期 "yesterday"、"上周五"）
- 历史谜题的日期范围验证（如禁止查询 2020 年之前）

## Technical Approach

### 实现步骤

**Step 1: 扩展日期解析（`src/utils/date.ts`）**
- 在 `parseDateString` 中添加格式检测：
  - `/^\d{8}$/` → `YYYYMMDD` 格式，插入 `-` 后递归调用
  - `/^\d{4}$/` → `MMDD` 格式，获取当前年份拼接后递归调用
  - 保持现有 `YYYY-MM-DD` 逻辑不变
- 递归调用确保所有格式都经过相同的有效性验证

**Step 2: 更新使用说明（`src/commands/router.ts`）**
- 修改 `handleHistory` 中的帮助文本（L48-52）
- 添加三种格式示例

**Step 3: 添加用户面板设置（`src/adapter/qqbot.ts` 或新增方法）**
- 在 `QQBotAdapter` 添加方法：
  ```typescript
  async setUserCommandPanel(userOpenid: string): Promise<void>
  ```
- 调用 `PUT /v2/users/${userOpenid}/panels/commands`
- 错误处理：catch 后 `console.warn`，不抛出

**Step 4: 集成到事件处理（`src/bootstrap.ts`）**
- 在 `handleVerifiedEvent` 的 `C2C_MESSAGE_CREATE` 分支开始处调用：
  ```typescript
  if (event.type === "C2C_MESSAGE_CREATE" && event.userOpenid) {
    await services.sender.setUserCommandPanel(event.userOpenid).catch(err => {
      console.warn('[c2c-panel] setup failed', { userOpenid: event.userOpenid, error: err.message });
    });
  }
  ```

**Step 5: 测试**
- 扩展 `test/date.test.ts` 覆盖新格式
- 扩展 `test/router.test.ts` 验证新使用说明
- 手动测试私聊面板（部署后）

### 文件变更清单
- `src/utils/date.ts` - 扩展 `parseDateString`
- `src/commands/router.ts` - 更新使用说明
- `src/adapter/qqbot.ts` - 添加 `setUserCommandPanel` 方法
- `src/bootstrap.ts` - 集成面板设置调用
- `test/date.test.ts` - 新增测试用例
- `test/router.test.ts` - 更新测试（可选）

### 技术参考
- QQ Bot API 文档：
  - 面板配置：https://bot.q.qq.com/wiki/develop/api-v2/server-inter/menu-panel/
  - 事件签名：https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/sign.html
- 现有群聊面板配置脚本：`scripts/setup-menu.ts`（可参考 API 调用格式）
- 日期验证逻辑：使用 `new Date()` + `formatDate()` 往返验证（现有模式）
