## Goal
Get the guest portal chatbot working without requiring an external StepFun API key, and remove the "Hermes Assistant" name from the chat panel header.

## Why it's broken now
The `hermes-chat` edge function is hardcoded to call StepFun (`https://api.stepfun.com/v1/chat/completions`) using `STEPFUN_API_KEY`. That secret isn't set in this project (only `LOVABLE_API_KEY` and `TELEGRAM_BOT_TOKEN` exist), so every send fails. Lovable AI Gateway is already available with no extra setup, so we'll use it instead.

## Changes

### 1. `supabase/functions/hermes-chat/index.ts`
- Replace StepFun endpoint/key with Lovable AI Gateway:
  - URL: `https://ai.gateway.lovable.dev/v1/chat/completions`
  - Auth: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`
  - Default model: `google/gemini-2.5-flash` (fast, supports tool calling, free tier)
- Keep the same request shape (messages, tools, tool_choice) — the gateway is OpenAI-compatible.
- Handle 429 (rate limit) and 402 (credits) with friendly error messages returned to the client.
- Keep all existing tools (`query_menu_items`, `get_order_status`, `create_tour_booking`, `submit_guest_request`, `get_resort_info`) and the two-pass tool-calling loop unchanged.

### 2. `src/components/HermesChatWidget.tsx`
- Header: remove the "Hermes Assistant" title line. Keep only the subtitle ("BAIA Resort — Here to help") or replace with a single "Assistant" label — final wording: just show "BAIA Resort — Here to help" with no name above it.
- Switch the fetch call from the raw `https://<ref>.functions.supabase.co/hermes-chat` URL to `supabase.functions.invoke('hermes-chat', { body: {...} })` so it routes through the SDK and avoids CORS/URL-construction issues.
- Surface backend error messages (rate limit / credits) via the existing `toast.error`.

### 3. No DB or schema changes.

## Out of scope
- No changes to tools, system prompt content, or guest session logic.
- No new env vars required.

## Verification
After deploy: open Guest Portal → chat → send "What's on the menu?" → expect a reply listing items pulled from `menu_items`. Check edge function logs if it still fails.