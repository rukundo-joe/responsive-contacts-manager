// Ties the store to the page: master/detail selection, the responsive sidebar,
// the add/edit dialog with live validation, delete, import/export, notes,
// theme, the first-run guide, and keyboard shortcuts.

import { createStore, SORTS } from './state.js';
import { renderList, renderDetail, announce, toast } from './ui.js';
import { validators, validateContact, parseTags } from './validation.js';
import { exportJSON, importJSON } from './storage.js';

const $ = (sel, root = document) => root.querySelector(sel);
const isMobile = () => matchMedia('(max-width: 860px)').matches;

const store = createStore();

const els = {
  app: $('#app'),
  sidebar: $('#sidebar'),
  scrim: $('#scrim'),
  listPane: $('#list-pane'),
  detailPane: $('#detail-pane'),
  detailContent: $('#detail-content'),
  listEl: $('#contact-list'),
  countEl: $('#result-count'),
  emptyEl: $('#empty-state'),
  navCount: $('#nav-count'),
  live: $('#live-region'),
  toastRoot: $('#toast-root'),
  search: $('#search-input'),
  regexToggle: $('#regex-toggle'),
  sortSelect: $('#sort-select'),
  dialog: $('#contact-dialog'),
  form: $('#contact-form'),
  dialogTitle: $('#dialog-title'),
  submitBtn: $('#form-submit'),
  delDialog: $('#delete-dialog'),
  delName: $('#delete-name'),
  delConfirm: $('#delete-confirm'),
  importDialog: $('#import-dialog'),
  intro: $('#intro-dialog'),
  themeToggle: $('#theme-toggle'),
  importInput: $('#import-input'),
};

let selectedId = null;
let tab = 'notes';
let editingId = null;
let pendingDeleteId = null;
let pendingImport = null;
let lastFocused = null;

const listHandlers = { onSelect: selectContact, onAdd: () => openDialog(null) };
const detailHandlers = {
  onBack: backToList,
  onEdit: (id) => openDialog(id),
  onDelete: (id) => openDeleteDialog(id),
  onTab: (t) => { tab = t; renderAll(); },
  onSaveNotes: (id, text) => { store.update(id, { notes: text }); },
};

function renderAll() {
  const view = store.getView();
  if (selectedId && !store.getById(selectedId)) selectedId = null;
  renderList(els, view, selectedId, listHandlers);
  renderDetail(els.detailContent, selectedId ? store.getById(selectedId) : null, view, { tab }, detailHandlers);
  if (els.sortSelect.value !== view.sortId) els.sortSelect.value = view.sortId;
}

store.subscribe(renderAll);

function selectContact(id) {
  selectedId = id;
  tab = 'notes';
  renderAll();
  if (isMobile()) { els.app.classList.add('show-detail'); els.detailPane.focus(); }
}

function backToList() {
  els.app.classList.remove('show-detail');
  els.listPane.focus();
}

// auto-select the first contact on a wide screen so the detail pane isn't blank
(function initSelection() {
  const view = store.getView();
  if (!isMobile() && view.total > 0) { selectedId = view.contacts[0].id; renderAll(); }
})();

// --- sidebar drawer (mobile) ---
function openSidebar() { els.sidebar.classList.add('open'); els.scrim.hidden = false; }
function closeSidebar() { els.sidebar.classList.remove('open'); els.scrim.hidden = true; }
$('#menu-btn').addEventListener('click', openSidebar);
$('#sidebar-close').addEventListener('click', closeSidebar);
els.scrim.addEventListener('click', closeSidebar);

// --- search + sort ---
let searchDebounce;
els.search.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const val = e.target.value;
  searchDebounce = setTimeout(() => {
    store.setQuery(val);
    const v = store.getView();
    if (val.trim()) announce(els.live, v.searchError ? v.searchError : `${v.visible} ${v.visible === 1 ? 'result' : 'results'} for ${val}`);
  }, 180);
});

