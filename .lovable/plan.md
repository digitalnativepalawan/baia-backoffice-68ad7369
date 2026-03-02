

## Redesign Housekeeping Config UI

### Goal
Rewrite `HousekeepingConfig.tsx` to match the mockup layout: a single scrollable page with three stacked sections (Room Types, Inspection Checklists, Cleaning Packages) instead of the current tab-based layout. Each room type row gets inline action buttons. Checklists and packages are shown filtered by selected room type with richer controls.

### Changes (1 file)

**`src/components/admin/HousekeepingConfig.tsx`** -- Full rewrite of the UI layout (same data logic):

**Section 1: Room Types**
- Card with header "ROOM TYPES"
- Each room type row shows: name, [Edit] (inline rename), [Checklist] (scrolls to/selects that type in checklist section), [Cleaning Package] (scrolls to/selects in package section)
- [+ Add Room Type] button with inline input
- "Assign Room Types to Units" sub-section stays below

**Section 2: Inspection Checklists**
- Card with header "INSPECTION CHECKLISTS (per room type)"
- Room type selector dropdown at top
- Shows selected room type name as sub-header (e.g. "STANDARD DOUBLE ROOM CHECKLIST")
- Each checklist item row shows:
  - Checkbox icon + item label
  - [Required] / [Optional] toggle badge
  - [Count field? Yes/No] toggle -- if Yes, shows "Expected: N" input
  - Delete button
- [+ Add Checklist Item] button with expanded form (label, required toggle, count toggle + expected count input)
- [Save Checklist] button at bottom (visual confirmation, items are already saved on add)

**Section 3: Cleaning Packages**
- Card with header "CLEANING PACKAGES (per room type - auto-deduct from inventory)"
- Room type selector dropdown
- Shows sub-header: "ROOM TYPE NAME - Package Name"
- Package items displayed in a two-column layout when space allows (Cleaning Supplies | Amenities), falling back to single column on mobile
- Each item: ingredient name + quantity + unit
- Action buttons: [Edit Package] (toggle edit mode), [Duplicate], [Delete]
- [+ Add New Cleaning Package] at bottom

### What stays the same
- All data queries, mutations, and state logic remain identical
- Same Supabase table interactions (room_types, housekeeping_checklists, cleaning_packages, cleaning_package_items, ingredients, units)
- Dark theme classes (bg-secondary, border-border, text-foreground, font-display, font-body)
- No database changes needed

### Technical details
- Replace `Tabs` wrapper with three stacked card sections using `border border-border rounded-lg p-4`
- Room type action buttons use `variant="outline" size="sm"` with icons (ClipboardList for Checklist, Package for Cleaning Package, Pencil for Edit)
- Clicking [Checklist] or [Cleaning Package] on a room type row sets the corresponding section's selected room type and optionally scrolls using `useRef` + `scrollIntoView`
- Checklist items get a toggle for "Count field" -- a small Switch that shows/hides the expected count input
- Cleaning package items attempt two-column grid (`grid grid-cols-2 gap-2`) on wider screens

