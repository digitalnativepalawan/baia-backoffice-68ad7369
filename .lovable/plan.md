# Luxury UI Refactor — Presentation Only

A pure visual upgrade to match the BAIA Boutique reference screens. Zero changes to data, auth, routes, or business logic — only tokens, wrappers, and className swaps.

## 1. Design tokens

**`src/index.css`** — extend the existing `:root` and `.dark` blocks (preserve every existing token name):
- Deepen dark `--background` to midnight navy, warm-white `--foreground`.
- Refine `--gold` to warm champagne; add `--emerald` and `--teal` secondary accents.
- Add utility tokens: `--gradient-ocean`, `--gradient-hero`, `--gradient-gold`, `--shadow-luxury`, `--shadow-glow-gold`, `--glass-bg`, `--glass-border`.
- Add Cormorant Garamond via Google Fonts `@import` alongside existing Playfair + Lato.
- All values HSL.

**`tailwind.config.ts`** — register new tokens (`emerald`, `teal`, `glass`) and a `font-serif-display` family for Cormorant. No removals.

## 2. Luxury wrappers (`src/components/luxury/`)

Pure presentation, no hooks, no fetching:
- `LuxuryShell` — page background + ambient gradient layer
- `LuxurySection` — vertical rhythm + uppercase eyebrow label
- `LuxuryCard` — glass card (backdrop-blur, border, luxury shadow)
- `LuxuryStatCard` — icon + label + value + delta + glow accent
- `LuxuryHeader` — serif greeting + meta slot (weather/location)
- `LuxuryNavItem` / `LuxuryBottomNav` — styling-only nav wrappers
- `LuxuryButton` — adds `luxury` / `glass` / `gold` variants via `cva`, does not replace shadcn Button

Framer Motion only for entrance fades on hero/cards (already a dep).

## 3. Targeted restyles (wrap, don't rewrite)

For each file: swap outer containers and classNames only. Props, state, queries, handlers untouched. Free Login button kept functional, only restyled.

- `src/pages/Index.tsx` — welcome screen (BAIA welcome ref)
- `src/pages/AdminPage.tsx` dashboard tab — hero greeting + stat row
- `src/components/MorningBriefing.tsx` — metric tile restyle
- `src/pages/ServiceModePage.tsx` — launcher cards with gold glow edges
- `src/components/service/ServiceHeader.tsx` — refined header bar
- `src/components/StaffNavBar.tsx` — bottom nav glass treatment + safe-area
- `src/pages/GuestPortal.tsx` — guest hero + action list (guest portal ref)
- `src/components/admin/InventoryDashboard.tsx`, `ReportsDashboard.tsx`, `LiveOpsDashboard.tsx` — stat card swap
- Kitchen / Bar / Housekeeping board cards — LuxuryCard styling only

## 4. Mobile QA

Verify at 360 / 390 / 768 px via preview:
- No horizontal scroll on any touched view
- Touch targets ≥44px preserved
- Bottom nav respects safe-area inset

## Out of scope (NOT touched)

- `src/integrations/supabase/*`, `supabase/functions/*`, `supabase/config.toml`
- All hooks, `src/lib/*`, permissions, session, auth, audit
- Routes in `App.tsx`, `RequireAuth`, `AdminLoginGate`
- Form fields, mutations, realtime, polling
- File renames / deletions / schema migrations

## Implementation order

1. Tokens (`index.css` + `tailwind.config.ts`)
2. Build `src/components/luxury/*`
3. Restyle `Index.tsx` — validates the system
4. Admin dashboard hero + MorningBriefing
5. ServiceMode launcher + ServiceHeader + StaffNavBar
6. GuestPortal
7. Sweep dashboards (Inventory / Reports / LiveOps)
8. Mobile QA pass

## Per-file verification

- No imports changed besides luxury wrappers + icons
- No props / handlers / queries / effects modified
- Build passes; routes resolve; login flows unchanged
- Zero hardcoded hex in components — only semantic tokens
