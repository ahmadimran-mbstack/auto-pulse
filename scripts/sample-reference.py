#!/usr/bin/env python3
"""
Sample color points and measurements from the reference screenshot.
This script checks the exact colors in docs/reference.png.
Includes Round 1 and Round 2 sampling points.
"""

import os
import colorsys
import collections
from PIL import Image

def rgb_to_hex(r, g, b):
    # Convert integer RGB values to a lowercase hex string
    return f"#{r:02x}{g:02x}{b:02x}"

def get_pixel_rgb(img, x, y):
    # Retrieve RGB tuple for a single pixel
    pixel = img.getpixel((x, y))
    return pixel[0], pixel[1], pixel[2]

def find_most_common_color(img, x1, y1, x2, y2, exclude_text=False):
    # Find the most frequent color in a box, optionally ignoring dark text pixels
    pixels = []
    for y in range(y1, y2 + 1):
        for x in range(x1, x2 + 1):
            r, g, b = get_pixel_rgb(img, x, y)
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if exclude_text and lum < 180:
                continue
            pixels.append((r, g, b))
    counter = collections.Counter(pixels)
    most_common_rgb, count = counter.most_common(1)[0]
    return most_common_rgb, rgb_to_hex(*most_common_rgb), count, len(pixels)

def find_darkest_in_box(img, x1, y1, x2, y2):
    # Find the darkest pixel (lowest luminance) inside a rectangular bounding box
    min_lum = float("inf")
    best_coord = (x1, y1)
    best_rgb = (0, 0, 0)
    
    for y in range(y1, y2 + 1):
        for x in range(x1, x2 + 1):
            r, g, b = get_pixel_rgb(img, x, y)
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if lum < min_lum:
                min_lum = lum
                best_coord = (x, y)
                best_rgb = (r, g, b)
                
    return best_coord, best_rgb

def find_darkest_on_hline(img, y, x1, x2):
    # Find the darkest pixel along a horizontal line
    min_lum = float("inf")
    best_x = x1
    best_rgb = (0, 0, 0)
    for x in range(x1, x2 + 1):
        r, g, b = get_pixel_rgb(img, x, y)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum < min_lum:
            min_lum = lum
            best_x = x
            best_rgb = (r, g, b)
    return best_x, best_rgb

def find_darkest_on_vline(img, x, y1, y2):
    # Find the darkest pixel along a vertical line
    min_lum = float("inf")
    best_y = y1
    best_rgb = (0, 0, 0)
    for y in range(y1, y2 + 1):
        r, g, b = get_pixel_rgb(img, x, y)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if lum < min_lum:
            min_lum = lum
            best_y = y
            best_rgb = (r, g, b)
    return best_y, best_rgb

def find_most_saturated_in_box(img, x1, y1, x2, y2):
    # Find the pixel with highest saturation inside a box
    max_sat = -1.0
    best_coord = (x1, y1)
    best_rgb = (0, 0, 0)
    
    for y in range(y1, y2 + 1):
        for x in range(x1, x2 + 1):
            r, g, b = get_pixel_rgb(img, x, y)
            h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            if s > max_sat:
                max_sat = s
                best_coord = (x, y)
                best_rgb = (r, g, b)
                
    return best_coord, best_rgb, max_sat