els.regexToggle.addEventListener('change', (e) => {
  store.setRegexMode(e.target.checked);
  els.search.setAttribute('placeholder', e.target.checked ? 'Regex search, e.g. ^a|gmail\\.com' : 'Search name, email, phone, tags…');
});

for (const [id, s] of Object.entries(SORTS)) {
  const opt = document.createElement('option');
  opt.value = id; opt.textContent = s.label;
  els.sortSelect.appendChild(opt);
}
els.sortSelect.value = 'created-desc';
els.sortSelect.addEventListener('change', (e) => store.setSort(e.target.value));

// --- add / edit ---
$('#add-btn').addEventListener('click', () => openDialog(null));

function openDialog(id) {
  editingId = id;
  lastFocused = document.activeElement;
  els.form.reset();
  clearAllErrors();
  if (id) {
    const c = store.getById(id);
    if (!c) return;
    els.dialogTitle.textContent = 'Edit contact';
    els.submitBtn.textContent = 'Save changes';
    els.form.name.value = c.name;
    els.form.email.value = c.email;
    els.form.phone.value = c.phone;
    els.form.website.value = c.website;
    els.form.tags.value = (c.tags || []).join(', ');
  } else {
    els.dialogTitle.textContent = 'Add contact';
    els.submitBtn.textContent = 'Add contact';
  }
  els.dialog.showModal();
  els.form.name.focus();
}

for (const field of Object.keys(validators)) {
  const input = els.form[field];
  if (!input) continue;
  input.addEventListener('blur', () => validateField(field));
  input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true') validateField(field); });
}

function validateField(field) {
  const input = els.form[field];
  const errEl = $(`#err-${field}`);
  const { valid, message } = validators[field](input.value);
  input.setAttribute('aria-invalid', String(!valid));
  errEl.textContent = valid ? '' : message;
  return valid;
}

function clearAllErrors() {
  for (const field of Object.keys(validators)) {
    els.form[field].setAttribute('aria-invalid', 'false');
    $(`#err-${field}`).textContent = '';
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const payload = {
    name: els.form.name.value.trim(),
    email: els.form.email.value.trim(),
    phone: els.form.phone.value.trim(),
    website: els.form.website.value.trim(),
    tags: els.form.tags.value,
  };
  const { valid, errors } = validateContact(payload);
  if (!valid) {
    for (const field of Object.keys(validators)) validateField(field);
    els.form[Object.keys(errors)[0]].focus();
    announce(els.live, 'Please fix the highlighted fields.');
    return;
  }
  const record = { ...payload, tags: parseTags(payload.tags) };
  const res = editingId ? store.update(editingId, record) : store.add(record);
  if (!res.ok) { toast(els.toastRoot, res.error || 'Could not save.', { kind: 'error' }); return; }
  const wasEditing = editingId;
  els.dialog.close();
  const msg = wasEditing ? `Saved ${record.name}.` : `Added ${record.name}.`;
  announce(els.live, msg);
  toast(els.toastRoot, msg, { kind: 'success' });
  if (!wasEditing && res.contact) selectContact(res.contact.id);
});

$('#form-cancel').addEventListener('click', () => els.dialog.close());
$('#form-cancel-2').addEventListener('click', () => els.dialog.close());
els.dialog.addEventListener('close', () => lastFocused?.focus?.());

// --- delete ---
function openDeleteDialog(id) {
  const c = store.getById(id);
  if (!c) return;
  pendingDeleteId = id;
  lastFocused = document.activeElement;
  els.delName.textContent = c.name;
  els.delDialog.showModal();
  els.delConfirm.focus();
}

els.delConfirm.addEventListener('click', () => {
  if (!pendingDeleteId) return;
  const c = store.getById(pendingDeleteId);
  const wasSelected = pendingDeleteId === selectedId;
  const res = store.remove(pendingDeleteId);
  els.delDialog.close();
  if (res.removed) {
    if (wasSelected) { selectedId = null; els.app.classList.remove('show-detail'); renderAll(); }
    const msg = `Deleted ${c?.name || 'contact'}.`;
    announce(els.live, msg);
    toast(els.toastRoot, msg, { kind: 'info' });
  }
  pendingDeleteId = null;
});

