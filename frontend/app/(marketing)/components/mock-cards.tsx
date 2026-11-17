// This file provides realistic mock UI cards styled with shadcn and Geist typography.
import React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Shield,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  LinkedInIcon,
  SlackIcon,
} from "./platform-icons";

// Mock 1: A complete drafted post awaiting founder review and one-tap approval
export function MockDraftCard({ className }: { className?: string }) {
  return (
    <Card
      className={`bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Author information header and draft status badge */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--lp-border-hairline)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--lp-surface-raised)] border border-[var(--lp-border)] flex items-center justify-center text-xs text-[var(--lp-text-heading)] font-normal">
            AR
          </div>
          <div>
            <div className="text-sm font-normal text-[var(--lp-text-heading)]">Alex Rivera</div>
            <div className="text-xs text-[var(--lp-text-muted)]">
              Founder and CEO at LaunchPath
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className="rounded-full text-xs font-normal border-[var(--lp-border)] text-[var(--lp-text-body)] bg-[var(--lp-surface-raised)] flex items-center gap-1.5 px-2.5 py-0.5"
        >
          <Clock className="w-3 h-3 text-[var(--lp-text-muted)]" />
          Awaiting approval
        </Badge>
      </div>

      {/* Realistic sample body text without banned phrases or promises */}
      <div className="py-4 text-sm text-[var(--lp-text-body)] leading-relaxed space-y-3 font-normal">
        <p>
          Most founders wait until product launch day to talk about their work. By then, nobody is listening.
        </p>
        <p>
          Build your audience while building the product. Share the decisions, the small wins, and the reasoning behind each milestone.
        </p>
        <p>
          When launch day comes, you already have people who care about what you created.
        </p>
      </div>

      {/* Quality check score and target delivery channel */}
      <div className="pt-3 pb-4 border-t border-[var(--lp-border-hairline)] flex items-center justify-between text-xs text-[var(--lp-text-muted)]">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--lp-ice)]" />
          AI writing score: 11 / 100 (Passed check)
        </span>
        <span className="flex items-center gap-1.5 text-[var(--lp-text-heading)] font-normal">
          <span className="text-[var(--lp-text-muted)]">Target:</span>
          <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
          <span>LinkedIn</span>
        </span>
      </div>

      {/* Action buttons inside the draft card */}
      <div className="flex items-center justify-end gap-2.5 pt-2">
        <Button
          variant="outline"
          className="rounded-full h-8 px-3.5 text-xs font-normal border-[var(--lp-border-input)] bg-transparent text-[var(--lp-text-body)] hover:bg-white/5"
        >
          Request changes
        </Button>
        <Button className="rounded-full h-8 px-4 text-xs font-normal bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)]">
          Approve and publish
        </Button>
      </div>
    </Card>
  );
}

// Mock 2: Slack approval message showing interactive bot actions
export function MockSlackCard({ className }: { className?: string }) {
  return (
    <Card
      className={`bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Slack channel and bot metadata header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)] text-xs text-[var(--lp-text-muted)]">
        <span className="flex items-center gap-1.5 font-normal text-[var(--lp-text-body)]">
          <SlackIcon className="w-3.5 h-3.5 shrink-0" />
          <span>#autopulse-approvals</span>
        </span>
        <span>Today at 9:00 AM</span>
      </div>

      {/* Bot message body with author tag */}
      <div className="pt-3 pb-2 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--lp-navy-deep)] border border-[var(--lp-border)] flex items-center justify-center shrink-0">
          <Image
            src="/logo-mark-blue-bg.png"
            alt=""
            width={18}
            height={18}
            className="w-4 h-4 object-contain"
          />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-normal text-[var(--lp-text-heading)]">AutoPulse</span>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-[var(--lp-border)] text-[var(--lp-text-muted)] rounded font-normal"
            >
              APP
            </Badge>
          </div>
          <p className="text-xs text-[var(--lp-text-body)] font-normal leading-snug flex items-center gap-1 flex-wrap">
            <span>Your daily draft for</span>
            <span className="inline-flex items-center gap-1 font-normal text-[var(--lp-text-heading)]">
              <LinkedInIcon className="w-3 h-3 shrink-0" />
              <span>LinkedIn</span>
            </span>
            <span>is ready for review.</span>
          </p>
        </div>
      </div>

      {/* Quoted draft snippet in Slack message block */}
      <div className="my-3 p-3 rounded-lg bg-[var(--lp-surface-raised)] border-l-2 border-[var(--lp-ice)] text-xs text-[var(--lp-text-body)] leading-relaxed font-normal">
        Great products rarely win on feature count alone. They win because they remove friction from one essential daily task.
      </div>

      {/* Interactive Slack action buttons */}
      <div className="pt-2 flex items-center gap-2">
        <Button className="rounded-full h-7 px-3.5 text-xs font-normal bg-[var(--lp-text-heading)] text-[var(--lp-bg)] hover:bg-[var(--lp-ice)]">
          Approve post
        </Button>
        <Button
          variant="outline"
          className="rounded-full h-7 px-3 text-xs font-normal border-[var(--lp-border-input)] bg-transparent text-[var(--lp-text-body)] hover:bg-white/5"
        >
          View full draft
        </Button>
      </div>
    </Card>
  );
}

