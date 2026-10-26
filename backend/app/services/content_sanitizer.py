import html
import re
from html.parser import HTMLParser
from typing import List, Tuple

# Character conversion maps for basic LinkedIn text formatting
# LinkedIn Posts API commentary does not support raw HTML tags
# We convert bold and italic characters to Unicode mathematical alphanumerics
# so formatting is preserved across desktop and mobile feeds

BOLD_MAP = {}
# Uppercase bold A-Z
for i in range(26):
    BOLD_MAP[chr(ord("A") + i)] = chr(0x1D400 + i)
# Lowercase bold a-z
for i in range(26):
    BOLD_MAP[chr(ord("a") + i)] = chr(0x1D41A + i)
# Digits bold 0-9
for i in range(10):
    BOLD_MAP[chr(ord("0") + i)] = chr(0x1D7CE + i)

ITALIC_MAP = {}
# Uppercase italic A-Z
for i in range(26):
    # Unicode mathematical italic A-Z (note that H is at 0x210B in math alphabet)
    if chr(ord("A") + i) == "H":
        ITALIC_MAP["H"] = "\u210B"
    else:
        ITALIC_MAP[chr(ord("A") + i)] = chr(0x1D434 + i)
# Lowercase italic a-z
for i in range(26):
    # Lowercase h is at 0x210E in math alphabet
    if chr(ord("a") + i) == "h":
        ITALIC_MAP["h"] = "\u210E"
    else:
        ITALIC_MAP[chr(ord("a") + i)] = chr(0x1D44E + i)


def to_bold(text: str) -> str:
    # Converts ASCII letters and digits to Unicode bold characters
    return "".join(BOLD_MAP.get(c, c) for c in text)


def to_italic(text: str) -> str:
    # Converts ASCII letters to Unicode italic characters
    return "".join(ITALIC_MAP.get(c, c) for c in text)


def to_underline(text: str) -> str:
    # Converts text to underlined style using the Unicode combining low line character
    return "".join(c + "\u0332" if c != "\n" else c for c in text)


class RichTextToLinkedInParser(HTMLParser):
    # Parser that strips dangerous tags, translates formatting tags to Unicode,
    # and outputs plain text suitable for LinkedIn posts

    def __init__(self):
        super().__init__()
        self.output: List[str] = []
        self.format_stack: List[str] = []
        self.in_ignored_tag = False
        self.ignored_tags = {"script", "style", "iframe", "object", "embed", "noscript"}

    def handle_starttag(self, tag: str, attrs):
        lower_tag = tag.lower()
        if lower_tag in self.ignored_tags:
            self.in_ignored_tag = True
            return

        if lower_tag in ("b", "strong"):
            self.format_stack.append("bold")
        elif lower_tag in ("i", "em"):
            self.format_stack.append("italic")
        elif lower_tag == "u":
            self.format_stack.append("underline")
        elif lower_tag == "br":
            self.output.append("\n")
        elif lower_tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6"):
            if self.output and not "".join(self.output).endswith("\n"):
                self.output.append("\n\n")
        elif lower_tag == "li":
            if self.output and not "".join(self.output).endswith("\n"):
                self.output.append("\n")
            self.output.append("• ")

    def handle_endtag(self, tag: str):
        lower_tag = tag.lower()
        if lower_tag in self.ignored_tags:
            self.in_ignored_tag = False
            return

        if lower_tag in ("b", "strong") and "bold" in self.format_stack:
            self.format_stack.remove("bold")
        elif lower_tag in ("i", "em") and "italic" in self.format_stack:
            self.format_stack.remove("italic")
        elif lower_tag == "u" and "underline" in self.format_stack:
            self.format_stack.remove("underline")
        elif lower_tag in ("p", "div", "h1", "h2", "h3", "h4", "h5", "h6"):
            if self.output and not "".join(self.output).endswith("\n"):
                self.output.append("\n\n")
        elif lower_tag == "li":
            if self.output and not "".join(self.output).endswith("\n"):
                self.output.append("\n")


    def handle_data(self, data: str):
        if self.in_ignored_tag:
            return

        text = data
        # Apply formatting active in the stack
        if "bold" in self.format_stack:
            text = to_bold(text)
        if "italic" in self.format_stack:
            text = to_italic(text)
        if "underline" in self.format_stack:
            text = to_underline(text)

        self.output.append(text)

    def get_result(self) -> str:
        raw_text = "".join(self.output)
        # Unescape HTML entities such as &amp; or &lt;
        clean_text = html.unescape(raw_text)
        # Collapse three or more newlines into two newlines for clean paragraph spacing
        clean_text = re.sub(r"\n{3,}", "\n\n", clean_text)
        return clean_text.strip()


def sanitize_linkedin_content(raw_content: str) -> str:
    # Primary entry point to sanitize post text before sending to LinkedIn
    # Strips any script tags or unsafe HTML attributes
    # Converts basic formatting (bold, italic, underline) to Unicode
    # Validates that content is non-empty and within the 3000 character limit
    if raw_content is None or not raw_content.strip():
        raise ValueError("Content cannot be empty.")

    # Remove script and style tags with regex first as extra safety layer
    cleaned_input = re.sub(
        r"<(script|style|iframe|object|embed)[^>]*>.*?</\1>",
        "",
        raw_content,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Check if the content contains HTML tags
    if "<" in cleaned_input and ">" in cleaned_input:
        parser = RichTextToLinkedInParser()
        parser.feed(cleaned_input)
        result = parser.get_result()
    else:
        # Plain text input: normalize whitespace and strip excess blank lines
        result = html.unescape(cleaned_input)
        result = re.sub(r"\r\n", "\n", result)
        result = re.sub(r"\n{3,}", "\n\n", result).strip()

    if not result:
        raise ValueError("Content cannot be empty after removing unsafe tags.")

    if len(result) > 3000:
        raise ValueError("Content cannot exceed 3000 characters.")

    return result
