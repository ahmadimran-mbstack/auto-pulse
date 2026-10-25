# AutoPulse Design Rules

AutoPulse follows a clean, calm, and exact developer-tool aesthetic in the spirit of modern developer startups.

## Core Rule
Use shadcn components first, add a shared component for any repeated pattern, never one-off styles.

## Color Tokens
All colors are defined as semantic tokens in `app/globals.css`. Never use raw hex, rgb, or hsl values in application markup or component styles.

- Canvas: `--background` (#F6F7F9), `--foreground` (#12141A)
- Cards & Popovers: `--card` (#FFFFFF), `--card-foreground` (#12141A), `--popover` (#FFFFFF), `--popover-foreground` (#12141A)
- Primary Accent: `--primary` (#0B7F70), `--primary-foreground` (#FFFFFF)
  - Hover: `--primary-hover` (#096A5D)
  - Active: `--primary-active` (#07584D)
- Neutrals: `--secondary` (#EEF0F4), `--secondary-foreground` (#12141A), `--muted` (#EEF0F4), `--muted-foreground` (#5B6270), `--accent` (#EEF0F4), `--accent-foreground` (#12141A)
- Destructive: `--destructive` (#B4412E), `--destructive-foreground` (#FFFFFF)
- Borders & Controls: `--border` (#E2E5EB), `--input` (#CBD0D9), `--ring` (#0B7F70)
- Sidebar: `--sidebar` (#FFFFFF), `--sidebar-foreground` (#12141A), `--sidebar-primary` (#0B7F70), `--sidebar-primary-foreground` (#FFFFFF), `--sidebar-accent` (#EEF0F4), `--sidebar-accent-foreground` (#12141A), `--sidebar-border` (#E2E5EB), `--sidebar-ring` (#0B7F70), `--sidebar-width` (232px)
- Signals: `--signal-soft` (#E3F4F1), `--signal-line` (#B9E2DB)
- Status:
  - Draft: `--status-draft-bg` (#FBF1DC), `--status-draft-fg` (#8A5A0B)
  - Danger: `--status-danger-bg` (#FBE9E5), `--status-danger-fg` (#B4412E)

## Radii & Elevation
- Controls (buttons, inputs, select triggers, badges): 6px (`rounded-md`).
- Panels, cards, dialogs, drawers, and sheets: 8px (`rounded-lg`).
- Flat by default: no shadows on cards, buttons, inputs, or static panels.
- Elevated surfaces: popovers, dropdowns, dialogs, sheets, and toasts use `0 8px 24px rgba(18, 20, 26, 0.08)`.

## Typography
Fonts are loaded through `next/font/google`:
- DM Sans: UI body and labels (weights 400, 500, 600).
- Bricolage Grotesque: Page titles and display headings (weight 600, class `font-display`, letter-spacing -0.02em).
- Tabular Numbers: Use class `tabular-nums` for dates, times, metrics, and counts.

Scale (size / line-height):
- Caption: 12px / 16px (`text-caption`)
- Table & Meta: 13px / 20px (`text-meta`)
- Body (default): 14px / 22px (`text-body`)
- Lead: 16px / 24px (`text-lead`)
- Heading 3: 20px / 28px (`text-h3` or `h3`)
- Heading 2: 24px / 32px (`text-h2` or `h2`)
- Page Title: 32px / 40px (`text-title` or `h1`)

## Spacing Scale
Tailwind 4px steps only: 1 (4px), 2 (8px), 3 (12px), 4 (16px), 5 (20px), 6 (24px), 8 (32px), 10 (40px), 12 (48px), 16 (64px).
- Page padding: 24px on desktop (`px-6 py-6`), 16px on mobile (`px-4 py-4`).
- Section gap: 32px (`gap-8`).
- Form field gap: 16px (`gap-4`).
- List row height: 48px (`h-12`).
- Control heights: 32px (`h-8`), 36px (`h-9`), 44px (`h-11`).
- Page max width: 1120px (`.page-container`), forms 720px (`.form-container`).

## Icons & Motion
- Icons: `lucide-react`, standard size 16px (`size-4`), stroke 1.5.
- Icon-only buttons must include an `aria-label` and tooltip.
- Motion: 120ms ease-out for hover and focus; 200ms for dialogs and menus. No hover lift, no entrance animations. Respect `prefers-reduced-motion`.

## Do-Not List
1. Centered everything (keep content left-aligned, product-first).
2. Cards inside cards (cards allowed at one level only).
3. Icon tiles in colored circles.
4. Uppercase tracked labels.
5. Badges on everything (use color only to show status).
6. More than one primary button in an area.
7. Gradients anywhere in UI components.
8. Shadows on static panels or buttons.
9. Decorative illustrations or cartoon drawings.
10. A second accent color (one accent `--primary` only).
11. Invented numbers or fake charts.
