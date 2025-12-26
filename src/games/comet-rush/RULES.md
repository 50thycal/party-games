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
| **Income** | 5 cubes per turn (can be upgraded) |

---

## Game Setup

When the game begins:

1. **Each player receives:**
   - 20 resource cubes
   - 4 cards (1 Engineering + 1 Espionage + 1 Economic + 1 random)

2. **The comet starts at distance 18** from Earth

3. **Strength cards are dealt** (based on player count):
   - 2 players: 4 cards (strength 4-7)
   - 3 players: 5 cards (strength 4-8)
   - 4 players: 6 cards (strength 4-9)

---

## Turn Structure

Each player's turn follows these steps:

### 1. Begin Turn & Collect Income
- Collect your income: **Base income (5)** + any income bonuses
- If you are under an **Embargo**, you receive 0 income this turn

### 2. Draw a Card
- Choose to draw from **one of three decks**:
  - **Engineering Deck** (upgrades and rocket improvements)
  - **Espionage Deck** (player interaction and sabotage)
  - **Economic Deck** (resource and funding cards)
- You draw exactly **one card per turn**

### 3. Main Actions (Any Order)
During your turn, you may:
- **Build ONE rocket** (only one per turn)
- **Launch rockets** (as many ready rockets as you want)
- **Play cards** from your hand (multiple allowed)

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
| 1 | 1 cube | 2 turns |
| 2 | 2 cubes | 1 turn |
| 3 | 3 cubes | Instant (ready immediately) |

### Total Rocket Cost
**Total Cost = Power + Accuracy + Build Time**

*Example: A rocket with Power 4, Accuracy 3, and Build Time 2 costs 4+3+2 = 9 cubes*

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
- The comet has multiple segments, each with a **strength value (4-9)**
- Players must destroy segments in order (first to last)
- Each segment has health equal to its strength value
- When a segment is destroyed, the player who dealt the final blow **claims it as a trophy**
- **Note:** Strength-9 segments cannot be one-shot even at max power (8)

---

## Card Types

### Engineering Cards (9 types, 34 total)
Permanent upgrades and rocket improvements:

| Card | Rarity | Count | Effect |
|------|--------|-------|--------|
| **Boost Power** | Common | 6 | +1 to your maximum Power cap (up to 8) |
| **Improve Accuracy** | Uncommon | 4 | +1 to your maximum Accuracy cap (up to 5) |
| **Streamlined Assembly** | Common | 6 | Reduce one of your building rockets' build time by 1 turn |
| **Mass Production** | Uncommon | 3 | Reduce ALL your building rockets' build time by 1 turn |
| **Increase Income** | Common | 5 | +1 permanent income bonus (max +3 total) |
| **Rocket Salvage** | Uncommon | 3 | +1 cube whenever you launch any rocket (max +3) |
| **Reroll Protocol** | Rare | 2 | Gain a reroll token - use it to retry a failed launch |
| **Comet Analysis** | Uncommon | 3 | Peek at the top Movement or Strength card |
| **Rocket Calibration** | Rare | 2 | On next launch, choose +1 accuracy OR +1 power (pre-roll) |

### Espionage Cards (7 types, 21 total)
Player interaction and sabotage:

| Card | Rarity | Count | Effect |
|------|--------|-------|--------|
| **Resource Seizure** | Common | 5 | Steal 3 cubes from target player |
| **Espionage Agent** | Uncommon | 3 | Steal 1 random card from target player's hand |
| **Embargo** | Uncommon | 3 | Target player receives no income next turn |
| **Sabotage Construction** | Uncommon | 3 | Add +1 turn to target opponent's building rocket |
| **Covert Rocket Strike** | Rare | 2 | Destroy one of target player's building or ready rockets |
| **Diplomatic Pressure** | Rare | 2 | Block target player's next card play (reactive) |
| **Regulatory Review** | Uncommon | 3 | Add +1 turn to target opponent's building rocket |

### Economic Cards (5 types, 19 total)
Resource generation and funding:

| Card | Rarity | Count | Effect |
|------|--------|-------|--------|
| **Emergency Funding** | Common | 5 | Immediately gain your income again |
| **Public Donation Drive** | Common | 5 | Gain +2 cubes for each rocket you have building or ready |
| **International Grant** | Uncommon | 3 | You gain 5 cubes; all other players gain 2 cubes |
| **Funding Pressure** | Uncommon | 4 | Gain resources based on comet distance: 12+ = 4, 7-11 = 8, ≤6 = 12 cubes |
| **Program Prestige** | Rare | 2 | Permanently gain +1 resource per card played (stacks, max +3) |

---

## Special Mechanics

### Reroll Protocol (Your Choice)
When you obtain a "Reroll Protocol" card:
- You gain a **reroll token**
- If your rocket launch **misses**, you may choose to use the token
- Roll the die again - this could turn a miss into a hit!
- The token is **consumed** whether you hit or miss on the reroll
- Each token is **single-use**

### Rocket Calibration (Pre-Launch Bonus)
When you play "Rocket Calibration":
- On your **next rocket launch**, a bonus selection appears
- Choose **+1 Accuracy** OR **+1 Power** before rolling
- The bonus applies to that single launch only
- Subject to caps (accuracy max 5, power max 8)

### Sabotage Construction (Forced Delay)
When an opponent plays "Sabotage Construction" on you:
- One of your **building rockets** gains +1 turn build time
- The attacker chooses which rocket is affected

### Covert Rocket Strike (Rocket Destruction)
When targeted by "Covert Rocket Strike":
- The attacker destroys one of your **building or ready** rockets
- Rockets currently launching cannot be targeted

### Diplomatic Pressure (Reactive Block)
This card can be played **reactively** when an opponent plays a card:
- Blocks the targeted player's next card play
- Creates a response window during opponent's turn

### Embargo (Income Block)
When targeted by "Embargo":
- On your **next turn**, you receive **0 income**
- Your base income and bonuses are skipped for that turn only
- The embargo clears after it takes effect

### Funding Pressure (Distance-Based Reward)
When you play "Funding Pressure":
- Gain resources based on how close the comet is:
  - Distance 12+: Gain 4 cubes
  - Distance 7-11: Gain 8 cubes
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
| Base Income | 5 per turn |
| Starting Distance | 18 spaces |
| Max Concurrent Rockets | 3 |
| Initial Power Cap | 3 |
| Initial Accuracy Cap | 3 |
| Maximum Power | 8 |
| Maximum Accuracy | 5 |
| Maximum Income Bonus | +3 |
| Maximum Salvage Bonus | +3 |
| Maximum Card Play Bonus | +3 |
| Movement Card Values | 1, 2, or 3 |
| Final Destroyer Bonus | +5 points |

---

## Glossary

| Term | Definition |
|------|------------|
| **Segment** | One piece of the comet with health equal to its strength |
| **Trophy** | A destroyed segment claimed by the player who dealt final damage |
| **Cube** | The game's resource currency |
| **Round** | One complete cycle of all players taking turns |
| **Reroll** | Rolling the dice again after an initial result |
| **Embargo** | Status effect that blocks income for one turn |
| **Sabotage** | Status effect that forces a reroll on your next launch |
| **Cap** | Maximum value you can assign to Power or Accuracy |
| **Ready** | A rocket that has finished building and can launch |
| **Calibration** | Pre-launch bonus of +1 accuracy or +1 power |
| **Reactive** | Card type that can be played in response to opponent actions |

---

*Good luck, Commander. The fate of Earth is in your hands!*
