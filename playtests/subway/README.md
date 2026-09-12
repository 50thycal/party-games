# Subway playtest archive

Human digital exports shared by the owner belong here permanently, in the same
repository as the game. `index.json` is the catalog. There are no supplied human
playtests yet; simulation fixtures must never be presented as human evidence.

Run from the checkout:

```sh
node scripts/archive-subway-playtest.mjs /path/to/export.json calibration "Owner observations"
```

Use `holdout` for games reserved to validate a policy after tuning; `reference`
for historical evidence. The original file's SHA-256 is its directory ID. Identical
reimports are no-ops. Original bytes never change. Metadata captures rules/build,
source population, player count and replay capability. Observations and analysis
are separate Markdown files. Commit the new directory and index together.

New JSON exports include initialization, reducer actions, time/random tapes,
controller provenance, notes and final state. Credentials are never exported.
Malformed JSON is preserved as reference-only with a malformed validation label.
Older text reports are stored as legacy reference, with unavailable replay and
unknown rules marked explicitly. Do not reconstruct missing actions as fact.

Use the lab's Review exports screen to verify exact replay against matching rules.
Record verified status and findings in analysis; preserve raw metadata provenance.
Keep calibration/holdout cohorts fixed before tuning, compare only matching rules
and player counts, and keep mixed/bot games out of the human baseline. More
simulations do not establish human validity. Archive batch simulations only when
useful as a deliberate experiment checkpoint, not every generated game.

The app downloads records; it does not carry GitHub credentials or push commits.
Repository ingestion is performed by the development agent when Calvin shares an
export. Saving a browser import is not the same as archiving it in this repository.
