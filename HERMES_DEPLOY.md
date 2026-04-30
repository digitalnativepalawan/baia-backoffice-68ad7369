# Hermes Guest Assistant — Deployment Guide

## ✅ Prerequisites

1. **StepFun API Key** — Obtain from https://stepfun.com (or your StepFun dashboard)
2. **Supabase CLI** installed locally (`npm install -g supabase`)
3. **GitHub repo access** — `digitalnativepalawan/baia-menu-feb19`

---

## 📦 Files Added

```
supabase/functions/hermes-chat/index.ts   # Edge Function (Deno)
src/components/HermesChatWidget.tsx       # Frontend chat widget
src/pages/GuestPortal.tsx                 # Widget integrated
```

---

## 🔧 Step 1: Add Environment Variables to Supabase

In your Supabase dashboard (`paghxagqnaisxesmhnwj` — see `.env` for `VITE_SUPABASE_URL`):

**Project Settings → Functions → Environment Variables**

Add:

| Key | Value |
|-----|-------|
| `STEPFUN_API_KEY` | `sk-...` (your StepFun key) |
| `HERMES_MODEL` | `step-3.5-flash` (optional, default) |

Also verify these are already set:
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)
- `TELEGRAM_BOT_TOKEN` (for future notifications)

⚠️ **Important:** After adding env vars, **redeploy** the function next.

---

## 🚀 Step 2: Deploy the Edge Function

From the project root (`baia-menu-feb19`):

```bash
# Login to Supabase (if not already)
supabase login

# Deploy the hermes-chat function
# --no-verify-jwt: allow unauthenticated (guest) access
supabase functions deploy hermes-chat --project-ref paghxagqnaisxesmhnwj --no-verify-jwt
```

Wait for deployment to complete (~10–20s).

**Test the function:**
```bash
curl -X POST https://paghxagqnaisxesmhnwj.functions.supabase.co/hermes-chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","guestSession":{"booking_id":"test","room_id":"test","room_name":"101","guest_name":"Test","check_out":"2026-12-31"}}'
```

Expected response: `{ "reply": "Hi! I'm Hermes..." }` (or similar greeting).

---

## 🌐 Step 3: Push Frontend to GitHub

The frontend changes are now in your local repo. Push to GitHub so Vercel deploys:

```bash
cd /workspace/baia-menu-feb19

git add -A
git commit -m "feat: add Hermes AI chat assistant for guests"
git push origin main
```

Vercel will auto-deploy within a few minutes.

---

## ✅ Step 4: Verify MVP

1. Visit the live guest portal: `https://baia-menu-feb19.vercel.app` (or your domain)
2. Log in as a guest (room + last name)
3. Click the **Hermes floating button** (bottom-right)
4. Try these queries:
   - "What's on the menu?"
   - "Do you have Caesar Salad?"
   - "I want to book the island tour tomorrow for 2 people"
   - "Can I have extra towels?"
   - "What's my current bill?"
5. Verify responses are accurate and tool calls succeed (check `guest_requests` table for service requests, `tour_bookings` for bookings)

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| Function returns 500 | Check Supabase Function logs in Dashboard → Functions → hermes-chat → Logs |
| "STEPFUN_API_KEY not set" | Add env var in Supabase dashboard, redeploy |
| Chat widget not appearing | Ensure code is pushed and Vercel deployed; check browser console for errors |
| Menu queries return nothing | Verify `menu_items` table has `available = true` rows |
| Tour booking fails | Check `tours_config` table exists and has matching tour name |
| CORS error | Function should return `Access-Control-Allow-Origin: *` — already configured |

---

## 📊 Phase 2 Next Steps

- Add **Telegram notifications** for `submit_guest_request` (call existing `send-telegram` function)
- Add **voice input** (Web Speech API)
- Add **conversation memory** (store in `hermes_conversations` table)
- Add **admin-side assistant** (AdminPage)
- Add **satisfaction rating** (thumbs up/down)
- Fine-tune the system prompt and add more tools (inventory, order modification)

---

**That's it!** The Guest Assistant MVP should be live. Let me know if you hit any snags.
