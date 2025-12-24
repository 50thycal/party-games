"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { MultiplayerLogEntry } from "../actionLog";
import {
  actionLogToCsv,
  actionLogToText,
  generateCsvFilename,
} from "../actionLog";
import { MissionButton } from "./controls/MissionButton";

// ============================================================================
// TYPES
// ============================================================================

interface ActionLogDisplayProps {
  actionLog: MultiplayerLogEntry[];
  playerCount: number;
  className?: string;
  maxHeight?: string;
  showTitle?: boolean;
}

// ============================================================================
// ACTION LOG TABLE
// ============================================================================

function ActionLogTable({ actionLog }: { actionLog: MultiplayerLogEntry[] }) {
  if (actionLog.length === 0) {
    return (
      <div className="text-center text-mission-steel py-8">
        No actions recorded yet.
      </div>
    );
  }

  let currentRound = 0;

  return (
    <div className="space-y-1">
      {actionLog.map((entry, index) => {
        const showRoundHeader = entry.round !== currentRound;
        if (showRoundHeader) {
          currentRound = entry.round;
        }

        return (
          <div key={entry.id}>
            {showRoundHeader && (
              <div className="sticky top-0 bg-mission-panel py-1 px-2 border-b border-mission-steel-dark mt-2 first:mt-0">
                <span className="label-embossed text-[10px]">
                  ROUND {entry.round}
                </span>
              </div>
            )}
            <div
              className={cn(
                "flex items-start gap-2 px-2 py-1 text-xs hover:bg-mission-panel-light/30 rounded",
                entry.action === "GAME_OVER" && "bg-mission-amber/10 border-l-2 border-mission-amber",
                entry.action === "LAUNCH_ROCKET" && entry.details.includes("HIT") && "bg-mission-green/10",
                entry.action === "LAUNCH_ROCKET" && entry.details.includes("MISS") && "bg-mission-red/10"
              )}
            >
              <span className="text-mission-steel shrink-0 w-8 text-right">
                #{entry.id}
              </span>
              <span className="text-mission-amber shrink-0 w-20 truncate">
                {entry.playerName}
              </span>
              <span className="text-mission-cream flex-1">
                {entry.details}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ActionLogDisplay({
  actionLog,
  playerCount,
  className,
  maxHeight = "400px",
  showTitle = true,
}: ActionLogDisplayProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading" | "done">("idle");

  const handleCopy = async () => {
    try {
      const text = actionLogToText(actionLog);
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("error");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };

  const handleDownloadCsv = () => {
    setDownloadStatus("downloading");

    const csv = actionLogToCsv(actionLog);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const filename = generateCsvFilename(playerCount);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadStatus("done");
    setTimeout(() => setDownloadStatus("idle"), 2000);
  };

  return (
    <div className={cn("panel-retro", className)}>
      {showTitle && (
        <div className="flex items-center justify-between p-3 border-b border-mission-steel-dark">
          <span className="label-embossed text-[10px]">ACTION LOG</span>
          <span className="text-xs text-mission-steel">
            {actionLog.length} action{actionLog.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 p-3 border-b border-mission-steel-dark">
        <MissionButton
          onClick={handleCopy}
          variant="primary"
          size="sm"
          className="flex-1"
        >
          {copyStatus === "copied" ? "Copied!" : copyStatus === "error" ? "Error" : "Copy Log"}
        </MissionButton>
        <MissionButton
          onClick={handleDownloadCsv}
          variant="success"
          size="sm"
          className="flex-1"
          disabled={actionLog.length === 0}
        >
          {downloadStatus === "done" ? "Downloaded!" : "Export CSV"}
        </MissionButton>
      </div>

      {/* Log entries */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight }}
      >
        <ActionLogTable actionLog={actionLog} />
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT VERSION FOR IN-GAME USE
// ============================================================================

export function ActionLogCompact({
  actionLog,
  playerCount,
  isHost,
  className,
}: {
  actionLog: MultiplayerLogEntry[];
  playerCount: number;
  isHost: boolean;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isHost) return null;

  return (
    <div className={cn("panel-retro overflow-hidden", className)}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-mission-panel-light/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            className="text-mission-green text-sm"
          >
            {"\u25B6"}
          </motion.span>
          <span className="text-sm font-bold uppercase text-mission-cream">
            Action Log (Host Only)
          </span>
        </div>
        <span className="text-xs text-mission-steel">
          {actionLog.length} actions
        </span>
      </button>

      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ActionLogDisplay
            actionLog={actionLog}
            playerCount={playerCount}
            showTitle={false}
            maxHeight="300px"
          />
        </motion.div>
      )}
    </div>
  );
}
