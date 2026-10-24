import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List
import requests
from sqlalchemy import text

# Ensure backend directory is in python search path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.db.session import engine


# Parse W3C Server-Timing header into a dictionary of metrics
def parse_server_timing(header_val: str) -> Dict[str, Any]:
    metrics: Dict[str, Any] = {"total": 0.0, "auth": 0.0, "db": 0.0, "queries": 0}
    if not header_val:
        return metrics

    for item in header_val.split(","):
        item = item.strip()
        if not item:
            continue
        parts = item.split(";")
        name = parts[0].strip()
        for param in parts[1:]:
            param = param.strip()
            if param.startswith("dur="):
                try:
                    val = float(param[4:])
                    if name in metrics:
                        metrics[name] = val
                    elif name == "queries":
                        metrics["queries"] = int(round(val))
                except ValueError:
                    pass
            elif param.startswith("desc=") and name == "queries":
                try:
                    val_str = param[5:].strip("\"'")
                    metrics["queries"] = int(val_str)
                except ValueError:
                    pass

    return metrics


# Extract only the region portion from a Neon database hostname
def extract_neon_region(db_url: str) -> str:
    parsed = urllib.parse.urlparse(db_url)
    host = parsed.hostname or ""
    parts = host.split(".")

    for i, part in enumerate(parts):
        if part == "aws" and i > 0:
            return parts[i - 1]

    if len(parts) >= 2:
        return parts[1]

    return "unknown"


# Benchmark raw database round trip and idle reconnect latency
def benchmark_database() -> Dict[str, Any]:
    region = extract_neon_region(settings.DATABASE_URL)
    select_times: List[float] = []

    # Run SELECT 1 twenty times using a dedicated connection
    with engine.connect() as conn:
        for _ in range(20):
            t0 = time.perf_counter()
            conn.execute(text("SELECT 1"))
            t1 = time.perf_counter()
            select_times.append((t1 - t0) * 1000)

    avg_roundtrip = sum(select_times) / len(select_times)

    # Wait 10 seconds to measure first-query reconnect latency on an idle connection
    print("Waiting 10 seconds to measure first-query reconnect latency...")
    time.sleep(10)

    with engine.connect() as conn:
        t0 = time.perf_counter()
        conn.execute(text("SELECT 1"))
        t1 = time.perf_counter()
        cold_query_ms = (t1 - t0) * 1000

    return {
        "region": region,
        "avg_roundtrip_ms": avg_roundtrip,
        "cold_query_ms": cold_query_ms,
    }


# Benchmark a single HTTP endpoint 20 times
def benchmark_endpoint(
    client: Any,
    url: str,
    headers: Dict[str, str],
    runs: int = 20,
) -> Dict[str, Any]:
    durations: List[float] = []
    db_times: List[float] = []
    queries: List[int] = []

    for _ in range(runs):
        t0 = time.perf_counter()
        res = client.get(url, headers=headers)
        t1 = time.perf_counter()

        client_duration_ms = (t1 - t0) * 1000
        durations.append(client_duration_ms)

        timing_header = res.headers.get("Server-Timing", "")
        parsed = parse_server_timing(timing_header)

        db_times.append(parsed.get("db", 0.0))
        queries.append(parsed.get("queries", 0))

    durations.sort()
    p50 = durations[int(len(durations) * 0.50)]
    p95 = durations[min(int(len(durations) * 0.95), len(durations) - 1)]
    avg_queries = sum(queries) / len(queries)
    avg_db_ms = sum(db_times) / len(db_times)

    return {
        "p50_ms": p50,
        "p95_ms": p95,
        "queries": avg_queries,
        "avg_db_ms": avg_db_ms,
    }


