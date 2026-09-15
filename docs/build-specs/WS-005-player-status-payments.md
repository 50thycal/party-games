# WS-005 — JNCG public status, drafting and station access

Framework: Build OS v0.12 checked against canonical 2026-09-15. Significant
continuation; owner authorized one PR after sequential planning. Do not merge.

## Goal
After this change, players should understand public leaders, line ownership,
build progress, Destination connectivity and payments at a glance; nobody can
stack pegs, and the last route drafter always chooses between two contracts.

## Approved scope
- iPad bottom player pads: name, money, line colors/codes; no progress dots.
  Confirmed payments animate a debit and corresponding credits beside pads,
  with pre-confirm recipient/reason/total preview. Undo reverses payment display.
  Replace money toasts; reduced-motion and reconnect/poll deduplication required.
- Phone top status: cash, longest-network and largest-station standings, own
  line colors/codes and built/remaining nodes/segments with separate starter dot.
- Live public longest-network leader/length and largest local station size/
  majority company; ties explicit. No new VP award in this display-only scope.
- Destinations are unordered neighborhoods in one own network. Any order,
  multiple connected unfinished lines, no starter/final requirement.
- Draft 3N+1 unique contracts for N players, 7/10/13 pools; still three picks
  each and one unused card. Add Copper/CO, seven segments (least represented
  segment count), distinct recipe, with comparable seven-segment economics.
- One peg per hole for all companies/lines, starters and builds, plans included.
  Transfers use orthogonal adjacency; no diagonal-only or string-only transfers.
- Join an opponent's local station: $1M once for this line, opponent and station.
  Further nodes on the same line at that growing/merged station do not repay.
  A different line, opponent or separate station can require a new payment.
  Crossing/contact with opposing strings keeps existing per-contact charges,
  irrespective of prior station access. A single join touching several pegs
  at one station is one fee per recipient. Current neighboring owners receive
  their respective fees; own-line contact is free. Starter placement has no base cost, but joining an opponent station
  with a starter pays the same access fee immediately. Existing participants are
  not charged back when the joiner later expands. Receipt topology and money are restored by Undo.
- State version/replay policy bumped; public payment events contain no hands.

## Non-goals
Highlight privacy change, zigzag segments, new largest-station VP, artwork
redesign, other economy/card rebalance, production merge.

## Acceptance
Reducer/preview parity; repeat joins vs other-line/other-station fees; mixed-owner
and cluster-growth/merge cases; independent crossing fees; starter/build/ghost
stack rejection; Undo and replay. Draft at 2/3/4 players finishes with one unused
card and two choices on final pick. Leaders ties/empty board and phone progress
exclude starter from segment count. Money animation deduplicates polls/remounts.
Build/lint/full Subway suite, browser desktop/phone when accessible, independent
current-head review and documentation-only finalization, one PR.
