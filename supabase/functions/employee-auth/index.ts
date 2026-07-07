import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
  'Content-Type': 'application/json',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const respond = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, ...jsonHeaders },
  });

const businessError = (message: string, status = 200) =>
  respond({ error: message }, status);

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hashArray = new Uint8Array(derived);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);
  return btoa(String.fromCharCode(...combined));
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const storedHash = combined.slice(16);
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const derivedArray = new Uint8Array(derived);
  if (derivedArray.length !== storedHash.length) return false;

  let match = true;
  for (let i = 0; i < derivedArray.length; i++) {
    if (derivedArray[i] !== storedHash[i]) match = false;
  }
  return match;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { action, employee_id, name, pin, old_pin, new_pin } = body;

    if (action === 'set-password') {
      if (!employee_id || !pin) {
        return businessError('employee_id and pin required', 400);
      }

      const hash = await hashPin(pin);
      const { error } = await supabase.from('employees').update({ password_hash: hash }).eq('id', employee_id);
      if (error) throw error;
      return respond({ success: true });
    }

    if (action === 'verify') {
      if (!name || !pin) {
        return businessError('name and pin required');
      }

      const nameLower = name.trim().toLowerCase();
      const { data: allActive } = await supabase.from('employees').select('*').eq('active', true);
      const emp = (allActive || []).find((e: any) =>
        e.name?.toLowerCase() === nameLower || e.display_name?.toLowerCase() === nameLower,
      );

      if (!emp) {
        return businessError('Employee not found');
      }
      if (!emp.password_hash) {
        return businessError('No PIN set. Ask admin to set your PIN.');
      }

      const valid = await verifyPin(pin, emp.password_hash);
      if (!valid) {
        return businessError('Invalid PIN');
      }

      const { data: perms } = await supabase.from('employee_permissions').select('permission').eq('employee_id', emp.id);
      const permList = (perms || []).map((p: any) => p.permission);
      const isAdmin = permList.includes('admin');
      const { password_hash, ...safeEmp } = emp;
      return respond({ employee: safeEmp, isAdmin, permissions: permList });
    }

    if (action === 'admin-verify') {
      if (!name || !pin) {
        return businessError('name and pin required');
      }

      const adminNameLower = name.trim().toLowerCase();
      const { data: allActiveAdmin } = await supabase.from('employees').select('*').eq('active', true);
      const emp = (allActiveAdmin || []).find((e: any) =>
        e.name?.toLowerCase() === adminNameLower || e.display_name?.toLowerCase() === adminNameLower,
      );

      if (!emp) {
        return businessError('Employee not found');
      }
      if (!emp.password_hash) {
        return businessError('No PIN set. Ask admin to set your PIN.');
      }

      const valid = await verifyPin(pin, emp.password_hash);
      if (!valid) {
        return businessError('Invalid PIN');
      }

      const { data: perms } = await supabase.from('employee_permissions').select('permission').eq('employee_id', emp.id).eq('permission', 'admin');
      if (!perms || perms.length === 0) {
        return businessError('Access denied. Admin permission required.', 403);
      }

      const { password_hash, ...safeEmp } = emp;
      return respond({ employee: safeEmp, isAdmin: true });
    }

    if (action === 'change-pin') {
      if (!employee_id || !old_pin || !new_pin) {
        return businessError('employee_id, old_pin, and new_pin required');
      }
      if (new_pin.length < 4) {
        return businessError('New PIN must be at least 4 digits');
      }

      const { data: emp, error } = await supabase.from('employees').select('id, password_hash').eq('id', employee_id).single();
      if (error || !emp) {
        return businessError('Employee not found', 404);
      }
      if (!emp.password_hash) {
        return businessError('No current PIN set. Ask admin to set your PIN first.');
      }

      const valid = await verifyPin(old_pin, emp.password_hash);
      if (!valid) {
        return businessError('Current PIN is incorrect');
      }

      const newHash = await hashPin(new_pin);
      const { error: updateErr } = await supabase.from('employees').update({ password_hash: newHash }).eq('id', employee_id);
      if (updateErr) throw updateErr;
      return respond({ success: true });
    }

    return businessError('Invalid action', 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    return respond({ error: message }, 500);
  }
});
