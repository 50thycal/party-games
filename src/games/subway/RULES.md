# Subway v0.1 rules and design pins

Subway is a single-project, two-player prototype. Each player buys one contract, commits three private Engineering cards, secretly schedules its contiguous construction block, places one free starter peg, and constructs one continuous route. Shared periods are allowed; the displayed priority player acts first.

## Prototype assumptions

- Procurement ends immediately after both companies own a contract. This keeps the alternating market deterministic.
- A station is claimed once per company, regardless of how many times that route visits it. Capacity counts companies.
- Adjacent opposition spacing uses the eight surrounding holes. It applies only between normal nodes; station tiles and strings do not project exclusion walls.
- Construction cards are played immediately before a scheduled build. Overtime and Extra Crew both add exactly one immediate sequential build in v0.1. Field Adjustment makes the already-flexible next destination explicit; built nodes never move. Expedite shifts the remaining schedule start one period earlier where possible.
- Geometry uses peg-coordinate vectors with 15°, 30°, and 50° tolerances. Parallel Corridor compares segment headings; overlap length is intentionally approximated for playtesting.
- Clients receive shared room state, but the view never renders an opponent's card identities before scoring. True server-filtered private state is a future engine enhancement.

## Future design pins (not implemented)

- **Survey Markers:** give each player 2–3 non-reserving, stackable intent markers during Engineering and consider bonus VP when a route reaches one.
- **Company Cards:** asymmetric money, card counts, and abilities.
- **Multiple Line Contracts:** multiple project cycles per company.
- **Bot Player:** optional server-controlled third transit company for two-human games.
- **Additional maps:** vary station layouts, peg density, geography, and constraints.
