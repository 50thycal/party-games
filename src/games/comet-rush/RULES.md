# Comet Rush - Complete Game Rules

## Overview

**Comet Rush** is a strategic multiplayer game where players compete to save Earth from an approaching comet. Players collect resources, draw powerful cards, build customizable rockets, and launch them at the comet before it reaches Earth. The player who deals the most damage wins!

---

## Quick Start Summary

| Element | Details |
|---------|---------|
| **Players** | 2-4 players |
| **Goal** | Destroy the comet before it reaches Earth |
| **Win Condition** | Player with the most trophy points wins |
| **Starting Resources** | 20 cubes per player |
| **Starting Cards** | Draft 4 cards from any deck |
| **Income** | 5 cubes per turn (can be upgraded) |

---

## Game Setup

When the game begins:

1. **Each player receives:**
   - 20 resource cubes
   - **Draft 4 cards** from any of the 3 decks (Engineering, Espionage, or Economic - your choice!)

2. **The comet starts at distance 18** from Earth

3. **Strength cards are dealt** (based on player count):
   - 2 players: 6 cards (strength 4-9)
   - 3 players: 7 cards (strength 4-10)
   - 4 players: 8 cards (strength 4-11)

---

## Turn Structure

Each player's turn follows these steps:

### 1. Begin Turn & Collect Income
- Collect your income: **Base income (5)** + any income bonuses
- If you are under an **Embargo**, you receive 0 income this turn

### 2. Draw Cards
- Choose to draw from **one of three decks**:
  - **Engineering Deck** (upgrades and rocket improvements)
  - **Espionage Deck** (player interaction and sabotage)
  - **Economic Deck** (resource and funding cards)
- **Normal game:** Draw **1 card** per turn
- **Late game (comet ≤9 from Earth):** Draw **2 cards** per turn!

### 3. Main Actions (Any Order)
During your turn, you may:
- **Build ONE rocket** (only one per turn)
- **Launch rockets** (as many ready rockets as you want)
- **Play cards** from your hand (multiple allowed)
- **Trade cards** (discard 2 cards → draw 1 from any deck) - FREE ACTION

### 4. End Turn
- Click "End Turn" to pass to the next player
- At the **end of each round** (after all players have taken a turn):
  - A **Movement card** is drawn
  - The **comet advances** toward Earth

---

## Building Rockets

Rockets are your primary weapon against the comet. Each rocket has three attributes:

### Rocket Attributes

| Attribute | Range | Effect |
|-----------|-------|--------|
| **Power** | 1-8 | Damage dealt to comet on a successful hit |
| **Accuracy** | 1-5 | Hit on dice roll ≤ this value (higher = more reliable) |
| **Build Time** | 1-3 | How quickly the rocket is ready |

### Build Time Cost System

| Build Time | Cube Cost | Turns to Build |
|------------|-----------|----------------|
| 1 | 1 cube | 2 turns (slow but cheap) |
| 2 | 2 cubes | 1 turn (balanced) |
| 3 | 5 cubes | Instant (fast but expensive) |

### Total Rocket Cost
**Total Cost = Power + Accuracy + Build Time Cube Cost**

*Example: A rocket with Power 4, Accuracy 3, and Instant Build (3) costs 4+3+5 = 12 cubes*

### Building Limits
- You can only **build ONE rocket per turn**
- Maximum of **3 rockets in progress** at any time (can be upgraded)
- Power is capped at **3** initially (can be upgraded to 8)
- Accuracy is capped at **3** initially (can be upgraded to 5)

---

## Launching Rockets

When you launch a ready rocket:

### The Dice Roll
1. Roll a **single 6-sided die (1d6)**
2. Compare the result to your rocket's **Accuracy**:
   - **HIT:** Roll ≤ Accuracy
   - **MISS:** Roll > Accuracy

*Example: Accuracy 4 means you hit on rolls of 1, 2, 3, or 4 (66% chance)*

### On a Hit
- Deal **[Power] damage** to the active comet segment
- If damage **≥ segment's remaining health**:
  - **Destroy** the segment
  - **Collect it as a trophy** (worth its strength value in points)
  - Next segment becomes active
