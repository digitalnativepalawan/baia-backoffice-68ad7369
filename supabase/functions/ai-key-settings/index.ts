import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ACTIONS = new Set([
  'status', 'set-config', 'clear-config',
  'kb-list', 'kb-upsert', 'kb-delete', 'kb-bulk-import',
]);

function respond(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function fail(status: number, code: string, message: string) {
  return respond({ error: { code, message } }, status);
}
function last4(v: string) {
  const t = (v || '').trim();
  return t.length <= 4 ? '****' : `••••${t.slice(-4)}`;
}
function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'POST required');

  try {
    const body = await req.json();
    const { action, context = {} } = body ?? {};
    if (!ACTIONS.has(action)) return fail(400, 'INVALID_ACTION', 'Unknown action');

    const employeeId = String(context?.employeeId || '');
    const staffName = String(context?.name || '').trim();
    if (!employeeId || !staffName) return fail(401, 'STAFF_CONTEXT_REQUIRED', 'Staff session context is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let isAdmin = false;
    if (employeeId === 'free-login' && staffName === 'Free Login') {
      isAdmin = true;
    } else {
      const { data: employee, error: empErr } = await supabase
        .from('employees').select('id, name, display_name, active')
        .eq('id', employeeId).eq('active', true).maybeSingle();
      if (empErr || !employee) return fail(401, 'STAFF_NOT_AUTHORIZED', 'Active staff record not found');
      const validName = [employee.name, employee.display_name].filter(Boolean)
        .some(v => String(v).trim().toLowerCase() === staffName.toLowerCase());
      if (!validName) return fail(401, 'STAFF_NOT_AUTHORIZED', 'Staff identity does not match');
      const { data: perms, error: permErr } = await supabase
        .from('employee_permissions').select('permission').eq('employee_id', employeeId);
      if (permErr) return fail(500, 'PERMISSIONS_UNAVAILABLE', 'Unable to load permissions');
      isAdmin = (perms || []).some(p => p.permission === 'admin');
    }

    const loadConfig = async () => {
      const { data } = await supabase.from('ai_assistant_config').select('*').eq('id', 'default').maybeSingle();
      return data;
    };

    if (action === 'status') {
      const cfg = await loadConfig();
      const envConfigured = Boolean(Deno.env.get('OPENROUTER_API_KEY'));
      return respond({
        active_provider: cfg?.active_provider || 'openrouter',
        primary_model: cfg?.primary_model || 'tencent/hy3:free',
        admin_max_tokens: clampInteger(cfg?.admin_max_tokens, 100, 4000, 1500),
        guest_max_tokens: clampInteger(cfg?.guest_max_tokens, 100, 1500, 500),
        temperature: typeof cfg?.temperature === 'number' ? cfg.temperature : 0.2,
        openrouter_configured: Boolean(cfg?.openrouter_api_key),
        openrouter_last4: cfg?.openrouter_api_key ? last4(cfg.openrouter_api_key) : null,
        fallback_configured: Boolean(cfg?.fallback_api_key),
        fallback_last4: cfg?.fallback_api_key ? last4(cfg.fallback_api_key) : null,
        fallback_base_url: cfg?.fallback_base_url || null,
        fallback_model: cfg?.fallback_model || null,
        ollama_configured: Boolean(cfg?.ollama_base_url),
        ollama_base_url: cfg?.ollama_base_url || null,
        env_secret_configured: envConfigured,
        updated_by: cfg?.updated_by || null,
        updated_at: cfg?.updated_at || null,
      });
    }

    if (!isAdmin) return fail(403, 'ADMIN_REQUIRED', 'Only admin staff can modify assistant settings');

    if (action === 'set-config') {
      const p = body.config || {};
      const patch: Record<string, unknown> = { id: 'default', updated_at: new Date().toISOString(), updated_by: staffName };
      if (typeof p.active_provider === 'string') patch.active_provider = p.active_provider;
      if (typeof p.primary_model === 'string') patch.primary_model = p.primary_model;
      if (typeof p.temperature === 'number') patch.temperature = Math.min(1, Math.max(0, p.temperature));
      if (p.admin_max_tokens !== undefined) patch.admin_max_tokens = clampInteger(p.admin_max_tokens, 100, 4000, 1500);
      if (p.guest_max_tokens !== undefined) patch.guest_max_tokens = clampInteger(p.guest_max_tokens, 100, 1500, 500);
      if (typeof p.openrouter_api_key === 'string' && p.openrouter_api_key.trim()) patch.openrouter_api_key = p.openrouter_api_key.trim();
      if (typeof p.fallback_api_key === 'string' && p.fallback_api_key.trim()) patch.fallback_api_key = p.fallback_api_key.trim();
      if (typeof p.fallback_base_url === 'string') patch.fallback_base_url = p.fallback_base_url.trim() || null;
      if (typeof p.fallback_model === 'string') patch.fallback_model = p.fallback_model.trim() || null;
      if (typeof p.ollama_base_url === 'string') patch.ollama_base_url = p.ollama_base_url.trim() || null;
      const { error } = await supabase.from('ai_assistant_config').upsert(patch);
      if (error) return fail(500, 'SAVE_FAILED', error.message);
      return respond({ ok: true });
    }

    if (action === 'clear-config') {
      const { error } = await supabase.from('ai_assistant_config').upsert({
        id: 'default', active_provider: 'openrouter', primary_model: 'tencent/hy3:free',
        admin_max_tokens: 1500, guest_max_tokens: 500,
        openrouter_api_key: null, fallback_api_key: null, fallback_base_url: null, fallback_model: null,
        updated_at: new Date().toISOString(), updated_by: staffName,
      });
      if (error) return fail(500, 'CLEAR_FAILED', error.message);
      return respond({ ok: true });
    }

    if (action === 'kb-list') {
      const { data, error } = await supabase.from('ai_knowledge_base')
        .select('id, category, question, answer, keywords, active, updated_at, updated_by')
        .order('category', { ascending: true }).order('updated_at', { ascending: false });
      if (error) return fail(500, 'KB_LIST_FAILED', error.message);
      return respond({ entries: data || [] });
    }

    if (action === 'kb-upsert') {
      const e = body.entry || {};
      const row: Record<string, unknown> = {
        category: String(e.category || 'general').trim() || 'general',
        question: String(e.question || '').trim(),
        answer: String(e.answer || '').trim(),
        keywords: String(e.keywords || '').trim(),
        active: e.active === false ? false : true,
        updated_at: new Date().toISOString(),
        updated_by: staffName,
      };
      if (!row.question || !row.answer) return fail(400, 'KB_INVALID', 'question and answer are required');
      if (e.id) row.id = e.id;
      const { error } = await supabase.from('ai_knowledge_base').upsert(row);
      if (error) return fail(500, 'KB_SAVE_FAILED', error.message);
      return respond({ ok: true });
    }

    if (action === 'kb-delete') {
      const id = String(body.id || '');
      if (!id) return fail(400, 'KB_INVALID', 'id required');
      const { error } = await supabase.from('ai_knowledge_base').delete().eq('id', id);
      if (error) return fail(500, 'KB_DELETE_FAILED', error.message);
      return respond({ ok: true });
    }

    if (action === 'kb-bulk-import') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return fail(400, 'KB_EMPTY', 'No rows to import');
      if (rows.length > 2000) return fail(400, 'KB_TOO_MANY', 'Max 2000 rows per import');
      const clean = rows
        .map((r: any) => ({
          category: String(r.category || 'general').trim() || 'general',
          question: String(r.question || '').trim(),
          answer: String(r.answer || '').trim(),
          keywords: String(r.keywords || '').trim(),
          active: r.active === false || String(r.active).toLowerCase() === 'false' ? false : true,
          updated_at: new Date().toISOString(),
          updated_by: staffName,
        }))
        .filter((r: any) => r.question && r.answer);
      if (clean.length === 0) return fail(400, 'KB_INVALID', 'No valid rows (need question + answer)');
      const { error } = await supabase.from('ai_knowledge_base').insert(clean);
      if (error) return fail(500, 'KB_IMPORT_FAILED', error.message);
      return respond({ ok: true, imported: clean.length });
    }

    return fail(400, 'INVALID_ACTION', 'Unhandled action');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return fail(500, 'SETTINGS_ERROR', message);
  }
});
