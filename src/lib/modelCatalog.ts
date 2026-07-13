// Dynamic model catalogs — NO hardcoded option lists (David's rule).
// OpenRouter: public models endpoint. Ollama: local bridge /api/ollama/models.

export interface ModelOption {
  id: string;
  label: string;
  group: 'Local (Ollama)' | 'OpenRouter · Free' | 'OpenRouter · Paid';
}

function groupOpenRouter(m: any): 'OpenRouter · Free' | 'OpenRouter · Paid' {
  const p = m?.pricing || {};
  return (p.prompt === '0' && p.completion === '0') ? 'OpenRouter · Free' : 'OpenRouter · Paid';
}

export async function fetchOpenRouterModels(signal?: AbortSignal): Promise<ModelOption[]> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal });
    const data = await res.json();
    const models: ModelOption[] = (data.data || [])
      .map((m: any) => ({
        id: m.id,
        label: m.id,
        group: groupOpenRouter(m),
      }))
      .sort((a: ModelOption, b: ModelOption) => a.id.localeCompare(b.id));
    return models;
  } catch {
    return [];
  }
}

export async function fetchOllamaModels(signal?: AbortSignal): Promise<ModelOption[]> {
  // In dev, Vite proxies /api -> localhost:3001 (ollama-bridge).
  // In prod, set VITE_OLLAMA_BRIDGE_URL (e.g. your VPS) or leave empty to disable.
  const base = (import.meta.env.VITE_OLLAMA_BRIDGE_URL || '/api/ollama').replace(/\/$/, '');
  if (!base) return [];
  try {
    const res = await fetch(`${base}/models`, { signal });
    const data = await res.json();
    return (data.models || []).map((m: any) => ({
      id: m.id,
      label: m.name || m.id,
      group: 'Local (Ollama)' as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchModelCatalog(): Promise<ModelOption[]> {
  const [or_, ol] = await Promise.allSettled([
    fetchOpenRouterModels(),
    fetchOllamaModels(),
  ]);
  const out: ModelOption[] = [];
  if (ol.status === 'fulfilled') out.push(...ol.value);
  if (or_.status === 'fulfilled') out.push(...or_.value);
  return out;
}
