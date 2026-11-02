import re
from typing import Optional, Set
from urllib.parse import urlparse

# Domains known for content farming, SEO spam, automated scraping, or shallow Q&A
BLOCKED_DOMAINS: Set[str] = {
    "quora.com",
    "medium.com",
    "pinterest.com",
    "geeksforgeeks.org",
    "tutorialspoint.com",
    "w3schools.com",
    "reddit.com",
    "buzzfeed.com",
    "forbes.com",
    "ehow.com",
    "wikihow.com",
    "answers.com",
    "about.com",
    "hubpages.com",
    "ezinearticles.com",
    "softonic.com",
    "cnet.com",
    "slideshare.net",
    "scribd.com",
    "hackernoon.com",
    "dev.to",
    "hashnode.dev",
}

# Domains recognized for rigorous engineering, official docs, primary research, or authoritative reporting
PREFERRED_DOMAINS: Set[str] = {
    "github.blog",
    "engineering.fb.com",
    "netflixtechblog.com",
    "uber.com",
    "aws.amazon.com",
    "cloud.google.com",
    "openai.com",
    "anthropic.com",
    "arxiv.org",
    "theverge.com",
    "arstechnica.com",
    "techcrunch.com",
    "wired.com",
    "nature.com",
    "acm.org",
    "ieee.org",
    "bloomberg.com",
    "reuters.com",
    "wsj.com",
    "ft.com",
    "blog.cloudflare.com",
    "increment.com",
    "stripe.com",
    "shopify.engineering",
    "dropbox.tech",
    "slack.engineering",
    "blog.pragmaticengineer.com",
    "martinfowler.com",
    "allthingsdistributed.com",
    "danluu.com",
    "simonwillison.net",
    "postgresql.org",
    "kubernetes.io",
}


def extract_domain(url: str) -> str:
    """Extract clean domain name from URL or domain string."""
    try:
        clean_url = url.strip()
        if not clean_url:
            return ""
        if "://" not in clean_url:
            clean_url = "https://" + clean_url
        netloc = urlparse(clean_url).netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        # Remove port if present
        netloc = netloc.split(":")[0]
        return netloc
    except Exception:
        return ""


def is_blocked_domain(url: str) -> bool:
    """Check if the URL belongs to a blocked content farm or spam domain."""
    domain = extract_domain(url)
    if not domain:
        return True
    for blocked in BLOCKED_DOMAINS:
        if domain == blocked or domain.endswith("." + blocked):
            return True
    return False


def is_preferred_domain(url: str) -> bool:
    """Check if the URL belongs to a preferred engineering/research domain."""
    domain = extract_domain(url)
    if not domain:
        return False
    for preferred in PREFERRED_DOMAINS:
        if domain == preferred or domain.endswith("." + preferred):
            return True
    return False


def score_domain(url: str) -> float:
    """Returns a multiplier boost: 0.0 for blocked, 2.0 for preferred, 1.0 for neutral."""
    if is_blocked_domain(url):
        return 0.0
    if is_preferred_domain(url):
        return 2.0
    return 1.0

