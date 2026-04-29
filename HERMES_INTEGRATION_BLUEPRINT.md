# BAIA Resort — Hermes Agent Integration Blueprint

**Project:** BAIA Menu System (Feb 19)  
**Repo:** `digitalnativepalawan/baia-menu-feb19`  
**Live:** Already deployed on Vercel  
**Stack:** React + TypeScript + Vite + Tailwind + shadcn/ui + Supabase  
**Database:** PostgreSQL (64 migrations, comprehensive resort ERP)

---

## 📊 Executive Summary

BAIA is a **full-stack resort management platform** built for BAIA Resort in San Vicente, Palawan. It handles:

- **Guest self-service** portal (food/drink ordering, tour bookings, service requests, messaging)
- **Staff operations** (kitchen, bar, reception, housekeeping, tours, waitstaff, cashier)
- **Admin dashboard** (menu management, inventory, payroll, accounting, reports, audits)
- **Real-time order routing** (department-specific status, realtime updates)
- **Telegram notifications** (order alerts to staff groups via Supabase Edge Functions)

The system is **already live** and processing real orders at the resort.

**Hermes Agent's role:**  
Dual-mode AI assistant that serves both:
1. **Guest-facing** — AI concierge in the guest portal (answering questions, taking orders, recommendations)
2. **Admin-facing** — AI ops assistant in admin dashboard (alerts, insights, report generation, task automation)

---

## 🏗️ System Architecture

### Frontend Structure

```
src/
├── pages/
│   ├── GuestPortal.tsx          ← Guest entry point (room + last name login)
│   ├── MenuPage.tsx              ← Food/drink ordering with cart
│   ├── AdminPage.tsx             ← Staff/admin dashboard (tabbed)
│   ├── ReceptionPage.tsx         ← Front desk view
│   ├── KitchenPage.tsx           ← Kitchen display system
│   ├── BarPage.tsx               ← Bar display system
│   ├── HousekeeperPage.tsx       ← Housekeeping tasks
│   ├── Service*Page.tsx          ← Staff-facing operational boards
│   └── *Page.tsx                 ← Various department views
├── components/
│   ├── admin/                    ← 20+ admin components (OrderCard, dashboards, modals)
│   ├── ui/                       ← shadcn/ui components
│   ├── CartDrawer.tsx            ← Order checkout (orders → JSONB items)
│   └── StaffNavBar.tsx           ← Navigation for staff
├── hooks/
│   ├── useGuestSession.ts        ← Guest session (sessionStorage, 4hr expiry)
│   ├── usePermissions.ts         ← Granular staff permissions (view/edit/manage)
│   ├── useResortProfile.ts       ← Resort config (name, logo, etc.)
│   ├── useBillingConfig.ts       │ Tax, service charge settings
│   ├── useDepartmentAlerts.ts    │ Unread counts per department
│   └── useMobile.tsx             │ Responsive breakpoint
├── lib/
│   ├── cart.ts                   ← Zustand cart (add/remove/clear)
│   ├── order.ts                  ← WhatsApp invoice formatting
│   ├── generateInvoicePdf.ts     │ PDF invoice generation
│   ├── stockCheck.ts             │ Inventory availability
│   ├── inventoryDeduction.ts     │ Auto-deduct ingredients
│   ├── telegram.ts               ← Supabase Edge Function caller
│   ├── session.ts                ← Staff auth session
│   └── permissions.ts            ← Permission helpers
└── integrations/
    └── supabase/
        ├── client.ts             ← Supabase client (VITE_* env vars)
        └── types.ts              ← Database types (generated)
```

### Database Schema Highlights

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `units` | Rooms/villas | `id`, `unit_name`, `active` |
| `resort_ops_bookings` | Guest stays | `unit_id`, `guest_login_count`, `check_in`, `check_out` |
| `resort_ops_guests` | Guest info | `full_name`, `email`, `phone` |
| `menu_items` | Menu catalog | `name`, `category`, `price`, `available`, `department` (kitchen/bar) |
| `menu_categories` | Menu sections | `name`, `active`, `sort_order`, `department` |
| `tabs` | Running bills | `location_type`, `location_detail`, `guest_name`, `status` (Open/Closed) |
| `orders` | Order history | `items` (JSONB), `total`, `status`, `tab_id`, `room_id`, `guest_name` |
| `order_items` | **Not present** — items stored as JSONB in `orders` |
| `guest_requests` | Service requests | `request_type`, `details`, `status` |
| `tour_bookings` | Tour reservations | `tour_name`, `date`, `pax`, `price`, `status` |
| `guest_reviews` | Guest reviews | `rating`, `comments`, `category` |
| `inventory_logs` | Stock tracking | `item_name`, `change`, `reason` |
| `ingredients` | Recipe ingredients | `name`, `unit`, `stock_level` |
| `employees` | Staff accounts | `name`, `role`, `permissions[]` |
| `settings` | App configuration | Key-value store |
| `resort_profile` | Resort info | `resort_name`, `logo_url`, `contact` |

