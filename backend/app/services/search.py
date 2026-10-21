import datetime
import html
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from pydantic import BaseModel, Field
from app.core.config import settings


class Candidate(BaseModel):
    # Search candidate article schema
    title: str
    url: str
    published_at: Optional[str] = None
    text: str = Field(description="Cleaned text content truncated to 3000 characters")
    source_name: str


class SearchError(Exception):
    # Unified exception raised when a search provider fails
    pass


# Clean raw web content by removing html tags and collapsing whitespace
def clean_content(raw_text: Optional[str], max_chars: int = 3000) -> str:
    if not raw_text:
        return ""
    # Unescape HTML entities
    unescaped = html.unescape(raw_text)
    # Strip HTML tags
    no_html = re.sub(r"<[^>]+>", " ", unescaped)
    # Collapse multiple whitespace and newlines
    collapsed = re.sub(r"\s+", " ", no_html).strip()
    return collapsed[:max_chars]


# Extract domain name as source identifier
def extract_source_name(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower()
        if netloc.startswith("www."):
            return netloc[4:]
        return netloc or "web"
    except Exception:
        return "web"


# Compute start date string for search lookback filtering
def get_lookback_start_date(lookback_days: int) -> str:
    start_dt = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=lookback_days)
    return start_dt.strftime("%Y-%m-%d")


class TavilySearchAdapter:
    # Adapter for Tavily search with news or general topic and lookback filtering
    def __init__(self, api_key: Optional[str] = None, topic: str = "general"):
        self.api_key = api_key or settings.TAVILY_API_KEY
        self.topic = topic
        self.call_count = 0

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10) -> List[Candidate]:
        if not self.api_key:
            raise SearchError("Tavily API key is missing")

        from langchain_tavily import TavilySearch

        tool = TavilySearch(
            tavily_api_key=self.api_key,
            topic=self.topic,
            include_raw_content=True,
            max_results=max_results,
        )
        start_date = get_lookback_start_date(lookback_days)

        # Retry once on timeout or 5xx error
        attempts = 0
        last_exc = None
        while attempts < 2:
            attempts += 1
            self.call_count += 1
            try:
                # Call Tavily with topic, lookback start date, and content request
                res = tool.invoke({
                    "query": query,
                    "topic": self.topic,
                    "start_date": start_date,
                })

                if isinstance(res, dict) and "error" in res and res["error"]:
                    raise SearchError(str(res["error"]))

                raw_items = res.get("results", []) if isinstance(res, dict) else (res if isinstance(res, list) else [])
                candidates: List[Candidate] = []
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    url = item.get("url") or ""
                    title = item.get("title") or "Untitled"
                    raw_text = item.get("raw_content") or item.get("content") or ""
                    pub_date = item.get("published_date") or item.get("published_at")
                    candidates.append(
                        Candidate(
                            title=title.strip(),
                            url=url.strip(),
                            published_at=str(pub_date) if pub_date else None,
                            text=clean_content(raw_text),
                            source_name=extract_source_name(url),
                        )
                    )
                return candidates
            except Exception as exc:
                last_exc = exc
                if attempts < 2:
                    time.sleep(1)
                    continue

        raise SearchError(f"Tavily search failed after {attempts} attempts: {last_exc}") from last_exc


class ExaSearchAdapter:
    # Adapter for Exa search using langchain_exa with published date and page text
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.EXA_API_KEY
        self.call_count = 0

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10) -> List[Candidate]:
        if not self.api_key:
            raise SearchError("Exa API key is missing")

        from langchain_exa import ExaSearchResults

        tool = ExaSearchResults(exa_api_key=self.api_key)
        start_date = get_lookback_start_date(lookback_days)

        # Retry once on timeout or provider error
        attempts = 0
        last_exc = None
        while attempts < 2:
            attempts += 1
            self.call_count += 1
            try:
                # ExaSearchResults supports start_published_date and text_contents_options
                raw_results = tool._run(
                    query=query,
                    num_results=max_results,
                    start_published_date=start_date,
                    text_contents_options=True,
                )
                candidates: List[Candidate] = []
                if isinstance(raw_results, list):
                    for item in raw_results:
                        if isinstance(item, dict):
                            url = item.get("url") or ""
                            title = item.get("title") or "Untitled"
                            text_body = item.get("text") or item.get("highlight") or ""
                            pub_date = item.get("published_date")
                            candidates.append(
                                Candidate(
                                    title=title.strip(),
                                    url=url.strip(),
                                    published_at=str(pub_date) if pub_date else None,
                                    text=clean_content(text_body),
                                    source_name=extract_source_name(url),
                                )
                            )
                return candidates
            except Exception as exc:
                last_exc = exc
                if attempts < 2:
                    time.sleep(1)
                    continue

        raise SearchError(f"Exa search failed after {attempts} attempts: {last_exc}") from last_exc


# Factory function to build the active search tool
def get_search_adapter(
    provider: Optional[str] = None,
    topic: str = "general",
    api_key: Optional[str] = None,
):
    selected = (provider or settings.SEARCH_PROVIDER or "tavily").lower()
    if selected == "tavily":
        return TavilySearchAdapter(api_key=api_key or settings.TAVILY_API_KEY, topic=topic)
    elif selected == "exa":
        return ExaSearchAdapter(api_key=api_key or settings.EXA_API_KEY)
    raise ValueError(f"Unknown search provider: {selected}")
