import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 24000;
const MODES = new Set(['admin-panel', 'guest-concierge']);
const SUBAGENTS = new Set(['operations-overview', 'guest-services', 'reservations', 'food-beverage', 'housekeeping']);
const DEFAULT_MODEL = 'tencent/hy3:free';

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function fail(status: number, code: string, message: string) {
  return respond({ error: { code, message } }, status);
}
function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function validateMessages(messages: unknown) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return 'messages must contain between 1 and 12 items';
  }
  let total = 0;
  for (const item of messages) {
    if (!item || typeof item !== 'object') return 'invalid message item';
    const role = (item as any).role;
    const content = (item as any).content;
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string') {
      return 'each message must contain a valid role and string content';
    }
    if (!content.trim() || content.length > MAX_MESSAGE_CHARS) {
      return `each message must contain 1-${MAX_MESSAGE_CHARS} characters`;
    }
    total += content.length;
  }
  if (total > MAX_TOTAL_CHARS) return `message history exceeds ${MAX_TOTAL_CHARS} characters`;
  return null;
}

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function buildKnowledgeBlock(supabase: any, mode: string): Promise<string> {
  const parts: string[] = [];

  try {
    const { data: profile } = await supabase.from('resort_profile')
      .select('resort_name, tagline, address, phone, email, website_url').limit(1).maybeSingle();
    if (profile) {
      parts.push(`RESORT: ${profile.resort_name || 'BAIA'}${profile.tagline ? ` — ${profile.tagline}` : ''}
Address: ${profile.address || 'San Vicente, Palawan'} | Phone: ${profile.phone || 'n/a'} | Email: ${profile.email || 'n/a'} | Web: ${profile.website_url || 'n/a'}`);
    }
  } catch (_) {}

  try {
    const { data: menu } = await supabase.from('menu_items')
      .select('name, category, description, price, available')
      .eq('available', true).order('category').order('sort_order').limit(200);
    if (menu?.length) {
      const byCat: Record<string, string[]> = {};
      for (const m of menu) {
        (byCat[m.category] ||= []).push(`${m.name} (₱${m.price})${m.description ? ` – ${m.description}` : ''}`);
      }
      const lines = Object.entries(byCat).map(([c, items]) => `${c}: ${items.join('; ')}`);
      parts.push(`MENU:\n${lines.join('\n')}`);
    }
  } catch (_) {}

  try {
    const { data: tours } = await supabase.from('tours_config')
      .select('name, description, price, duration, schedule, max_pax, active')
      .eq('active', true).order('sort_order').limit(60);
    if (tours?.length) {
      const lines = tours.map((t: any) =>
        `${t.name} (₱${t.price}${t.duration ? `, ${t.duration}` : ''}${t.max_pax ? `, max ${t.max_pax} pax` : ''})${t.schedule ? ` – ${t.schedule}` : ''}${t.description ? ` – ${t.description}` : ''}`);
      parts.push(`TOURS:\n${lines.join('\n')}`);
    }
  } catch (_) {}

  try {
    const { data: transport } = await supabase.from('transport_rates')
      .select('type, origin, destination, price, description, active')
      .eq('active', true).order('sort_order').limit(80);
    if (transport?.length) {
      const lines = transport.map((t: any) =>
        `${t.type}: ${t.origin} → ${t.destination} (₱${t.price})${t.description ? ` – ${t.description}` : ''}`);
      parts.push(`TRANSPORT:\n${lines.join('\n')}`);
    }
  } catch (_) {}

  try {
    const { data: rentals } = await supabase.from('rental_rates')
      .select('rate_name, item_type, price, description, active')
      .eq('active', true).order('sort_order').limit(60);
    if (rentals?.length) {
      const lines = rentals.map((r: any) => `${r.rate_name} (₱${r.price})${r.description ? ` – ${r.description}` : ''}`);
      parts.push(`RENTALS:\n${lines.join('\n')}`);
    }
  } catch (_) {}

  try {
    const { data: reqCats } = await supabase.from('request_categories')
      .select('name, active').eq('active', true).order('sort_order').limit(40);
    if (reqCats?.length) {
      parts.push(`GUEST PORTAL — guests can request: ${reqCats.map((r: any) => r.name).join(', ')}. These go to Reception / the guest request workflow.`);
    }
  } catch (_) {}

  if (mode === 'admin-panel') {
    try {
      const { data: rooms } = await supabase.from('room_types')
        .select('name, base_rate').order('name').limit(40);
      if (rooms?.length) {
        parts.push(`ROOM TYPES: ${rooms.map((r: any) => `${r.name} (₱${r.base_rate})`).join(', ')}`);
      }
    } catch (_) {}
  }

  try {
    const { data: kb } = await supabase.from('ai_knowledge_base')
      .select('category, question, answer').eq('active', true).order('category').limit(300);
    if (kb?.length) {
      const lines = kb.map((k: any) => `[${k.category}] Q: ${k.question} A: ${k.answer}`);
      parts.push(`KNOWLEDGE BASE (authoritative answers):\n${lines.join('\n')}`);
    }
  } catch (_) {}

  return parts.join('\n\n');
}

