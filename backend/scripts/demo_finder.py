import json
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.agents.finder import FinderOutput, FinderSource, validate_finder_output
from app.core.config import settings
from app.services.pipeline import create_chat_model

# Shared candidate articles simulating search node output
candidates = [
    {
        "title": "PostgreSQL 17 Logical Replication Failover Benchmarks",
        "url": "https://example.com/pg17-failover-benchmarks",
        "published_at": "2026-10-27T10:00:00Z",
        "source_name": "Postgres Weekly",
        "text": "PostgreSQL 17 introduces failover control for logical replication slots. In our tests with high write volume, slot synchronization latency was reduced to under 12ms during replica promotion.",
    },
    {
        "title": "Rust Async Runtimes: Tokio vs smol under 50k Concurrency",
        "url": "https://example.com/rust-tokio-vs-smol-50k",
        "published_at": "2026-10-26T14:30:00Z",
        "source_name": "Systems Engineering Journal",
        "text": "We ran continuous 50k TCP client connections against Tokio and smol. Tokio maintained steady 14ms latency while consuming 120MB less resident memory under burst thread allocation.",
    },
    {
        "title": "Kafka Partition Rebalancing Latency in Kubernetes",
        "url": "https://example.com/kafka-rebalance-k8s-latency",
        "published_at": "2026-10-25T08:00:00Z",
        "source_name": "Distributed Systems Today",
        "text": "Cooperative sticky assignors reduced consumer stop-the-world pauses from 8.4 seconds down to 220ms during Kubernetes rolling pod restarts across 40 partitions.",
    },
    {
        "title": "SQLite as an Application File Format in 2026",
        "url": "https://example.com/sqlite-app-format-2026",
        "published_at": "2026-10-24T12:00:00Z",
        "source_name": "Database Trends",
        "text": "Embedded SQLite databases outpaced custom JSON file parsing by 9x on mobile startup benchmarks, with zero corruption across 10,000 simulated process crashes.",
    },
]

# Scenario 1: Active Author (Last 2 formats: 'observer take', 'myth vs reality')
history_1 = [
    {
        "post_format": "observer take",
        "topic_title": "PostgreSQL 16 Memory Management",
        "topic_url": "https://example.com/pg16-mem-management",
        "is_last_14_days": True,
        "angle": "Why buffer context management matters",
        "hook_type": "specific observation",
        "caption_preview": "Postgres memory fragmentation dropped from 34% to 12% in production tests.",
    },
    {
        "post_format": "myth vs reality",
        "topic_title": "Redis Persistence: RDB vs AOF",
        "topic_url": "https://example.com/redis-rdb-vs-aof",
        "is_last_14_days": True,
        "angle": "Common misconceptions about disk sync intervals",
        "hook_type": "defensible contrarian claim",
        "caption_preview": "A lot of teams think AOF everysec is zero risk, but write amplification can saturate SSDs.",
    },
]

# Scenario 2: Lead Architect (Last 2 formats: 'build log', 'mistake and fix')
history_2 = [
    {
        "post_format": "build log",
        "topic_title": "Kafka Partition Rebalancing Latency in Kubernetes",
        "topic_url": "https://example.com/kafka-rebalance-k8s-latency",
        "is_last_14_days": True,
        "angle": "How we tuned consumer group assignors",
        "hook_type": "number-led specific result",
        "caption_preview": "We cut stop-the-world pauses from 8.4s to 220ms during Kubernetes pod rollouts.",
    },
    {
        "post_format": "mistake and fix",
        "topic_title": "Connection Pool Starvation in Go Services",
        "topic_url": "https://example.com/go-pool-starvation",
        "is_last_14_days": True,
        "angle": "Why default HTTP client transport timeouts lead to thread starvation",
        "hook_type": "concrete mistake",
        "caption_preview": "We lost 15 minutes of API gateway traffic because idle connection timeouts were missing.",
    },
]

# Scenario 3: Brand New User (Zero previous posts)
history_3 = []


