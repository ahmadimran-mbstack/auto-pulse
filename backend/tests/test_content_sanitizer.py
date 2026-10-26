import pytest
from app.services.content_sanitizer import (
    RichTextToLinkedInParser,
    sanitize_linkedin_content,
    to_bold,
    to_italic,
    to_underline,
)


def test_sanitize_plain_text():
    # Plain text without HTML tags should pass through unchanged
    text = "Hello world! This is a simple test post for LinkedIn."
    assert sanitize_linkedin_content(text) == text


def test_sanitize_bold_tags():
    # Bold tags should be transformed to Unicode bold characters
    html_input = "Hello <b>world</b> and <strong>everyone</strong>!"
    sanitized = sanitize_linkedin_content(html_input)
    # Ensure raw HTML tags are gone
    assert "<b>" not in sanitized
    assert "</b>" not in sanitized
    assert "<strong>" not in sanitized
    # Verify presence of Unicode bold characters
    assert to_bold("world") in sanitized
    assert to_bold("everyone") in sanitized


def test_sanitize_italic_tags():
    # Italic tags should be transformed to Unicode italic characters
    html_input = "Check <i>this</i> out with <em>emphasis</em>."
    sanitized = sanitize_linkedin_content(html_input)
    assert "<i>" not in sanitized
    assert "<em>" not in sanitized
    assert to_italic("this") in sanitized
    assert to_italic("emphasis") in sanitized


def test_sanitize_underline_tags():
    # Underline tags should be transformed using combining low line characters
    html_input = "Important: <u>read this now</u>!"
    sanitized = sanitize_linkedin_content(html_input)
    assert "<u>" not in sanitized
    assert to_underline("read this now") in sanitized


def test_sanitize_strips_scripts_and_unsafe_tags():
    # Script, style, and iframe tags and their inner contents must be stripped completely
    html_input = (
        "<p>Visible text</p>"
        "<script>alert('xss attack');</script>"
        "<style>body { display: none; }</style>"
        "<iframe>http://evil.com</iframe>"
    )
    sanitized = sanitize_linkedin_content(html_input)
    assert "Visible text" in sanitized
    assert "alert" not in sanitized
    assert "xss attack" not in sanitized
    assert "display: none" not in sanitized
    assert "evil.com" not in sanitized


def test_sanitize_paragraphs_and_lists():
    # Paragraphs, breaks, and list items should be formatted with clean line breaks
    html_input = (
        "<p>First paragraph</p>"
        "<p>Second paragraph</p>"
        "<ul>"
        "<li>Item one</li>"
        "<li>Item two</li>"
        "</ul>"
    )
    sanitized = sanitize_linkedin_content(html_input)
    assert "First paragraph\n\nSecond paragraph" in sanitized
    assert "• Item one" in sanitized
    assert "• Item two" in sanitized


def test_sanitize_html_entities():
    # HTML entities should be unescaped to standard human-readable symbols
    html_input = "Growth &amp; Innovation &gt; Stagnation &lt;3 &quot;AutoPulse&quot;"
    sanitized = sanitize_linkedin_content(html_input)
    assert "Growth & Innovation > Stagnation <3 \"AutoPulse\"" == sanitized


def test_sanitize_empty_content_raises_value_error():
    # Empty content or content with only whitespace/scripts must raise ValueError
    with pytest.raises(ValueError, match="cannot be empty"):
        sanitize_linkedin_content("")

    with pytest.raises(ValueError, match="cannot be empty"):
        sanitize_linkedin_content("   \n\t  ")

    with pytest.raises(ValueError, match="cannot be empty"):
        sanitize_linkedin_content("<script>console.log('only scripts');</script>")


def test_sanitize_content_too_long_raises_value_error():
    # Content exceeding 3000 characters must raise ValueError
    long_text = "A" * 3001
    with pytest.raises(ValueError, match="cannot exceed 3000 characters"):
        sanitize_linkedin_content(long_text)