function buildSystemPrompt(mode: string, context: Record<string, unknown>, knowledge: string) {
  const base = mode === 'admin-panel'
    ? [
        'You are BAIA Operations Assistant for BAIA Boutique Resort in San Vicente, Palawan.',
        'You have broad knowledge of this web app: reception, orders, kitchen, bar, housekeeping, menu, tours, transport, guest portal, reports, inventory, HR.',
        'Work strictly read-only. Never invent live operational data (specific bookings, live inventory counts, guest PII) that is not in the supplied context or knowledge base.',
        'Do not suggest destructive or database-changing actions.',
        'If something is not in your knowledge, say so plainly.',
      ]
    : [
        'You are BAIA Guest Concierge for BAIA Boutique Resort in San Vicente, Palawan.',
        'Answer guest questions using the resort knowledge below (menu, tours, transport, rentals, resort info, and the knowledge base).',
        'Keep responses concise and practical to control usage.',
        'Never invent live prices, availability, schedules, weather, or booking facts beyond what is provided.',
        'Never expose staff or admin information.',
        'For towels, repairs, food orders, bookings, or anything requiring staff action, direct the guest to Reception or the Request Service / Message Reception flow — do not attempt to fulfill it yourself.',
      ];

  const ctxLines: string[] = [];
  if (mode === 'admin-panel') {
    const staff = (context as any).staff || {};
    ctxLines.push(`Staff: ${staff.name || 'unknown'}`, `Focus: ${(context as any).approvedSubagent || 'operations-overview'}`, `Permissions: ${JSON.stringify(staff.permissions || [])}`);
  } else {
    const guest = (context as any).guest || {};
    ctxLines.push(`Guest: ${guest.firstName || 'unknown'}`, `Room: ${guest.roomName || 'unknown'}`, `Checkout: ${guest.checkoutDate || 'unknown'}`);
  }

  return [
    base.join('\n'),
    '',
    'SESSION CONTEXT:',
    ctxLines.join('\n'),
    '',
    knowledge ? `RESORT KNOWLEDGE:\n${knowledge}` : 'RESORT KNOWLEDGE: (none loaded)',
  ].join('\n');
}

