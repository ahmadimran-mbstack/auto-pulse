import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure Windows stdout handles utf-8 safely
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.agents.scanner import scan

sample1 = """PostgreSQL 16 introduced bidirectionally linked memory contexts.

In our benchmarks with 400 active client connections, memory fragmentation fell from 34% to 12% over 48 hours. The p99 query latency stayed flat at 18ms under 5,000 queries per second.

We deployed the upgrade across our staging cluster last Tuesday, monitoring buffer pool evictions. The database service remained stable throughout the test."""

sample2 = """In today's fast-paced world, the realm of cloud databases is undergoing a truly transformative journey.

It's not just about speed, it's about unlocking the power of seamless scalability.

The secret: supercharge your holistic strategy, highlighting the importance of continuous innovation.

What do you think? Agree? Thoughts? Drop a comment below!"""

sample3 = """AI is revolutionizing database optimization—and the speed gains are real.

Here is what we observed:
→ Efficiency increased by 40% across all services.
→ Teams can now foster seamless deployments.

Whether you're a junior dev or an engineering VP, this stands as a testament to modern engineering.

Let that sink in. Follow for more!"""

for title, s in [
    ("Sample 1: Authentic Human Post", sample1),
    ("Sample 2: Blatant AI Slop Post", sample2),
    ("Sample 3: Subtle Slop with Punctuation & Bullets", sample3),
]:
    res = scan(s)
    print(f"=== {title} ===")
    print(f"Deterministic Score: {res.deterministic_score}/100")
    print(f"Category Scores: {res.category_scores}")
    print(f"Total Findings: {len(res.findings)}")
    for f in res.findings:
        print(f"  - [{f.category}] {f.rule_id} ({f.points} pts) [offsets {f.start}:{f.end}]: \"{f.quote}\"")
        # Sanity check exact substring offset in text
        assert s[f.start:f.end] == f.quote
    print()