def main():
    image_path = os.path.join(os.path.dirname(__file__), "..", "docs", "reference.png")
    if not os.path.exists(image_path):
        print(f"Error: {image_path} does not exist.")
        return

    img = Image.open(image_path).convert("RGB")
    width, height = img.size
    print(f"Screenshot dimensions: {width} x {height}")

    print("\n=== ROUND 1 SAMPLING ===")
    p_bg = get_pixel_rgb(img, 1500, 900)
    print(f"Page background (1500, 900): RGB{p_bg} {rgb_to_hex(*p_bg)}")

    h_bg = get_pixel_rgb(img, 800, 40)
    print(f"Header background (800, 40): RGB{h_bg} {rgb_to_hex(*h_bg)}")

    s_bg = get_pixel_rgb(img, 200, 805)
    print(f"Sidebar background (200, 805): RGB{s_bg} {rgb_to_hex(*s_bg)}")

    c_surface = get_pixel_rgb(img, 470, 1100)
    print(f"Card surface (470, 1100): RGB{c_surface} {rgb_to_hex(*c_surface)}")

    cb_x, cb_rgb = find_darkest_on_hline(img, 1100, 412, 426)
    print(f"Card border (x={cb_x}, y=1100): RGB{cb_rgb} {rgb_to_hex(*cb_rgb)}")

    print("Card shadow profile (x=720, y=1214..1222):")
    for y in range(1214, 1223):
        rgb = get_pixel_rgb(img, 720, y)
        print(f"  y={y}: RGB{rgb} {rgb_to_hex(*rgb)}")

    nav_active_bg = get_pixel_rgb(img, 300, 180)
    print(f"Active nav row background (300, 180): RGB{nav_active_bg} {rgb_to_hex(*nav_active_bg)}")

    striped_bg = get_pixel_rgb(img, 800, 384)
    plain_bg = get_pixel_rgb(img, 800, 432)
    print(f"Striped row (800, 384): RGB{striped_bg} {rgb_to_hex(*striped_bg)}")
    print(f"Plain row (800, 432): RGB{plain_bg} {rgb_to_hex(*plain_bg)}")

    btn_bg = get_pixel_rgb(img, 60, 746)
    print(f"Black button background (60, 746): RGB{btn_bg} {rgb_to_hex(*btn_bg)}")

    print("\n=== ROUND 2 SAMPLING: BACKGROUNDS (MOST COMMON COLOR IN BOX) ===")
    s1_rgb, s1_hex, s1_c, s1_tot = find_most_common_color(img, 250, 225, 330, 248)
    print(f"Sidebar box 1 (250,225)-(330,248): RGB{s1_rgb} {s1_hex} ({s1_c}/{s1_tot} px)")

    s2_rgb, s2_hex, s2_c, s2_tot = find_most_common_color(img, 250, 335, 330, 358)
    print(f"Sidebar box 2 (250,335)-(330,358): RGB{s2_rgb} {s2_hex} ({s2_c}/{s2_tot} px)")

    an_rgb, an_hex, an_c, an_tot = find_most_common_color(img, 260, 160, 360, 200)
    print(f"Active nav row (260,160)-(360,200): mode RGB{an_rgb} {an_hex} ({an_c}/{an_tot} px)")

    hb_rgb, hb_hex, hb_c, hb_tot = find_most_common_color(img, 143, 28, 222, 56, exclude_text=True)
    print(f"Hobby pill (143,28)-(222,56): RGB{hb_rgb} {hb_hex} ({hb_c}/{hb_tot} px)")

    bb_rgb, bb_hex, bb_c, bb_tot = find_most_common_color(img, 143, 607, 208, 636, exclude_text=True)
    print(f"Blue -60% badge (143,607)-(208,636): RGB{bb_rgb} {bb_hex} ({bb_c}/{bb_tot} px)")

    st_rgb, st_hex, st_c, st_tot = find_most_common_color(img, 900, 365, 1010, 400)
    print(f"Striped row (900,365)-(1010,400): RGB{st_rgb} {st_hex} ({st_c}/{st_tot} px)")

    pl_rgb, pl_hex, pl_c, pl_tot = find_most_common_color(img, 900, 415, 1010, 450)
    print(f"Plain row (900,415)-(1010,450): RGB{pl_rgb} {pl_hex} ({pl_c}/{pl_tot} px)")

    sg_rgb, sg_hex, sg_c, sg_tot = find_most_common_color(img, 1410, 128, 1420, 138)
    print(f"Segmented toggle active (1410,128)-(1420,138): RGB{sg_rgb} {sg_hex} ({sg_c}/{sg_tot} px)")

    print("\n=== ROUND 2 SAMPLING: BORDERS (DARKEST PIXEL ON LINE) ===")
    f_x, f_rgb = find_darkest_on_hline(img, 110, 8, 18)
    print(f"Find input border (x={f_x}, y=110): RGB{f_rgb} {rgb_to_hex(*f_rgb)}")

    si_x, si_rgb = find_darkest_on_hline(img, 147, 414, 424)
    print(f"Search input border (x={si_x}, y=147): RGB{si_rgb} {rgb_to_hex(*si_rgb)}")

    fl_x, fl_rgb = find_darkest_on_hline(img, 147, 1329, 1339)
    print(f"Filter button border (x={fl_x}, y=147): RGB{fl_rgb} {rgb_to_hex(*fl_rgb)}")

    pm_x, pm_rgb = find_darkest_on_hline(img, 700, 8, 18)
    print(f"Promo card border (x={pm_x}, y=700): RGB{pm_rgb} {rgb_to_hex(*pm_rgb)}")

    sd_x, sd_rgb = find_darkest_on_hline(img, 600, 380, 388)
    print(f"Sidebar divider (x={sd_x}, y=600): RGB{sd_rgb} {rgb_to_hex(*sd_rgb)}")

    hd_y, hd_rgb = find_darkest_on_vline(img, 1500, 80, 86)
    print(f"Header divider (x=1500, y={hd_y}): RGB{hd_rgb} {rgb_to_hex(*hd_rgb)}")

    sr_x, sr_rgb = find_darkest_on_hline(img, 324, 1812, 1822)
    print(f"Project status ring border (x={sr_x}, y=324): RGB{sr_rgb} {rgb_to_hex(*sr_rgb)}")

    print("\n=== ROUND 2 SAMPLING: TEXT AND ICONS (DARKEST PIXEL IN BOX) ===")
    nl_c, nl_rgb = find_darkest_in_box(img, 69, 170, 147, 192)
    print(f"Active nav label Projects: coord {nl_c}, RGB{nl_rgb} {rgb_to_hex(*nl_rgb)}")

    ai_c, ai_rgb = find_darkest_in_box(img, 30, 168, 54, 192)
    print(f"Nav icon active: coord {ai_c}, RGB{ai_rgb} {rgb_to_hex(*ai_rgb)}")

    ii_c, ii_rgb = find_darkest_in_box(img, 30, 336, 54, 358)
    print(f"Nav icon inactive Analytics: coord {ii_c}, RGB{ii_rgb} {rgb_to_hex(*ii_rgb)}")

    pf_c, pf_rgb = find_darkest_in_box(img, 69, 100, 110, 122)
    print(f"Placeholder Find: coord {pf_c}, RGB{pf_rgb} {rgb_to_hex(*pf_rgb)}")

    ps_c, ps_rgb = find_darkest_in_box(img, 477, 137, 629, 159)
    print(f"Placeholder Search Projects: coord {ps_c}, RGB{ps_rgb} {rgb_to_hex(*ps_rgb)}")

    ht_c, ht_rgb = find_darkest_in_box(img, 427, 30, 538, 54)
    print(f"Header text All Projects: coord {ht_c}, RGB{ht_rgb} {rgb_to_hex(*ht_rgb)}")

    ul_c, ul_rgb = find_darkest_in_box(img, 477, 372, 651, 396)
    print(f"Usage row label: coord {ul_c}, RGB{ul_rgb} {rgb_to_hex(*ul_rgb)}")

    uv_c, uv_rgb = find_darkest_in_box(img, 866, 372, 1001, 396)
    print(f"Usage value: coord {uv_c}, RGB{uv_rgb} {rgb_to_hex(*uv_rgb)}")

    pn_c, pn_rgb = find_darkest_in_box(img, 1152, 298, 1231, 320)
    print(f"Project name prospex: coord {pn_c}, RGB{pn_rgb} {rgb_to_hex(*pn_rgb)}")

    cl_c, cl_rgb = find_darkest_in_box(img, 1113, 375, 1850, 398)
    print(f"Commit line: coord {cl_c}, RGB{cl_rgb} {rgb_to_hex(*cl_rgb)}")

    ml_c, ml_rgb = find_darkest_in_box(img, 1113, 408, 1419, 432)
    print(f"Meta line: coord {ml_c}, RGB{ml_rgb} {rgb_to_hex(*ml_rgb)}")

    ae_c, ae_rgb = find_darkest_in_box(img, 595, 744, 851, 768)
    print(f"Alerts empty-state text: coord {ae_c}, RGB{ae_rgb} {rgb_to_hex(*ae_rgb)}")

if __name__ == "__main__":
    main()
