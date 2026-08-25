# 管理员可查询未来历史谜题

## Goal

Allow the configured QQ Bot administrator to inspect future content through `/历史谜题 <date>` in C2C messages only, while retaining the existing future-date restriction for all group messages and every other user.

## What I Already Know

* `CommandRouter.handleHistory` currently rejects every date after its injected `today` date.
* `ADMIN_OPENID` is already required configuration and is available as `services.config.adminOpenid`.
* Verified QQ events expose the message sender as `event.userOpenid`; the event type distinguishes C2C messages from group mentions.

## Requirements

* Pass the message context, sender OpenID, and configured administrator OpenID to the command-routing decision.
* When `/历史谜题 <date>` requests a future date, allow it only for a C2C message whose sender OpenID exactly matches `ADMIN_OPENID`.
* Group messages must always retain the future-date restriction, including messages sent by the configured administrator.
* An authorized administrator receives the same rendered content or existing missing-content response as a normal historical query.
* Non-administrators retain the existing future-date rejection response.
* Do not change the behavior of `/今日谜题`, date parsing, message rendering, configuration validation, or daily push behavior.

## Acceptance Criteria

* [ ] A non-administrator requesting a future date receives the existing future-content rejection message.
* [ ] An administrator requesting a future puzzle in C2C receives its rendered Markdown content.
* [ ] An administrator requesting unavailable future content receives the existing no-content response.
* [ ] A group message requesting a future date receives the existing future-content rejection message, including when its sender OpenID equals `ADMIN_OPENID`.
* [ ] Admin authorization is based on the verified C2C message sender OpenID.
* [ ] `npm test`, `npm run typecheck`, and `npm run build:scf` pass.

## Definition of Done

* Focused regression tests cover both authorization outcomes and the webhook-to-router identity propagation.
* Existing behavior remains covered by the test suite.
* No secrets or local environment files are added to the repository.

## Technical Approach

Extend the router dependencies with the C2C context, caller identity, and configured administrator identity, then exempt an exact sender/admin match only when the event is C2C. `handleVerifiedEvent` supplies those values from its verified event and loaded configuration.

## Decision (ADR-lite)

**Context**: The date restriction is enforced in the command router, but the router currently has no caller identity.

**Decision**: Make authorization explicit at the router boundary by passing C2C context plus sender and administrator OpenIDs from the verified event path.

**Consequences**: The policy remains local to `/历史谜题`, is independently testable, and can only be granted for a verified C2C sender. Group messages cannot gain the exception.

## Out of Scope

* Adding roles, multiple administrators, or a separate permission configuration.
* Bypassing future-date restrictions for other commands.
* Altering QQ webhook signature verification.

## Technical Notes

* Relevant implementation files: `src/commands/router.ts`, `src/bootstrap.ts`.
* Relevant tests: `test/router.test.ts`, `test/bootstrap.test.ts`.
* Relevant contract: `.trellis/spec/worker/qqbot-worker-contract.md`.
