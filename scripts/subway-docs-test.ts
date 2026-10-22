import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUBWAY_CONFIG, LINE_CONTRACTS, activationCost, cardPurchaseCost, type SubwayPlayer } from '../src/games/subway/config';
import { ENGINEERING_CARDS } from '../src/games/subway/engineering';
import { SUBWAY_LESSONS } from '../src/games/subway/tutorial';
import { introSlides } from '../src/games/subway/Intro';

// Rules text drifts when a number lives in several places (docs/subway-rules-audit.md, K4).
// Every player-facing surface must state the numbers the reducer actually uses.
// Compare prose, not layout: markdown emphasis and line wrapping are ignored.
const flat = (text: string) => text.replace(/\*\*/g, '').replace(/\s+/g, ' ');
const read = (name: string) => flat(readFileSync(`src/games/subway/${name}`, 'utf8'));
const docs = { rulebook: read('RULEBOOK.md'), rules: read('RULES.md'), quick: read('QUICK_START.md') };
const tutorial = flat(SUBWAY_LESSONS.map(l => `${l.text} ${l.task}`).join(' '));
const intro = JSON.stringify(introSlides({}));
const C = SUBWAY_CONFIG;
const has = (surface: string, text: string, pattern: RegExp, what: string) =>
  assert.ok(pattern.test(text), `${surface}: ${what} (expected ${pattern})`);
const money = (millions: number) => new RegExp(`\\$${millions}(M| million)\\b`);

// Starting cash, completion cash and nine rounds, on every surface.
for (const [surface, text] of Object.entries({ ...docs, tutorial, intro })) {
  has(surface, text, money(C.startingMoney), 'starting cash');
  has(surface, text, money(C.completionReward), 'line completion cash');
}
has('rulebook', docs.rulebook, /nine rounds/, 'round cap');
has('rules', docs.rules, new RegExp(`${C.timelinePeriods} construction rounds`), 'round cap');
has('quick', docs.quick, /nine construction rounds/, 'round cap');

// Crew bills 0/1/3/6 in every crew table and in the tutorial.
const bills = [1, 2, 3].map(n => activationCost({} as SubwayPlayer, n));
for (const [surface, text] of Object.entries(docs)) {
  for (const bill of bills) has(surface, text, new RegExp(`\\| \\$${bill}(M| million) \\|`), `crew bill $${bill}M`);
}
has('tutorial', tutorial, new RegExp(`\\$${bills[0]}M for one, \\$${bills[1]}M for two, \\$${bills[2]}M for three`), 'crew bills');

// Destination VP and first-connection cash (G1).
const { pair, triple } = C.destinationCompletionReward;
for (const [surface, text] of Object.entries({ ...docs, tutorial, intro })) {
  has(surface, text, new RegExp(`\\$${pair}(M| million)`), 'pair Destination cash');
  has(surface, text, new RegExp(`\\$${triple}(M| million)`), 'triple Destination cash');
}
for (const [surface, text] of Object.entries(docs)) if (surface !== 'quick') {
  has(surface, text, new RegExp(`missions (award|pay) ${C.destinationVp} VP|Two neighborhoods \\| \\$${pair} million \\| ${C.destinationVp} VP`), 'pair Destination VP');
  has(surface, text, new RegExp(`missions (award|pay)? ?${C.threeStationDestinationVp} VP|Three neighborhoods \\| \\$${triple} million \\| ${C.threeStationDestinationVp} VP`), 'triple Destination VP');
}

// Optional card prices.
for (const surface of ['rulebook', 'rules'] as const) {
  const d = cardPurchaseCost('destination'), e = cardPurchaseCost('engineering');
  has(surface, docs[surface], new RegExp(`extra random Destination for \\$${d}( million|M)|\\$${d}( million|M) for one extra random Destination`), 'Destination price');
  has(surface, docs[surface], new RegExp(`extra Engineering goal,? (each )?for \\$${e}( million|M)|\\$${e}( million|M) for one extra Engineering`), 'Engineering price');
}

