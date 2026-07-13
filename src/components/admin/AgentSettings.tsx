import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getStaffSession } from '@/lib/session';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Search, Download, Upload, RefreshCw, Plus, Save, Trash2 } from 'lucide-react';
import { fetchModelCatalog, type ModelOption } from '@/lib/modelCatalog';

type Provider = 'openrouter' | 'ollama';

interface Status {
  active_provider: Provider;
  primary_model: string;
  temperature: number;
  admin_max_tokens: number;
  guest_max_tokens: number;
  openrouter_configured: boolean;
  openrouter_last4: string | null;
  ollama_base_url: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

interface FaqEntry {
  id?: string;
  question: string;
  keywords: string;
  answer: string;
  active: boolean;
}

async function call(action: string, extra: Record<string, unknown> = {}) {
  const ctx = getStaffSession();
  const { data, error } = await supabase.functions.invoke('ai-key-settings', {
    body: { action, context: ctx, ...extra },
  });
  if (error) throw new Error(error.message || 'Request failed');
  if (data?.error) throw new Error(data.error.message || 'Request failed');
  return data;
}

export default function AgentSettings() {
  const [provider, setProvider] = useState<Provider>('openrouter');
  const [primaryModel, setPrimaryModel] = useState('');
  const [temperature, setTemperature] = useState(0.2);
  const [guestTokens, setGuestTokens] = useState(500);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');
  const [catalog, setCatalog] = useState<ModelOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [faq, setFaq] = useState<FaqEntry[]>([]);
  const [faqForm, setFaqForm] = useState<FaqEntry>({ question: '', keywords: '', answer: '', active: true });

  const loadStatus = useCallback(async () => {
    try {
      const s: Status = await call('status');
      setStatus(s);
      setProvider(s.active_provider === 'custom' ? 'openrouter' : s.active_provider);
      setPrimaryModel(s.primary_model || '');
      setTemperature(typeof s.temperature === 'number' ? s.temperature : 0.2);
      setGuestTokens(s.guest_max_tokens || 500);
      setOllamaBaseUrl(s.ollama_base_url || '');
    } catch {
      toast.error('Could not load agent settings');
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const models = await fetchModelCatalog();
      setCatalog(models);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadFaq = useCallback(async () => {
    try {
      const data = await call('kb-list');
      setFaq((data.entries || []).filter((e: any) => e.category === 'guest-faq'));
    } catch {
      setFaq([]);
    }
  }, []);

  useEffect(() => { loadStatus(); loadCatalog(); loadFaq(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true);
    try {
      const config: Record<string, unknown> = {
        active_provider: provider,
        primary_model: primaryModel,
        temperature,
        guest_max_tokens: guestTokens,
        ollama_base_url: ollamaBaseUrl.trim() || null,
      };
      if (openrouterKey.trim()) config.openrouter_api_key = openrouterKey.trim();
      await call('set-config', { config });
      await loadStatus();
      toast.success('Agent settings saved');
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addFaq = async () => {
    if (!faqForm.question.trim() || !faqForm.answer.trim()) {
      toast.error('Question and answer are required');
      return;
    }
    try {
      await call('kb-upsert', { entry: { ...faqForm, category: 'guest-faq' } });
      setFaqForm({ question: '', keywords: '', answer: '', active: true });
      await loadFaq();
      toast.success('FAQ answer added');
    } catch (e: any) {
      toast.error(e.message || 'Add failed');
    }
  };

  const deleteFaq = async (id: string) => {
    try {
      await call('kb-delete', { id });
      await loadFaq();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    }
  };

  const importFaq = async (file: File) => {
    try {
      const text = await file.text();
      const rows: any[] = file.name.endsWith('.csv')
        ? text.trim().split('\n').slice(1).map(l => {
            const [question, answer, keywords] = l.split(',');
            return { question: (question || '').trim(), answer: (answer || '').trim(), keywords: (keywords || '').trim() };
          })
        : JSON.parse(text);
      const clean = (rows || []).filter((r: any) => r.question && r.answer)
        .map((r: any) => ({ category: 'guest-faq', question: String(r.question).trim(), answer: String(r.answer).trim(), keywords: String(r.keywords || '').trim(), active: true }));
      if (!clean.length) return toast.error('No valid rows');
      await call('kb-bulk-import', { rows: clean });
      await loadFaq();
      toast.success(`Imported ${clean.length} answers`);
    } catch (e: any) {
      toast.error(e.message || 'Import failed');
    }
  };

  const filtered = useMemo(() => {
    let list = catalog;
    if (freeOnly) list = list.filter(m => m.group === 'OpenRouter · Free' || m.group === 'Local (Ollama)');
    if (search.trim()) list = list.filter(m => m.id.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [catalog, freeOnly, search]);

  const activeCount = faq.filter(f => f.active).length;

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg tracking-wider text-foreground">Agent Settings</h2>
          <p className="font-body text-xs text-muted-foreground mt-1">Configure the AI model powering resort operations and guest concierge.</p>
        </div>
      </div>

      {/* AI Provider */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm tracking-wider text-foreground">AI Provider</h3>
            <p className="font-body text-xs text-muted-foreground mt-1">Choose where the agent runs its AI models.</p>
          </div>
          <Switch checked={true} onCheckedChange={() => {}} aria-label="Provider enabled" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setProvider('ollama')}
            className={`rounded-lg border p-3 text-left transition ${provider === 'ollama' ? 'border-primary bg-secondary' : 'border-border'}`}>
            <div className="font-body text-sm text-foreground">Ollama (Local)</div>
            <div className="font-body text-[11px] text-muted-foreground mt-1">Runs on your machine</div>
          </button>
          <button
            type="button"
            onClick={() => setProvider('openrouter')}
            className={`rounded-lg border p-3 text-left transition ${provider === 'openrouter' ? 'border-primary bg-secondary' : 'border-border'}`}>
            <div className="font-body text-sm text-foreground">OpenRouter (Cloud)</div>
            <div className="font-body text-[11px] text-muted-foreground mt-1">Many models, some free</div>
          </button>
        </div>
      </section>

      {/* Provider-specific config */}
      {provider === 'openrouter' && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <label className="font-body text-xs text-muted-foreground">API Key {status?.openrouter_configured ? `(set: ${status.openrouter_last4})` : ''}</label>
            <Input type="password" value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-… (leave blank to keep current)" className="bg-secondary border-border text-foreground font-body mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search models…"
              className="bg-secondary border-border text-foreground font-body" />
            <Button variant={freeOnly ? 'default' : 'outline'} size="sm" onClick={() => setFreeOnly(v => !v)}>Show Free</Button>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Model</label>
            <Select value={primaryModel} onValueChange={setPrimaryModel}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                <SelectValue placeholder={catalogLoading ? 'Loading models…' : 'Select a model…'} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(['Local (Ollama)', 'OpenRouter · Free', 'OpenRouter · Paid'] as const).map(group => {
                  const items = filtered.filter(m => m.group === group);
                  if (!items.length) return null;
                  return (
                    <div key={group}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group}</div>
                      {items.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </div>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="font-body text-[10px] text-muted-foreground mt-1">
              {catalogLoading ? 'Loading…' : `${filtered.length} of ${catalog.length} models shown`}
            </p>
          </div>
        </section>
      )}

      {provider === 'ollama' && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <label className="font-body text-xs text-muted-foreground">Ollama base URL (bridge)</label>
            <Input value={ollamaBaseUrl} onChange={e => setOllamaBaseUrl(e.target.value)}
              placeholder="http://localhost:3001/api/ollama" className="bg-secondary border-border text-foreground font-body mt-1" />
            <p className="font-body text-[10px] text-muted-foreground mt-1">Local models only — needs the Ollama bridge running.</p>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground">Model</label>
            <Select value={primaryModel} onValueChange={setPrimaryModel}>
              <SelectTrigger className="bg-secondary border-border text-foreground font-body mt-1">
                <SelectValue placeholder="Select a local model…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {catalog.filter(m => m.group === 'Local (Ollama)').map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
                {catalog.filter(m => m.group === 'Local (Ollama)').length === 0 && (
                  <SelectItem value={primaryModel || 'none'} disabled>{primaryModel || 'No local models found'}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </section>
      )}

      {/* Model Behavior */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="font-display text-sm tracking-wider text-foreground">Model Behavior</h3>
        <div className="space-y-2">
          <label className="font-body text-xs text-muted-foreground">Temperature ({temperature.toFixed(1)})</label>
          <Slider min={0} max={1} step={0.1} value={[temperature]} onValueChange={v => setTemperature(v[0])} />
          <div className="flex justify-between font-body text-[10px] text-muted-foreground">
            <span>Precise</span><span>Creative</span>
          </div>
        </div>
        <div>
          <label className="font-body text-xs text-muted-foreground">Max Reply Tokens (guest)</label>
          <Input type="number" min={100} max={1500} step={100} value={guestTokens}
            onChange={e => setGuestTokens(Number(e.target.value) || 500)}
            className="bg-secondary border-border text-foreground font-body mt-1" />
        </div>
      </section>

      <Button onClick={save} disabled={saving} className="w-full font-display tracking-wider">
        <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving…' : 'Save Agent Settings'}
      </Button>

      {/* Guest FAQ Memory */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm tracking-wider text-foreground">Guest FAQ Memory</h3>
            <p className="font-body text-xs text-muted-foreground mt-1">{activeCount} active shared answers.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadFaq}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const blob = new Blob([JSON.stringify(faq, null, 2)], { type: 'application/json' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'guest-faq.json'; a.click();
            }}><Download className="w-3.5 h-3.5 mr-1" />Download</Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5 mr-1" />Import</Button>
            <input ref={fileRef} type="file" accept=".csv,.json" className="hidden" onChange={e => { if (e.target.files?.[0]) importFaq(e.target.files[0]); e.target.value = ''; }} />
          </div>
        </div>
        <Input value={faqForm.question} onChange={e => setFaqForm(f => ({ ...f, question: e.target.value }))}
          placeholder="Guest question, e.g. What time is breakfast?" className="bg-secondary border-border text-foreground font-body" />
        <Input value={faqForm.keywords} onChange={e => setFaqForm(f => ({ ...f, keywords: e.target.value }))}
          placeholder="Keywords, comma separated: breakfast, morning meal" className="bg-secondary border-border text-foreground font-body" />
        <textarea value={faqForm.answer} onChange={e => setFaqForm(f => ({ ...f, answer: e.target.value }))}
          placeholder="Confirmed answer shown to guests" rows={3}
          className="w-full rounded-md bg-secondary border border-border text-foreground font-body p-2 text-sm resize-none" />
        <Button onClick={addFaq} variant="outline" className="font-display tracking-wider"><Plus className="w-4 h-4 mr-2" />Add Answer</Button>
        {faq.length === 0 ? (
          <p className="font-body text-xs text-muted-foreground">No reusable guest answers yet.</p>
        ) : (
          <div className="space-y-2">
            {faq.map((f, i) => (
              <div key={f.id || i} className="rounded-md border border-border p-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-body text-sm text-foreground">{f.question}</div>
                  <div className="font-body text-xs text-muted-foreground mt-1 line-clamp-2">{f.answer}</div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => f.id && deleteFaq(f.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
