// Rendering. Paints the master list and the detail panel from store snapshots.
// No storage or validation in here.

import { highlight, escapeHTML } from './search.js';

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// soft pastel avatar colours, picked deterministically so a person keeps theirs
const AVATAR_COLORS = [
  ['#FDE3DE', '#C73A2B'], ['#E2EEFF', '#2C5FD6'], ['#FFF0D2', '#B07414'],
  ['#E2F6EA', '#1C8A56'], ['#EEE6FF', '#6A41C4'], ['#FFE6F0', '#BE3A74'],
  ['#DFF5F2', '#11888A'], ['#FCEFD9', '#C2691A'],
];

function hashInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function avatar(seed, name, cls = '') {
  const [bg, fg] = AVATAR_COLORS[hashInt(seed) % AVATAR_COLORS.length];
  return `<span class="avatar ${cls}" aria-hidden="true" style="background:${bg};color:${fg}">${escapeHTML(initials(name))}</span>`;
}

function tagPill(text, regex) {
  const [bg, fg] = AVATAR_COLORS[hashInt(text.toLowerCase()) % AVATAR_COLORS.length];
  return `<li class="pill" style="background:${bg};color:${fg}">${highlight(text, regex)}</li>`;
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function normalizeUrl(url) { return /^https?:\/\//i.test(url) ? url : 'https://' + url; }
function prettyUrl(url) { return String(url).replace(/^https?:\/\//i, '').replace(/\/$/, ''); }
function telHref(phone) { return phone.replace(/[^\d+]/g, ''); }

/* ---- master list ---- */

export function renderList(els, view, selectedId, handlers) {
  const { listEl, countEl, emptyEl, navCount } = els;

  if (navCount) navCount.textContent = view.total;
  if (view.total === 0) countEl.textContent = '';
  else if (view.query.trim() || view.searchError)
    countEl.textContent = `${view.visible} of ${view.total} ${plural(view.total, 'contact')}`;
  else countEl.textContent = `${view.total} ${plural(view.total, 'contact')}`;

  if (view.visible === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.innerHTML = emptyState(view);
    const cta = emptyEl.querySelector('[data-action="add"]');
    if (cta) cta.addEventListener('click', handlers.onAdd);
    return;
  }

  emptyEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const c of view.contacts) {
    const li = document.createElement('li');
    li.className = 'person' + (c.id === selectedId ? ' is-active' : '');
    li.innerHTML = `
      <button type="button" class="person__btn" data-id="${c.id}">
        ${avatar(c.email || c.name, c.name, 'avatar--sm')}
        <span class="person__text">
          <span class="person__name">${highlight(c.name, view.regex)}</span>
          <span class="person__sub">${highlight(c.email, view.regex)}</span>
        </span>
      </button>`;
    li.querySelector('.person__btn').addEventListener('click', () => handlers.onSelect(c.id));
    frag.appendChild(li);
  }
  listEl.appendChild(frag);
}

function emptyState(view) {
  if (view.searchError)
    return `<div class="empty"><span class="empty__icon empty__icon--warn">${icon('alert')}</span>
      <h2 class="empty__title">Search couldn’t run</h2><p class="empty__body">${escapeHTML(view.searchError)}</p></div>`;
  if (view.query.trim())
    return `<div class="empty"><span class="empty__icon">${icon('search')}</span>
      <h2 class="empty__title">No matches</h2><p class="empty__body">Nothing matched “${escapeHTML(view.query)}”.</p></div>`;
  return `<div class="empty"><span class="empty__icon">${icon('users')}</span>
      <h2 class="empty__title">No contacts yet</h2>
      <p class="empty__body">Add your first contact or import a JSON backup.</p>
      <button type="button" class="btn btn--primary" data-action="add">${icon('plus')}<span>Add contact</span></button></div>`;
}

/* ---- detail panel ---- */

export function renderDetail(detailEl, contact, view, state, handlers) {
  if (!contact) {
    detailEl.innerHTML = `
      <div class="detail__empty">
        <span class="detail__empty-icon">${icon('users')}</span>
        <h2>No contact selected</h2>
        <p>Pick someone from the list to see their details here.</p>
      </div>`;
    return;
  }

  const regex = view.regex;
  const tab = state.tab || 'notes';

  const infoRow = (label, valueHtml) =>
    `<div class="info-row"><dt>${label}</dt><dd>${valueHtml}</dd></div>`;

  const email = `<a href="mailto:${escapeHTML(contact.email)}">${highlight(contact.email, regex)}</a>`;
  const phone = contact.phone
    ? `<a href="tel:${escapeHTML(telHref(contact.phone))}">${highlight(contact.phone, regex)}</a>`
    : '<span class="muted">—</span>';
  const website = contact.website
    ? `<a href="${escapeHTML(normalizeUrl(contact.website))}" target="_blank" rel="noopener noreferrer">${highlight(prettyUrl(contact.website), regex)}</a>`
    : '<span class="muted">—</span>';
  const tags = (contact.tags || []).length
    ? `<ul class="pills">${contact.tags.map((t) => tagPill(t, regex)).join('')}</ul>`
    : '<span class="muted">—</span>';

  const notesPanel = `
    <div class="notes">
      <label for="detail-notes" class="visually-hidden">Notes for ${escapeHTML(contact.name)}</label>
      <textarea id="detail-notes" class="notes__area" rows="6"
        placeholder="Add a note about ${escapeHTML(contact.name)}…">${escapeHTML(contact.notes || '')}</textarea>
      <div class="notes__foot">
        <span class="notes__hint" id="notes-status">Saved automatically</span>
        <button type="button" id="notes-save" class="btn btn--ghost btn--sm">${icon('check')}<span>Save</span></button>
      </div>
    </div>`;

  const detailsPanel = `
    <dl class="meta-list">
      ${infoRow('Added', escapeHTML(fmtDate(contact.createdAt)))}
      ${infoRow('Last updated', escapeHTML(fmtDate(contact.updatedAt)))}
      ${infoRow('Tags', tags)}
    </dl>`;

  detailEl.innerHTML = `
    <div class="detail__inner">
      <button type="button" class="detail__back" id="detail-back">${icon('back')}<span>Back</span></button>

      <header class="detail__head">
        ${avatar(contact.email || contact.name, contact.name, 'avatar--xl')}
        <div class="detail__id">
          <h2 class="detail__name">${highlight(contact.name, regex)}</h2>
          <p class="detail__phone">${contact.phone ? highlight(contact.phone, regex) : highlight(contact.email, regex)}</p>
        </div>
        <div class="detail__actions">
          <button type="button" class="icon-btn" id="detail-edit" aria-label="Edit ${escapeHTML(contact.name)}" title="Edit">${icon('edit')}</button>
          <button type="button" class="icon-btn icon-btn--danger" id="detail-delete" aria-label="Delete ${escapeHTML(contact.name)}" title="Delete">${icon('trash')}</button>
          ${contact.phone ? `<a class="btn btn--call" href="tel:${escapeHTML(telHref(contact.phone))}">${icon('phone')}<span>Call</span></a>` : ''}
        </div>
      </header>

      <dl class="info">
        ${infoRow('Email', email)}
        ${infoRow('Phone', phone)}
        ${infoRow('Website', website)}
        ${infoRow('Tags', tags)}
      </dl>

      <div class="tabs" role="tablist">
        <button type="button" class="tab ${tab === 'notes' ? 'is-active' : ''}" data-tab="notes" role="tab" aria-selected="${tab === 'notes'}">${icon('note')}<span>Notes</span></button>
        <button type="button" class="tab ${tab === 'details' ? 'is-active' : ''}" data-tab="details" role="tab" aria-selected="${tab === 'details'}">${icon('info')}<span>Details</span></button>
      </div>

      <div class="tab-panel">${tab === 'notes' ? notesPanel : detailsPanel}</div>
    </div>`;

  detailEl.querySelector('#detail-back').addEventListener('click', handlers.onBack);
  detailEl.querySelector('#detail-edit').addEventListener('click', () => handlers.onEdit(contact.id));
  detailEl.querySelector('#detail-delete').addEventListener('click', () => handlers.onDelete(contact.id));
  detailEl.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => handlers.onTab(t.dataset.tab)));

  if (tab === 'notes') {
    const area = detailEl.querySelector('#detail-notes');
    const status = detailEl.querySelector('#notes-status');
    const save = () => { handlers.onSaveNotes(contact.id, area.value); status.textContent = 'Saved'; };
    detailEl.querySelector('#notes-save').addEventListener('click', save);
    area.addEventListener('blur', save);
    area.addEventListener('input', () => { status.textContent = 'Unsaved changes'; });
  }
}

function plural(n, word) { return n === 1 ? word : word + 's'; }

export function announce(liveEl, message) {
  liveEl.textContent = '';
  requestAnimationFrame(() => { liveEl.textContent = message; });
}

export function toast(rootEl, message, { kind = 'info', timeout = 4000 } = {}) {
  const iconName = kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'info';
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(iconName, 'toast__icon')}<span class="toast__msg"></span>`;
  el.querySelector('.toast__msg').textContent = message;
  rootEl.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  const close = () => {
    el.classList.remove('toast--in');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  };
  setTimeout(close, timeout);
  el.addEventListener('click', close);
}

export const _ui = { initials, hashInt, avatar, normalizeUrl, prettyUrl, plural };
