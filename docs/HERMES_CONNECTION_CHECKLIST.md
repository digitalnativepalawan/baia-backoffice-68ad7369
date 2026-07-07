# BAIA Hermes Connection Checklist

Use this only after the current Hermes subagent work is finished.

## Supabase project

Project: `paghxagqnaisxesmhnwj`

1. Deploy the existing Edge Function:
   - `supabase/functions/hermes-chat/index.ts`
2. Confirm `supabase/config.toml` contains:
   - `[functions.hermes-chat]`
   - `verify_jwt = false`
3. Add these Supabase secrets without exposing their values in frontend code:
   - `HERMES_BRIDGE_URL`
   - `HERMES_BRIDGE_TOKEN`

## Hermes bridge host

1. Set the same `HERMES_BRIDGE_TOKEN` used by Supabase.
2. Set `HERMES_ALLOWED_ORIGINS` to the approved calling origins if browser access is ever enabled. The Supabase broker itself sends no browser origin.
3. Confirm the runtime model lock:
   - `HERMES_PROVIDER=ollama`
   - `HERMES_MODEL=qwen2.5:3b`
   - `OLLAMA_MODEL=qwen2.5:3b`
4. Confirm Ollama has `qwen2.5:3b` available.
5. Start the existing bridge with:
   - `npm run dev:server`
6. Do not configure any cloud provider or fallback model.

## Connection tests

1. Admin portal:
   - Sign in through the existing staff/admin flow or temporary Free Login.
   - Open BAIA Operations Assistant.
   - Confirm a read-only response is returned.
   - Confirm the selected approved subagent is included.
2. Guest portal:
   - Sign in using room and guest last name.
   - Confirm Ask BAIA appears only after authentication.
   - Confirm the response uses guest booking context and exposes no admin information.
   - Confirm service actions still use Request Service or Message Reception.
3. Confirm the response metadata reports:
   - provider: `ollama`
   - model: `qwen2.5:3b`

## Production verification

1. Confirm GitHub `main` is deployed successfully by Vercel.
2. Test both:
   - `https://baia-backoffice-68ad7369.vercel.app`
   - `https://baia.menu.palawancollective.com`
3. Confirm neither browser bundle nor network requests expose `HERMES_BRIDGE_TOKEN`.
