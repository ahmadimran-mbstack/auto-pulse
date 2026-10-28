import json
import logging
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.agents.gtm import GTMBriefOutput, GTMReviewOutput, run_gtm_brief, run_gtm_review
from app.core.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("demo_gtm")


def main():
    print("=" * 70)
    print("AUTOPULSE PHASE 4: GTM AGENT DEMO")
    print("=" * 70)

    # 1. Setup sample context from a realistic Post Finder output
    sample_topic = "Neon Serverless Postgres Architecture Shift"
    sample_angle = "Why decoupling compute from storage changes p99 query tail latencies"
    sample_post_format = "observer take"
    sample_hook_type = "number-led specific result"
    sample_why_now = "Neon recently published new architectural benchmarks on storage engine latency"

    sample_sources = [
        {
            "title": "Neon Architecture: Storage Engine Deep Dive",
            "url": "https://neon.tech/blog/storage-engine-deep-dive",
            "text": (
                "By separating compute nodes from the Safekeeper and Pageserver tiers, Neon achieves sub-10ms "
                "cold starts and eliminates write amplification on compute instances. In recent synthetic benchmarks, "
                "p99 tail latency dropped by 38% under bursty read/write workloads."
            ),
        }
    ]

    sample_profile = {
        "role_title": "Staff Infrastructure Architect",
        "industry": "Distributed Cloud Systems",
        "niche_description": "Cloud native databases, Postgres internals, serverless compute, low-latency architectures",
        "audience": "Principal engineers, CTOs, and backend systems builders",
        "tone": "direct, technically rigorous, empirical, no marketing fluff",
        "voice_notes": "Ground observations in production benchmarks and real infrastructure trade-offs",
        "topics_include": ["PostgreSQL", "Distributed Systems", "Cloud Architecture"],
        "topics_avoid": ["Crypto", "Generic AI hype"],
    }

    print("\n[STEP 1] Generating GTM Content Brief (Before Drafting)...")
    print(f"Topic:       {sample_topic}")
    print(f"Angle:       {sample_angle}")
    print(f"Format:      {sample_post_format}")
    print(f"Hook Type:   {sample_hook_type}")
    print(f"Target Role: {sample_profile['role_title']}")

    # Check if API key is present for real call, otherwise use fake model
    use_mock = "--mock" in sys.argv or "--offline" in sys.argv
    has_api_key = bool(settings.LLM_API_KEY) and not use_mock
    if has_api_key:
        print("\n-> Running GTM Agent with live configured LLM model (settings.LLM_MODEL_GTM)...")
        brief = run_gtm_brief(
            topic=sample_topic,
            angle=sample_angle,
            post_format=sample_post_format,
            hook_type=sample_hook_type,
            why_now=sample_why_now,
            sources=sample_sources,
            profile=sample_profile,
        )
    else:
        print("\n-> Running with deterministic mock/offline model for clear demonstration.")
        brief = GTMBriefOutput(
            hook_options=[
                "Neon's storage decoupling dropped p99 tail latency by 38% under bursty workloads.",
                "Why serverless Postgres compute instances shouldn't manage their own write-ahead logs.",
                "We benchmarked Neon's Pageserver architecture against traditional Postgres RDS instances.",
            ],
            chosen_hook="Neon's storage decoupling dropped p99 tail latency by 38% under bursty workloads.",
            structure_lines=[
                "1. Hook: 38% tail latency reduction observed in storage decoupling benchmarks.",
                "2. Context: The legacy bottleneck—compute instances managing both WAL flush and page caching.",
                "3. Operational breakdown: How Safekeeper and Pageserver tiers isolate write amplification.",
                "4. Strategic trade-off: Network hop overhead vs compute tier elasticity.",
                "5. Practical takeaway: When to move database workloads to separated storage architectures.",
            ],
            ending_strategy="Decisive closing insight recommending architectural audit points without engagement bait [END-01].",
            notes=[
                "[HOOK-02] Number-led specific hook utilizing the 38% benchmark metric.",
                "[BODY-04] Front-load context and place architectural mechanics squarely in the center.",
                "[BODY-05] Show clear before vs after contrast between monolith and decoupled tiers.",
                "[END-01] Clean close adhering to playbook rules, avoiding 'Thoughts?' or 'Agree?'.",
            ],
        )

    print("\n--- GTM CONTENT BRIEF OUTPUT ---")
    print(f"Chosen Hook:     {brief.chosen_hook}")
    print("\nHook Variations:")
    for idx, opt in enumerate(brief.hook_options, 1):
        print(f"  [{idx}] {opt}")
    print("\nStructure Progression:")
    for line in brief.structure_lines:
        print(f"  {line}")
    print(f"\nEnding Strategy: {brief.ending_strategy}")
    print("\nEditorial Notes:")
    for note in brief.notes:
        print(f"  - {note}")

    # 2. Simulate draft creation and post-loop review
    print("\n" + "=" * 70)
    print("[STEP 2] Running GTM Post Review (After Rewrite Loop Finishes)...")

    sample_draft_post = (
        "Neon's storage decoupling dropped p99 tail latency by 38% under bursty workloads.\n\n"
        "In traditional Postgres deployments, compute instances handle both active query execution "
        "and synchronous WAL flushing to local NVMe disks. When traffic spikes, write amplification stalls read queries.\n\n"
        "By offloading the write-ahead log to Safekeeper nodes and stateless Pageservers, compute instances "
        "only need to hold warm memory contexts. Cold starts dropped under 10ms in our testbed, with zero node-level cache corruption.\n\n"
        "The trade-off is clear: you introduce a network hop between compute and storage, but you eliminate "
        "the tail latency spikes that plague high-concurrency clusters."
    )

    print("\nDraft Post Text Under Review:")
    print("-" * 50)
    print(sample_draft_post)
    print("-" * 50)

    if has_api_key:
        review = run_gtm_review(
            post_text=sample_draft_post,
            brief=brief,
            sources=sample_sources,
        )
    else:
        review = GTMReviewOutput(
            hook_strength=9,
            review_notes=[
                "Hook execution [HOOK-01, HOOK-02]: Opening line delivers a concrete 38% benchmark result that fits cleanly before the fold.",
                "Structure & rhythm [BODY-03, BODY-05]: Contrasts traditional monolith Postgres against decoupled architecture without listicle templates.",
                "Ending strategy [END-01]: Closes with a decisive operational trade-off without engagement bait or fake questions.",
            ],
        )

    print("\n--- GTM POST REVIEW OUTPUT ---")
    print(f"Hook Strength Score: {review.hook_strength}/10")
    print("\nReview Notes:")
    for note in review.review_notes:
        print(f"  * {note}")

    print("\n" + "=" * 70)
    print("PHASE 4 GTM AGENT EXECUTION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
