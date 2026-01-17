"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import { MissionButton } from "./controls/MissionButton";

interface TutorialProps {
  isOpen: boolean;
  onClose: () => void;
}

type TutorialSection =
  | "overview"
  | "turns"
  | "rockets"
  | "launching"
  | "cards"
  | "ui";

const sections: { id: TutorialSection; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "🎯" },
  { id: "turns", label: "Turns", icon: "🔄" },
  { id: "rockets", label: "Rockets", icon: "🚀" },
  { id: "launching", label: "Launch", icon: "🎲" },
  { id: "cards", label: "Cards", icon: "🃏" },
  { id: "ui", label: "Interface", icon: "📺" },
];

export function Tutorial({ isOpen, onClose }: TutorialProps) {
  const [activeSection, setActiveSection] = useState<TutorialSection>("overview");

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-2xl max-h-[85vh] bg-mission-dark border-2 border-mission-steel rounded-lg overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-mission-panel border-b-2 border-mission-steel p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📖</span>
                <div>
                  <h2 className="text-lg font-bold text-mission-cream uppercase tracking-wider">
                    Mission Briefing
                  </h2>
                  <span className="text-[10px] text-mission-steel">
                    COMET DEFENSE TRAINING MANUAL
                  </span>
                </div>
              </div>
              <MissionButton onClick={onClose} variant="primary" size="sm">
                Close
              </MissionButton>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-mission-panel-light border-b border-mission-steel-dark overflow-x-auto">
            <div className="flex min-w-max">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 whitespace-nowrap",
                    activeSection === section.id
                      ? "bg-mission-dark text-mission-green border-b-2 border-mission-green"
                      : "text-mission-steel hover:text-mission-cream hover:bg-mission-panel"
                  )}
                >
                  <span>{section.icon}</span>
                  <span className="hidden sm:inline">{section.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(85vh - 140px)" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
              >
                {activeSection === "overview" && <OverviewSection />}
                {activeSection === "turns" && <TurnsSection />}
                {activeSection === "rockets" && <RocketsSection />}
                {activeSection === "launching" && <LaunchingSection />}
                {activeSection === "cards" && <CardsSection />}
                {activeSection === "ui" && <UISection />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Footer */}
          <div className="bg-mission-panel border-t border-mission-steel-dark p-3 flex justify-between items-center">
            <MissionButton
              onClick={() => {
                const currentIndex = sections.findIndex((s) => s.id === activeSection);
                if (currentIndex > 0) {
                  setActiveSection(sections[currentIndex - 1].id);
                }
              }}
              variant="primary"
              size="sm"
              disabled={activeSection === sections[0].id}
            >
              Previous
            </MissionButton>
            <span className="text-xs text-mission-steel">
              {sections.findIndex((s) => s.id === activeSection) + 1} / {sections.length}
            </span>
            <MissionButton
              onClick={() => {
                const currentIndex = sections.findIndex((s) => s.id === activeSection);
                if (currentIndex < sections.length - 1) {
                  setActiveSection(sections[currentIndex + 1].id);
                } else {
                  onClose();
                }
              }}
              variant={activeSection === sections[sections.length - 1].id ? "success" : "primary"}
              size="sm"
            >
              {activeSection === sections[sections.length - 1].id ? "Start Playing" : "Next"}
            </MissionButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helper component for section headers
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold text-mission-green uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-2 h-2 bg-mission-green rounded-full" />
      {children}
    </h3>
  );
}

// Helper component for info boxes
function InfoBox({
  variant = "default",
  children,
}: {
  variant?: "default" | "warning" | "success" | "danger";
  children: React.ReactNode;
}) {
  const variantStyles = {
    default: "border-mission-steel bg-mission-panel-light/50",
    warning: "border-mission-amber bg-mission-amber/10",
    success: "border-mission-green bg-mission-green/10",
    danger: "border-mission-red bg-mission-red/10",
  };

  return (
    <div className={cn("border rounded p-3 mb-3", variantStyles[variant])}>
      {children}
    </div>
  );
}

// Helper component for key-value displays
function StatRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-mission-steel-dark/50 last:border-0">
      <span className="text-xs text-mission-steel">{label}</span>
      <span className="text-sm text-mission-cream font-medium">{value}</span>
    </div>
  );
}

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

