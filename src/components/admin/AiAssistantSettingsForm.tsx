import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getStaffSession } from '@/lib/session';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, Upload, Trash2, Plus } from 'lucide-react';

interface Status {
  active_provider: 'openrouter' | 'custom';
  primary_model: string;
  admin_max_tokens: number;
  guest_max_tokens: number;
  openrouter_configured: boolean;
  openrouter_last4: string | null;
  fallback_configured: boolean;
  fallback_last4: string | null;
  fallback_base_url: string | null;
  fallback_model: string | null;
  env_secret_configured: boolean;
  updated_by: string | null;
  updated_at: string | null;
}

interface KbEntry {
  id?: string;
  category: string;
  question: string;
  answer: string;
  keywords?: string;
  active?: boolean;
}

const TEMPLATE_ROWS: KbEntry[] = [
  { category: 'menu', question: 'Do you have vegetarian options?', answer: 'Yes — ask reception for the daily vegetarian specials.', keywords: 'vegetarian,vegan,food', active: true },
  { category: 'tours', question: 'What time do island tours leave?', answer: 'Island tours typically depart at 8:00 AM. Confirm with reception the day before.', keywords: 'tour,island,time', active: true },
  { category: 'guest-portal', question: 'How do I request extra towels?', answer: 'Use Request Service in the guest portal, or message Reception.', keywords: 'towels,housekeeping,request', active: true },
];

function toCsv(rows: KbEntry[]): string {
  const header = 'category,question,answer,keywords,active';
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(r => [r.category, r.question, r.answer, r.keywords || '', r.active === false ? 'false' : 'true'].map(esc).join(','));
  return [header, ...lines].join('\n');
}

