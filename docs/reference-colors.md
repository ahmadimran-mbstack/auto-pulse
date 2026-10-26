# Reference Color Measurements

Measurements sampled from the reference screenshot (`docs/reference.png`, 1920x1248 px, taken at 1.5x zoom).
Sidebar measured width: 384 px in file = 256 CSS px (384 / 1.5 = 256).

Script used: `scripts/sample-reference.py`

## Round 1 Sampling Results

| Token / Element | Sample Point (screenshot px) | Measured RGB | Measured Hex | User Starting Hex | Match / Difference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Page background | (1500, 900) | RGB(250, 250, 250) | `#fafafa` | `#fafafa` | Match |
| Header background | (800, 40) | RGB(250, 250, 250) | `#fafafa` | `#fafafa` | Match |
| Sidebar background | (200, 805) | RGB(248, 248, 248) | `#f8f8f8` | `#fafafa` | Differs: `#f8f8f8` vs `#fafafa` |
| Card surface | (470, 1100) | RGB(255, 255, 255) | `#ffffff` | `#ffffff` | Match |
| Card border | Darkest on y=1100 (412..426) | RGB(227, 227, 227) | `#e3e3e3` | `#ebebeb` | Differs: `#e3e3e3` vs `#ebebeb` |
| Card shadow | (720, 1214..1222) | RGB(244..250) | Gradient to `#fafafa` | `0 1px 2px rgba(0,0,0,0.04)` | Confirmed: subtle shadow present at bottom edge |
| Active nav row background | (300, 180) | RGB(240, 240, 240) | `#f0f0f0` | `var(--accent)` (`#0000000d`) | Match (solid `#f0f0f0` adopted) |
| Striped row background | (800, 384) | RGB(250, 250, 250) | `#fafafa` | `var(--secondary)` (`#f2f2f2`) | Differs: `#fafafa` vs `#f2f2f2` |
| Plain row background | (800, 432) | RGB(255, 255, 255) | `#ffffff` | `#ffffff` | Match |
| Black button background | (60, 746) | RGB(23, 23, 23) | `#171717` | `#171717` | Match |
| Heading text color | Darkest in (430,222)..(492,246) | RGB(23, 23, 23) | `#171717` | `#171717` | Match |
| Muted text color | Darkest in (1152,330)..(1393,350) | RGB(77, 77, 77) | `#4d4d4d` | `#666666` | Differs: `#4d4d4d` vs `#666666` |
| Nav label color | Darkest in (69,336)..(156,358) | RGB(77, 77, 77) | `#4d4d4d` | `#666666` | Differs: `#4d4d4d` vs `#666666` |
| "Hobby" pill background | (152, 42) | RGB(230, 230, 230) | `#e6e6e6` | `#f2f2f2` | Differs: `#e6e6e6` vs `#f2f2f2` |
| Blue "-60%" badge background | (147, 621) | RGB(224, 237, 250) | `#e0edfa` | `#f0f7ff` | Differs: `#e0edfa` vs `#f0f7ff` |
| Blue "-60%" badge text | Darkest in (154,611)..(196,631) | RGB(0, 104, 214) | `#0068d6` | `#0068d6` | Match |
| Usage ring arc color | Most saturated in (446,372)..(468,396) | RGB(0, 114, 245) | `#0072f5` | `#0070f3` | Differs: `#0072f5` vs `#0070f3` |

## Round 2 Sampling Results

### 1. Backgrounds (Most Common Color in Box)

| Element | Box Coordinates (px) | Mode RGB | Mode Hex | Frequency | Comparison to Tokens |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Sidebar box 1 | (250,225) to (330,248) | RGB(250, 250, 250) | `#fafafa` | 1944 / 1944 px (100%) | Near header/nav boundary |
| Sidebar box 2 | (250,335) to (330,358) | RGB(250, 250, 250) | `#fafafa` | 1944 / 1944 px (100%) | Near analytics row |
| Active nav row | (260,160) to (360,200) | RGB(235, 235, 235) | `#ebebeb` | Mode of subtle gradient; center at (300,180) is `#f0f0f0` | Adopted solid `#f0f0f0` for `--accent` |
| "Hobby" pill | (143,28) to (222,56) | RGB(230, 230, 230) | `#e6e6e6` | 1559 / 2034 px (77%) | Matches `--status-neutral-bg: #e6e6e6` |
| Blue "-60%" badge | (143,607) to (208,636) | RGB(224, 237, 250) | `#e0edfa` | 1355 / 1796 px (75%) | Matches `--status-info-bg: #e0edfa` |
| Striped row | (900,365) to (1010,400) | RGB(250, 250, 250) | `#fafafa` | 3272 / 3996 px (82%) | Matches new token `--stripe: #fafafa` |
| Plain row | (900,415) to (1010,450) | RGB(255, 255, 255) | `#ffffff` | 3271 / 3996 px (82%) | Matches `--card: #ffffff` |
| Segmented toggle active | (1410,128) to (1420,138) | RGB(242, 242, 242) | `#f2f2f2` | 116 / 121 px (96%) | Matches `--secondary: #f2f2f2` |

