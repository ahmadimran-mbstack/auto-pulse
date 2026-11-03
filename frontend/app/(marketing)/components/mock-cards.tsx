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
  MessageSquare,
  Shield,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";

// Mock 1: A complete drafted post awaiting founder review and one-tap approval
export function MockDraftCard({ className }: { className?: string }) {
  return (
    <Card
      className={`bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Author information header and draft status badge */}
      <div className="flex items-center justify-between pb-4 border-b border-border-light">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center text-xs text-neutral-700 font-normal">
            AR
          </div>
          <div>
            <div className="text-sm font-normal text-ink">Alex Rivera</div>
            <div className="text-xs text-text-muted-light">
              Founder and CEO at LaunchPath
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className="rounded-full text-xs font-normal border-border-light text-neutral-700 bg-neutral-50 flex items-center gap-1.5 px-2.5 py-0.5"
        >
          <Clock className="w-3 h-3 text-text-muted-light" />
          Awaiting approval
        </Badge>
      </div>

      {/* Realistic sample body text without banned phrases or promises */}
      <div className="py-4 text-sm text-neutral-800 leading-relaxed space-y-3 font-normal">
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
      <div className="pt-3 pb-4 border-t border-border-light flex items-center justify-between text-xs text-text-muted-light">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-navy" />
          AI writing score: 11 / 100 (Passed check)
        </span>
        <span>Target: LinkedIn</span>
      </div>

      {/* Action buttons inside the draft card */}
      <div className="flex items-center justify-end gap-2.5 pt-2">
        <Button
          variant="outline"
          className="rounded-full h-8 px-3.5 text-xs font-normal border-border-light text-neutral-700 hover:bg-neutral-100"
        >
          Request changes
        </Button>
        <Button className="rounded-full h-8 px-4 text-xs font-normal bg-ink text-white hover:bg-neutral-800">
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
      className={`bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Slack channel and bot metadata header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-light text-xs text-text-muted-light">
        <span className="flex items-center gap-1.5 font-normal text-neutral-700">
          <MessageSquare className="w-3.5 h-3.5" />
          #autopulse-approvals
        </span>
        <span>Today at 9:00 AM</span>
      </div>

      {/* Bot message body with author tag */}
      <div className="pt-3 pb-2 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-navy-deep flex items-center justify-center shrink-0">
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
            <span className="text-xs font-normal text-ink">AutoPulse</span>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 border-neutral-300 text-text-muted-light rounded font-normal"
            >
              APP
            </Badge>
          </div>
          <p className="text-xs text-neutral-700 font-normal leading-snug">
            Your daily draft for LinkedIn is ready for review.
          </p>
        </div>
      </div>

      {/* Quoted draft snippet in Slack message block */}
      <div className="my-3 p-3 rounded-lg bg-neutral-50 border-l-2 border-navy text-xs text-neutral-800 leading-relaxed font-normal">
        Great products rarely win on feature count alone. They win because they remove friction from one essential daily task.
      </div>

      {/* Interactive Slack action buttons */}
      <div className="pt-2 flex items-center gap-2">
        <Button className="rounded-full h-7 px-3.5 text-xs font-normal bg-ink text-white hover:bg-neutral-800">
          Approve post
        </Button>
        <Button
          variant="outline"
          className="rounded-full h-7 px-3 text-xs font-normal border-border-light text-neutral-700 hover:bg-neutral-100"
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
      className={`bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Quality check header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-light">
        <span className="text-xs text-text-muted-light">Quality check</span>
        <Badge className="bg-ink text-white text-xs font-normal hover:bg-neutral-800">
          Passed check
        </Badge>
      </div>

      {/* Score number and threshold indicator */}
      <div className="py-4 text-center space-y-1">
        <div className="landing-heading text-4xl text-ink">
          11 / 100
        </div>
        <div className="text-xs text-text-muted-light font-normal">
          AI writing score (Iteration 2 of 4)
        </div>
      </div>

      {/* Visual threshold progress track */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-text-muted-light">
          <span>Measured score</span>
          <span>Threshold: under 15</span>
        </div>
        <div className="w-full h-2 rounded-full bg-neutral-100 relative overflow-hidden">
          <div
            className="h-full bg-blue rounded-full"
            style={{ width: "11%" }}
          />
        </div>
      </div>

      {/* Quality criteria checklist */}
      <div className="mt-4 pt-3 border-t border-border-light space-y-2 text-xs text-neutral-700">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-navy" />
          <span>Natural sentence length variation confirmed</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-navy" />
          <span>Uncommon industry vocabulary preserved</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-navy" />
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
      className={`bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Connection status header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-light">
        <span className="text-xs text-text-muted-light">LinkedIn Connection</span>
        <Badge
          variant="outline"
          className="text-xs font-normal border-border-light text-navy bg-ice/20"
        >
          Active
        </Badge>
      </div>

      {/* LinkedIn profile info */}
      <div className="py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0077B5]/10 text-[#0077B5] flex items-center justify-center font-bold text-sm">
          in
        </div>
        <div>
          <div className="text-sm font-normal text-ink">Alex Rivera</div>
          <div className="text-xs text-text-muted-light">
            linkedin.com/in/alexrivera
          </div>
        </div>
      </div>

      {/* Token lifespan and renewal notice */}
      <div className="pt-3 border-t border-border-light space-y-2 text-xs text-text-muted-light">
        <div className="flex items-center justify-between">
          <span>Connection duration</span>
          <span className="text-ink font-normal">Valid for 48 more days</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Permission scope</span>
          <span className="text-ink font-normal">Post to profile</span>
        </div>
        <div className="p-2.5 rounded-lg bg-neutral-50 text-[11px] text-neutral-600 leading-relaxed">
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
      className={`bg-white text-ink rounded-2xl border border-border-light p-5 sm:p-6 w-full max-w-md mx-auto ${
        className ?? ""
      }`}
    >
      {/* Step header */}
      <div className="flex items-center justify-between pb-2 border-b border-border-light">
        <span className="text-xs text-text-muted-light">Profile preferences</span>
        <span className="text-xs text-text-muted-light">Step 2 of 3</span>
      </div>

      {/* Profile preferences review */}
      <div className="py-2 space-y-2.5 text-xs">
        <div className="flex justify-between py-1 border-b border-neutral-100">
          <span className="text-text-muted-light">Professional role</span>
          <span className="text-ink font-normal">Founder and Operator</span>
        </div>
        <div className="flex justify-between py-1 border-b border-neutral-100">
          <span className="text-text-muted-light">Target audience</span>
          <span className="text-ink font-normal">B2B SaaS Leaders</span>
        </div>
        <div className="flex justify-between py-1 border-b border-neutral-100">
          <span className="text-text-muted-light">Tone selection</span>
          <span className="text-ink font-normal">Direct and analytical</span>
        </div>
        <div className="pt-1">
          <span className="text-text-muted-light block mb-1.5">Selected topics</span>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px] font-normal border-border-light">
              Product Strategy
            </Badge>
            <Badge variant="outline" className="text-[11px] font-normal border-border-light">
              Engineering Leadership
            </Badge>
            <Badge variant="outline" className="text-[11px] font-normal border-border-light">
              SaaS Operations
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

