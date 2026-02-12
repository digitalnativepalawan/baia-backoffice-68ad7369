
# BAIA PALAWAN — F&B Ordering System

## Design Vision
A luxury beach resort digital menu that faithfully replicates the attached printed menu: **dark navy textured background, cream/beige serif typography, dotted leader lines, seafood line-art illustrations**, and elegant minimal spacing. This is NOT a food delivery app — it's an interactive extension of the printed menu.

---

## Phase 1: Database & Backend Setup (Supabase Cloud)

Create the following tables:
- **settings** — kitchen WhatsApp number, breakfast hours
- **units** — resort rooms/glamping units (name, active status)
- **tables** — dine-in table names (name, active status)
- **menu_items** — name, category, description, food_cost (admin-only), price, image_url, available, featured, sort_order
- **orders** — order_type, location_detail, items (JSON), total, payment_type, status (New/Preparing/Delivered), timestamps

Seed with sample menu data from the printed menu (Starters, Breakfast, Main Courses).

---

## Phase 2: Start Screen

A branded landing page with the BAIA PALAWAN identity and three entry points:
- **View Menu as Guest** — opens the order type selector
- **Staff Order** — prompts for passkey (5309)
- **Admin Login** — prompts for passkey (5309)

Dark navy background, cream typography, matching the luxury aesthetic.

---

## Phase 3: Guest Order Flow

### Step 1 — Order Type Selection
After tapping "View Menu as Guest", the user picks:
- **Room / Glamping Unit** → dropdown populated from `units` table
- **Dine In** → dropdown populated from `tables` table
- **Beach Delivery** → free text input for location
- **Walk-In Guest** → name input

### Step 2 — Menu Page (Core Visual Experience)
- **Sticky category tabs** at top: Breakfast | Starters | Main Courses
- Each section replicates the printed menu layout:
  - Section title in elegant serif
  - Dish name (bold) ··········· ₱Price (right-aligned)
  - Description in smaller cream text below
- Only items marked `available = true` are shown
- Tapping a dish opens a **dark-themed modal** with quantity selector and "Add to Order" button
- **Floating cart icon** (bottom-right) showing item count

### Step 3 — Cart & Checkout
- Cart drawer slides up (dark themed) showing all selected items, quantities, and total
- On "Confirm Order":
  1. Save order to Supabase `orders` table
  2. Generate formatted WhatsApp message with order details
  3. Redirect to WhatsApp using the kitchen number from `settings`

---

## Phase 4: Staff Order Flow

Same menu interface as guest, but after passkey entry (5309), staff get an additional field before checkout:
- **Payment Type**: Charge to Room / Cash / Paid

Order is saved with payment type and sent via WhatsApp.

---

## Phase 5: Admin Dashboard

Behind passkey (5309), a clean management interface with:

### Resort Setup
- Add/edit/toggle units (rooms, glamping)
- Add/edit/toggle tables
- Set kitchen WhatsApp number
- Set breakfast service hours

### Menu Manager
- Add/edit menu items (name, description, category, price, food cost, image, sort order)
- Toggle availability and featured status
- Food cost visible only in admin (never shown to guests)

---

## Phase 6: Responsiveness & Polish

- **Mobile-first** — primary use case
- **Tablet** — maintain elegance with slightly wider layout
- **Desktop** — centered container with max-width, dark background fills the viewport
- Subtle CSS seafood line-art decorative elements on menu pages
- Smooth transitions and animations for modals and cart drawer
