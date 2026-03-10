

## Plan: Replace RoomsDashboard with Full ReceptionPage in Admin "Reception" Tab

### Problem
The Admin "Reception" tab still renders `RoomsDashboard` (the old room status grid). It should render the full `ReceptionPage` with Manila time, arrivals/departures, walk-in sell, check-in/out modals, and room protection.

### Change

**`src/pages/AdminPage.tsx`**

1. Import `ReceptionPage` instead of (or in addition to) `RoomsDashboard`
2. In the `TabsContent value="rooms"` block (~line 693-695), replace `<RoomsDashboard ... />` with `<ReceptionPage embedded />`

The `embedded` prop already exists on ReceptionPage — it removes the standalone nav header and adjusts layout to fit inside a parent container. This is the same pattern used by `ReceptionHome` in the Staff Shell.

### Files
```
EDIT  src/pages/AdminPage.tsx  (swap component in TabsContent, update import)
```

No other changes needed. ReceptionPage already has all the functionality.

