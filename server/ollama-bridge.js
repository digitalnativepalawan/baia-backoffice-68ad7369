// BAIA Ollama bridge — local-only LLM for the admin/guest assistants.
// Exposes:
//   GET  /api/ollama/models      -> [{ id, name }] from `ollama list`
//   POST /api/ollama/chat         -> { reply } calling Ollama's /api/chat
// Runs on your machine; the deployed cloud app cannot reach localhost:11434.
import http from 'node:http';
import { request as httpReq } from 'node:http';
import { request as httpsReq } from 'node:https';

const PORT = Number(process.env.OLLAMA_BRIDGE_PORT || 3001);
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function collect(req, cb) {
  let buf = '';
  let bytes = 0;
  req.on('data', c => { bytes += c.length; if (bytes > 1 << 20) req.destroy(); else buf += c; });
  req.on('end', () => { try { cb(null, buf ? JSON.parse(buf) : {}); } catch (e) { cb(e); } });
  req.on('error', e => cb(e));
}

// Forward to Ollama using either http or https based on the base URL.
function ollamaFetch(path, payload, cb) {
  const url = new URL(OLLAMA_BASE + path);
  const body = JSON.stringify(payload);
  const lib = url.protocol === 'https:' ? httpsReq : httpReq;
  const r = lib({
    hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, res => {
    let out = '';
    res.on('data', c => out += c);
    res.on('end', () => { try { cb(null, res.statusCode, out); } catch (e) { cb(e); } });
  });
  r.on('error', e => cb(e));
  r.write(body); r.end();
}

function handleModels(res) {
  ollamaFetch('/api/tags', {}, (err, status, raw) => {
    if (err || status !== 200) return json(res, 502, { models: [], error: 'ollama_unreachable' });
    try {
      const data = JSON.parse(raw || '{}');
      const models = (data.models || []).map(m => ({ id: m.name, name: m.name, size: m.size }));
      json(res, 200, { models });
    } catch {
      json(res, 502, { models: [], error: 'parse_error' });
    }
  });
}

function handleChat(req, res) {
  collect(req, (err, body) => {
    if (err) return json(res, 400, { error: 'bad_request' });
    const model = body.model || '';
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!model || !messages.length) return json(res, 400, { error: 'model and messages required' });
    ollamaFetch('/api/chat', { model, messages, stream: false, options: { temperature: 0.4 } }, (e, status, raw) => {
      if (e) return json(res, 502, { error: 'ollama_unreachable' });
      try {
        const data = JSON.parse(raw || '{}');
        const reply = (data.message?.content || '').trim();
        if (!reply) return json(res, 502, { error: 'empty_response' });
        json(res, 200, { reply, model, provider: 'ollama' });
      } catch {
        json(res, 502, { error: 'parse_error' });
      }
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/api/ollama/models')) return handleModels(res);
  if (req.method === 'POST' && req.url.startsWith('/api/ollama/chat')) return handleChat(req, res);
  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`[ollama-bridge] listening on http://localhost:${PORT} -> ${OLLAMA_BASE}`);
});
