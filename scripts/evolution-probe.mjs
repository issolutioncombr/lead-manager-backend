import fs from 'node:fs';
import path from 'node:path';

function readEnvFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const k = trimmed.slice(0, idx).trim();
    let v = trimmed.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function maskJid(jid) {
  const left = String(jid ?? '').split('@')[0];
  const digits = left.replace(/\D+/g, '');
  if (digits.length < 4) return 'jid';
  return `${digits.slice(0, 2)}*****${digits.slice(-2)}@${String(jid ?? '').split('@')[1] ?? 'jid'}`;
}

async function fetchJson(url, init) {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, json };
}

async function main() {
  const envPath = path.join(process.cwd(), '.env');
  const env = readEnvFile(envPath);
  const baseUrl = String(env.EVOLUTION_API_URL ?? '').replace(/\/$/, '');
  const apiKey = String(env.EVOLUTION_API_KEY ?? '');
  if (!baseUrl || !apiKey) {
    console.error('EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes em .env');
    process.exit(1);
  }

  const root = await fetchJson(`${baseUrl}/`, { method: 'GET', headers: { apikey: apiKey } });
  console.log('root', root.status, root.json?.version ?? null);

  const instances = await fetchJson(`${baseUrl}/instance/fetchInstances`, { method: 'GET', headers: { apikey: apiKey } });
  console.log('fetchInstances', instances.status, Array.isArray(instances.json) ? instances.json.length : null);
  const first = Array.isArray(instances.json) ? instances.json[0] : null;
  if (!first) {
    console.log('Sem instâncias retornadas.');
    return;
  }

  const instanceName = String(first.instanceName ?? first.name ?? '');
  const instanceId = String(first.id ?? '');
  console.log('instance candidates', { instanceName: instanceName || null, id: instanceId || null });

  const chatTargets = [instanceName, instanceId].filter(Boolean);
  for (const target of chatTargets) {
    const chats = await fetchJson(`${baseUrl}/chat/findChats/${encodeURIComponent(target)}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: {}, limit: 20 })
    });
    console.log('findChats', target === instanceName ? 'instanceName' : 'id', chats.status, {
      chats: Array.isArray(chats.json?.chats) ? chats.json.chats.length : Array.isArray(chats.json?.data) ? chats.json.data.length : Array.isArray(chats.json) ? chats.json.length : null
    });
  }

  const remoteJid = '553285155159@s.whatsapp.net';
  for (const target of chatTargets) {
    const messages = await fetchJson(`${baseUrl}/chat/findMessages/${encodeURIComponent(target)}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid } }, limit: 20 })
    });
    const shape = (() => {
      const j = messages.json ?? {};
      const paths = {
        'messages.records': Array.isArray(j?.messages?.records) ? j.messages.records.length : null,
        messages: Array.isArray(j?.messages) ? j.messages.length : null,
        records: Array.isArray(j?.records) ? j.records.length : null,
        data: Array.isArray(j?.data) ? j.data.length : null,
        items: Array.isArray(j?.items) ? j.items.length : null,
        result: Array.isArray(j?.result) ? j.result.length : null
      };
      return { keys: Object.keys(j), paths };
    })();
    const arr =
      Array.isArray(messages.json?.messages) ? messages.json.messages
      : Array.isArray(messages.json?.data) ? messages.json.data
      : Array.isArray(messages.json) ? messages.json
      : null;
    const sample = Array.isArray(arr) && arr.length
      ? {
          count: arr.length,
          sample: {
            fromMe: !!arr[0]?.key?.fromMe,
            id: arr[0]?.key?.id ?? arr[0]?.id ?? null,
            remoteJid: maskJid(arr[0]?.key?.remoteJid ?? remoteJid),
            messageTimestamp: arr[0]?.messageTimestamp ?? null,
            hasConversation: !!(arr[0]?.message?.conversation ?? arr[0]?.message?.extendedTextMessage?.text),
            hasMedia: !!(arr[0]?.message?.imageMessage?.url ?? arr[0]?.message?.videoMessage?.url ?? arr[0]?.message?.documentMessage?.url)
          }
        }
      : { count: Array.isArray(arr) ? arr.length : null };
    console.log('findMessages', target === instanceName ? 'instanceName' : 'id', messages.status, { shape, sample });
  }

  const all = Array.isArray(instances.json) ? instances.json : [];
  const needle = '553285155159@s.whatsapp.net';
  const hits = [];
  for (const inst of all) {
    const n = String(inst.instanceName ?? inst.name ?? '').trim();
    if (!n) continue;
    const chat = await fetchJson(`${baseUrl}/chat/findChats/${encodeURIComponent(n)}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { remoteJid: needle }, limit: 1 })
    });
    const chatArr =
      Array.isArray(chat.json?.chats) ? chat.json.chats
      : Array.isArray(chat.json?.data) ? chat.json.data
      : Array.isArray(chat.json) ? chat.json
      : Array.isArray(chat.json?.records) ? chat.json.records
      : null;
    const chatCount = Array.isArray(chatArr) ? chatArr.length : null;
    const msg = await fetchJson(`${baseUrl}/chat/findMessages/${encodeURIComponent(n)}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ where: { key: { remoteJid: needle } }, limit: 1 })
    });
    const msgCount = Array.isArray(msg.json?.messages?.records) ? msg.json.messages.records.length : null;
    if ((chatCount && chatCount > 0) || (msgCount && msgCount > 0)) {
      hits.push({ instanceName: n, chatCount, msgCount });
    }
  }
  console.log('lookup remoteJid', maskJid(needle), hits);
}

main().catch((e) => {
  console.error('probe failed', e?.message ?? e);
  process.exit(1);
});
