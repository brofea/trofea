# Research: SCF Function URL & Timer Trigger (event formats, cron, Node runtime)

- **Query**: Tencent Cloud SCF (事件函数) — Function URL event/response format, timer trigger event/cron, Node runtime & module format
- **Scope**: external (official Tencent Cloud SCF docs, cloud.tencent.com / tencentcloud.com)
- **Date**: 2026-08-25

## Summary of key facts

- Function URL on an **event function** passes a slim APIGW-style event: `body` (plain string, **NOT** base64), `headers`, `httpMethod`, `path`, `queryString` — and explicitly **drops** `requestContext`, `pathParameters`, `queryStringParameters`, `headerParameters`, `isBase64Encoded`.
- Function URL response (集成响应) returns `{ statusCode, headers, body }`. The old APIGW 4-field format `{ isBase64Encoded, statusCode, headers, body }` is also accepted ("函数 URL 兼容 apigw 响应集成，无需改造").
- Timer trigger event = `{ "Type":"Timer", "TriggerName":..., "Time":..., "Message":... }`; `Time` is UTC+0.
- Timer cron is **7 fields** `秒 分 时 日 月 星期 年` (a legacy **5-field** form `分 时 日 月 星期` also works, not recommended). Weekday = `0-6` or `SUN-SAT`, **0 = Sunday**. Cron schedule runs in **UTC+8 (Beijing time)**, independent of the function's `TZ` env var.
- Node runtimes: 20.19 / 18.15 / 16.13 / 14.18 / 12.16 / 10.15 / 8.9 (deprecating) / 6.10 (deprecating). Entry must be **CommonJS** `exports.main_handler`; default handler string is `index.main_handler`. No ESM documented for the handler entry.

---

## 1. Function URL — event format for an 事件函数 (Event function)