def run_scenario(name: str, profile: dict, history: list, mock_output: FinderOutput):
    print(f"\n=======================================================")
    print(f"  {name.upper()}")
    print(f"=======================================================")
    print(f"Profile: {profile['role_title']} ({profile['niche_description']})")
    print(f"Past posts in history: {len(history)}")
    if history:
        print("Last 2 post formats to avoid:", [p["post_format"] for p in history[:2]])
        recent_14d_titles = [p["topic_title"] for p in history if p.get("is_last_14_days")]
        print("Recent 14-day topics to avoid:", recent_14d_titles)
    else:
        print("No prior history (first post).")

    is_valid, violations = validate_finder_output(mock_output, candidates, history)
    print(f"\nFinder Output:")
    print(f"  Topic:       {mock_output.topic}")
    print(f"  Angle:       {mock_output.angle}")
    print(f"  Post Format: {mock_output.post_format}")
    print(f"  Hook Type:   {mock_output.hook_type}")
    print(f"  Why Now:     {mock_output.why_now}")
    print(f"  Sources:     {[s.url for s in mock_output.sources]}")
    print(f"  Avoided:     {mock_output.avoided}")
    print(f"  Validation:  {'VALID (Passed)' if is_valid else 'VIOLATIONS: ' + str(violations)}")


if __name__ == "__main__":
    profile_systems = {
        "role_title": "Principal Systems Engineer",
        "industry": "Cloud Infrastructure",
        "niche_description": "Database internals, memory optimization, low-latency runtimes",
        "audience": "Staff and Principal Engineers",
        "topics_include": ["Postgres", "Rust", "Distributed Systems"],
        "topics_avoid": ["Crypto", "Frontend"],
    }

    # Output for Scenario 1: Avoids 'observer take' and 'myth vs reality', picks 'comparison with a verdict'
    output_1 = FinderOutput(
        topic="Rust Async Runtimes: Tokio vs smol under 50k Concurrency",
        angle="Why Tokio's memory allocator holds up better under sudden TCP connection spikes",
        post_format="comparison with a verdict",
        hook_type="number-led specific result",
        why_now="New benchmark published yesterday comparing runtime overhead under 50k concurrent sockets",
        sources=[
            FinderSource(
                title="Rust Async Runtimes: Tokio vs smol under 50k Concurrency",
                url="https://example.com/rust-tokio-vs-smol-50k",
            )
        ],
        avoided=["PostgreSQL 16 Memory Management", "Redis Persistence: RDB vs AOF"],
    )
    run_scenario("Scenario 1: Author Rotating Formats & Avoiding PG 16 / Redis", profile_systems, history_1, output_1)

    # Output for Scenario 2: Avoids 'build log' and 'mistake and fix' AND avoids Kafka URL used 2 days ago
    output_2 = FinderOutput(
        topic="PostgreSQL 17 Logical Replication Failover Benchmarks",
        angle="Why replication slot failover in PG 17 changes disaster recovery topologies",
        post_format="news with a take",
        hook_type="specific observation",
        why_now="PG 17 logical slot failover benchmarks were released yesterday morning",
        sources=[
            FinderSource(
                title="PostgreSQL 17 Logical Replication Failover Benchmarks",
                url="https://example.com/pg17-failover-benchmarks",
            )
        ],
        avoided=["Kafka Partition Rebalancing Latency in Kubernetes", "Connection Pool Starvation in Go Services"],
    )
    run_scenario("Scenario 2: Lead Architect Avoiding Kafka Rebalance URL & Format Duplication", profile_systems, history_2, output_2)

    # Output for Scenario 3: First Post for New User
    output_3 = FinderOutput(
        topic="SQLite as an Application File Format in 2026",
        angle="Why treating SQLite as an immutable document format beats custom serialization",
        post_format="observer take",
        hook_type="pointed specific question",
        why_now="Fresh mobile startup benchmarks released showing 9x throughput gains over JSON parsing",
        sources=[
            FinderSource(
                title="SQLite as an Application File Format in 2026",
                url="https://example.com/sqlite-app-format-2026",
            )
        ],
        avoided=[],
    )
    run_scenario("Scenario 3: Brand New User with Zero Prior History", profile_systems, history_3, output_3)