async function callLLM(cfg: any, mode: string, systemPrompt: string, messages: Array<{ role: string; content: string }>) {
  const provider = cfg?.active_provider || 'openrouter';
  let baseUrl: string;
  let apiKey: string | undefined;
  let model: string;

  if (provider === 'custom') {
    baseUrl = (cfg?.fallback_base_url || '').replace(/\/$/, '');
    apiKey = cfg?.fallback_api_key || undefined;
    model = cfg?.fallback_model || 'gpt-3.5-turbo';
    if (!baseUrl) throw new Error('Custom provider selected but no base URL configured');
  } else if (provider === 'ollama') {
    const bridge = (cfg?.ollama_base_url || Deno.env.get('OLLAMA_BRIDGE_URL') || '').replace(/\/$/, '');
    if (!bridge) throw new Error('Ollama provider selected but no bridge URL configured');
    // Forward to the local Ollama bridge (chat API). No API key needed.
    const response = await fetch(`${bridge}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg?.primary_model || 'qwen2.5:3b',
        temperature,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Ollama bridge failed (${response.status})`);
    const reply = (data?.reply || '').trim();
    if (!reply) throw new Error('Ollama returned an empty response');
    return { reply, model: data.model || cfg?.primary_model, provider: 'ollama', maxTokens: undefined };
  } else {
    baseUrl = 'https://openrouter.ai/api/v1';
    apiKey = cfg?.openrouter_api_key
      || Deno.env.get('OPENROUTER_API_KEY')
      || Deno.env.get('Openrouter_API_Key')
      || Deno.env.get('OPENROUTER_SECRET');
    model = cfg?.primary_model || DEFAULT_MODEL;
    if (!apiKey) throw new Error('No OpenRouter key configured (admin override or secret)');
  }

  const maxTokens = mode === 'guest-concierge'
    ? clampInteger(cfg?.guest_max_tokens, 100, 1500, 500)
    : clampInteger(cfg?.admin_max_tokens, 100, 4000, 1500);

  const temperature = typeof cfg?.temperature === 'number' ? Math.min(1, Math.max(0, cfg.temperature)) : 0.4;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  if (provider === 'openrouter') headers['HTTP-Referer'] = 'https://baia-backoffice-68ad7369.vercel.app';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || `LLM request failed (${response.status})`);
  }
  const choice = data?.choices?.[0];
  const reply = choice?.message?.content?.trim();
  if (!reply) {
    const finish = choice?.finish_reason || 'unknown';
    throw new Error(`LLM returned an empty response (finish_reason=${finish}, model=${model}, max_tokens=${maxTokens})`);
  }
  return { reply, model, provider, maxTokens };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'POST required');

  try {
    const body = await req.json();
    const { mode, messages, context = {}, approvedSubagent } = body ?? {};
    if (!MODES.has(mode)) return fail(400, 'INVALID_MODE', 'mode must be admin-panel or guest-concierge');
    const messageError = validateMessages(messages);
    if (messageError) return fail(400, 'INVALID_MESSAGES', messageError);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let safeContext: Record<string, unknown>;

    if (mode === 'admin-panel') {
      const employeeId = String(context?.employeeId || '');
      const staffName = String(context?.name || '').trim();
      if (!employeeId || !staffName) return fail(401, 'STAFF_CONTEXT_REQUIRED', 'Staff session context is required');
      const subagent = SUBAGENTS.has(approvedSubagent) ? approvedSubagent : 'operations-overview';

      if (employeeId === 'free-login' && staffName === 'Free Login') {
        safeContext = { staff: { employeeId: 'free-login', name: 'Free Login', permissions: ['admin'], temporaryDevelopmentSession: true }, approvedSubagent: subagent, access: 'read-only' };
      } else {
        const { data: employee, error: employeeError } = await supabase
          .from('employees').select('id, name, display_name, active')
          .eq('id', employeeId).eq('active', true).maybeSingle();
        if (employeeError || !employee) return fail(401, 'STAFF_NOT_AUTHORIZED', 'Active staff record not found');
        const validName = [employee.name, employee.display_name].filter(Boolean)
          .some(value => String(value).trim().toLowerCase() === staffName.toLowerCase());
        if (!validName) return fail(401, 'STAFF_NOT_AUTHORIZED', 'Staff identity does not match');
        const { data: permissionRows, error: permissionError } = await supabase
          .from('employee_permissions').select('permission').eq('employee_id', employeeId);
        if (permissionError) return fail(500, 'PERMISSIONS_UNAVAILABLE', 'Unable to load staff permissions');
        safeContext = {
          staff: { employeeId: employee.id, name: employee.display_name || employee.name, permissions: (permissionRows || []).map(r => r.permission) },
          approvedSubagent: subagent, access: 'read-only',
        };
      }
    } else {
      const bookingId = String(context?.bookingId || '');
      const guestName = String(context?.guestName || '').trim();
      const roomName = String(context?.roomName || '').trim();
      const checkoutDate = String(context?.checkoutDate || '');
      if (!bookingId || !guestName) return fail(401, 'GUEST_CONTEXT_REQUIRED', 'Guest session context is required');

      const today = manilaDate();
      const { data: booking, error: bookingError } = await supabase
        .from('resort_ops_bookings')
        .select('id, check_in, check_out, resort_ops_guests(full_name), resort_ops_units(name)')
        .eq('id', bookingId).lte('check_in', today).gte('check_out', today).maybeSingle();
      if (bookingError || !booking) return fail(401, 'BOOKING_NOT_ACTIVE', 'Active guest booking not found');

      const bookedGuestName = String((booking as any).resort_ops_guests?.full_name || '').trim();
      const bookedRoomName = String((booking as any).resort_ops_units?.name || '').trim();
      if (!bookedGuestName || bookedGuestName.toLowerCase() !== guestName.toLowerCase()) {
        return fail(401, 'GUEST_NOT_AUTHORIZED', 'Guest identity does not match booking');
      }
      if (roomName && bookedRoomName && bookedRoomName.toLowerCase() !== roomName.toLowerCase()) {
        return fail(401, 'ROOM_NOT_AUTHORIZED', 'Room does not match booking');
      }
      safeContext = {
        guest: { bookingId: booking.id, firstName: bookedGuestName.split(' ')[0], roomName: bookedRoomName || roomName || null, checkoutDate: booking.check_out || checkoutDate || null },
        access: 'guest-read-only',
      };
    }

    try {
      const { data: cfg } = await supabase.from('ai_assistant_config').select('*').eq('id', 'default').maybeSingle();
      const knowledge = await buildKnowledgeBlock(supabase, mode);
      const systemPrompt = buildSystemPrompt(mode, safeContext, knowledge);
      const chatMessages = messages.slice(-MAX_MESSAGES).map((m: any) => ({ role: m.role, content: m.content }));
      const { reply, model, provider, maxTokens } = await callLLM(cfg, mode, systemPrompt, chatMessages);
      return respond({ reply, model, provider, max_tokens: maxTokens });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LLM request failed';
      return fail(502, 'LLM_ERROR', message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected broker error';
    return fail(500, 'BROKER_ERROR', message);
  }
});