Source: [函数 URL 概述](https://cloud.tencent.com/document/product/583/96099) (cloud.tencent.com, updated 2025-08-12).

Function URL is a dedicated HTTP(S) endpoint for the function (`https://<app-id>-<url-id>.<region>.tencentscf.com`), sits alongside triggers, and applies to both event and Web functions. For an **event function**, the URL converts the HTTP request into the `event` argument:

```json
{
    "body":"{\"test\":\"hello world\"}",
    "headers":{
        "accept":"*/*",
        "accept-encoding":"gzip, deflate, br",
        "cache-control":"no-cache",
        "connection":"keep-alive",
        "content-length":"17",
        "x-scf-remote-addr":"111.206.96.145"
    },
    "httpMethod":"POST",
    "path":"/",
    "queryString":{
        "a":"1",
        "b":"2"
    }
}
```

Exact field locations:

| Field | Meaning |
|---|---|
| `event.body` | Request body as a **String** (raw, not base64). |
| `event.headers` | Flat object of request headers. `x-scf-remote-addr` holds the client source IP (per doc comment). |
| `event.httpMethod` | HTTP method (`GET`/`POST`/…). |
| `event.path` | Actual request path. |
| `event.queryString` | Object of parsed query-string key/values. |

**Critical note (base64):** the doc states the Function URL event is "兼容apigw协议，**去掉 headerParameters、isBase64Encoded、pathParameters、queryStringParameters、requestContext 相关字段**" — i.e. compared to the full API-Gateway event, Function URL **removes** `headerParameters`, `isBase64Encoded`, `pathParameters`, `queryStringParameters` and `requestContext`. Consequences for the port:

- `event.body` is always a plain string — **do NOT base64-decode** it (there is no `isBase64Encoded` flag in the Function URL event).
- There is no `event.requestContext` / `event.pathParameters` / `event.queryStringParameters` — use `event.path` + `event.queryString` instead.
- Header keys in the doc example are all **lowercase** (HTTP/2 style). Look headers up case-insensitively (e.g. lower-case before indexing) to be safe.

For comparison, the full legacy APIGW event (still valid if APIGW trigger used, but APIGW trigger is being retired) is documented at [API 网关触发器概述 (即将下线)](https://cloud.tencent.com/document/product/583/12513):

```json
{
  "requestContext": { "serviceId": "...", "path": "/test/{path}", "httpMethod": "POST",
                      "requestId": "...", "identity": { "secretId": "..." },
                      "sourceIp": "10.0.2.14", "stage": "release" },
  "headers": { "accept-Language": "en-US,en,cn", "host": "...", "user-Agent": "User Agent String" },
  "body": "{\"test\":\"body\"}",
  "pathParameters": { "path": "value" },
  "queryStringParameters": { "foo": "bar" },
  "headerParameters": { "Refer": "10.0.2.14" },
  "stageVariables": { "stage": "release" },
  "path": "/test/value",
  "queryString": { "foo": "bar", "bob": "alice" },
  "httpMethod": "POST"
}
```

## 2. Function URL — response format (集成响应)

Source: [函数 URL 概述](https://cloud.tencent.com/document/product/583/96099) (§ 事件函数 → 响应参数).

Standard response payload returned by the handler:

```json
{
   "statusCode": 200,
    "headers": {
        "Content-Type": "application/json",
        "My-Custom-Header": "Custom Value"
    },
    "body": "{ \"message\": \"Hello, world!\" }"
}
```

Exact field names:

| Field | Type | Meaning |
|---|---|---|
| `statusCode` | Integer | HTTP status code. |
| `headers` | Object (key→string, or key→[value,…]) | HTTP response headers. |
| `body` | String | HTTP response body. |

Behavior notes:

- "函数会为您推断响应格式" — if the handler returns valid JSON **without** `statusCode`, SCF assumes `statusCode = 200`, `content-type = application/json`, `body` = the returned value (stringified).
- The migration notice [API 网关触发器功能下线通知](https://cloud.tencent.com/document/product/583/107631) explicitly states: "**函数 URL 兼容 apigw 响应集成，无需改造**". Therefore the classic APIGW integration-response shape is also accepted:

```json
{
    "isBase64Encoded": false,
    "statusCode": 200,
    "headers": {"Content-Type":"text/html"},
    "body": "<html>...</html>"
}
```

(from [API 网关触发器概述](https://cloud.tencent.com/document/product/583/12513): `isBase64Encoded` boolean, `statusCode` Integer, `headers` object, `body` string; duplicate header values may be given as arrays `{"Key":["v1","v2"]}`; `Location` key not supported in `headers`).

Recommendation for the port: return the minimal 3-field form `{ statusCode, headers, body }`; adding `isBase64Encoded: false` is harmless and APIGW-compatible, but is not required by Function URL.

## 3. Timer trigger — event format

Source: [定时触发器说明](https://cloud.tencent.com/document/product/583/9708) (cloud.tencent.com, updated 2023-08-24) and [触发器事件消息结构汇总](https://cloud.tencent.com/document/product/583/31927).

```json
{
    "Type":"Timer",
    "TriggerName":"EveryDay",
    "Time":"2019-02-21T11:49:00Z",
    "Message":"user define msg body"
}
```

| Field | Meaning |
|---|---|
| `Type` | Always the string `"Timer"`. |
| `TriggerName` | Timer trigger name (≤60 chars: `a-z A-Z 0-9 - _`, must start with a letter, unique per function). |
| `Time` | Trigger creation time, **UTC+0** (0时区). |
| `Message` | User-defined string (optional, ≤4 KB, empty by default; set via the 入参/CustomArgument field). |

Branching note: an event function receives this exact object for timer invocations. The cleanest dispatch in `main_handler` is `if (event.Type === 'Timer') { /* daily push */ } else { /* Function URL webhook */ }`. (Function URL events never contain a `Type` field.)

## 4. Timer trigger — cron expression

Source: [定时触发器说明](https://cloud.tencent.com/document/product/583/9708) + international [Timer Trigger Description](https://www.tencentcloud.com/document/product/583/9708).

### Field count & order

- **Recommended syntax: 7 fields**, space-separated: `秒 分 时 日 月 星期 年` (Second Minute Hour Day Month Week Year).
- **Legacy syntax: 5 fields** (not recommended): `分 时 日 月 星期` (Minute Hour Day Month Week) — kept for backward compatibility.

### Field ranges

| Position | Field | Values | Wildcards | Special symbols |
|---|---|---|---|---|
| 1 | 秒 Second | 0–59 | `, - * /` | — |
| 2 | 分 Minute | 0–59 | `, - * /` | — |
| 3 | 时 Hour | 0–23 | `, - * /` | — |
| 4 | 日 Day | 1–31 | `, - * /` | `? L W` |
| 5 | 月 Month | 1–12 or JAN–DEC | `, - * /` | — |
| 6 | 星期 Week | **0–6** or SUN,MON,TUE,WED,THU,FRI,SAT — **0 = Sunday**, 1 = Monday, …, 6 = Saturday | `, - * /` | `? L #` |
| 7 | 年 Year | 1970–2099 | `, - * /` | — |

Special symbols: `?` (day/week only, "not specified"), `L` (last; e.g. `5L` = last Friday, `LW` = last working day), `W` (nearest weekday, day field only), `#` (nth weekday, week field only, e.g. `2#3` = 3rd Tuesday). Wildcards: `,` union, `-` range, `*` all, `/` step.

**Important gotcha:** "在 Cron 表达式中的‘日’和‘星期’字段同时指定具体值时，两者为‘或’关系" — if both Day and Week are concrete values they are OR-ed. To say "only on weekdays", put `?` in the Day field and the weekday in the Week field (see examples).

### Timezone

- **Cron schedule timezone = UTC+8 (Beijing time).** This is independent of the function's runtime timezone.
- The function runtime itself defaults to **UTC**; setting env var `TZ=Asia/Shanghai` only affects `Date`-related behavior inside code (see [通用问题 FAQ](https://cloud.tencent.com/document/product/583/9180): "云函数的运行环境内保持的是 UTC 时间 … 可通过设置环境变量 TZ=Asia/Shanghai 指定时区").
- Note: the current 9708 doc text does **not** state the cron timezone explicitly (only that the event `Time` field is 0时区). UTC+8 for the schedule is corroborated by the Tencent Cloud community article ("定时触发的时间使用的是 utc+8 的时区") and the WeChat Cloud Development timer-trigger doc ("触发器规则的时区为 UTC+8"). Treat as verified-by-secondary-source; if schedule drift is observed, verify against a real run.

### Concrete cron strings (7-field)

| Intent | Cron (7 fields) | Notes |
|---|---|---|
| Weekdays 08:00 | `0 0 8 ? * MON-FRI *` | Day=`?`, Week=`MON-FRI` (0=Sun, so MON..FRI = 1-5). |
| Saturday 10:00 | `0 0 10 ? * SAT *` | SAT = 6. |
| Sunday 10:00 | `0 0 10 ? * SUN *` | SUN = 0. |
| Every 5 minutes | `0 */5 * * * * *` | official example. |
| Every day 10:00/14:00/16:00 | `0 0 10,14,16 * * * *` | official example. |

### Official examples (from 9708)

```
*/5 * * * * * *          每5秒触发一次
0 15 10 1 * ? *          每月1日 10:15
0 15 10 ? * MON-FRI *    周一至周五 10:15
0 0 10,14,16 * * * *     每天 10:00 / 14:00 / 16:00
0 */30 9-17 * * * *      每天 9:00–17:00 每半小时
0 0 12 ? * WED *         每周三 12:00
0 0 0 L * * *            每月最后一天 00:00
0 0 0 ? * 2#3 *          每月第三个星期二 00:00
0 0 0 LW * ? *           每月最后一个工作日 00:00
```

### TriggerDesc (API)

When creating via API [CreateTrigger](https://cloud.tencent.com/document/product/583/18589), use `Type=timer` and `TriggerDesc` = the cron expression (optionally wrapped as `{"cron":"0 */2 * * * * *"}` — console/API returns it in this JSON form). `CustomArgument` (≤4 KB) maps to the timer event `Message` and is timer-only.

## 5. Node.js runtime & module format

Sources: [Node.js 环境说明](https://cloud.tencent.com/document/product/583/11060), [Node.js 开发方法](https://cloud.tencent.com/document/product/583/67790), [函数概述](https://cloud.tencent.com/document/product/583/19805).

### Available versions

- Node.js 20.19
- Node.js 18.15
- Node.js 16.13
- Node.js 14.18
- Node.js 12.16
- Node.js 10.15
- Node.js 8.9（即将下线 / deprecating）
- Node.js 6.10（即将下线 / deprecating）

Recommend Node 18.15 or 20.19. Note: "Node.js 14.18 及之后版本，平台不再额外内置依赖库" — the runtime does **not** bundle third-party libs on 14.18+, so bundle deps yourself (consistent with the esbuild single-file plan in the PRD). Runtime env exposes `NODE_PATH` including `/var/user/node_modules` (i.e. you could also ship node_modules in the zip).

### Module format & handler naming

- The entry module must be **CommonJS**; the documented handler pattern is:

```js
exports.main_handler = async (event, context) => {
  console.log(event);
  console.log(context);
  return event;
};
// or callback style:
exports.main_handler = (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false; // optional, avoid hanging
  callback(null, "hello world");
};
```

- **ESM is not documented as a supported handler entry.** Only the `exports.<fn>` (CommonJS) form appears in the official docs. For a bundled entry, have esbuild emit **CJS** (`format=cjs`), matching the PRD plan (`dist-scf/index.js`).
- **Default execution method string: `index.main_handler`** — two-segment format `[文件名].[函数名]`: `index` ⇒ entry file `index.js`, `main_handler` ⇒ exported function. The zip must contain the entry file at the **root** (do not wrap in an outer folder), with the exported name matching the handler config.
- Handler signature: `main_handler(event, context, callback?)` — `callback` optional; async handlers must return a Promise (promise + callback must not be mixed).
- The `context` object carries request/runtime metadata (RequestId, function name/version, region, etc.).

### Runtime timezone

- Runtime defaults to UTC; set env `TZ=Asia/Shanghai` to change (the console "时区" setting just injects `TZ`). This does **not** affect the timer-trigger schedule (which is UTC+8, see §4).

## External References

- [函数 URL 概述](https://cloud.tencent.com/document/product/583/96099) — Function URL event & response format (event function), endpoint naming.
- [创建函数 URL](https://cloud.tencent.com/document/product/583/100227) — console + API creation; API uses `Type=http`, `TriggerDesc` with `AuthType`/`NetConfig`/`CorsConfig`.
- [API 网关触发器功能下线通知](https://cloud.tencent.com/document/product/583/107631) — "函数 URL 兼容 apigw 响应集成，无需改造"; migration guide.
- [API 网关触发器概述（即将下线）](https://cloud.tencent.com/document/product/583/12513) — full APIGW event shape & integration-response fields (superset Function URL is based on).
- [定时触发器说明](https://cloud.tencent.com/document/product/583/9708) — timer event structure + cron syntax + examples.
- [Timer Trigger Description (intl)](https://www.tencentcloud.com/document/product/583/9708) — confirms 5-field legacy syntax + 7-field recommended syntax.
- [触发器事件消息结构汇总](https://cloud.tencent.com/document/product/583/31927) — Timer event JSON.
- [CreateTrigger API](https://cloud.tencent.com/document/product/583/18589) — `Type` values (`timer`, `http`, …), timer `TriggerDesc` = cron, `CustomArgument` (timer-only).
- [Node.js 环境说明](https://cloud.tencent.com/document/product/583/11060) — Node versions, NODE_PATH, bundled libs.
- [Node.js 开发方法](https://cloud.tencent.com/document/product/583/67790) — CommonJS handler, `index.main_handler`, async/callback semantics.
- [函数概述](https://cloud.tencent.com/document/product/583/19805) — execution-method format, 时区/TZ behavior, function types.
- [通用问题 FAQ](https://cloud.tencent.com/document/product/583/9180) — runtime timezone (UTC default, `TZ=Asia/Shanghai`).

## Caveats / Not Found

- **Cron timezone not stated verbatim in the current official 9708 doc** — only the event `Time` field is documented as UTC+0. UTC+8 for the *schedule* is corroborated by Tencent Cloud community article + WeChat Cloud Development timer docs ("触发器规则的时区为 UTC+8"). Recommend a smoke test to confirm the actual firing time before relying on it.
- **Function URL event omits `isBase64Encoded`** — so `event.body` is a raw string; the "is body base64?" question only applies to the legacy APIGW trigger, not Function URL. Verified by the explicit "去掉 … isBase64Encoded …" note.
- **Header case**: the Function URL doc example shows lowercase header keys (HTTP/2). Not explicitly guaranteed; handle header lookup case-insensitively.
- **Function URL response example omits `isBase64Encoded`**; the APIGW 4-field form is documented as compatible. Either form is acceptable.
- **ESM entry support**: not documented; official docs only show CommonJS `exports.main_handler`. If ESM is required, this is unverified — safest is CJS output from esbuild.
- Node version list is from the 2025-10-11 doc snapshot; newer patch versions may exist at deploy time.