def main():
    token = os.environ.get("PERF_TOKEN", "").strip()
    if not token and len(sys.argv) > 1:
        token = sys.argv[1].strip()

    is_in_process = False
    api_base = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")

    if not token:
        print("Notice: PERF_TOKEN was not set in the environment.")
        print("Initializing in-process test client with real Neon database...")
        is_in_process = True

        from cryptography.hazmat.primitives.asymmetric import ed25519
        from cryptography.hazmat.primitives import serialization
        import base64
        import jwt
        from fastapi.testclient import TestClient
        from app.main import app
        from app.core import auth

        # Generate in-memory Ed25519 keypair and JWKS
        priv_key = ed25519.Ed25519PrivateKey.generate()
        pub_key = priv_key.public_key()
        pub_bytes = pub_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        x_b64 = base64.urlsafe_b64encode(pub_bytes).decode("ascii").rstrip("=")
        jwks = {"keys": [{"kty": "OKP", "crv": "Ed25519", "kid": "perf-key-1", "x": x_b64}]}
        auth._fetch_jwks = lambda *args, **kwargs: jwks

        # Discover author user_id from existing posts in database
        target_user_id = "33afd361-0a47-466d-8d32-be2d591379fb"
        try:
            with engine.connect() as conn:
                row = conn.execute(text("SELECT user_id FROM posts LIMIT 1")).fetchone()
                if row and row.user_id:
                    target_user_id = str(row.user_id)
        except Exception:
            pass

        now = int(time.time())
        payload = {
            "sub": target_user_id,
            "id": target_user_id,
            "email": "student@example.com",
            "name": "Student Engineer",
            "iss": settings.auth_origin,
            "aud": settings.auth_origin,
            "iat": now,
            "exp": now + 3600,
        }
        token = jwt.encode(payload, priv_key, algorithm="EdDSA", headers={"kid": "perf-key-1"})
        client = TestClient(app)
        api_base = ""
    else:
        client = requests.Session()

    auth_headers = {"Authorization": f"Bearer {token}"}

    print("================================================================================")
    print("AutoPulse Performance Benchmark (Baseline Measurement)")
    print(f"Mode: {'In-Process TestClient (Real Neon DB)' if is_in_process else f'HTTP ({api_base})'}")
    print("================================================================================\n")

    # Step A: Measure database round trips and idle connection latency
    print("1. Benchmarking Database...")
    db_metrics = benchmark_database()
    print(f"   Neon Region:             {db_metrics['region']}")
    print(f"   Average SELECT 1 (20x):  {db_metrics['avg_roundtrip_ms']:.2f} ms")
    print(f"   First query after 10s:   {db_metrics['cold_query_ms']:.2f} ms\n")

    # Step B: Discover existing post ID for /posts/{id} and /posts/{id}/image.png
    print("2. Discovering existing post for detail and image benchmarks...")
    sample_post_id = None
    try:
        posts_res = client.get(f"{api_base}/posts", headers=auth_headers)
        if posts_res.status_code == 200:
            posts_data = posts_res.json()
            posts_list = posts_data.get("items", posts_data) if isinstance(posts_data, dict) else posts_data
            if isinstance(posts_list, list) and len(posts_list) > 0:
                sample_post_id = posts_list[0].get("id")
    except Exception as exc:
        print(f"   Warning: Could not fetch posts list: {exc}")

    if not sample_post_id:
        print("   Warning: No posts found for the authenticated user.")
        sample_post_id = "1613ef0a-6ee7-4edd-b557-eb45afdd718c"

    print(f"   Selected Post ID:        {sample_post_id}\n")

    # Step C: Benchmark endpoints 20 times each
    endpoints = [
        ("/health", f"{api_base}/health", {}),
        ("/me", f"{api_base}/me", auth_headers),
        ("/profile", f"{api_base}/profile", auth_headers),
        ("/dashboard", f"{api_base}/dashboard", auth_headers),
        ("/posts", f"{api_base}/posts", auth_headers),
        ("/posts/schedule", f"{api_base}/posts/schedule", auth_headers),
        ("/connections", f"{api_base}/connections", auth_headers),
        (f"/posts/[id]", f"{api_base}/posts/{sample_post_id}", auth_headers),
        (f"/posts/[id]/image.png", f"{api_base}/posts/{sample_post_id}/image.png", auth_headers),
    ]

    results: List[Dict[str, Any]] = []
    print("3. Benchmarking Endpoints (20 requests per endpoint)...")
    for name, url, headers in endpoints:
        print(f"   Testing {name} ...", end="", flush=True)
        stats = benchmark_endpoint(client, url, headers, runs=20)
        stats["route"] = name
        results.append(stats)
        print(f" done (p50: {stats['p50_ms']:.1f}ms, queries: {stats['queries']:.0f}, db: {stats['avg_db_ms']:.1f}ms)")

    print("\n================================================================================")
    print("BENCHMARK RESULTS TABLE")
    print("================================================================================")
    header_fmt = "{:<26} | {:>10} | {:>10} | {:>10} | {:>12}"
    row_fmt = "{:<26} | {:>10.2f} | {:>10.2f} | {:>10.1f} | {:>12.2f}"

    print(header_fmt.format("Route", "p50 (ms)", "p95 (ms)", "Queries", "Avg DB (ms)"))
    print("-" * 80)
    for res in results:
        print(row_fmt.format(
            res["route"],
            res["p50_ms"],
            res["p95_ms"],
            res["queries"],
            res["avg_db_ms"],
        ))
    print("-" * 80)
    print("\nDatabase Metrics Summary:")
    print(f"- Neon Region: {db_metrics['region']}")
    print(f"- 20x SELECT 1 Average Round Trip: {db_metrics['avg_roundtrip_ms']:.2f} ms")
    print(f"- First Query After 10s Idle: {db_metrics['cold_query_ms']:.2f} ms")
    print("================================================================================\n")


if __name__ == "__main__":
    main()