$('#delete-cancel').addEventListener('click', () => els.delDialog.close());
$('#delete-cancel-x').addEventListener('click', () => els.delDialog.close());
els.delDialog.addEventListener('close', () => lastFocused?.focus?.());

// --- export / import ---
$('#export-btn').addEventListener('click', () => {
  if (isMobile()) closeSidebar();
  const blob = new Blob([exportJSON(store.raw)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(els.toastRoot, `Exported ${store.raw.length} contacts.`, { kind: 'success' });
});

$('#import-btn').addEventListener('click', () => els.importInput.click());

els.importInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  let text;
  try { text = await file.text(); } catch { toast(els.toastRoot, 'Could not read that file.', { kind: 'error' }); return; }
  const result = importJSON(text);
  els.importInput.value = '';
  if (!result.ok) { toast(els.toastRoot, result.error, { kind: 'error' }); return; }
  if (isMobile()) closeSidebar();
  if (store.raw.length === 0) { applyImport(result, 'replace'); return; }
  pendingImport = result;
  lastFocused = document.activeElement;
  $('#import-summary').textContent =
    `This file has ${result.contacts.length} ${result.contacts.length === 1 ? 'contact' : 'contacts'}. You currently have ${store.raw.length}.`;
  els.importDialog.showModal();
  $('#import-merge').focus();
});

function applyImport(result, mode) {
  const res = store.replaceAll(result.contacts, mode);
  const skipNote = result.skipped ? ` (${result.skipped} skipped)` : '';
  const verb = mode === 'merge' ? 'Merged' : 'Imported';
  announce(els.live, `${verb} ${result.contacts.length} contacts${skipNote}. ${res.count} total.`);
  toast(els.toastRoot, `${verb} ${result.contacts.length} contacts${skipNote}.`, { kind: 'success' });
}

$('#import-merge').addEventListener('click', () => { if (pendingImport) applyImport(pendingImport, 'merge'); pendingImport = null; els.importDialog.close(); });
$('#import-replace').addEventListener('click', () => { if (pendingImport) applyImport(pendingImport, 'replace'); pendingImport = null; els.importDialog.close(); });
$('#import-cancel').addEventListener('click', () => els.importDialog.close());
$('#import-cancel-x').addEventListener('click', () => els.importDialog.close());
els.importDialog.addEventListener('close', () => { pendingImport = null; lastFocused?.focus?.(); });

// --- first-run guide ---
const GUIDE_KEY = 'rcm:seen-guide';
function openGuide() { lastFocused = document.activeElement; if (isMobile()) closeSidebar(); els.intro.showModal(); $('#intro-start').focus(); }
els.intro.addEventListener('close', () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch {} lastFocused?.focus?.(); });
$('#intro-start').addEventListener('click', () => els.intro.close());
$('#intro-close').addEventListener('click', () => els.intro.close());
$('#open-guide').addEventListener('click', openGuide);
let guideSeen = true;
try { guideSeen = !!localStorage.getItem(GUIDE_KEY); } catch {}
if (!guideSeen) openGuide();

// --- theme ---
const THEME_KEY = 'rcm:theme';
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
  els.themeToggle.querySelector('.theme-toggle__label').textContent = theme === 'dark' ? 'Dark' : 'Light';
}
try {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
} catch { applyTheme('light'); }
els.themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
});

// --- shortcuts ---
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  const dialogOpen = els.dialog.open || els.delDialog.open || els.intro.open || els.importDialog.open;
  if (e.key === '/' && !typing && !dialogOpen) { e.preventDefault(); els.search.focus(); }
  else if ((e.key === 'n' || e.key === 'N') && !typing && !dialogOpen) { e.preventDefault(); openDialog(null); }
  else if (e.key === 'Escape' && document.activeElement === els.search && els.search.value) { els.search.value = ''; store.setQuery(''); }
});
