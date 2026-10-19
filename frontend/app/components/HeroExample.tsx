"use client";

import { useEffect, useState } from "react";

type Stage =
  | "finding"
  | "writing"
  | "designing"
  | "waiting"
  | "approved"
  | "published"
  | "rejected";

export function HeroExample() {
  const [stage, setStage] = useState<Stage>("finding");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check user preference for reduced motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncMotionPreference = () => {
      if (mediaQuery.matches) {
        setPrefersReducedMotion(true);
        setStage("waiting");
      }
    };

    const animId = requestAnimationFrame(syncMotionPreference);
    mediaQuery.addEventListener("change", syncMotionPreference);

    return () => {
      cancelAnimationFrame(animId);
      mediaQuery.removeEventListener("change", syncMotionPreference);
    };
  }, []);

  // Run initial sequence of ~4 seconds: finding -> writing -> designing -> waiting
  useEffect(() => {
    if (prefersReducedMotion) return;

    if (stage === "finding") {
      const t1 = setTimeout(() => setStage("writing"), 1100);
      return () => clearTimeout(t1);
    }
    if (stage === "writing") {
      const t2 = setTimeout(() => setStage("designing"), 1100);
      return () => clearTimeout(t2);
    }
    if (stage === "designing") {
      const t3 = setTimeout(() => setStage("waiting"), 1100);
      return () => clearTimeout(t3);
    }
    if (stage === "approved") {
      const t4 = setTimeout(() => setStage("published"), 900);
      return () => clearTimeout(t4);
    }
  }, [stage, prefersReducedMotion]);

  const handleApprove = () => {
    setStage("approved");
  };

  const handleReject = () => {
    setStage("rejected");
  };

  const handleReplay = () => {
    if (prefersReducedMotion) {
      setStage("waiting");
    } else {
      setStage("finding");
    }
  };

  return (
    <div className="w-full max-w-[500px] bg-surface rounded-[16px] border border-line p-6 hero-panel-shadow text-left transition-all">
      {/* Header bar of example card */}
      <div className="flex items-center justify-between pb-4 border-b border-line mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-signal animate-pulse-glow" />
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            Daily Approval Queue
          </span>
        </div>
        <button
          type="button"
          onClick={handleReplay}
          className="text-xs text-muted hover:text-ink transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Replay sequence</span>
        </button>
      </div>

      {/* Stepper progress indicator */}
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        <div
          className={`h-1.5 rounded-full transition-colors duration-300 ${
            stage === "finding" || stage === "writing" || stage === "designing" || stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-signal"
              : "bg-line"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors duration-300 ${
            stage === "writing" || stage === "designing" || stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-signal"
              : "bg-line"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors duration-300 ${
            stage === "designing" || stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-signal"
              : "bg-line"
          }`}
        />
        <div
          className={`h-1.5 rounded-full transition-colors duration-300 ${
            stage === "waiting" || stage === "approved" || stage === "published"
              ? "bg-signal"
              : "bg-line"
          }`}
        />
      </div>

      {/* Dynamic status badge */}
      <div className="mb-4 flex items-center justify-between">
        {stage === "finding" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-draft-text bg-draft-bg border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            1/4 Scanning industry trends...
          </span>
        )}
        {stage === "writing" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-draft-text bg-draft-bg border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            2/4 Drafting executive perspective...
          </span>
        )}
        {stage === "designing" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-draft-text bg-draft-bg border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
            3/4 Designing branded visual card...
          </span>
        )}
        {stage === "waiting" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Ready for your review
          </span>
        )}
        {stage === "approved" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-signal bg-signal-soft border border-[#93D7CE]">
            <span className="w-1.5 h-1.5 rounded-full bg-signal" />
            Approved · Publishing now...
          </span>
        )}
        {stage === "published" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-ink bg-surface border border-line">
            <svg
              className="w-3.5 h-3.5 text-signal"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 8.5L6.5 12L13 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Live on LinkedIn
          </span>
        )}
        {stage === "rejected" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-rejected-text bg-rejected-bg border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Draft Rejected · Nothing published
          </span>
        )}

        <span className="text-[11px] text-muted">LinkedIn Post Preview</span>
      </div>

      {/* Realistic LinkedIn Post Container */}
      <div className="rounded-[10px] border border-line bg-paper/60 p-4 mb-4">
        {/* Author header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-linear-to-tr from-[#0B7F70] to-[#14B8A6] flex items-center justify-center text-white text-xs font-bold shrink-0">
            AM
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-xs text-ink truncate">Alex Morgan</span>
              <svg className="w-3 h-3 text-[#0A66C2] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm-1-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5 7h-2v-3c0-.55-.45-1-1-1s-1 .45-1 1v3h-2v-6h2v1.1c.42-.64 1.14-1.1 2-1.1 1.66 0 3 1.34 3 3v3z" />
              </svg>
            </div>
            <p className="text-[11px] text-muted truncate">VP of Product & AI Architecture · 8:15 AM</p>
          </div>
        </div>

        {/* Post body */}
        <div className="text-xs text-ink space-y-1.5 mb-3 leading-relaxed">
          <p className="font-medium text-ink">
            Most teams measure activity metrics instead of completed customer workflows.
          </p>
          <p className="text-muted">
            When retention stalls, shipping more features rarely fixes the underlying friction. Measure completed workflows, not output volume.
          </p>
          <p className="text-[#0A66C2] font-medium pt-1">
            #ProductStrategy #EngineeringLeadership #AutoPulse
          </p>
        </div>

        {/* Branded visual card */}
        <div className="w-full h-32 rounded-[8px] bg-linear-to-br from-[#064E3B] via-[#0B7F70] to-[#042F2E] p-3.5 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-[#93D7CE] uppercase">
              AutoPulse Insight
            </span>
            <span className="text-[10px] text-white/70 font-mono">08:00 AM</span>
          </div>
          <p className="text-xs font-semibold leading-snug text-white max-w-[90%]">
            &ldquo;Measure completed customer workflows, not raw feature output volume.&rdquo;
          </p>
          <div className="flex items-center justify-between text-[10px] text-white/60">
            <span>autopulse.ai</span>
            <span>Verified draft</span>
          </div>
        </div>

        {/* Simulated LinkedIn Engagement Bar */}
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-line text-[11px] text-muted">
          <span>👍 148 reactions</span>
          <span>32 comments · 14 reposts</span>
        </div>
      </div>

      {/* Interactive approval actions */}
      <div>
        {stage === "rejected" ? (
          <button
            type="button"
            onClick={handleReplay}
            className="w-full py-2.5 px-4 rounded-[8px] bg-ink text-surface text-sm font-medium hover:opacity-95 transition-opacity cursor-pointer text-center"
          >
            Generate next morning draft
          </button>
        ) : stage === "published" ? (
          <div className="p-3 rounded-[8px] bg-signal-soft border border-[#93D7CE] text-center">
            <p className="text-xs font-medium text-signal">
              Post successfully published to your LinkedIn profile.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleApprove}
              disabled={stage !== "waiting"}
              className="flex-1 py-2.5 px-4 rounded-[8px] bg-signal text-surface text-sm font-medium hover:bg-signal-hover disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed text-center shadow-xs active:translate-y-[1px]"
            >
              Approve & Publish
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={stage !== "waiting"}
              className="flex-1 py-2.5 px-4 rounded-[8px] border border-line bg-surface text-ink text-sm font-medium hover:bg-paper disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed text-center"
            >
              Reject Draft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