- If damage **< segment's health**:
  - Reduce segment health by your power
  - Segment remains active

### On a Miss
- Your rocket is consumed with no effect
- **If you have a Reroll Token:** You may choose to use it for a second chance
- **If you are Sabotaged:** You must reroll (no choice - see Sabotage below)

---

## The Comet

### Comet Distance
- The comet starts at **distance 18** from Earth
- Each round, a **Movement card (1-3)** is drawn
- The comet moves that many spaces closer to Earth
- **If the comet reaches distance 0: EARTH IS DESTROYED!**

### Comet Segments (Strength Cards)
- The comet has multiple segments, each with a **strength value** based on player count
- Number of segments scales with player count:
  - **2 players:** 6 segments (strength 4-9)
  - **3 players:** 7 segments (strength 4-10)
  - **4 players:** 8 segments (strength 4-11)
- Players must destroy segments in order (first to last)
- Each segment has health equal to its strength value
- When a segment is destroyed, the player who dealt the final blow **claims it as a trophy**
- **Note:** Segments with strength 9+ cannot be one-shot even at max power (8)

---

## Card Types

### Engineering Cards (7 types, 44 total)
Rocket engineering, optimization, and reliability:

| Card | Rarity | Count | Effect |
|------|--------|-------|--------|
| **Mass Production** | Rare | 4 | −1 build time for all rockets |
| **Flight Adjustment** | Rare | 4 | If next launch fails, re-roll once |
| **Warhead Upgrade** | Uncommon | 6 | +1 max power (up to 8) |
| **Guidance System Upgrade** | Uncommon | 6 | +1 max accuracy (up to 5) |
| **Streamlined Assembly** | Common | 8 | −1 build time for one rocket |
| **Comet Analysis** | Common | 8 | Peek at a strength or movement card |
| **Rocket Calibration** | Common | 8 | Play before launch: choose +1 Accuracy or +1 Power for that launch |

### Espionage Cards (7 types, 44 total)
Interference, sabotage, and intelligence:

| Card | Rarity | Count | Effect |
|------|--------|-------|--------|
| **Covert Rocket Strike** | Rare | 4 | Destroy any rocket (building or ready) of another player |
| **Embargo** | Rare | 4 | Target player gains no income next turn |
| **Espionage Agent** | Uncommon | 6 | Steal a random card from target player |
| **Diplomatic Pressure** | Uncommon | 6 | Block any card a target player attempts to play |
| **Resource Seizure** | Common | 8 | Steal 3 resources from target player |
| **Sabotage Construction** | Common | 8 | Force target player to re-roll a launch |
| **Regulatory Review** | Common | 8 | +1 build time to opponent's rocket |

### Economic Cards (7 types, 44 total)
Resources, funding, and financial advantage:

| Card | Rarity | Count | Effect |
|------|--------|-------|--------|
| **International Grant** | Rare | 4 | You gain 5 resources, all others gain 2 |
| **Funding Pressure** | Rare | 4 | Gain resources based on comet distance (4/8/12) |
| **Increase Income** | Uncommon | 6 | +1 income permanently (max 3) |
| **Rocket Salvage** | Uncommon | 6 | +1 resource per launch (max 3) |
| **Emergency Funding** | Common | 8 | Gain your income immediately |
| **Public Donation Drive** | Common | 8 | Gain 2 resources per built rocket (building + ready) |
| **Program Prestige** | Common | 8 | Permanent: +1 resource per card played (max 3) |

---

## Special Mechanics

### Flight Adjustment (Reroll Token)
When you play "Flight Adjustment":
- You gain a **reroll token**
- If your rocket launch **misses**, you may choose to use the token
- Roll the die again - this could turn a miss into a hit!
- The token is **consumed** whether you hit or miss on the reroll
- Each token is **single-use**