**Department model:**
- Kitchen (`department: 'kitchen'`)
- Bar (`department: 'bar'`)
- Both (`department: 'both'`) — item appears in both menus

**Order workflow:**
1. Guest adds items → cart (Zustand)
2. Checkout → `orders` inserted (status: `'New'`)
3. `room_transactions` created if "Charge to Room"
4. Real-time push to kitchen/bar via Supabase Realtime
5. Staff updates status: `New` → `Preparing` → `Served` → `Paid` → `Closed`
6. Guest can view order status in "My Orders"

---

## 🎯 Hermes Integration: Two Modes

### Mode 1: Guest Portal Assistant

**Where:** Embedded in `GuestPortal.tsx` as a floating chat widget  
**Audience:** Hotel guests (self-service)  
**Capabilities:**

#### A. Menu Assistant
- "What's in the Caesar salad?"
- "Do you have vegan options?"
- "What's today's special?"
- "I'm allergic to nuts — what's safe?"
- "Recommend something with prawns"

**Implementation:**
- Query `menu_items` + `ingredients` for item details/allergens
- Context: Current guest's order history (personalization)
- Show images if available (`image_url`)
- Add to cart directly from chat: "Add 2 Caesar salads to my order"

#### B. Order Status Tracker
- "Where's my order?"
- "Is my breakfast ready?"
- Show real-time status: New → Preparing → Served
- Connect to `orders` table (filter by `room_id` + `booking_id`)

#### C. Concierge & Bookings
- "I want to book the island hopping tour tomorrow"
- Check `tours_config` availability + guest's `booking_id`
- Create `tour_bookings` record on confirmation
- "What tours are available on Friday?"

#### D. Service Requests
- "Can I have extra towels?"
- "The AC is leaking"
- Categorize → insert into `guest_requests` with proper `request_type`
- Auto-notify reception via existing Telegram integration

#### E. Resort Information
- "What time is checkout?"
- "How do I connect to WiFi?"
- "Do you have a pharmacy nearby?"
- Pull from `resort_profile`, `settings`

#### F. Bill & Payments
- "What's my current bill?"
- "Can I see my room charges?"
- Query `room_transactions` for `room_id`
- "Add this to my room tab" (during ordering)

---

### Mode 2: Admin/Staff Assistant

**Where:** Embedded in `AdminPage.tsx` as a sidebar or floating panel  
**Audience:** Resort staff (reception, kitchen, managers)  
**Capabilities:**

#### A. Order Triage & Alerts
- "New orders waiting: 3"
- Highlight VIP guests (repeat customers, managers)
- Flag unusual patterns: "Order cost >₱5000 — big spend alert"
- Prioritize by `order_type` + `status` + `schedule_for`

#### B. Inventory & Stock Insights
- "We're low on coffee grounds" (based on `inventory_logs`, `recipe_ingredients`)
- "Stocks used today: 5kg rice, 2 bottles rum"
- "Suggest reorder: coconut oil (below threshold)"

#### C. Guest Insights
- "Who are the VIP guests arriving today?"
- "Show me guests with >3 visits"
- "Any complaints from room 203?"

#### D. Predictive Forecasting
- "Expected covers for dinner tonight: 45 based on bookings"
- "Staffing suggestion: 2 kitchen, 1 bar, 1 waitstaff"
- Uses `resort_ops_bookings` + historical order patterns

#### E. Report Generation
- "Generate today's P&L report"
- "Sales by department: kitchen vs bar"
- "Top 5 menu items by revenue"
- Pulls from `orders`, `room_transactions`, aggregated in SQL or Edge Function