function OverviewSection() {
  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <span className="text-5xl block mb-2">☄️</span>
        <h2 className="text-xl font-bold text-mission-cream">Welcome to Comet Rush!</h2>
        <p className="text-sm text-mission-steel mt-2">
          A strategic multiplayer game where you save Earth from destruction
        </p>
      </div>

      <SectionHeader>The Mission</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-4">
        A massive comet is hurtling toward Earth! You and your fellow commanders must work together
        to destroy it before impact. But only the commander who deals the most damage will be
        crowned the hero of humanity.
      </p>

      <SectionHeader>How to Win</SectionHeader>
      <InfoBox variant="success">
        <p className="text-sm text-mission-cream/80">
          <strong className="text-mission-green">Primary Goal:</strong> Destroy all comet segments before
          the comet reaches Earth (distance 0).
        </p>
        <p className="text-sm text-mission-cream/80 mt-2">
          <strong className="text-mission-amber">Victory:</strong> The player with the most{" "}
          <strong>trophy points</strong> wins! You earn points by destroying comet segments.
        </p>
      </InfoBox>

      <SectionHeader>Quick Reference</SectionHeader>
      <InfoBox>
        <StatRow label="Players" value="2-6 players" />
        <StatRow label="Starting Resources" value="20 cubes" />
        <StatRow label="Starting Cards" value="4 cards (your choice)" />
        <StatRow label="Income Per Turn" value="5 cubes (upgradeable)" />
        <StatRow label="Comet Start Distance" value="15 spaces from Earth" />
      </InfoBox>

      <InfoBox variant="warning">
        <p className="text-xs text-mission-amber">
          <strong>Tip:</strong> The player who destroys the final comet segment gets a +5 bonus!
          Time your attacks carefully.
        </p>
      </InfoBox>
    </div>
  );
}

