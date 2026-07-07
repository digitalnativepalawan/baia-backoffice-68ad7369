import http from 'node:http';
import { spawn } from 'node:child_process';

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 24_000;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 90_000;
const APPROVED_MODEL = 'qwen2.5:3b';
const APPROVED_PROVIDER = 'ollama';
const MODES = new Set(['admin-panel', 'guest-concierge']);
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const allowedOrigins = (process.env.HERMES_ALLOWED_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

function responseHeaders(origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  };
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function sendJson(res, status, payload, origin) {
  res.writeHead(status, responseHeaders(origin));
  res.end(JSON.stringify(payload));
}

function sendError(res, status, code, message, origin) {
  sendJson(res, status, { error: { code, message } }, origin);
}

function validateModelLock() {
  const provider = (process.env.HERMES_PROVIDER || APPROVED_PROVIDER).toLowerCase();
  const hermesModel = process.env.HERMES_MODEL || APPROVED_MODEL;
  const ollamaModel = process.env.OLLAMA_MODEL || APPROVED_MODEL;
  return provider === APPROVED_PROVIDER
    && hermesModel === APPROVED_MODEL
    && ollamaModel === APPROVED_MODEL;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return 'messages must contain between 1 and 12 items';
  }
  let total = 0;
  for (const item of messages) {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') {
      return 'each message must contain a valid role and string content';
    }
    if (!item.content.trim() || item.content.length > MAX_MESSAGE_CHARS) {
      return `each message must contain 1-${MAX_MESSAGE_CHARS} characters`;
    }
    total += item.content.length;
  }
  return total > MAX_TOTAL_CHARS ? `message history exceeds ${MAX_TOTAL_CHARS} characters` : null;
}

function buildPrompt(mode, messages, context) {
  const system = mode === 'admin-panel'
    ? 'You are BAIA Operations Assistant for BAIA Palawan. Work read-only. Use only the supplied authorized context. Never invent live operational data. Do not execute destructive or database-changing actions. State clearly when information is unavailable.'
    : 'You are BAIA Guest Concierge for BAIA Palawan in San Vicente, Palawan. Use only approved resort knowledge and supplied guest context. Never expose admin data or invent live prices, availability, schedules, weather, transport times, or booking facts. Direct operational requests to Reception and the existing guest request workflow.';
  const history = messages
    .map(item => `${item.role === 'user' ? 'User' : 'BAIA'}: ${item.content}`)
    .join('\n');
  return `${system}\nMode: ${mode}\nContext: ${JSON.stringify(context || {})}\nConversation:\n${history}\nBAIA:`;
}

function runHermes({ mode, messages, context }, res, origin) {
  const prompt = buildPrompt(mode, messages, context);
  const child = spawn('hermes', ['chat', '-q', prompt], {
    shell: false,
    env: {
      ...process.env,
      HERMES_PROVIDER: APPROVED_PROVIDER,
      HERMES_MODEL: APPROVED_MODEL,
      OLLAMA_MODEL: APPROVED_MODEL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let finished = false;

  const finish = callback => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    callback();
  };

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    finish(() => sendError(res, 504, 'HERMES_TIMEOUT', 'Hermes did not respond within 90 seconds', origin));
  }, TIMEOUT_MS);

  child.stdout.on('data', chunk => {
    outputBytes += chunk.length;
    if (outputBytes > MAX_OUTPUT_BYTES) {
      child.kill('SIGKILL');
      finish(() => sendError(res, 502, 'OUTPUT_TOO_LARGE', 'Hermes response exceeded the output limit', origin));
      return;
    }
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
  child.on('error', error => finish(() => sendError(res, 502, 'HERMES_START_FAILED', error.message, origin)));
  child.on('close', code => finish(() => {
    if (code !== 0) return sendError(res, 502, 'HERMES_FAILED', stderr.trim() || `Hermes exited with code ${code}`, origin);
    const reply = stdout.trim();
    if (!reply) return sendError(res, 502, 'EMPTY_RESPONSE', 'Hermes returned an empty response', origin);
    return sendJson(res, 200, { reply, model: APPROVED_MODEL, provider: APPROVED_PROVIDER }, origin);
  }));
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    if (origin && !allowedOrigins.includes(origin)) return sendError(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed', origin);
    res.writeHead(204, responseHeaders(origin));
    return res.end();
  }

  if (req.method !== 'POST' || req.url !== '/api/hermes/chat') {
    return sendError(res, 404, 'NOT_FOUND', 'Route not found', origin);
  }
  if (origin && !allowedOrigins.includes(origin)) {
    return sendError(res, 403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed', origin);
  }

  const expectedToken = process.env.HERMES_BRIDGE_TOKEN;
  if (!expectedToken) return sendError(res, 503, 'BRIDGE_NOT_CONFIGURED', 'Hermes bridge token is not configured', origin);
  if (req.headers.authorization !== `Bearer ${expectedToken}`) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid bridge credentials', origin);
  }
  if (!validateModelLock()) {
    return sendError(res, 503, 'MODEL_LOCK_FAILED', 'Hermes must use Ollama with qwen2.5:3b only', origin);
  }

  let body = '';
  let bytes = 0;
  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) req.destroy(new Error('REQUEST_TOO_LARGE'));
    else body += chunk.toString('utf8');
  });
  req.on('error', error => {
    if (!res.headersSent) sendError(res, error.message === 'REQUEST_TOO_LARGE' ? 413 : 400, error.message, 'Request could not be read', origin);
  });
  req.on('end', () => {
    if (res.headersSent) return;
    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      return sendError(res, 400, 'INVALID_JSON', 'Request body must be valid JSON', origin);
    }
    if (!MODES.has(payload.mode)) return sendError(res, 400, 'INVALID_MODE', 'mode must be admin-panel or guest-concierge', origin);
    const validationError = validateMessages(payload.messages);
    if (validationError) return sendError(res, 400, 'INVALID_MESSAGES', validationError, origin);
    runHermes(payload, res, origin);
  });
});

server.listen(PORT, () => {
  console.log(`Hermes proxy listening on http://localhost:${PORT} using ${APPROVED_PROVIDER}/${APPROVED_MODEL}`);
});
