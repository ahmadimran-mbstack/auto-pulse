import io
from pathlib import Path
import re
from typing import Any, Dict, List, Tuple
from PIL import Image, ImageDraw, ImageFont

import hashlib
import json

# Path to font assets
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
FONTS_DIR = BACKEND_DIR / "assets" / "fonts"
DISPLAY_FONT_PATH = FONTS_DIR / "BricolageGrotesque-Bold.ttf"
BODY_FONT_PATH = FONTS_DIR / "DMSans-Medium.ttf"

# Load font bytes into memory once at startup to avoid repeated disk reads
_DISPLAY_FONT_BYTES: bytes = b""
_BODY_FONT_BYTES: bytes = b""

if DISPLAY_FONT_PATH.exists():
    with open(DISPLAY_FONT_PATH, "rb") as f:
        _DISPLAY_FONT_BYTES = f.read()

if BODY_FONT_PATH.exists():
    with open(BODY_FONT_PATH, "rb") as f:
        _BODY_FONT_BYTES = f.read()

# Font object cache mapping (font_type, size) to loaded ImageFont instance
_FONT_CACHE: Dict[Tuple[str, int], ImageFont.FreeTypeFont] = {}


def get_display_font(size: int) -> ImageFont.FreeTypeFont:
    key = ("display", size)
    font = _FONT_CACHE.get(key)
    if font is None:
        font = ImageFont.truetype(io.BytesIO(_DISPLAY_FONT_BYTES), size)
        _FONT_CACHE[key] = font
    return font


def get_body_font(size: int) -> ImageFont.FreeTypeFont:
    key = ("body", size)
    font = _FONT_CACHE.get(key)
    if font is None:
        font = ImageFont.truetype(io.BytesIO(_BODY_FONT_BYTES), size)
        _FONT_CACHE[key] = font
    return font


# Preload commonly used font sizes at startup
if _DISPLAY_FONT_BYTES and _BODY_FONT_BYTES:
    for sz in range(36, 82, 2):
        get_display_font(sz)
    get_body_font(32)


# Build a deterministic ETag from canonical JSON of image_spec and requested width
def build_image_etag(image_spec: Dict[str, Any], width: int) -> str:
    canonical_json = json.dumps(image_spec, sort_keys=True, separators=(",", ":"))
    spec_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()[:16]
    return f'"{spec_hash}-{width}"'


# Helper to verify font assets exist before rendering
def ensure_fonts_exist():
    if not _DISPLAY_FONT_BYTES:
        raise FileNotFoundError(f"Missing required display font: {DISPLAY_FONT_PATH}")
    if not _BODY_FONT_BYTES:
        raise FileNotFoundError(f"Missing required body font: {BODY_FONT_PATH}")


# Helper to convert hex color string to RGB tuple
def hex_to_rgb(hex_str: str) -> Tuple[int, int, int]:
    cleaned = hex_str.lstrip("#")
    if len(cleaned) == 3:
        cleaned = "".join(c * 2 for c in cleaned)
    if len(cleaned) != 6:
        return (15, 23, 42)
    return (
        int(cleaned[0:2], 16),
        int(cleaned[2:4], 16),
        int(cleaned[4:6], 16),
    )


