import type { RunEventItem } from "@/lib/api";

export interface FriendlyActivityStep {
  id: string;
  seq: number;
  label: string;
  detail?: string;
  relativeTime: string;
  status: "running" | "done" | "failed";
  round?: number;
  // Technical details (shown only when Technical details switch is on)
  agentName?: string;
  rawMessage?: string;
  score?: number;
  failedRules?: string[];
}

export interface ActivityRoundGroup {
  round: number;
  outcome: string;
  passed: boolean;
  steps: FriendlyActivityStep[];
}

export function formatRelativeSeconds(
  evt: RunEventItem,
  firstEventTimeMs: number | null
): string {
  if (typeof evt.elapsed_ms === "number" && evt.elapsed_ms >= 0) {
    return `+${Math.round(evt.elapsed_ms / 1000)}s`;
  }
  if (evt.time && firstEventTimeMs !== null) {
    const t = Date.parse(evt.time);
    if (!Number.isNaN(t)) {
      const diffSec = Math.max(0, Math.round((t - firstEventTimeMs) / 1000));
      return `+${diffSec}s`;
    }
  }
  return "+0s";
}

export function mapEventToFriendlyStep(
  evt: RunEventItem,
  firstEventTimeMs: number | null,
  isLatestAndRunning: boolean
): FriendlyActivityStep {
  const payload = (evt.payload || {}) as Record<string, unknown>;
  const type = (evt.type || "").toLowerCase();
  const agent = (evt.agent || "").toLowerCase();
  const msg = evt.message || "";
  const msgLower = msg.toLowerCase();

  let label = "Working on draft";
  let detail: string | undefined;

  if (type === "run_started") {
    label = "Loaded your settings";
  } else if (type === "run_completed") {
    label = "Finished";
  } else if (type === "run_failed") {
    label = "Could not finish this draft";
  } else if (type === "topic_selected" || agent === "topic finder" || agent === "finder") {
    if (msgLower.includes("search")) {
      label = "Researching trends";
    } else {
      label = "Choosing a topic";
      if (payload.topic_title) {
        detail = String(payload.topic_title);
      }
    }
  } else if (agent === "hook strategist" || agent === "gtm") {
    label = "Planning the hook";
    if (payload.hook_style) {
      detail = `Style: ${String(payload.hook_style).replace(/_/g, " ")}`;
    }
  } else if (type === "draft_written" || agent === "writer" || agent === "drafter") {
    const r = Number(payload.round || 1);
    label = r > 1 ? "Revising the draft" : "Writing the draft";
  } else if (
    type === "check_result" ||
    type === "rewrite_requested" ||
    agent === "ai-writing checker" ||
    agent === "detector" ||
    agent === "editor"
  ) {
    label = "Checking quality";
    if (type === "rewrite_requested") {
      label = "Revising the draft";
      const note = payload.note ? String(payload.note) : undefined;
      if (note) detail = note;
    }
  } else if (msgLower.includes("search") || msgLower.includes("trend")) {
    label = "Researching trends";
  } else if (msgLower.includes("topic")) {
    label = "Choosing a topic";
  } else if (msgLower.includes("hook")) {
    label = "Planning the hook";
  } else if (msgLower.includes("revis") || msgLower.includes("rewrit")) {
    label = "Revising the draft";
  } else if (msgLower.includes("draft") || msgLower.includes("writ")) {
    label = "Writing the draft";
  } else if (msgLower.includes("check") || msgLower.includes("quality") || msgLower.includes("slop")) {
    label = "Checking quality";
  }

  let status: "running" | "done" | "failed" = "done";
  if (type === "run_failed" || evt.status === "failed") {
    status = "failed";
  } else if (isLatestAndRunning && type !== "run_completed") {
    status = "running";
  }

  const roundNum =
    typeof payload.round === "number"
      ? payload.round
      : typeof payload.round === "string" && payload.round
        ? Number(payload.round)
        : undefined;

  const scoreVal =
    typeof payload.ai_score === "number"
      ? payload.ai_score
      : typeof payload.final_score === "number"
        ? payload.final_score
        : undefined;

  const failedRules = Array.isArray(payload.failed_rules)
    ? payload.failed_rules.map(String)
    : Array.isArray(payload.issue_codes)
      ? payload.issue_codes.map(String)
      : undefined;

  return {
    id: `${evt.seq}-${type}`,
    seq: evt.seq,
    label,
    detail,
    relativeTime: formatRelativeSeconds(evt, firstEventTimeMs),
    status,
    round: roundNum && !Number.isNaN(roundNum) ? roundNum : undefined,
    agentName: evt.agent || undefined,
    rawMessage: evt.message || undefined,
    score: scoreVal,
    failedRules,
  };
}

export function groupStepsByRound(steps: FriendlyActivityStep[]): {
  preRound: FriendlyActivityStep[];
  rounds: ActivityRoundGroup[];
  postRound: FriendlyActivityStep[];
} {
  const preRound: FriendlyActivityStep[] = [];
  const postRound: FriendlyActivityStep[] = [];
  const roundsMap = new Map<number, FriendlyActivityStep[]>();

  let currentRound: number | null = null;
  for (const step of steps) {
    if (step.label === "Finished" || step.label === "Could not finish this draft") {
      postRound.push(step);
      continue;
    }
    if (step.round !== undefined) {
      currentRound = step.round;
    }
    if (currentRound !== null) {
      const list = roundsMap.get(currentRound) || [];
      list.push(step);
      roundsMap.set(currentRound, list);
    } else {
      preRound.push(step);
    }
  }

  const rounds: ActivityRoundGroup[] = Array.from(roundsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([round, rSteps]) => {
      const hasRevision = rSteps.some(
        (s) => s.label === "Revising the draft" && (s.detail || s.failedRules?.length)
      );
      const revStep = [...rSteps].reverse().find((s) => s.label === "Revising the draft");
      const allDone = rSteps.every((s) => s.status === "done");
      let outcome = "In progress";
      let passed = false;

      if (hasRevision && revStep?.detail) {
        outcome = `Revising: ${revStep.detail}`;
      } else if (allDone) {
        outcome = "Passed all checks";
        passed = true;
      }

      return {
        round,
        outcome,
        passed,
        steps: rSteps,
      };
    });

  return { preRound, rounds, postRound };
}