### Rocket Calibration (Pre-Launch Bonus)
When you play "Rocket Calibration":
- Choose **+1 Accuracy** OR **+1 Power** for your next launch
- The bonus applies to that single launch only
- Multiple copies can be played to stack bonuses
- Subject to caps (accuracy max 5, power max 8)

### Sabotage Construction (Forced Reroll)
When an opponent plays "Sabotage Construction" on you:
- Your **next rocket launch** is affected
- If you **HIT** on your first roll: You **must** reroll (could become a miss!)
- If you **MISS** on your first roll: The rocket is spent (no second chance)
- Sabotage creates risk - even a perfect roll might become a miss!

### Regulatory Review (Build Delay)
When an opponent plays "Regulatory Review" on you:
- One of your **building rockets** gains +1 turn build time
- The attacker chooses which rocket is affected

### Covert Rocket Strike (Rocket Destruction)
When targeted by "Covert Rocket Strike":
- The attacker destroys one of your **building or ready** rockets
- Rockets currently launching cannot be targeted

### Diplomatic Pressure (Card Block & Counter)
When an opponent plays "Diplomatic Pressure" on you:
- Your **next card play** will be blocked
- The card is discarded without effect
- Plan your turn carefully!

**Counter Mechanic:** If you have your own "Diplomatic Pressure" card in hand when targeted:
- You will be prompted: "You've been attacked! Would you like to use your counter card?"
- **If you counter:** Your Diplomatic Pressure card is discarded, the attack is nullified, and you are no longer under pressure
- **If you accept:** You keep your card but remain under the blocking effect
- This creates strategic decisions about when to save vs. use your defensive cards

### Embargo (Income Block)
When targeted by "Embargo":
- On your **next turn**, you receive **0 income**
- Your base income and bonuses are skipped for that turn only
- The embargo clears after it takes effect

### Funding Pressure (Distance-Based Reward)
When you play "Funding Pressure":
- Gain resources based on how close the comet is:
  - Distance 13+: Gain 4 cubes
  - Distance 7-12: Gain 8 cubes
  - Distance 6 or less: Gain 12 cubes
- More dangerous = more funding!

### Program Prestige (Stacking Bonus)
When you play "Program Prestige":
- Permanently gain +1 resource each time you play a card
- Effect stacks (max +3 bonus)
- Applies to all future card plays

### Comet Analysis (Intel Gathering)
When you play "Comet Analysis":
- Choose to peek at either the **top Movement card** or **top Strength card**
- This information is **private** - only you can see it
- Helps you plan: Will the comet move 1 or 3 spaces? How strong is the next segment?

### Card Trading (Free Action)
During your turn, you may trade cards to improve your hand:

**How to Trade:**
1. Click the **"Trade Cards (2 → 1)"** button in the Play Card panel
2. **Select exactly 2 cards** from your hand to discard
3. **Choose a deck** to draw from (Engineering, Espionage, or Economic)
4. Confirm the trade - your selected cards are discarded and you draw 1 new card

**Trade Rules:**
- This is a **free action** - it doesn't count as playing a card
- You can trade **at any point during your turn** (before or after other actions)
- You can only trade if you have **at least 2 cards** in hand
- The discarded cards go to their respective deck's discard pile
- You may trade multiple times per turn (if you still have 2+ cards)
- Useful for cycling bad cards or searching for specific deck types

---

## Winning & Losing

### Victory: Comet Destroyed!
The game ends in **victory** when:
- All comet segments have been destroyed
- All players survive until the last movement card is drawn

**Final Destroyer Bonus:** The player who destroys the **final segment** receives **+5 bonus points!**

### Defeat: Earth Destroyed!
The game ends in **defeat** if:
- The comet reaches **distance 0 or below**
- Players still score based on trophies collected (partial victory)

### Scoring & Winner
- **Trophy Points:** Sum of all strength values from segments you destroyed
- **Final Destroyer Bonus:** +5 points for destroying the last segment
- **Winner:** Player with the **highest total points**
- **Tie:** Multiple winners possible if scores are equal

---

## Strategy Tips for New Players