function parseCsv(text: string): KbEntry[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else field += c;
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const ci = idx('category'), qi = idx('question'), ai = idx('answer'), ki = idx('keywords'), acti = idx('active');
  return rows.slice(1).filter(r => r.length > 1).map(r => ({
    category: (ci >= 0 ? r[ci] : 'general')?.trim() || 'general',
    question: (qi >= 0 ? r[qi] : '')?.trim() || '',
    answer: (ai >= 0 ? r[ai] : '')?.trim() || '',
    keywords: (ki >= 0 ? r[ki] : '')?.trim() || '',
    active: acti >= 0 ? String(r[acti]).trim().toLowerCase() !== 'false' : true,
  })).filter(r => r.question && r.answer);
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AiAssistantSettingsForm() {
  const staff = getStaffSession();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [provider, setProvider] = useState<'openrouter' | 'custom'>('openrouter');
  const [primaryModel, setPrimaryModel] = useState('tencent/hy3:free');
  const [adminMaxTokens, setAdminMaxTokens] = useState(1500);
  const [guestMaxTokens, setGuestMaxTokens] = useState(500);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [fallbackKey, setFallbackKey] = useState('');
  const [fallbackBaseUrl, setFallbackBaseUrl] = useState('');
  const [fallbackModel, setFallbackModel] = useState('');

  const [kb, setKb] = useState<KbEntry[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [newEntry, setNewEntry] = useState<KbEntry>({ category: 'general', question: '', answer: '', keywords: '', active: true });
  const fileRef = useRef<HTMLInputElement>(null);

  const ctx = staff ? { employeeId: staff.employeeId, name: staff.name } : null;

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('ai-key-settings', { body: { action, context: ctx, ...extra } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error.message);
    return data;
  };

  const loadStatus = async () => {
    if (!ctx) return;
    setLoading(true);
    try {
      const s: Status = await call('status');
      setStatus(s);
      setProvider(s.active_provider);
      setPrimaryModel(s.primary_model || 'tencent/hy3:free');
      setAdminMaxTokens(s.admin_max_tokens || 1500);
      setGuestMaxTokens(s.guest_max_tokens || 500);
      setFallbackBaseUrl(s.fallback_base_url || '');
      setFallbackModel(s.fallback_model || '');
    } catch {
      toast.error('Could not load assistant status');
    } finally {
      setLoading(false);
    }
  };

  const loadKb = async () => {
    if (!ctx) return;
    setKbLoading(true);
    try {
      const d = await call('kb-list');
      setKb(d.entries || []);
    } catch {
      toast.error('Could not load knowledge base');
    } finally {
      setKbLoading(false);
    }
  };

  useEffect(() => { loadStatus(); loadKb(); /* eslint-disable-next-line */ }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const config: Record<string, unknown> = {
        active_provider: provider,
        primary_model: primaryModel,
        admin_max_tokens: adminMaxTokens,
        guest_max_tokens: guestMaxTokens,
        fallback_base_url: fallbackBaseUrl,
        fallback_model: fallbackModel,
      };
      if (openrouterKey.trim()) config.openrouter_api_key = openrouterKey.trim();
      if (fallbackKey.trim()) config.fallback_api_key = fallbackKey.trim();
      await call('set-config', { config });
      toast.success('Assistant settings saved');
      setOpenrouterKey(''); setFallbackKey('');
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const clearConfig = async () => {
    setSaving(true);
    try {
      await call('clear-config');
      toast.success('Keys cleared — using Supabase secret');
      await loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to clear');
    } finally {
      setSaving(false);
    }
  };

  const addEntry = async () => {
    if (!newEntry.question.trim() || !newEntry.answer.trim()) { toast.error('Question and answer required'); return; }
    try {
      await call('kb-upsert', { entry: newEntry });
      toast.success('Entry added');
      setNewEntry({ category: 'general', question: '', answer: '', keywords: '', active: true });
      await loadKb();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add');
    }
  };

  const deleteEntry = async (id?: string) => {
    if (!id) return;
    try { await call('kb-delete', { id }); await loadKb(); toast.success('Deleted'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete'); }
  };

  const onUpload = async (file: File) => {
    try {
      const text = await file.text();
      let rows: KbEntry[];
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : (parsed.entries || []);
      } else {
        rows = parseCsv(text);
      }
      if (!rows.length) { toast.error('No valid rows found'); return; }
      const d = await call('kb-bulk-import', { rows });
      toast.success(`Imported ${d.imported} entries`);
      await loadKb();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="border border-border rounded-lg p-4 space-y-6">
      <div>
        <h3 className="font-display text-sm tracking-wider text-foreground">BAIA AI Assistant</h3>
        <p className="font-body text-xs text-muted-foreground mt-1">
          Configure the LLM provider, response limits, and the knowledge base used by the admin and guest assistants.
        </p>
      </div>

      <div className="space-y-3">
        <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">LLM Provider</p>
        {loading ? <p className="font-body text-sm text-muted-foreground">Loading…</p> : status && (
          <p className="font-body text-xs text-muted-foreground">
            Active: <span className="text-foreground">{status.active_provider}</span>
            {status.openrouter_configured && ` · OpenRouter key ${status.openrouter_last4}`}
            {status.fallback_configured && ` · fallback key ${status.fallback_last4}`}
            {!status.openrouter_configured && !status.env_secret_configured && provider === 'openrouter' && (
              <span className="text-destructive"> · no key set, chat will fail</span>
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-xs text-muted-foreground">Provider</label>
            <Select value={provider} onValueChange={v => setProvider(v as any)}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="custom">Custom / open-source (OpenAI-compatible)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Primary model (OpenRouter)</label>
            <Input value={primaryModel} onChange={e => setPrimaryModel(e.target.value)}
              placeholder="tencent/hy3:free" className="bg-secondary border-border text-foreground font-body mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-xs text-muted-foreground">Admin reply max tokens</label>
            <Input type="number" min={100} max={4000} step={100} value={adminMaxTokens}
              onChange={e => setAdminMaxTokens(Number(e.target.value) || 1500)}
              className="bg-secondary border-border text-foreground font-body mt-1" />
            <p className="font-body text-[10px] text-muted-foreground mt-1">100–4000. Default: 1500.</p>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Guest reply max tokens</label>
            <Input type="number" min={100} max={1500} step={100} value={guestMaxTokens}
              onChange={e => setGuestMaxTokens(Number(e.target.value) || 500)}
              className="bg-secondary border-border text-foreground font-body mt-1" />
            <p className="font-body text-[10px] text-muted-foreground mt-1">100–1500. Default: 500 to control cost.</p>
          </div>
        </div>

        <div>
          <label className="font-body text-xs text-muted-foreground">OpenRouter API key {status?.openrouter_configured ? `(set: ${status.openrouter_last4})` : ''}</label>
          <Input type="password" value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)}
            placeholder="sk-or-… (leave blank to keep current)" className="bg-secondary border-border text-foreground font-body mt-1" />
        </div>

        {provider === 'custom' && (
          <div className="space-y-3 border-l-2 border-border pl-3">
            <div>
              <label className="font-body text-xs text-muted-foreground">Fallback base URL (OpenAI-compatible)</label>
              <Input value={fallbackBaseUrl} onChange={e => setFallbackBaseUrl(e.target.value)}
                placeholder="https://my-host/v1" className="bg-secondary border-border text-foreground font-body mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-body text-xs text-muted-foreground">Fallback model</label>
                <Input value={fallbackModel} onChange={e => setFallbackModel(e.target.value)}
                  placeholder="qwen2.5:3b / llama3.1" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
              <div>
                <label className="font-body text-xs text-muted-foreground">Fallback API key {status?.fallback_configured ? `(set: ${status.fallback_last4})` : ''}</label>
                <Input type="password" value={fallbackKey} onChange={e => setFallbackKey(e.target.value)}
                  placeholder="leave blank to keep / if none needed" className="bg-secondary border-border text-foreground font-body mt-1" />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={saveConfig} disabled={saving} className="font-display tracking-wider text-xs">
            {saving ? 'Saving…' : 'Save Provider Settings'}
          </Button>
          <Button variant="outline" onClick={clearConfig} disabled={saving} className="font-display tracking-wider text-xs">
            Clear Keys
          </Button>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-xs tracking-wider text-muted-foreground uppercase">Knowledge Base ({kb.length})</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="font-body text-xs gap-1"
              onClick={() => download('baia-knowledge-template.csv', toCsv(kb.length ? kb : TEMPLATE_ROWS), 'text/csv')}>
              <Download className="w-3 h-3" /> CSV
            </Button>
            <Button size="sm" variant="outline" className="font-body text-xs gap-1"
              onClick={() => download('baia-knowledge-template.json', JSON.stringify(kb.length ? kb : TEMPLATE_ROWS, null, 2), 'application/json')}>
              <Download className="w-3 h-3" /> JSON
            </Button>
            <Button size="sm" variant="outline" className="font-body text-xs gap-1" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3 h-3" /> Import
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
          </div>
        </div>
        <p className="font-body text-[11px] text-muted-foreground">
          Download a CSV or JSON template, fill it with Q&amp;A, and import. Columns: category, question, answer, keywords, active.
          The bot also automatically reads live menu, tours, transport, rentals, resort info, rooms, and guest-portal request types.
        </p>

        <div className="border border-border rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input value={newEntry.category} onChange={e => setNewEntry({ ...newEntry, category: e.target.value })}
              placeholder="category (e.g. tours)" className="bg-secondary border-border text-foreground font-body text-sm" />
            <Input value={newEntry.keywords} onChange={e => setNewEntry({ ...newEntry, keywords: e.target.value })}
              placeholder="keywords (optional)" className="bg-secondary border-border text-foreground font-body text-sm" />
          </div>
          <Input value={newEntry.question} onChange={e => setNewEntry({ ...newEntry, question: e.target.value })}
            placeholder="Question" className="bg-secondary border-border text-foreground font-body text-sm" />
          <Input value={newEntry.answer} onChange={e => setNewEntry({ ...newEntry, answer: e.target.value })}
            placeholder="Answer" className="bg-secondary border-border text-foreground font-body text-sm" />
          <Button size="sm" onClick={addEntry} className="font-display tracking-wider text-xs gap-1">
            <Plus className="w-3 h-3" /> Add Entry
          </Button>
        </div>

        {kbLoading ? (
          <p className="font-body text-sm text-muted-foreground">Loading knowledge base…</p>
        ) : kb.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">No entries yet. Add one above or import a file.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {kb.map(entry => (
              <div key={entry.id} className="flex items-start justify-between gap-2 border border-border/60 rounded-lg p-2">
                <div className="min-w-0">
                  <p className="font-body text-xs text-muted-foreground">[{entry.category}]{entry.active === false ? ' · inactive' : ''}</p>
                  <p className="font-body text-sm text-foreground truncate">{entry.question}</p>
                  <p className="font-body text-xs text-muted-foreground truncate">{entry.answer}</p>
                </div>
                <button onClick={() => deleteEntry(entry.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0 p-1" aria-label="Delete entry">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
