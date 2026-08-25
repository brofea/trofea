# Fix GitHub Issue #2

## Goal

Make `/历史谜题` return the requested non-puzzle content while clearly stating that the date has no puzzle.

## What I Already Know

* GitHub issue #2 reports that `/历史谜题` currently drops `knowledge` and `story` content.
* `src/commands/router.ts` returns only `"这一天没有谜题。"` for non-puzzle historical content.
* `buildMessage` already renders every content type as a Markdown message.

## Requirements

* When `/历史谜题 <date>` resolves to `knowledge` or `story`, return the original rendered content.
* Prefix the returned message with `这一天没有谜题`.
* Preserve the existing behavior for historical puzzle content, future dates, invalid dates, and missing content.
* Add a router-level regression test for historical non-puzzle content.

## Acceptance Criteria

* [ ] `/历史谜题 2026-08-20` returns a Markdown message for a `knowledge` or `story` document.
* [ ] The non-puzzle historical response contains `这一天没有谜题` before the normal title and body.
* [ ] Historical puzzle rendering remains unchanged.
* [ ] `npm test`, `npm run typecheck`, and `npm run build:scf` pass.

## Definition of Done

* Targeted regression test added or updated.
* Project checks pass.
* No secrets or generated SCF artifacts are added.

## Technical Approach

Use the existing `buildMessage` renderer for all historical content. For non-puzzle content, wrap its text in a Markdown response prefixed with the required notice; do not alter the renderer shared by scheduled and current-content flows.

## Decision (ADR-lite)

**Context**: Historical non-puzzle content is currently suppressed in the command router.

**Decision**: Keep the behavior local to `CommandRouter.handleHistory` and reuse `buildMessage` for the existing content format.

**Consequences**: The requested behavior is fixed without changing unrelated command or scheduled-message wording.

## Out of Scope

* Changing `/今日谜题` behavior.
* Changing content parsing, storage, date formats, or command names.
* Altering missing-content or future-date responses.

## Technical Notes

* Issue: https://github.com/brofea/trofea/issues/2
* Expected code and test locations: `src/commands/router.ts`, `test/router.test.ts`.
* Relevant quality guidance: `.trellis/spec/worker/index.md`.
