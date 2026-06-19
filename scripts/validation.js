// Field validators for the contact form. Each one returns { valid, message }
// so the form can show inline errors. Patterns are exported too so the tests
// can hit them directly.

// letters (incl. accented), separated by space, hyphen or apostrophe
export const NAME_RE =
  /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '\-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

// the two lookaheads cap total length at 254 and the local part at 64,
// which you can't express with a plain character class
export const EMAIL_RE =
  /^(?=.{3,254}$)(?=[^@]{1,64}@)[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

// optional +, 1-3 digit country code, then grouped digits
export const PHONE_RE =
  /^\+?[1-9]\d{0,2}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){1,4}$/;

export const WEBSITE_RE =
  /^(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:[/?#]\S*)?$/;

export const TAGS_RE = /^[A-Za-z0-9][\w-]*(?:\s*,\s*[A-Za-z0-9][\w-]*)*$/;

// \1 back-reference: true when the same tag shows up twice in the list
export const DUPLICATE_TAG_RE = /\b([A-Za-z0-9][\w-]*)\b(?=.*\b\1\b)/i;

const ok = { valid: true, message: '' };
const err = (message) => ({ valid: false, message });

export function validateName(value) {
  const v = value.trim();
  if (!v) return err('Name is required.');
  if (v.length < 2) return err('Name must be at least 2 characters.');
  if (v.length > 80) return err('Name must be 80 characters or fewer.');
  if (!NAME_RE.test(v))
    return err('Use letters only, separated by spaces, hyphens, or apostrophes.');
  return ok;
}

export function validateEmail(value) {
  const v = value.trim();
  if (!v) return err('Email is required.');
  if (!EMAIL_RE.test(v)) return err('Enter a valid email, e.g. ada@example.com.');
  return ok;
}

export function validatePhone(value) {
  const v = value.trim();
  if (!v) return ok;
  if (!PHONE_RE.test(v))
    return err('Enter a valid phone, e.g. +250 788 123 456.');
  return ok;
}

export function validateWebsite(value) {
  const v = value.trim();
  if (!v) return ok;
  if (!WEBSITE_RE.test(v))
    return err('Enter a valid URL, e.g. example.com or https://example.com.');
  return ok;
}

export function validateTags(value) {
  const v = value.trim();
  if (!v) return ok;
  if (!TAGS_RE.test(v))
    return err('Comma-separated tags only, e.g. work, vip, lead.');
  if (DUPLICATE_TAG_RE.test(v))
    return err('Remove the duplicated tag.');
  return ok;
}

// field name -> validator, so the form can loop over them
export const validators = {
  name: validateName,
  email: validateEmail,
  phone: validatePhone,
  website: validateWebsite,
  tags: validateTags,
};

export function validateContact(payload) {
  const errors = {};
  for (const [field, fn] of Object.entries(validators)) {
    const result = fn(payload[field] ?? '');
    if (!result.valid) errors[field] = result.message;
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// turn the raw tags string into a clean, de-duplicated array
export function parseTags(value) {
  const seen = new Set();
  const out = [];
  for (const raw of String(value || '').split(',')) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