#### F. Quick Actions via Chat
- "Mark order #123 as prepared"
- "Add note to tab 456: ' Complimentary dessert '"
- "Close tab 789"
- Direct API calls to update `orders`, `tabs`

#### G. Staff Scheduling
- "Who's on shift now?"
- "Schedule tomorrow's housekeeping"
- Reads `employee_shifts`, `weekly_schedules`

---

## 🔌 Integration Architecture

### Option A: Embedded Chat Widget (Client-side)

```
GuestPortal.tsx / AdminPage.tsx
   ├── <HermesChatWidget />
         ├── MessageList (user + assistant bubbles)
         ├── ChatInput (text/voice)
         └── Uses LLM via Edge Function:
             POST /api/hermes/chat → Edge Function → LLM (StepFun/Claude) → response
```

**Pros:** Fast, UI-controlled, works offline (queue if no connection)  
**Cons:** Requires API key management, needs auth

---

### Option B: Webhook-based (Stateless)

```
Frontend:
   User message → POST /api/hermes/invoke
   ← Stream response back

Supabase Edge Function:
   - Receives message + context
   - Calls LLM API
   - Returns answer
   - Optionally stores in `hermes_conversations` table
```

**Pros:** Secure (API keys server-side), scalable, context persistence  
**Cons:** More latency, dependent on Supabase function cold starts

---

### Option C: Autonomous Backend Agent (Recommended)

```
Hermes runs as a separate service (Node.js/Python):
   - Listens to Supabase Realtime (orders, requests, bookings)
   - Auto-responds to events: new order → send summary to admin Telegram
   - Proactive nudges: "Guest hasn't ordered in 2 hours — send offer?"
   - Daily digest: morning briefing for manager

In-app: Simple webview to Hermes dashboard / chat interface
```

**Pros:** Independent, can run complex workflows, no Vercel cold start  
**Cons:** Requires separate hosting (could be same Vercel project as separate service)

---

## 🗂️ Database Additions for Hermes

New tables needed (if storing conversations):

