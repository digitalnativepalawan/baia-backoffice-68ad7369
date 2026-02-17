

## Remove All Guests

### What Will Happen
Delete all 78 records from the `resort_ops_guests` table. There are currently 0 bookings referencing these guests, so no cascade issues.

### Implementation
Run a single SQL statement via a database migration (since the data tool doesn't support DELETE):

```sql
DELETE FROM resort_ops_guests;
```

This is a one-line data cleanup operation. No code changes needed -- the Resort Ops dashboard will automatically show an empty guests list after the deletion.

### Risk
- This is irreversible
- No bookings are affected (0 bookings reference existing guests)