// Mock 3: AI-writing score meter card with strict quality threshold
export function MockScoreMeterCard({ className }: { className?: string }) {
  return (
    <Card
      className={`bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Quality check header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)]">
        <span className="text-xs text-[var(--lp-text-muted)]">Quality check</span>
        <Badge className="bg-[var(--lp-text-heading)] text-[var(--lp-bg)] text-xs font-normal hover:bg-[var(--lp-ice)]">
          Passed check
        </Badge>
      </div>

      {/* Score number and threshold indicator */}
      <div className="py-4 text-center space-y-1">
        <div className="landing-heading text-5xl text-[var(--lp-text-heading)]">
          11 / 100
        </div>
        <div className="text-xs text-[var(--lp-text-muted)] font-normal">
          AI writing score (Iteration 2 of 4)
        </div>
      </div>

      {/* Visual threshold progress track */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-[var(--lp-text-muted)]">
          <span>Measured score</span>
          <span>Threshold: under 15</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[var(--lp-surface-raised)] border border-[var(--lp-border-hairline)] relative overflow-hidden">
          <div
            className="h-full bg-[var(--lp-blue)] rounded-full"
            style={{ width: "11%" }}
          />
        </div>
      </div>

      {/* Quality criteria checklist */}
      <div className="mt-4 pt-3 border-t border-[var(--lp-border-hairline)] space-y-2 text-xs text-[var(--lp-text-body)]">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--lp-ice)] shrink-0" />
          <span>Natural sentence length variation confirmed</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--lp-ice)] shrink-0" />
          <span>Uncommon industry vocabulary preserved</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--lp-ice)] shrink-0" />
          <span>No generic introductory statements</span>
        </div>
      </div>
    </Card>
  );
}

// Mock 4: LinkedIn connected status card
export function MockLinkedInStatusCard({ className }: { className?: string }) {
  return (
    <Card
      className={`bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Connection status header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--lp-border-hairline)]">
        <span className="text-xs text-[var(--lp-text-muted)] flex items-center gap-1.5 font-normal">
          <LinkedInIcon className="w-3.5 h-3.5 shrink-0" />
          <span>LinkedIn Connection</span>
        </span>
        <Badge
          variant="outline"
          className="text-xs font-normal border-[var(--lp-border)] text-[var(--lp-ice)] bg-[var(--lp-surface-raised)]"
        >
          Active
        </Badge>
      </div>

      {/* LinkedIn profile info */}
      <div className="py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
          <LinkedInIcon className="w-10 h-10" />
        </div>
        <div>
          <div className="text-sm font-normal text-[var(--lp-text-heading)]">Alex Rivera</div>
          <div className="text-xs text-[var(--lp-text-muted)]">
            linkedin.com/in/alexrivera
          </div>
        </div>
      </div>

      {/* Token lifespan and renewal notice */}
      <div className="pt-3 border-t border-[var(--lp-border-hairline)] space-y-2 text-xs text-[var(--lp-text-muted)]">
        <div className="flex items-center justify-between">
          <span>Connection duration</span>
          <span className="text-[var(--lp-text-heading)] font-normal">Valid for 48 more days</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Permission scope</span>
          <span className="text-[var(--lp-text-heading)] font-normal">Post to profile</span>
        </div>
        <div className="p-2.5 rounded-lg bg-[var(--lp-surface-raised)] border border-[var(--lp-border-hairline)] text-[11px] text-[var(--lp-text-body)] leading-relaxed">
          LinkedIn connections last 60 days. AutoPulse sends an email reminder before expiry so your schedule continues without pause.
        </div>
      </div>
    </Card>
  );
}

// Mock 5: Onboarding step showing audience and voice setup
export function MockOnboardingStepCard({ className }: { className?: string }) {
  return (
    <Card
      className={`bg-[var(--lp-surface)] text-[var(--lp-text-body)] rounded-2xl border border-[var(--lp-border)] shadow-[var(--lp-highlight-top)] p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Step header */}
      <div className="flex items-center justify-between pb-2 border-b border-[var(--lp-border-hairline)]">
        <span className="text-xs text-[var(--lp-text-muted)]">Profile preferences</span>
        <span className="text-xs text-[var(--lp-text-muted)]">Step 2 of 3</span>
      </div>

      {/* Profile preferences review */}
      <div className="py-2 space-y-2.5 text-xs">
        <div className="flex justify-between py-1 border-b border-[var(--lp-border-hairline)]">
          <span className="text-[var(--lp-text-muted)]">Professional role</span>
          <span className="text-[var(--lp-text-heading)] font-normal">Founder and Operator</span>
        </div>
        <div className="flex justify-between py-1 border-b border-[var(--lp-border-hairline)]">
          <span className="text-[var(--lp-text-muted)]">Target audience</span>
          <span className="text-[var(--lp-text-heading)] font-normal">B2B SaaS Leaders</span>
        </div>
        <div className="flex justify-between py-1 border-b border-[var(--lp-border-hairline)]">
          <span className="text-[var(--lp-text-muted)]">Tone selection</span>
          <span className="text-[var(--lp-text-heading)] font-normal">Direct and analytical</span>
        </div>
        <div className="pt-1">
          <span className="text-[var(--lp-text-muted)] block mb-1.5">Selected topics</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-text-body)]">
              Product Strategy
            </Badge>
            <Badge variant="outline" className="text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-text-body)]">
              Engineering Leadership
            </Badge>
            <Badge variant="outline" className="text-[11px] font-normal border-[var(--lp-border)] text-[var(--lp-text-body)]">
              SaaS Operations
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