### Early Game
1. **Build income first** - "Increase Income" cards pay off over many turns
2. **Start with balanced rockets** - Power 2, Accuracy 3 is reliable and cheap
3. **Don't rush expensive rockets** - You need cubes for future turns
4. **Consider Economic cards** - "Program Prestige" early pays dividends

### Mid Game
1. **Upgrade your caps** - Higher Power and Accuracy unlock stronger rockets
2. **Watch the comet distance** - Don't let it get too close!
3. **Use Espionage cards strategically** - Embargo right before a big turn hurts most
4. **Save Funding Pressure** - Worth more when comet is closer

### Late Game
1. **Go for the final segment** - The +5 bonus can win the game
2. **High-power rockets matter** - Even with 8 power, strength-9 segments need 2 hits
3. **Save Reroll tokens** - Use them when it really counts
4. **Use Rocket Calibration** - The +1 accuracy/power can make the difference

### General Tips
- **Accuracy 4+** gives you better than 50% hit chance (max 5 = 83%)
- **Salvage bonus** makes even misses less painful
- **Comet Analysis** before big decisions helps you plan
- **Don't hoard cards** - Playing them is usually better than saving

---

## Player Status Overview

### Your Resources
- **Cubes:** Your spending currency for rockets and cards
- **Income:** Base 5 + bonuses (collected each turn)
- **Salvage Bonus:** Cubes gained on every launch (hit or miss)

### Your Upgrades
- **Power Cap:** Maximum power you can build (starts at 3, max 8)
- **Accuracy Cap:** Maximum accuracy you can build (starts at 3, max 5)
- **Reroll Token:** Whether you can retry a failed launch
- **Card Play Bonus:** Extra resources per card played (from Program Prestige)

### Your Rockets
- **Building:** Rockets in construction (countdown shown)
- **Ready:** Rockets available to launch
- **Launched:** Rockets that have been used

### Your Trophies
- Comet segments you've destroyed
- Each shows its strength value (your points)
- Total determines your final score

---

## Game Constants Reference

| Setting | Value |
|---------|-------|
| Starting Cubes | 20 |
| Starting Cards | 4 (drafted from any deck) |
| Base Income | 5 per turn |
| Starting Distance | 18 spaces |
| Comet Segments | 6 (2p: 4-9), 7 (3p: 4-10), 8 (4p: 4-11) |
| Max Concurrent Rockets | 3 |
| Initial Power Cap | 3 |
| Initial Accuracy Cap | 3 |
| Maximum Power | 8 |
| Maximum Accuracy | 5 |
| Maximum Income Bonus | +3 |
| Maximum Salvage Bonus | +3 |
| Maximum Card Play Bonus | +3 |
| Movement Card Values | 1, 2, or 3 |
| Late Game Threshold | ≤9 distance (draw 2 cards) |
| Final Destroyer Bonus | +5 points |

---

## Glossary

| Term | Definition |
|------|------------|
| **Segment** | One piece of the comet with health equal to its strength |
| **Trophy** | A destroyed segment claimed by the player who dealt final damage |
| **Cube** | The game's resource currency |
| **Draft** | Selecting your starting cards from any of the 3 decks at game start |
| **Round** | One complete cycle of all players taking turns |
| **Reroll** | Rolling the dice again after an initial result |
| **Embargo** | Status effect that blocks income for one turn |
| **Sabotage** | Status effect (from Sabotage Construction) that forces a reroll on your next launch |
| **Cap** | Maximum value you can assign to Power or Accuracy |
| **Ready** | A rocket that has finished building and can launch |
| **Calibration** | Pre-launch bonus of +1 accuracy or +1 power (from Rocket Calibration) |
| **Diplomatic Pressure** | Status effect that blocks your next card play (can be countered) |
| **Counter** | Using your own Diplomatic Pressure card to nullify an incoming attack |
| **Card Trade** | Free action to discard 2 cards and draw 1 from any deck |
| **Late Game** | When comet is ≤9 distance from Earth (draw 2 cards per turn) |
| **Free Action** | An action that doesn't count toward your normal turn limits |

---

*Good luck, Commander. The fate of Earth is in your hands!*
