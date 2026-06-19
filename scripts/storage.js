// Everything that touches localStorage and JSON files. Reads are defensive on
// purpose: a corrupt or hand-edited store should never throw, it just falls
// back to an empty list.

const STORAGE_KEY = 'rcm:contacts:v1';
const SCHEMA_VERSION = 1;

function isContactLike(x) {
  return (
    x &&
    typeof x === 'object' &&
    typeof x.name === 'string' &&
    typeof x.email === 'string'
  );
}

// fill in defaults for anything missing/wrong on an untrusted record
function normalize(x, now) {
  return {
    id: typeof x.id === 'string' && x.id ? x.id : cryptoId(),
    name: String(x.name ?? '').trim(),
    email: String(x.email ?? '').trim(),
    phone: String(x.phone ?? '').trim(),
    website: String(x.website ?? '').trim(),
    notes: String(x.notes ?? ''),
    tags: Array.isArray(x.tags)
      ? x.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
    createdAt: Number.isFinite(x.createdAt) ? x.createdAt : now,
    updatedAt: Number.isFinite(x.updatedAt) ? x.updatedAt : now,
  };
}

export function cryptoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function loadContacts() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return []; // storage blocked (private mode etc.)
  }
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // bad JSON, start clean
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.contacts;
  if (!Array.isArray(list)) return [];

  const now = Date.now();
  return list.filter(isContactLike).map((x) => normalize(x, now));
}

export function saveContacts(contacts) {
  try {
    const envelope = {
      schema: SCHEMA_VERSION,
      exportedAt: Date.now(),
      contacts,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.name === 'QuotaExceededError'
      ? 'Storage is full. Export and prune some contacts.'
      : 'Could not save to this browser.' };
  }
}

export function exportJSON(contacts) {
  return JSON.stringify(
    { schema: SCHEMA_VERSION, exportedAt: Date.now(), contacts },
    null,
    2
  );
}

// accepts either a bare array or a { contacts: [...] } wrapper
export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const list = Array.isArray(data) ? data : data?.contacts;
  if (!Array.isArray(list)) {
    return { ok: false, error: 'Expected an array of contacts or a { contacts: [...] } object.' };
  }

  const valid = list.filter(isContactLike);
  if (valid.length === 0) {
    return { ok: false, error: 'No valid contacts found in that file.' };
  }

  const now = Date.now();
  const contacts = valid.map((x) => normalize(x, now));
  const skipped = list.length - valid.length;
  return { ok: true, contacts, skipped };
}

export const _internals = { STORAGE_KEY, SCHEMA_VERSION, isContactLike, normalize };
