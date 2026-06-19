// Search: builds a RegExp from what the user typed, filters contacts with it,
// and highlights the matches. Regex mode is guarded so a bad or evil pattern
// can't hang the page.

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const MAX_QUERY = 200;

// rough check for the patterns that blow up with exponential backtracking,
// e.g. (a+)+ or (.*)*. Not exhaustive, just a shield for a search box.
function looksDangerous(pattern) {
  if (/\([^)]*[+*][^)]*\)\s*[*+?]?[*+{]/.test(pattern)) return true;
  if (/[+*]\s*[+*]/.test(pattern)) return true;
  return false;
}

export function compileSearch(query, { regexMode = false } = {}) {
  const q = String(query ?? '');
  if (!q) return { ok: false, error: 'empty' };
  if (q.length > MAX_QUERY) {
    return { ok: false, error: `Search is limited to ${MAX_QUERY} characters.` };
  }

  // plain mode: escape it and do a case-insensitive substring match
  if (!regexMode) {
    return { ok: true, regex: new RegExp(escapeRegExp(q), 'gi') };
  }

  if (looksDangerous(q)) {
    return { ok: false, error: 'That pattern is too risky to run safely.' };
  }
  try {
    return { ok: true, regex: new RegExp(q, 'gi') };
  } catch (e) {
    return { ok: false, error: 'Invalid regular expression.' };
  }
}

const SEARCH_FIELDS = ['name', 'email', 'phone', 'website'];

export function filterContacts(contacts, regex) {
  return contacts.filter((c) => {
    const hay = [
      ...SEARCH_FIELDS.map((f) => c[f] || ''),
      (c.tags || []).join(' '),
    ].join('  ');
    regex.lastIndex = 0;
    return regex.test(hay);
  });
}

export function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// wrap matches in <mark>. Text is escaped first so the result is safe to drop
// in with innerHTML.
export function highlight(text, regex) {
  const safeText = String(text ?? '');
  if (!regex) return escapeHTML(safeText);

  let out = '';
  let last = 0;
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(safeText)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    out += escapeHTML(safeText.slice(last, start));
    out += '<mark>' + escapeHTML(safeText.slice(start, end)) + '</mark>';
    last = end;
    if (m[0].length === 0) regex.lastIndex++; // avoid looping on empty matches
  }
  out += escapeHTML(safeText.slice(last));
  return out;
}
