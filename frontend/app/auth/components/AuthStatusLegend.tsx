export function AuthStatusLegend() {
  return (
    <div className="w-full max-w-[440px] p-8 rounded-[16px] border border-line bg-surface text-left hero-panel-shadow">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-signal animate-pulse-glow" />
        <span className="text-xs font-semibold uppercase tracking-wider text-signal font-mono">
          Strict Approval Standard
        </span>
      </div>

      <h2 className="text-2xl font-geist font-normal tracking-tighter text-ink mb-3">
        You approve every post
      </h2>
      <p className="text-sm text-muted mb-7 leading-relaxed">
        AutoPulse operates as your dedicated research and creative team. Drafts and branded graphics wait in your dashboard until you explicitly confirm them.
      </p>

      {/* Visual Status Ledger */}
      <div className="space-y-3 mb-8">
        <div className="flex items-center justify-between p-3.5 rounded-[8px] border border-line bg-paper/60">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-draft-text bg-draft-bg border border-amber-200">
              Draft
            </span>
            <span className="text-xs font-medium text-ink">
              Morning Discovery
            </span>
          </div>
          <span className="text-xs text-muted">
            Waiting in queue
          </span>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-[8px] border border-signal/30 bg-signal-soft/30">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-signal bg-signal-soft border border-[#93D7CE]">
              Approved
            </span>
            <span className="text-xs font-medium text-ink">
              Human Sign-Off
            </span>
          </div>
          <span className="text-xs text-signal font-medium">
            Ready to dispatch
          </span>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-[8px] border border-line bg-paper/60">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-ink bg-surface border border-line">
              <svg
                className="w-3 h-3 text-signal"
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
              Published
            </span>
            <span className="text-xs font-medium text-ink">
              Live on Feed
            </span>
          </div>
          <span className="text-xs text-muted">
            Official API call
          </span>
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-[8px] border border-line bg-paper/60">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-rejected-text bg-rejected-bg border border-rose-200">
              Rejected
            </span>
            <span className="text-xs font-medium text-ink">
              Discarded
            </span>
          </div>
          <span className="text-xs text-muted">
            Never leaves system
          </span>
        </div>
      </div>

      {/* Trust reassurance pills */}
      <div className="pt-6 border-t border-line space-y-2 text-xs text-muted">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-signal shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span>Official LinkedIn OAuth with revocable permissions</span>
        </div>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-signal shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span>No automated scheduling or publishing overrides</span>
        </div>
      </div>
    </div>
  );
}
