# Cloudflare Cron 星期字段语义

## 结论

Cloudflare Cron Triggers 的星期字段是 **1-7，其中 1 = Sunday、7 = Saturday**，这与标准 cron（0 = Sunday、6 = Saturday）不同。官方文档明确建议使用 3 字母缩写（`SUN`…`SAT`）以避免歧义。

## 支持的表（官方）

| 字段 | 取值 | 允许字符 |
| --- | --- | --- |
| Minute | 0-59 | `* , - /` |
| Hours | 0-23 | `* , - /` |
| Days of Month | 1-31 | `* , - / L W` |
| Months | 1-12 或 3 字母缩写（不分大小写） | `* , - /` |
| Weekdays | 1-7 或 3 字母缩写（不分大小写） | `* , - / L #` |

## 对本项目的映射

| 北京时间 | UTC | 正确表达式 |
| --- | --- | --- |
| 工作日 08:00 (Mon-Fri) | 00:00 | `0 0 * * MON-FRI`（或 `0 0 * * 2-6`） |
| 周六 10:00 | 02:00 | `0 2 * * SAT`（或 `0 2 * * 7`） |
| 周日 10:00 | 02:00 | `0 2 * * SUN`（或 `0 2 * * 1`） |

## 历史错误

- `0 2 * * 0,6`：`0` 非法（Cloudflare 不接受 0）。
- `0 2 * * 0`：`0` 非法，报 `invalid cron string [code: 10100]`。
- `0 0 * * 1-5`：语法合法但语义错误（Cloudflare 下为周日~周四）。
- `0 2 * * 6`：语法合法但语义错误（Cloudflare 下为周五）。

## 参考

- https://developers.cloudflare.com/workers/configuration/cron-triggers/
