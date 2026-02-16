

## Display Sunday-to-Saturday Pay Period in Payroll Dashboard

### Problem
1. The "This Week" date filter uses Monday as the week start instead of Sunday
2. There is no visible pay period indicator showing the current Sunday-to-Saturday range
3. The payroll and shift views don't clearly communicate the pay cycle dates

### Changes (single file: `src/components/admin/PayrollDashboard.tsx`)

**1. Fix "This Week" filter to use Sunday as start**
- Change `startOfWeek(now, { weekStartsOn: 1 })` to `startOfWeek(now, { weekStartsOn: 0 })` so the week filter matches the actual pay period (Sunday start)

**2. Add a pay period banner**
- Compute the current pay period dates (this Sunday through this Saturday) using `previousSunday`/`nextSaturday` from date-fns
- Display a prominent banner at the top of the Shifts, Payroll, and Payments sub-views showing:
  - "Pay Period: Sun Feb 15 - Sat Feb 21" (formatted dates)
  - "Payday: Saturday" label
- This gives the admin clear visibility into which pay cycle they're viewing

**3. Add "This Pay Period" as a dedicated date filter**
- Replace the generic "This Week" filter with "Pay Period" that explicitly filters Sunday-to-Saturday
- Keep the other filters (Today, Yesterday, Month, All) as-is

### Technical Details

- The pay period start is calculated as: if today is Sunday use today, otherwise use `previousSunday(now)`
- The pay period end is calculated as: `nextSaturday(now)` (or today if it is Saturday)
- The banner will use `format(date, 'EEE, MMM d')` for readable dates
- The "week" filter logic at line 81 changes from `weekStartsOn: 1` to `weekStartsOn: 0`
- The date filter label at line 369 changes from "This Week" to "Pay Period"