### 2. Borders (Darkest Pixel on Line)

| Border Line | Coordinates (px) | Darkest RGB | Darkest Hex | Token Assignment Decision |
| :--- | :--- | :--- | :--- | :--- |
| "Find" input | y=110, x=8..18 | RGB(225, 225, 225) | `#e1e1e1` | Uses `--card-border: #e3e3e3` (card/input outline) |
| Search input | y=147, x=414..424 | RGB(230, 230, 230) | `#e6e6e6` | Uses `--card-border: #e3e3e3` (card/input outline) |
| Filter button | y=147, x=1329..1339 | RGB(235, 235, 235) | `#ebebeb` | Uses `--border: #ebebeb` (controls and buttons) |
| Promo card | y=700, x=8..18 | RGB(224, 224, 224) | `#e0e0e0` | Uses `--card-border: #e3e3e3` (card outline) |
| Sidebar divider | y=600, x=380..388 | RGB(235, 235, 235) | `#ebebeb` | Uses `--border: #ebebeb` (sidebar vertical divider) |
| Header divider | x=1500, y=80..86 | RGB(235, 235, 235) | `#ebebeb` | Uses `--border: #ebebeb` (header bottom border) |
| Project status ring | y=324, x=1812..1822 | RGB(235, 235, 235) | `#ebebeb` | Uses `--border: #ebebeb` (status ring outer track) |

### 3. Text and Icons (Darkest Pixel in Box)

| Text / Icon Element | Box Coordinates (px) | Darkest RGB | Darkest Hex | Assigned Token |
| :--- | :--- | :--- | :--- | :--- |
| Active nav label "Projects" | (69,170) to (147,192) | RGB(55, 55, 55) | `#373737` | `--foreground: #171717` (anti-aliased to `#373737`) |
| Nav icon, active | (30,168) to (54,192) | RGB(55, 55, 55) | `#373737` | `--foreground: #171717` |
| Nav icon, inactive "Analytics" | (30,336) to (54,358) | RGB(77, 77, 77) | `#4d4d4d` | `--muted-foreground: #4d4d4d` |
| Placeholder "Find" | (69,100) to (110,122) | RGB(125, 125, 125) | `#7d7d7d` | Muted placeholder |
| Placeholder "Search Projects" | (477,137) to (629,159) | RGB(143, 143, 143) | `#8f8f8f` | Muted placeholder |
| Header text "All Projects" | (427,30) to (538,54) | RGB(23, 23, 23) | `#171717` | `--foreground: #171717` |
| Usage row label | (477,372) to (651,396) | RGB(23, 23, 23) | `#171717` | `--foreground: #171717` |
| Usage value | (866,372) to (1001,396) | RGB(77, 77, 77) | `#4d4d4d` | `--muted-foreground: #4d4d4d` |
| Project name "prospex" | (1152,298) to (1231,320) | RGB(23, 23, 23) | `#171717` | `--foreground: #171717` |
| Commit line | (1113,375) to (1850,398) | RGB(23, 23, 23) | `#171717` | `--foreground: #171717` |
| Meta line | (1113,408) to (1419,432) | RGB(23, 23, 23) | `#171717` | `--foreground: #171717` / muted |
| Alerts empty-state text | (595,744) to (851,768) | RGB(77, 77, 77) | `#4d4d4d` | `--muted-foreground: #4d4d4d` |

## Token Decisions Summary

1. `--background: #fafafa` for page and header surfaces.
2. `--sidebar: #f8f8f8` for sidebar surface.
3. `--card: #ffffff` for cards, promo card, inputs, popovers.
4. `--accent: #f0f0f0` as a solid color in light mode for active and hover states.
5. `--stripe: #fafafa` for alternating zebra rows (dark mode: `#111111`).
6. `--border: #ebebeb` for dividers, headers, row separators, filter button, and ring tracks.
7. `--card-border: #e3e3e3` for card outlines, promo card, and input borders.
8. `--muted-foreground: #4d4d4d` for inactive nav labels, icons, metadata, and empty state copy.
