# WS-005 — Draft rules and current-player destination highlights

Status: owner authorized implementation. Build OS v0.12 checked against canonical
on 2026-09-15; compatible. Existing WS-005 continuation, no new mission.

## Goal
Persist the quick-start and full rulebook presented for review, prominently marked
DRAFT — NEEDS OWNER REVIEW, and correct the iPad destination highlight leak.

## Scope and acceptance
- Add linked quick-start and full player rulebook drafts; mark the existing rules
  reference as draft too. Preserve current mechanics and tables. No claim of owner
  rules approval. Record proposed graphics for later, without generating images.
- Keep each company's selected destinations across turns/reconnects. Tablet
  projection, map highlights and legend include only the current actor's selected
  cards; when there is no actor, none are shown. A phone sees only its own choices,
  including while another player acts. Clearing affects only that phone's choices.
- Test 2/3/4-player handoffs, incoming/outgoing selections, no-selection actor,
  return turns, reconnect and no-actor phases. Retain legacy selection support.
- Build, lint, full Subway suite and independent current-head review before handoff.

## Non-goals
No change to turns, geometry, scoring, fees or card balance. Turn question follows
this PR. Bendable connections remain last. Artwork and owner rules review deferred.
No new rules UI required; repository Markdown is the review/publishing surface.