# Calculate relative luminance per WCAG 2.1 specifications
def get_relative_luminance(rgb: Tuple[int, int, int]) -> float:
    def channel_linear(c: int) -> float:
        val = c / 255.0
        if val <= 0.03928:
            return val / 12.92
        return ((val + 0.055) / 1.055) ** 2.4

    r, g, b = (channel_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# Calculate contrast ratio between two colors
def get_contrast_ratio(color_a: Tuple[int, int, int], color_b: Tuple[int, int, int]) -> float:
    lum_a = get_relative_luminance(color_a)
    lum_b = get_relative_luminance(color_b)
    lighter = max(lum_a, lum_b)
    darker = min(lum_a, lum_b)
    return (lighter + 0.05) / (darker + 0.05)


# Pick text color (white or #12141A) with the higher WCAG contrast on the primary color
def pick_optimal_text_color(primary_hex: str) -> Tuple[Tuple[int, int, int], str]:
    primary_rgb = hex_to_rgb(primary_hex)
    white_rgb = (255, 255, 255)
    dark_rgb = hex_to_rgb("#12141A")

    white_contrast = get_contrast_ratio(white_rgb, primary_rgb)
    dark_contrast = get_contrast_ratio(dark_rgb, primary_rgb)

    if white_contrast >= dark_contrast:
        return white_rgb, "#FFFFFF"
    return dark_rgb, "#12141A"


# Wrap text into lines that do not exceed max_width given a font
def wrap_text(text_to_wrap: str, font: ImageFont.FreeTypeFont, max_width: int, draw: ImageDraw.ImageDraw) -> List[str]:
    words = text_to_wrap.split()
    if not words:
        return []

    lines: List[str] = []
    current_line: List[str] = []

    for word in words:
        trial_line = " ".join(current_line + [word])
        bbox = draw.textbbox((0, 0), trial_line, font=font)
        line_width = bbox[2] - bbox[0]
        if line_width <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
                current_line = [word]
            else:
                lines.append(word)
                current_line = []

    if current_line:
        lines.append(" ".join(current_line))

    return lines


# Render branded square image from image_spec using preloaded fonts and optional width resizing
def render_post_image(image_spec: Dict[str, Any], width_target: int = 1200) -> bytes:
    ensure_fonts_exist()

    # 1200 x 1200 pixels base canvas
    width = 1200
    height = 1200
    margin = 96
    max_content_width = width - (2 * margin)

    primary_hex = image_spec.get("brand_primary_hex") or "#0F172A"
    accent_hex = image_spec.get("brand_accent_hex") or "#38BDF8"
    headline = image_spec.get("headline") or "AutoPulse Industry Insights"
    brand_name = image_spec.get("brand_name") or "AutoPulse"

    primary_rgb = hex_to_rgb(primary_hex)
    accent_rgb = hex_to_rgb(accent_hex)
    text_rgb, _ = pick_optimal_text_color(primary_hex)

    # Accent bar color fallback if contrast against primary is below 3
    if get_contrast_ratio(accent_rgb, primary_rgb) < 3.0:
        bar_rgb = text_rgb
    else:
        bar_rgb = accent_rgb

    # Create solid background image
    img = Image.new("RGB", (width, height), color=primary_rgb)
    draw = ImageDraw.Draw(img)

    # Headline font sizing: starts large and shrinks until it fits max width and at most 7 lines
    headline_size = 80
    min_size = 36
    chosen_lines: List[str] = []
    chosen_font = get_display_font(headline_size)

    while headline_size >= min_size:
        test_font = get_display_font(headline_size)
        lines = wrap_text(headline, test_font, max_content_width, draw)
        if len(lines) <= 7:
            # Check individual line widths
            all_fit = True
            for l in lines:
                bbox = draw.textbbox((0, 0), l, font=test_font)
                if (bbox[2] - bbox[0]) > max_content_width:
                    all_fit = False
                    break
            if all_fit:
                chosen_lines = lines
                chosen_font = test_font
                break
        headline_size -= 2

    if not chosen_lines:
        chosen_font = get_display_font(min_size)
        chosen_lines = wrap_text(headline, chosen_font, max_content_width, draw)

    # Compute line height and total headline height
    line_spacing = int(chosen_font.size * 0.28)
    sample_bbox = draw.textbbox((0, 0), "Ajgq", font=chosen_font)
    single_line_h = sample_bbox[3] - sample_bbox[1]
    total_text_h = (len(chosen_lines) * single_line_h) + ((len(chosen_lines) - 1) * line_spacing)

    # Middle third placement: vertically centered around y=550 to 650
    # Middle third is y=400 to y=800
    headline_top_y = 600 - (total_text_h // 2)
    headline_top_y = max(380, min(520, headline_top_y))

    # Draw accent bar (120 x 10) above headline
    bar_w = 120
    bar_h = 10
    bar_y = headline_top_y - 48
    draw.rectangle([margin, bar_y, margin + bar_w, bar_y + bar_h], fill=bar_rgb)

    # Draw headline lines
    curr_y = headline_top_y
    for line in chosen_lines:
        draw.text((margin, curr_y), line, font=chosen_font, fill=text_rgb)
        curr_y += single_line_h + line_spacing

    # Bottom left brand section: thin rule and brand name
    brand_font = get_body_font(32)
    rule_y = height - margin - 60
    rule_rgb = text_rgb
    draw.line([(margin, rule_y), (margin + 240, rule_y)], fill=rule_rgb, width=2)

    brand_y = rule_y + 16
    draw.text((margin, brand_y), brand_name, font=brand_font, fill=text_rgb)

    # Resize to requested target width if not default 1200
    if width_target != 1200:
        img = img.resize((width_target, width_target), Image.Resampling.LANCZOS)

    # Export PNG bytes
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
