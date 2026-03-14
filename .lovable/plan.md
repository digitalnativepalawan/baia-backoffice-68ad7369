

## Plan: Remove "Start from template" from Create Role modal

### Change

**`src/components/admin/StaffAccessManager.tsx`** — Delete lines 547–560 (the template picker `<div>` block including the label, `<Select>`, and its contents). The `prefillFromTemplate` function and `BUILTIN_ROLE_LABELS` can stay in code (no harm), but the UI element is removed entirely.