function TurnsSection() {
  return (
    <div className="space-y-4">
      <SectionHeader>Turn Structure</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-4">
        Each turn follows a specific sequence. Understanding this flow is key to success.
      </p>

      {/* Step 1 */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-mission-green/20 border border-mission-green flex items-center justify-center text-xs font-bold text-mission-green">
            1
          </span>
          <div>
            <p className="text-sm font-bold text-mission-cream">Begin Turn & Collect Income</p>
            <p className="text-xs text-mission-steel mt-1">
              Click &quot;Begin Turn&quot; to collect your income (base 5 cubes + bonuses).
              If you&apos;re under an Embargo, you receive 0 income this turn.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Step 2 */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-mission-amber/20 border border-mission-amber flex items-center justify-center text-xs font-bold text-mission-amber">
            2
          </span>
          <div>
            <p className="text-sm font-bold text-mission-cream">Draw Cards</p>
            <p className="text-xs text-mission-steel mt-1">
              Choose one of three decks to draw from:
            </p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 bg-mission-green/10 rounded border border-mission-green/30">
                <span className="text-lg">🔧</span>
                <p className="text-[10px] text-mission-green font-bold">Engineering</p>
              </div>
              <div className="text-center p-2 bg-mission-red/10 rounded border border-mission-red/30">
                <span className="text-lg">🕵️</span>
                <p className="text-[10px] text-mission-red font-bold">Espionage</p>
              </div>
              <div className="text-center p-2 bg-mission-amber/10 rounded border border-mission-amber/30">
                <span className="text-lg">💰</span>
                <p className="text-[10px] text-mission-amber font-bold">Economic</p>
              </div>
            </div>
            <p className="text-xs text-mission-amber mt-2">
              Late game bonus: Draw 2 cards when comet is 9 or closer!
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Step 3 */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500 flex items-center justify-center text-xs font-bold text-cyan-400">
            3
          </span>
          <div>
            <p className="text-sm font-bold text-mission-cream">Main Actions (Any Order)</p>
            <ul className="text-xs text-mission-steel mt-1 space-y-1">
              <li>• <strong>Build rockets</strong> (as many as you can afford!)</li>
              <li>• <strong>Launch rockets</strong> (as many ready rockets as you want)</li>
              <li>• <strong>Play cards</strong> from your hand</li>
              <li>• <strong>Trade cards</strong> (discard 2 → draw 1) - free action!</li>
            </ul>
          </div>
        </div>
      </InfoBox>

      {/* Step 4 */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500 flex items-center justify-center text-xs font-bold text-purple-400">
            4
          </span>
          <div>
            <p className="text-sm font-bold text-mission-cream">End Turn</p>
            <p className="text-xs text-mission-steel mt-1">
              Click &quot;End Turn&quot; to pass. After ALL players take their turn, a Movement card is drawn
              and the comet advances 1-3 spaces toward Earth!
            </p>
          </div>
        </div>
      </InfoBox>

      <InfoBox variant="danger">
        <p className="text-xs text-mission-red">
          <strong>Warning:</strong> If the comet reaches distance 0, Earth is destroyed!
          Work together to stop it, but compete for the most points.
        </p>
      </InfoBox>
    </div>
  );
}

function RocketsSection() {
  return (
    <div className="space-y-4">
      <SectionHeader>Building Rockets</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-4">
        Rockets are your weapons against the comet. Each rocket has three attributes you customize.
      </p>

      {/* Power */}
      <InfoBox variant="success">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💥</span>
          <div>
            <p className="text-sm font-bold text-mission-green">Power (1-8)</p>
            <p className="text-xs text-mission-steel mt-1">
              Damage dealt to the comet on a successful hit. Higher power = more damage = faster
              segment destruction. Starts capped at 3, can upgrade to 8.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Accuracy */}
      <InfoBox variant="success">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <p className="text-sm font-bold text-mission-green">Accuracy (1-5)</p>
            <p className="text-xs text-mission-steel mt-1">
              How likely your rocket is to hit. Roll a d6 - you hit if roll ≤ accuracy.
            </p>
            <div className="grid grid-cols-5 gap-1 mt-2">
              {[1, 2, 3, 4, 5].map((acc) => (
                <div key={acc} className="text-center p-1 bg-mission-dark rounded text-[10px]">
                  <div className="text-mission-green font-bold">Acc {acc}</div>
                  <div className="text-mission-steel">{Math.round((acc / 6) * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </InfoBox>

      {/* Build Time */}
      <InfoBox variant="warning">
        <div className="flex items-start gap-3">
          <span className="text-2xl">⏱️</span>
          <div>
            <p className="text-sm font-bold text-mission-amber">Build Time (1-3)</p>
            <p className="text-xs text-mission-steel mt-1">
              How quickly your rocket is ready. Trade-off between cost and speed:
            </p>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 bg-mission-dark rounded">
                <div className="text-mission-green font-bold text-sm">BT 1</div>
                <div className="text-[10px] text-mission-steel">1 cube</div>
                <div className="text-[10px] text-mission-amber">2 turns</div>
              </div>
              <div className="text-center p-2 bg-mission-dark rounded">
                <div className="text-mission-amber font-bold text-sm">BT 2</div>
                <div className="text-[10px] text-mission-steel">2 cubes</div>
                <div className="text-[10px] text-mission-amber">1 turn</div>
              </div>
              <div className="text-center p-2 bg-mission-dark rounded">
                <div className="text-mission-red font-bold text-sm">BT 3</div>
                <div className="text-[10px] text-mission-steel">5 cubes</div>
                <div className="text-[10px] text-mission-green">Instant!</div>
              </div>
            </div>
          </div>
        </div>
      </InfoBox>

      <SectionHeader>Total Rocket Cost</SectionHeader>
      <InfoBox>
        <p className="text-sm text-mission-cream text-center font-bold">
          Cost = Power + Accuracy + Build Time Cost
        </p>
        <p className="text-xs text-mission-steel text-center mt-2">
          Example: Power 4 + Accuracy 3 + Instant (5) = 12 cubes
        </p>
      </InfoBox>

      <InfoBox variant="warning">
        <p className="text-xs text-mission-amber">
          <strong>Limits:</strong> You can have a maximum of 3 rockets in progress at once.
          Build as many as you can afford, but manage your hangar space wisely!
        </p>
      </InfoBox>
    </div>
  );
}

function LaunchingSection() {
  return (
    <div className="space-y-4">
      <SectionHeader>Launching Rockets</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-4">
        When your rocket is ready, launch it to attack the comet! The outcome depends on a dice roll.
      </p>

      {/* The Dice Roll */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎲</span>
          <div>
            <p className="text-sm font-bold text-mission-cream">The Dice Roll</p>
            <p className="text-xs text-mission-steel mt-1">
              Roll a 6-sided die. Compare to your rocket&apos;s accuracy:
            </p>
            <div className="flex gap-3 mt-2">
              <div className="flex-1 p-2 bg-mission-green/10 rounded border border-mission-green/30 text-center">
                <span className="text-lg">✓</span>
                <p className="text-xs text-mission-green font-bold">HIT</p>
                <p className="text-[10px] text-mission-steel">Roll ≤ Accuracy</p>
              </div>
              <div className="flex-1 p-2 bg-mission-red/10 rounded border border-mission-red/30 text-center">
                <span className="text-lg">✗</span>
                <p className="text-xs text-mission-red font-bold">MISS</p>
                <p className="text-[10px] text-mission-steel">Roll &gt; Accuracy</p>
              </div>
            </div>
          </div>
        </div>
      </InfoBox>

      {/* On a Hit */}
      <InfoBox variant="success">
        <p className="text-sm font-bold text-mission-green mb-2">On a Hit:</p>
        <ul className="text-xs text-mission-steel space-y-1">
          <li>• Deal your rocket&apos;s <strong>Power</strong> as damage to the active comet segment</li>
          <li>• If damage ≥ segment&apos;s remaining health → <strong>Destroy it!</strong></li>
          <li>• Destroyed segment becomes your <strong>trophy</strong> (worth points)</li>
          <li>• If segment survives, its health is reduced</li>
        </ul>
      </InfoBox>

      {/* On a Miss */}
      <InfoBox variant="danger">
        <p className="text-sm font-bold text-mission-red mb-2">On a Miss:</p>
        <ul className="text-xs text-mission-steel space-y-1">
          <li>• Your rocket is consumed with no effect</li>
          <li>• <strong>If you have a Reroll Token:</strong> You can try again!</li>
        </ul>
      </InfoBox>

      <SectionHeader>Special Launch Mechanics</SectionHeader>

      {/* Reroll Token */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="text-xl">🔄</span>
          <div>
            <p className="text-sm font-bold text-cyan-400">Reroll Token</p>
            <p className="text-xs text-mission-steel mt-1">
              Earned from &quot;Flight Adjustment&quot; cards. If you miss, you can choose to reroll the dice
              for a second chance. The token is consumed whether you hit or miss on the reroll.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Sabotage */}
      <InfoBox variant="danger">
        <div className="flex items-start gap-3">
          <span className="text-xl">💀</span>
          <div>
            <p className="text-sm font-bold text-mission-red">Sabotage (Forced Reroll)</p>
            <p className="text-xs text-mission-steel mt-1">
              If an opponent played &quot;Sabotage Construction&quot; on you, your next launch is risky!
              Even if you HIT, you MUST reroll - and might miss!
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Calibration */}
      <InfoBox variant="success">
        <div className="flex items-start gap-3">
          <span className="text-xl">📐</span>
          <div>
            <p className="text-sm font-bold text-mission-green">Rocket Calibration</p>
            <p className="text-xs text-mission-steel mt-1">
              Play the &quot;Rocket Calibration&quot; card to gain +1 Accuracy OR +1 Power for your next
              launch. Stack multiple cards for bigger bonuses!
            </p>
          </div>
        </div>
      </InfoBox>
    </div>
  );
}

// Helper component for individual card display
function CardEntry({
  name,
  description,
  strategy,
  rarity,
}: {
  name: string;
  description: string;
  strategy: string;
  rarity: "common" | "uncommon" | "rare";
}) {
  const rarityColors = {
    common: "text-mission-steel",
    uncommon: "text-cyan-400",
    rare: "text-purple-400",
  };
  const rarityBg = {
    common: "bg-mission-steel/10",
    uncommon: "bg-cyan-400/10",
    rare: "bg-purple-400/10",
  };

  return (
    <div className={cn("p-2 rounded border border-mission-steel-dark/50 mb-2", rarityBg[rarity])}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-mission-cream">{name}</span>
        <span className={cn("text-[9px] uppercase font-bold", rarityColors[rarity])}>
          {rarity}
        </span>
      </div>
      <p className="text-[10px] text-mission-steel mb-1">{description}</p>
      <p className="text-[10px] text-mission-amber italic">💡 {strategy}</p>
    </div>
  );
}

function CardsSection() {
  return (
    <div className="space-y-4">
      <SectionHeader>Card Decks</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-4">
        There are three card decks, each with unique strategies. You draw 4 cards at game start
        and 1 per turn (2 when comet is close!). Each deck has 44 cards total.
      </p>

      {/* Engineering Deck */}
      <div className="border-2 border-mission-green/50 rounded-lg overflow-hidden">
        <div className="bg-mission-green/20 px-3 py-2 flex items-center gap-2">
          <span className="text-xl">🔧</span>
          <div>
            <p className="text-sm font-bold text-mission-green">Engineering Deck</p>
            <p className="text-[10px] text-mission-steel">Upgrades, optimizations, and rocket improvements</p>
          </div>
        </div>
        <div className="p-3 space-y-0">
          <CardEntry
            name="Warhead Upgrade"
            description="+1 to your maximum power cap (up to 8 total)"
            strategy="Essential for late game. Higher power = destroy segments faster. Stack these early!"
            rarity="uncommon"
          />
          <CardEntry
            name="Guidance System Upgrade"
            description="+1 to your maximum accuracy cap (up to 5 total)"
            strategy="Accuracy 5 = 83% hit rate. Prioritize these to land more hits consistently."
            rarity="uncommon"
          />
          <CardEntry
            name="Mass Production"
            description="−1 build time for ALL rockets currently building"
            strategy="Play when you have multiple rockets building. Can make slow rockets instant!"
            rarity="rare"
          />
          <CardEntry
            name="Flight Adjustment"
            description="Gain a reroll token - if your next launch misses, you can roll again"
            strategy="Save for high-power rockets. A miss with power 6+ hurts - reroll gives you a second chance."
            rarity="rare"
          />
          <CardEntry
            name="Streamlined Assembly"
            description="−1 build time for one rocket of your choice"
            strategy="Best on slow (BT1) rockets to get them ready faster without paying instant costs."
            rarity="common"
          />
          <CardEntry
            name="Rocket Calibration"
            description="Play before launching: +1 Accuracy OR +1 Power for that launch"
            strategy="Stack multiple for big launches! +2 Accuracy can turn a risky shot into a sure hit."
            rarity="common"
          />
          <CardEntry
            name="Comet Analysis"
            description="Peek at the next strength or movement card that will be drawn"
            strategy="Check movement to time your attacks. Know when the comet will surge forward!"
            rarity="common"
          />
        </div>
      </div>

      {/* Espionage Deck */}
      <div className="border-2 border-mission-red/50 rounded-lg overflow-hidden">
        <div className="bg-mission-red/20 px-3 py-2 flex items-center gap-2">
          <span className="text-xl">🕵️</span>
          <div>
            <p className="text-sm font-bold text-mission-red">Espionage Deck</p>
            <p className="text-[10px] text-mission-steel">Sabotage, theft, and interference with opponents</p>
          </div>
        </div>
        <div className="p-3 space-y-0">
          <CardEntry
            name="Resource Seizure"
            description="Steal 3 resource cubes from target player"
            strategy="Hit the leader or someone about to build. Denying resources slows their rockets."
            rarity="common"
          />
          <CardEntry
            name="Sabotage Construction"
            description="Force target player to re-roll their next successful launch"
            strategy="Save for when someone is about to destroy a segment. Turn their hit into a potential miss!"
            rarity="common"
          />
          <CardEntry
            name="Regulatory Review"
            description="+1 build time added to one of opponent&apos;s building rockets"
            strategy="Target instant (BT3) rockets to delay them. Disrupts fast attack strategies."
            rarity="common"
          />
          <CardEntry
            name="Espionage Agent"
            description="Steal a random card from target player&apos;s hand"
            strategy="Target players with large hands. You might steal a rare upgrade or key card!"
            rarity="uncommon"
          />
          <CardEntry
            name="Diplomatic Pressure"
            description="Block any card a target player attempts to play (reactive)"
            strategy="Hold this as a threat! Counter enemy sabotage or block their crucial upgrade."
            rarity="uncommon"
          />
          <CardEntry
            name="Covert Rocket Strike"
            description="Destroy any rocket (building or ready) belonging to another player"
            strategy="Devastating against ready high-power rockets. Erase their investment completely!"
            rarity="rare"
          />
          <CardEntry
            name="Embargo"
            description="Target player gains no income at the start of their next turn"
            strategy="Hit players who just spent their cubes. No income = no recovery = no rockets."
            rarity="rare"
          />
        </div>
      </div>

      {/* Economic Deck */}
      <div className="border-2 border-mission-amber/50 rounded-lg overflow-hidden">
        <div className="bg-mission-amber/20 px-3 py-2 flex items-center gap-2">
          <span className="text-xl">💰</span>
          <div>
            <p className="text-sm font-bold text-mission-amber">Economic Deck</p>
            <p className="text-[10px] text-mission-steel">Resources, funding, and financial advantages</p>
          </div>
        </div>
        <div className="p-3 space-y-0">
          <CardEntry
            name="Emergency Funding"
            description="Immediately gain resources equal to your current income"
            strategy="Excellent after upgrading income. With +3 income upgrades, this gives 8 cubes!"
            rarity="common"
          />
          <CardEntry
            name="Public Donation Drive"
            description="Gain 2 resources for each rocket you have built (building + ready)"
            strategy="Build lots of cheap rockets first, then cash in. 3 rockets = 6 free cubes!"
            rarity="common"
          />
          <CardEntry
            name="Program Prestige"
            description="+1 resource gained each time you play a card (stacks up to 3)"
            strategy="Play early! Every card after this pays you back. Multiple copies stack."
            rarity="common"
          />
          <CardEntry
            name="Increase Income"
            description="+1 to your permanent income each turn (max +3 total)"
            strategy="The earlier you play these, the more value. +3 income doubles your resources!"
            rarity="uncommon"
          />
          <CardEntry
            name="Rocket Salvage"
            description="+1 resource gained each time you launch a rocket (stacks up to 3)"
            strategy="Great for aggressive launchers. Launch often? Get paid for it."
            rarity="uncommon"
          />
          <CardEntry
            name="International Grant"
            description="You gain 5 resources, all other players gain 2"
            strategy="Best when you need resources NOW. The 2 to others is worth your 5."
            rarity="rare"
          />
          <CardEntry
            name="Funding Pressure"
            description="Gain resources based on comet distance: 4 (far), 8 (mid), or 12 (close)"
            strategy="Save for when comet is close! At distance ≤6, this gives 12 cubes - massive!"
            rarity="rare"
          />
        </div>
      </div>

      <SectionHeader>Card Trading</SectionHeader>
      <InfoBox>
        <p className="text-sm text-mission-cream mb-2">
          <strong>Free Action:</strong> Discard 2 cards → Draw 1 from any deck
        </p>
        <p className="text-xs text-mission-steel">
          Use this to cycle bad cards or dig for specific deck types. You can trade multiple times
          per turn if you have enough cards.
        </p>
      </InfoBox>

      <InfoBox variant="warning">
        <p className="text-xs text-mission-amber">
          <strong>Deck Strategy Tips:</strong>
        </p>
        <ul className="text-xs text-mission-steel mt-1 space-y-1">
          <li>• <strong className="text-mission-green">Engineering:</strong> Best for building powerful rockets that hit consistently</li>
          <li>• <strong className="text-mission-red">Espionage:</strong> Best for disrupting the leader and controlling the competition</li>
          <li>• <strong className="text-mission-amber">Economic:</strong> Best for snowballing resources and outpacing everyone</li>
        </ul>
      </InfoBox>
    </div>
  );
}

function UISection() {
  return (
    <div className="space-y-4">
      <SectionHeader>Understanding the Interface</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-4">
        Here&apos;s a guide to the Mission Control interface and what each section shows.
      </p>

      {/* Header */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="text-xl">📊</span>
          <div>
            <p className="text-sm font-bold text-mission-cream">Mission Control Header</p>
            <p className="text-xs text-mission-steel mt-1">
              Shows the current <strong>Round number</strong> and whose turn it is.
              A green &quot;YOUR TURN&quot; light indicates when you can act.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Comet Track */}
      <InfoBox variant="danger">
        <div className="flex items-start gap-3">
          <span className="text-xl">☄️</span>
          <div>
            <p className="text-sm font-bold text-mission-red">Comet Track</p>
            <p className="text-xs text-mission-steel mt-1">
              Shows how far the comet is from Earth (0-15). The number changes color as danger
              increases. Watch this closely - if it reaches 0, game over!
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Strength Card Panel */}
      <InfoBox variant="warning">
        <div className="flex items-start gap-3">
          <span className="text-xl">🎯</span>
          <div>
            <p className="text-sm font-bold text-mission-amber">Active Comet Segment</p>
            <p className="text-xs text-mission-steel mt-1">
              Shows the current segment&apos;s <strong>health/strength</strong>. This is what your
              rockets are attacking. When health reaches 0, it&apos;s destroyed and the next segment
              appears.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Card Decks */}
      <InfoBox variant="success">
        <div className="flex items-start gap-3">
          <span className="text-xl">🃏</span>
          <div>
            <p className="text-sm font-bold text-mission-green">Card Decks Display</p>
            <p className="text-xs text-mission-steel mt-1">
              Shows how many cards remain in each deck (Engineering, Espionage, Economic) plus the
              Movement and Strength decks. Helps you track what&apos;s left in the game.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Player Status Grid */}
      <InfoBox>
        <div className="flex items-start gap-3">
          <span className="text-xl">👥</span>
          <div>
            <p className="text-sm font-bold text-mission-cream">Player Status Grid</p>
            <p className="text-xs text-mission-steel mt-1">
              Shows all players&apos; <strong>cubes</strong>, <strong>rocket counts</strong>, and
              <strong> scores</strong>. The active player is highlighted. Use this to track who&apos;s
              winning and who might be a threat.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Your Console */}
      <InfoBox variant="success">
        <div className="flex items-start gap-3">
          <span className="text-xl">💻</span>
          <div>
            <p className="text-sm font-bold text-mission-green">Your Console</p>
            <p className="text-xs text-mission-steel mt-1">
              Your detailed status: cubes, income, rockets (building/ready), upgrades, and trophies.
              This is your mission dashboard.
            </p>
          </div>
        </div>
      </InfoBox>

      {/* Action Panels */}
      <SectionHeader>Action Panels</SectionHeader>
      <p className="text-sm text-mission-cream/80 mb-3">
        Click to expand these panels during your turn:
      </p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="p-2 bg-emerald-900/30 border border-emerald-700 rounded text-center">
          <span className="text-lg">🔧</span>
          <p className="text-[10px] text-mission-cream font-bold mt-1">Build Rocket</p>
          <p className="text-[10px] text-mission-steel">Configure & build</p>
        </div>
        <div className="p-2 bg-rose-900/30 border border-rose-700 rounded text-center">
          <span className="text-lg">🚀</span>
          <p className="text-[10px] text-mission-cream font-bold mt-1">Launch Rocket</p>
          <p className="text-[10px] text-mission-steel">Fire at comet</p>
        </div>
        <div className="p-2 bg-cyan-900/30 border border-cyan-700 rounded text-center">
          <span className="text-lg">🃏</span>
          <p className="text-[10px] text-mission-cream font-bold mt-1">Play Card</p>
          <p className="text-[10px] text-mission-steel">Use your cards</p>
        </div>
      </div>

      {/* End Turn */}
      <InfoBox variant="success">
        <div className="flex items-start gap-3">
          <span className="text-xl">✅</span>
          <div>
            <p className="text-sm font-bold text-mission-green">End Turn Button</p>
            <p className="text-xs text-mission-steel mt-1">
              Fixed at the bottom of the screen. Click when you&apos;re done with your actions.
              Don&apos;t forget to build, launch, and play cards before ending!
            </p>
          </div>
        </div>
      </InfoBox>

      <InfoBox variant="warning">
        <p className="text-xs text-mission-amber">
          <strong>Pro Tip:</strong> You can access this tutorial anytime by clicking the &quot;?&quot; button
          during the game!
        </p>
      </InfoBox>
    </div>
  );
}

// ============================================================================
// TUTORIAL BUTTON COMPONENT
// ============================================================================

export function TutorialButton({ onClick }: { onClick: () => void }) {
  return (
    <MissionButton onClick={onClick} variant="primary" size="sm">
      <span className="flex items-center gap-1.5">
        <span>?</span>
        <span className="hidden sm:inline">Help</span>
      </span>
    </MissionButton>
  );
}
