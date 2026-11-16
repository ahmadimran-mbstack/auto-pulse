"""Public event emitter for live agent timeline updates.
Buffers and writes sanitized RunEvent rows to Postgres while keeping DB round trips low.
"""

import datetime
import logging
import time
import uuid
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urlparse

from app.models.post import PlaygroundRun, RunEvent
from app.services.pipeline_config import (
    AI_SLOP_TARGET,
    get_agent_label,
    get_plain_issue_note,
)

logger = logging.getLogger(__name__)


def extract_domain(url: str) -> str:
    """Extract a clean host domain from a URL without protocol or www prefix."""
    if not url:
        return ""
    try:
        host = urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host
    except Exception:
        return ""


def first_two_lines(text: str) -> str:
    """Return at most the first two non-empty lines of a draft for safe previewing."""
    if not text:
        return ""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    return "\n".join(lines[:2])[:280]


class RunEventEmitter:
    """Collects public timeline events and flushes them in batches to run_events."""

    def __init__(
        self,
        run_id: Optional[str],
        user_id: str,
        session_factory: Optional[Callable[[], Any]] = None,
        batch_size: int = 4,
    ):
        self.run_id = uuid.UUID(str(run_id)) if run_id and str(run_id) != "none" else None
        self.user_id = user_id
        self.session_factory = session_factory
        self.batch_size = max(1, batch_size)
        self._seq = 0
        self._buffer: List[RunEvent] = []
        self.total_write_ms: float = 0.0
        self.events_emitted: int = 0
        self.flush_count: int = 0

    def emit(
        self,
        event_type: str,
        message: str,
        agent: Optional[str] = None,
        status: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        flush_now: bool = False,
    ) -> None:
        """Queue a sanitized public event and flush when batch_size or flush_now is reached."""
        if not self.run_id:
            return

        self._seq += 1
        self.events_emitted += 1
        friendly_agent = get_agent_label(agent) if agent and agent in {"finder", "gtm", "drafter", "detector", "editor"} else agent

        evt = RunEvent(
            run_id=self.run_id,
            user_id=self.user_id,
            seq=self._seq,
            created_at=datetime.datetime.now(datetime.timezone.utc),
            type=event_type,
            agent=friendly_agent,
            status=status,
            message=message,
            payload=payload or {},
        )
        self._buffer.append(evt)

        if flush_now or len(self._buffer) >= self.batch_size:
            self.flush()

    def flush(self) -> None:
        """Write buffered events to Postgres in a single transaction."""
        if not self.run_id or not self._buffer or self.session_factory is None:
            return

        to_write = list(self._buffer)
        self._buffer.clear()
        t0 = time.perf_counter()
        try:
            with self.session_factory() as db:
                db.add_all(to_write)
                # Touch last_progress_at so the 2-minute stuck-run detector knows we are alive
                db.query(PlaygroundRun).filter(PlaygroundRun.id == self.run_id).update(
                    {"last_progress_at": datetime.datetime.now(datetime.timezone.utc)}
                )
                db.commit()
            self.flush_count += 1
        except Exception as exc:
            logger.warning(f"Failed to flush {len(to_write)} run events for {self.run_id}: {exc}")
        finally:
            self.total_write_ms += (time.perf_counter() - t0) * 1000.0

    def is_cancelled(self) -> bool:
        """Check whether the user requested cancellation for this run."""
        if not self.run_id or self.session_factory is None:
            return False
        try:
            with self.session_factory() as db:
                row = (
                    db.query(PlaygroundRun.cancel_requested)
                    .filter(PlaygroundRun.id == self.run_id)
                    .first()
                )
                return bool(row and row[0])
        except Exception:
            return False

    # Convenience helpers for standard Phase 4 public events

    def emit_run_started(self) -> None:
        self.emit(
            "run_started",
            "Starting your post writing run.",
            status="working",
            flush_now=True,
        )

    def emit_agent_started(self, agent_key: str, message: str, round_num: int = 0) -> None:
        self.emit(
            "agent_started",
            message,
            agent=agent_key,
            status="working",
            payload={"round": round_num} if round_num else {},
            flush_now=True,
        )

    def emit_agent_completed(self, agent_key: str, message: str, round_num: int = 0) -> None:
        self.emit(
            "agent_completed",
            message,
            agent=agent_key,
            status="done",
            payload={"round": round_num} if round_num else {},
        )

    def emit_topic_chosen(self, topic_label: str, key_facts: List[Dict[str, Any]]) -> None:
        domains: List[str] = []
        facts_preview: List[Dict[str, str]] = []
        for kf in key_facts[:6]:
            url = kf.get("source_url", "") if isinstance(kf, dict) else getattr(kf, "source_url", "")
            dom = extract_domain(url)
            if dom and dom not in domains:
                domains.append(dom)
            fact_text = kf.get("fact", "") if isinstance(kf, dict) else getattr(kf, "fact", "")
            if fact_text:
                facts_preview.append({"fact": fact_text[:220], "domain": dom})

        self.emit(
            "topic_chosen",
            f"Picked topic: {topic_label}.",
            agent="finder",
            status="done",
            payload={
                "topic_title": topic_label,
                "facts_count": len(facts_preview),
                "source_domains": domains,
                "facts": facts_preview,
            },
            flush_now=True,
        )

    def emit_hook_chosen(self, hook_style: str) -> None:
        readable_style = (hook_style or "observation").replace("_", " ")
        self.emit(
            "hook_chosen",
            f"Chosen opening style: {readable_style}.",
            agent="gtm",
            status="done",
            payload={"hook_style": readable_style},
            flush_now=True,
        )

    def emit_draft_ready(self, round_num: int, post_text: str) -> None:
        self.emit(
            "draft_ready",
            f"Draft ready for round {round_num}.",
            agent="drafter",
            status="done",
            payload={
                "round": round_num,
                "preview": first_two_lines(post_text),
            },
            flush_now=True,
        )

    def emit_check_result(self, round_num: int, ai_score: int) -> None:
        self.emit(
            "check_result",
            f"AI-writing check scored {ai_score} out of 100 (target under {AI_SLOP_TARGET}).",
            agent="detector",
            status="done",
            payload={
                "round": round_num,
                "ai_score": ai_score,
                "target": AI_SLOP_TARGET,
            },
            flush_now=True,
        )

    def emit_revision_notes(self, round_num: int, issue_codes: List[str]) -> None:
        seen = set()
        for code in issue_codes:
            note = get_plain_issue_note(code)
            if note in seen:
                continue
            seen.add(note)
            self.emit(
                "revision_note",
                note,
                agent="editor",
                status="working",
                payload={"round": round_num, "note": note},
            )
        self.flush()

    def emit_best_updated(self, round_num: int) -> None:
        self.emit(
            "best_updated",
            f"Saved round {round_num} as the best draft so far.",
            agent="editor",
            status="done",
            payload={"round": round_num},
        )

    def emit_run_completed(self, final_post: Dict[str, Any], ai_score: int, rounds_used: int) -> None:
        self.emit(
            "run_completed",
            f"Finished after {rounds_used} round{'s' if rounds_used != 1 else ''}.",
            agent="editor",
            status="done",
            payload={
                "final_post": final_post,
                "ai_score": ai_score,
                "rounds_used": rounds_used,
            },
            flush_now=True,
        )

    def emit_run_failed(self, plain_message: str) -> None:
        self.emit(
            "run_failed",
            plain_message,
            status="failed",
            payload={"message": plain_message},
            flush_now=True,
        )