```sql
-- hermes_conversations.sql
CREATE TABLE hermes_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_type TEXT NOT NULL, -- 'guest' | 'admin' | 'staff'
  user_id TEXT, -- null for anon; could be booking_id for guest, employee_id for staff
  session_id UUID, -- links to guest_sessions or staff_sessions
  messages JSONB NOT NULL DEFAULT '[]',
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- hermes_insights.sql (for admin alerts)
CREATE TABLE hermes_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'alert', 'recommendation', 'forecast'
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK (priority IN ('low','medium','high','critical')),
  action_url TEXT,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 🤖 LLM Backend Options

| Option | Description | Cost | Latency |
|--------|-------------|------|---------|
| **StepFun** (your native provider) | Step model via API | Pay-per-use | ~1s |
| **OpenAI GPT-4o** | High-quality chat | $$ | ~0.8s |
| **Anthropic Claude 3.5 Sonnet** | Strong reasoning | $$ | ~1s |
| **Google Gemini** | Multi-modal (images) | $ | ~1s |
| **Ollama (local)** | Self-hosted, free | Free (GPU needed) | ~0.5s |

**Recommendation:** Use **StepFun Step** (Hermes native provider) via API call from Supabase Edge Function. Keeps it in the ecosystem and cost-effective.

Edge Function (`supabase/functions/hermes-chat`):

```typescript
// 1. Receive message + context from frontend
// 2. Build system prompt with guest/staff role + current data context
// 3. Call StepFun API with tools (functions) if needed
// 4. Parse response → either answer or call tool (e.g., query DB)
// 5. Return response to frontend
```

---

## 🛠️ Implementation Roadmap

### Phase 1: Guest Assistant MVP (1 week)

**Goal:** Simple, helpful AI concierge in Guest Portal

1. **Add `hermes_chat` Edge Function**
   - Receives `{ message, guestSession, conversationId }`
   - Calls StepFun API
   - System prompt includes: resort name, policies, current order status
   - Returns `{ reply, actions }`

2. **Create HermesChatWidget component**
   - Position: bottom-right floating button (similar to Intercom)
   - Opens to chat panel
   - MessageInput + MessageList
   - Supports text only (Phase 2 adds voice)

3. **Context injection**
   - On guest login → fetch their `booking_id`, `room_name`
   - Load recent orders from `orders` table (last 3)
   - Load resort profile (name, contact, Wi-Fi, policies)
   - Pass as context to LLM: "Guest is {guest_name} in {room_name}"

4. **Tool/function calling**
   - `query_menu_items(category?)` → fetch menu from DB
   - `get_order_status()` → latest orders for this guest
   - `create_tour_booking(tour_id, date, pax)` → insert to `tour_bookings`
   - `submit_guest_request(type, details)` → insert to `guest_requests`

5. **Deploy & test with real guest in resort**

---

### Phase 2: Admin Assistant MVP (1 week)

**Goal:** AI ops dashboard for managers

1. **AdminChatPanel component** (sidebar in AdminPage)
   - Role: admin/staff
   - Context: recent orders across departments, today's stats

2. **Admin-specific tools**
   - `get_orders_by_status(status)` → order list
   - `get_low_stock_items()` → inventory alerts
   - `generate_report(type, date)` → revenue, orders, guests
   - `send_telegram_to_group(group, msg)` → use existing `notifyTelegram`
   - `update_order_status(order_id, status)` → change order state

3. **Proactive alerts**
   - Inserts into `hermes_insights` table
   - Shown as badges in AdminPage header
   - "Dismiss" functionality

4. **Voice input** (optional)
   -Web Speech API → text
   - Faster for busy staff

---

### Phase 3: Advanced Features (2 weeks)

- **Voice ordering** in Guest Portal (speak → order)
- **Multilingual** (English, Tagalog, Korean if needed)
- **Image understanding** (guest uploads photo of problem → describe)
- **Knowledge base** (FAQ from past guest_requests + responses)
- **Memory** — remembers guest preferences ("Mr. Lee always orders iced tea")
- **Automated workflows** — "If order takes >15 min, send status update to guest"

---

## 📐 Technical Design Notes

### Frontend Component Structure

```
src/
├── components/
│   ├── HermesChatWidget.tsx      ← Main wrapper (Guest Portal)
│   ├── HermesChatWindow.tsx      ← Expanded chat panel
│   ├── HermesMessageList.tsx     ← Conversation history
│   ├── HermesMessageInput.tsx    ← Text + voice button
│   ├── HermesAdminPanel.tsx      ← Admin sidebar
│   ├── HermesAssistant.tsx       ← Unified component (role-based)
│   └── HermesVoiceInput.tsx      ← Web Speech API
```

### State Management
- **Guest:** Store conversation in `sessionStorage` (cleared on logout)
- **Admin:** Store in React context (cleared on session close)
- Optional: Persist to `hermes_conversations` for analytics

### Edge Function Schema (`/api/hermes/chat`)

```typescript
interface Request {
  message: string;
  role: 'guest' | 'admin';
  session: GuestSession | StaffSession;
  context: {
    recentOrders?: Order[];
    activeTab?: string;
    timeOfDay: string;
    resortProfile: ResortProfile;
  };
  conversationHistory?: Array<{role: 'user'|'assistant'; content: string}>;
}

interface Response {
  reply: string;
  actions?: Array<{
    type: 'query' | 'update' | 'insert';
    table: string;
    sql: string;
    result?: any;
  }>;
  suggestions?: string[]; // Quick reply buttons
}
```

---

## 🎪 Context Injection Examples

### Guest Context

```
System: You are Hermes, the AI concierge for BAIA Resort in San Vicente, Palawan.
Guest: {guest_name}
Room: {room_name}
Check-out: {check_out}
Current time: {datetime}
Recent orders: [{order_id, items, status}]

Menu highlights:
- Caesar Salad: ₱450, contains dairy, nuts
- Chicken Curry: ₱550, gluten-free
- Mango Shake: ₱180

Policies:
- Checkout: 11:00 AM
- WiFi: BAIA-Guest, password: welcome
- Room charges: paid at front desk on checkout

Your job: Help guests order food, book tours, request services, answer questions.
If they ask for something you can DO (not just say), call the appropriate tool.
Never make up menu items — only what's in the database.
```

### Admin Context

```
System: You are Hermes Ops Assistant for BAIA Resort.
Current dashboard stats:
- Open orders: 12 (Kitchen: 3, Bar: 2, Kitchen+Bar: 1)
- New since last hour: 5
- Tabs open: 8
- Low stock items: coffee beans (12% remaining), towels (8 left)

