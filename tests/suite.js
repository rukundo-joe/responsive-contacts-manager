// All the test cases live here so the same set can run under Node
// (tests/test.js) and in the browser (tests/tests.html). The runner passes in
// its own test() + assert helpers.
import {
  validateName, validateEmail, validatePhone, validateWebsite, validateTags,
  validateContact, parseTags, DUPLICATE_TAG_RE, EMAIL_RE,
} from '../scripts/validation.js';
import {
  escapeRegExp, compileSearch, filterContacts, highlight, escapeHTML,
} from '../scripts/search.js';
import { exportJSON, importJSON } from '../scripts/storage.js';

export function registerTests(test, assert) {
  // validation: name
  test('name accepts letters, spaces, hyphens, apostrophes', () => {
    assert.ok(validateName("Ada Lovelace").valid);
    assert.ok(validateName("Jean-Luc Picard").valid);
    assert.ok(validateName("O'Brien").valid);
    assert.ok(validateName("Zoë Müller").valid);
  });
  test('name rejects digits, empties, and too-short', () => {
    assert.ok(!validateName("R2D2").valid);
    assert.ok(!validateName("").valid);
    assert.ok(!validateName("A").valid);
  });

  // validation: email (advanced lookahead)
  test('email accepts valid addresses', () => {
    assert.ok(validateEmail("ada@example.com").valid);
    assert.ok(validateEmail("a.b+tag@sub.domain.co").valid);
  });
  test('email rejects malformed addresses', () => {
    for (const bad of ["plainaddress", "a@b", "@x.com", "a@@b.com", "a b@x.com"]) {
      assert.ok(!validateEmail(bad).valid, `should reject ${bad}`);
    }
  });
  test('email lookahead enforces 64-char local-part limit', () => {
    const longLocal = "a".repeat(65) + "@x.com";
    assert.ok(!EMAIL_RE.test(longLocal));
    assert.ok(EMAIL_RE.test("a".repeat(64) + "@x.com"));
  });

  // validation: phone / website / tags
  test('phone accepts international formats, optional', () => {
    assert.ok(validatePhone("").valid);
    assert.ok(validatePhone("+250 788 123 456").valid);
    assert.ok(validatePhone("+1 (415) 555-2671").valid);
    assert.ok(!validatePhone("phone").valid);
  });
  test('website accepts bare and full URLs', () => {
    assert.ok(validateWebsite("example.com").valid);
    assert.ok(validateWebsite("https://www.example.com/path?q=1").valid);
    assert.ok(!validateWebsite("not a url").valid);
  });
  test('tags backreference flags duplicates', () => {
    assert.ok(validateTags("work, vip, lead").valid);
    assert.ok(!validateTags("vip, work, vip").valid);
    assert.ok(DUPLICATE_TAG_RE.test("a, b, a"));
    assert.ok(!DUPLICATE_TAG_RE.test("a, b, c"));
  });
  test('parseTags trims and de-duplicates case-insensitively', () => {
    assert.deepEqual(parseTags("work,  VIP , work, vip"), ["work", "VIP"]);
  });
  test('validateContact aggregates field errors', () => {
    const { valid, errors } = validateContact({ name: "", email: "bad" });
    assert.ok(!valid);
    assert.ok(errors.name && errors.email);
  });

  // search: safe compiler
  test('escapeRegExp neutralises metacharacters', () => {
    assert.equal(escapeRegExp("a.b(c)"), "a\\.b\\(c\\)");
  });
  test('plain search matches literal dots, not wildcards', () => {
    const r = compileSearch("a.com", { regexMode: false });
    assert.ok(r.ok);
    assert.ok(r.regex.test("ada@a.com"));
    r.regex.lastIndex = 0;
    assert.ok(!r.regex.test("axcom"));
  });
  test('regex mode compiles valid patterns', () => {
    const r = compileSearch("^a|gmail", { regexMode: true });
    assert.ok(r.ok && r.regex instanceof RegExp);
  });
  test('regex mode rejects invalid patterns', () => {
    assert.ok(!compileSearch("(unclosed", { regexMode: true }).ok);
  });
  test('regex mode blocks catastrophic patterns', () => {
    assert.ok(!compileSearch("(a+)+$", { regexMode: true }).ok);
  });
  test('over-long queries are rejected', () => {
    assert.ok(!compileSearch("x".repeat(500), { regexMode: false }).ok);
  });

  // search: filter + highlight
  const sample = [
    { name: "Ada Lovelace", email: "ada@math.org", phone: "", website: "", tags: ["vip"] },
    { name: "Alan Turing", email: "alan@bletchley.uk", phone: "", website: "", tags: ["lead"] },
  ];
  test('filterContacts matches across fields and tags', () => {
    const r = compileSearch("vip", {});
    assert.equal(filterContacts(sample, r.regex).length, 1);
    const r2 = compileSearch("a", {});
    assert.equal(filterContacts(sample, r2.regex).length, 2);
  });
  test('highlight wraps matches in mark and escapes HTML', () => {
    const r = compileSearch("ada", {});
    assert.equal(highlight("Ada", r.regex), "<mark>Ada</mark>");
    assert.equal(escapeHTML('<script>'), '&lt;script&gt;');
    assert.ok(highlight('<b>x</b>', null).includes('&lt;b&gt;'));
  });
  test('highlight is XSS-safe on matched content', () => {
    const r = compileSearch("img", {});
    const out = highlight('<img onerror=1>', r.regex);
    assert.ok(!out.includes('<img'));
    assert.ok(out.includes('<mark>img</mark>'));
  });

  // storage: import / export round-trip
  test('exportJSON then importJSON round-trips', () => {
    const contacts = [{ id: "1", name: "Ada", email: "ada@x.com", phone: "", website: "", tags: ["vip"], createdAt: 1, updatedAt: 1 }];
    const json = exportJSON(contacts);
    const res = importJSON(json);
    assert.ok(res.ok);
    assert.equal(res.contacts.length, 1);
    assert.equal(res.contacts[0].name, "Ada");
  });
  test('importJSON accepts a bare array', () => {
    const res = importJSON('[{"name":"Bo","email":"bo@x.com"}]');
    assert.ok(res.ok && res.contacts[0].email === "bo@x.com");
  });
  test('importJSON rejects malformed JSON gracefully', () => {
    assert.ok(!importJSON("{ not json").ok);
  });
  test('importJSON rejects wrong shapes', () => {
    assert.ok(!importJSON('{"foo":1}').ok);
    assert.ok(!importJSON('[{"noemail":true}]').ok);
  });
  test('importJSON skips invalid rows but keeps valid ones', () => {
    const res = importJSON('[{"name":"Ok","email":"ok@x.com"},{"bad":1}]');
    assert.ok(res.ok);
    assert.equal(res.contacts.length, 1);
    assert.equal(res.skipped, 1);
  });
}
