

## Integration Readiness — Isolated Module

All new code lives in separate files/directories. Zero modifications to existing production code.

### 1. Database Migration

**Add columns to `resort_ops_bookings`** (all nullable with defaults):
```sql
ALTER TABLE resort_ops_bookings
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'walkin',
  ADD COLUMN IF NOT EXISTS external_reservation_id text NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS external_data jsonb NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_external_res_id
  ON resort_ops_bookings (external_reservation_id) WHERE external_reservation_id IS NOT NULL;
```

**Create `webhook_events` table:**
```sql
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE INDEX idx_webhook_events_status ON webhook_events (status);
CREATE UNIQUE INDEX idx_webhook_events_event_id ON webhook_events (event_id);
```

With public RLS policies (read-only for anon, full for service role via edge functions).

### 2. Edge Function: `integration-webhook`

New file: `supabase/functions/integration-webhook/index.ts`

- `POST` → validates payload, stores in `webhook_events` with status `pending`, returns `202 Accepted`
- `GET` → health check
- Signature verification placeholder (logs warning if no signature header)
- `verify_jwt = false` in config.toml

### 3. Edge Function: `process-webhook-queue`

New file: `supabase/functions/process-webhook-queue/index.ts`

- Fetches `pending` or `retry` events (max 10 at a time)
- Processes each event type (new_reservation, date_change, cancellation)
- On success: marks `processed`, updates `resort_ops_bookings` with `source`, `external_reservation_id`, `last_synced_at`, `external_data`
- On failure: increments `retry_count`, sets `error` status if retry_count >= 3
- Called manually from the admin dashboard or could be scheduled later

### 4. Admin Integration Readiness Dashboard

New file: `src/components/integration/IntegrationReadinessDashboard.tsx`

- Feature-flagged: only renders when `import.meta.env.DEV` is true
- **TEST MODE** banner at the top
- Sections:
  - **Webhook Events Log**: read-only table showing `webhook_events` (event_id, type, source, status, retry_count, timestamps)
  - **Schema Status**: checks if new columns exist on `resort_ops_bookings` and `webhook_events` table exists
  - **Simulation Tools**: buttons to send test payloads (new reservation, date change, cancellation) to the `integration-webhook` edge function
  - **Process Queue**: button to trigger `process-webhook-queue`

### 5. Wire into Admin Page (minimal, additive only)

Add a new tab entry to the `CONFIG` array in `AdminPage.tsx`:
```ts
{ value: 'integration', label: 'Integration', perm: null }
```
And a corresponding `TabsContent` that renders `<IntegrationReadinessDashboard />` — only visible in dev mode. This is a 2-line additive change (array entry + TabsContent), no existing logic modified.

### Files Created/Modified

| File | Action |
|------|--------|
| `supabase/migrations/...` | Schema migration (new columns + new table) |
| `supabase/config.toml` | Add `[functions.integration-webhook]` and `[functions.process-webhook-queue]` entries |
| `supabase/functions/integration-webhook/index.ts` | New edge function |
| `supabase/functions/process-webhook-queue/index.ts` | New edge function |
| `src/components/integration/IntegrationReadinessDashboard.tsx` | New dashboard component |
| `src/pages/AdminPage.tsx` | Add 1 tab def + 1 TabsContent render (additive only, ~4 lines) |