Recent activity:
- Order #123 (New, kitchen) — Chicken Curry x2
- Order #124 (Paid) — 2 cocktails, 1 burger
- Tour booking confirmed: El Nido tour, 4 pax, tomorrow 7:00 AM

Your job: Help staff answer questions about current operations, suggest actions,
generate reports, and surface insights. You can query the database if needed.
```

---

## 🔐 Authentication & Security

### Guest Auth
- Already have `guest_session` from login (room + last name)
- No additional auth needed for chat
- Limit: Each guest can only query their own orders/room

### Staff Auth
- Already have `getStaffSession()` with permissions
- Chat respects same permissions (staff can only do what their role allows)
- Example: housekeeper cannot see financial data via Hermes either

### Data Isolation
- Supabase Row Level Security (RLS) already in place
- Hermes queries use same `supabase` client → RLS enforced
- No security downgrade — Hermes is just a natural language interface to the same API

---

## 📊 Monitoring & Analytics

Add to `hermes_conversations`:
- `user_message_count` (track engagement)
- `tool_calls` (which functions used most)
- `satisfaction_rating` (thumbs up/down from UI)
- Average response time

Dashboard for managers:
- "Top guest questions this week"
- "Most used Hermes features"
- "Reduction in front desk calls"

---

## 🚀 First Implementation Steps (Concrete)

### Step 1: Create Supabase Edge Function — `hermes-chat`

File: `supabase/functions/hermes-chat/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const { message, role, session, context } = await req.json();

  // Build system prompt based on role
  // Call StepFun API
  // Return reply + optional tool calls
});
```

### Step 2: Create Frontend Widget

File: `src/components/HermesChatWidget.tsx`

```tsx
export const HermesChatWidget = ({ role, session }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  
  const send = async () => {
    const res = await fetch('/api/hermes/chat', {
      method: 'POST',
      body: JSON.stringify({ message: input, role, session, context })
    });
    const data = await res.json();
    setMessages(prev => [...prev, {role: 'assistant', content: data.reply}]);
  };

  return (
    <FloatingButton onClick={() => setOpen(true)}>
      <Bot className="w-6 h-6" />
    </FloatingButton>
  );
};
```

### Step 3: Add to GuestPortal & AdminPage

```tsx
// In GuestPortal.tsx return statement
{/* at bottom, above closing div */}
<HermesChatWidget role="guest" session={session} />

// In AdminPage.tsx
<HermesChatWidget role="admin" session={perms} />
```

### Step 4: Test with Sample Queries

Guest:
- "What's on the menu for lunch?"
- "I want to book the island tour for tomorrow"
- "What's my current bill?"

Admin:
- "Show me new orders"
- "What's running low on inventory?"
- "Send alert to kitchen: rush order #123"

---

## 🎯 Success Metrics

- Guest: 30% reduction in front desk calls, 20% increase in order frequency
- Admin: 15 min/day saved per staff member on routine tasks
- Quality: 90% of Hermes answers rated "helpful" by users

---

## 📚 Appendix: Existing Patterns to Follow

BAIA's existing code patterns (important for integration):

1. **Query keys:** Use namespaced keys like `['orders-admin']`, `['menu-categories']`
2. **Realtime:** `supabase.channel(...).on('postgres_changes', ...).subscribe()`
3. **Toasts:** `toast.success()`, `toast.error()` from `sonner`
4. **UI components:** shadcn/ui `Button`, `Input`, `Select`, `Dialog`, `Drawer`
5. **Icons:** `lucide-react`
6. **State:** `useState`, `useQuery` (TanStack Query), `useQueryClient` for invalidation
7. **Telegram:** `import('@/lib/telegram').then(({ notifyTelegram }) => ...)`
8. **Permissions:** `const { canView, canEdit } = usePermissions();`

Follow these conventions when writing Hermes components.

---

**Next:** If you approve this architecture, I'll start with Phase 1: Guest Assistant MVP.  
**Decision needed:** Which LLM provider should we use?
- A) StepFun Step (recommended, aligns with Hermes identity)
- B) OpenAI GPT-4o
- C) Anthropic Claude
- D) Google Gemini

And: Do you want the chat widget **embedded in the guest portal page** or as a **separate floating window** that can be minimized?
