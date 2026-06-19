// The store. Holds the contacts plus the current search/sort, works out what
// should be on screen, and writes through to storage on every change. The UI
// subscribes to it and never touches the array itself.

import { loadContacts, saveContacts, cryptoId } from './storage.js';
import { compileSearch, filterContacts } from './search.js';

export const SORTS = {
  'name-asc': { label: 'Name (A → Z)', key: 'name', dir: 'asc' },
  'name-desc': { label: 'Name (Z → A)', key: 'name', dir: 'desc' },
  'created-desc': { label: 'Newest first', key: 'createdAt', dir: 'desc' },
  'created-asc': { label: 'Oldest first', key: 'createdAt', dir: 'asc' },
  'updated-desc': { label: 'Recently updated', key: 'updatedAt', dir: 'desc' },
};

function compare(a, b, key, dir) {
  let av = a[key];
  let bv = b[key];
  if (typeof av === 'string') av = av.toLowerCase();
  if (typeof bv === 'string') bv = bv.toLowerCase();
  let cmp = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === 'desc' ? -cmp : cmp;
}

export function createStore() {
  let contacts = loadContacts();
  let query = '';
  let regexMode = false;
  let sortId = 'created-desc';
  let searchError = '';

  const subscribers = new Set();

  function persist() {
    return saveContacts(contacts);
  }

  function emit() {
    const snap = getView();
    subscribers.forEach((fn) => fn(snap));
  }

  // build the filtered + sorted list for the current query/sort
  function getView() {
    const sort = SORTS[sortId] ?? SORTS['created-desc'];
    let list = contacts.slice();

    let regex = null;
    searchError = '';
    if (query.trim()) {
      const compiled = compileSearch(query.trim(), { regexMode });
      if (compiled.ok) {
        regex = compiled.regex;
        list = filterContacts(list, regex);
      } else if (compiled.error !== 'empty') {
        searchError = compiled.error;
        list = []; // bad query -> no results, plus a message
      }
    }

    list.sort((a, b) => compare(a, b, sort.key, sort.dir));

    return {
      contacts: list,
      total: contacts.length,
      visible: list.length,
      query,
      regexMode,
      regex,
      sortId,
      searchError,
    };
  }

  function add(payload) {
    const now = Date.now();
    const contact = { id: cryptoId(), createdAt: now, updatedAt: now, ...payload };
    contacts.push(contact);
    const res = persist();
    emit();
    return { ...res, contact };
  }

  function update(id, payload) {
    const i = contacts.findIndex((c) => c.id === id);
    if (i === -1) return { ok: false, error: 'Contact not found.' };
    contacts[i] = { ...contacts[i], ...payload, updatedAt: Date.now() };
    const res = persist();
    emit();
    return { ...res, contact: contacts[i] };
  }

  function remove(id) {
    const before = contacts.length;
    contacts = contacts.filter((c) => c.id !== id);
    const removed = before !== contacts.length;
    const res = persist();
    emit();
    return { ...res, removed };
  }

  function getById(id) {
    return contacts.find((c) => c.id === id) || null;
  }

  // used by import. mode 'merge' keeps existing and overwrites by email.
  function replaceAll(next, mode = 'replace') {
    if (mode === 'merge') {
      const byEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c]));
      for (const c of next) byEmail.set(c.email.toLowerCase(), c);
      contacts = [...byEmail.values()];
    } else {
      contacts = next.slice();
    }
    const res = persist();
    emit();
    return { ...res, count: contacts.length };
  }

  function setQuery(q) { query = q; emit(); }
  function setRegexMode(on) { regexMode = !!on; emit(); }
  function setSort(id) { if (SORTS[id]) sortId = id; emit(); }

  function subscribe(fn) {
    subscribers.add(fn);
    fn(getView());
    return () => subscribers.delete(fn);
  }

  return {
    subscribe, getView, getById,
    add, update, remove, replaceAll,
    setQuery, setRegexMode, setSort,
    get raw() { return contacts.slice(); },
  };
}