// Contact toll and ending-cash spectrum.
for (const [surface, text] of Object.entries(docs)) {
  has(surface, text, new RegExp(`\\$${C.contact.toll}(M| million)`), 'contact toll');
  has(surface, text, new RegExp(`${C.contact.debtVpPerMillion}( VP)? per \\$1M`), 'debt rate');
}
const [five, four, two] = C.cashBands;
const band = (label: string, vp: number) => new RegExp(`${label}[^.]{0,12}\\+${vp}|\\+${vp} VP at ${label}`);
for (const [surface, text] of Object.entries(docs)) {
  has(surface, text, band(`\\$${five.min}M or more`, five.vp), 'top cash band');
  has(surface, text, band(`\\$${four.min}M`, four.vp), 'second cash band');
  has(surface, text, band(`\\$${two.min}M to \\$3M`, two.vp), 'third cash band');
}

// Draft pool 3n+1 for n = 2..4.
has('rulebook', docs.rulebook, /2 players: 7 contracts - 3 players: 10 contracts - 4 players: 13 contracts/, 'contract pool');
has('rules', docs.rules, /7\/10\/13 unique lines for 2\/3\/4 companies/, 'contract pool');

// Line-contract tables match the contract data exactly, in both references.
for (const surface of ['rulebook', 'rules'] as const) for (const c of LINE_CONTRACTS) {
  const row = `| ${c.name} | ${c.code} | ${c.recipe.join(', ')} | $${c.cost}M | ${c.completionVp} | ${c.incompletePenalty} |`;
  assert.ok(docs[surface].includes(row), `${surface}: ${c.name} row should read ${row}`);
}

// Engineering card tables match the card data exactly, in both references.
for (const surface of ['rulebook', 'rules'] as const) for (const card of ENGINEERING_CARDS) {
  const row = `| ${card.name} | ${card.vp} | ${card.requirement} |`;
  assert.ok(docs[surface].includes(row), `${surface}: ${card.name} row should read ${row}`);
}

// Retired or stale rules must not come back (G4, G5, G6, G8, G14).
const retired: [string, RegExp][] = [
  ['card privacy', /private until results/],
  ['flexible length', /[Ss]hortening is enabled|Optional shortening|Flexible length/],
  ['drafted Destinations', /[Dd]raft three Engineering goals and two Destinations/],
  ['paid station access', /\$1M once per line, opponent/],
  ['diagonal step counted as one peg space (G2)', /neighboring peg, either orthogonally or diagonally/],
  ['board locations called pegs (G3)', /grid of pegs|Each peg can hold only one station/],
  ['paid extensions (DEC-068)', /1–2(\.5)? peg spaces|paid extension\b(?! ?\(?DEC)|[Ee]xtend (any )?one (of your )?lines?/],
  ['bend-token or straight-only variant (DEC-065)', /bend tokens|straight-only|Optional bend/i],
  ['one pair and one triple dealt (DEC-067)', /one two-neighborhood and one three-neighborhood|one pair and one triple|one naming two neighborhoods and one naming three/],
  ['same-line or lone-station award groups (DEC-069)', /including (pegs on )?the same line|counts same-line adjacency|includes same-line adjacency|size-one group|singleton occupied holes count/],
  ['one charge per owner at a point (DEC-066)', /once per owner|per distinct contact per owner|even after transfer access/],
];
const everywhere = { ...docs, tutorial, intro, terminology: read('TERMINOLOGY.md'), table: read('table.tsx') };
for (const [surface, text] of Object.entries(everywhere)) for (const [what, pattern] of retired) {
  assert.ok(!pattern.test(text), `${surface}: stale ${what} (${pattern})`);
}

// Dealt three, keep two, from one mixed deck (DEC-067).
for (const [surface, text] of Object.entries({ ...docs, tutorial, intro })) {
  has(surface, text, /(dealt|deal) three/i, 'three Destinations dealt');
  has(surface, text, /keep(s|ing)? two/i, 'keep two Destinations');
}

// Free contacts at a shared transfer station are taught wherever tolls are (DEC-066).
for (const [surface, text] of Object.entries({ ...docs, tutorial, intro })) {
  has(surface, text, new RegExp(`within ${C.contact.sharedStationFreeReach} (peg )?space`), 'shared-station free contacts');
}


console.log('Rules text: numbers, contract and card tables match the reducer; no retired rules remain.');
