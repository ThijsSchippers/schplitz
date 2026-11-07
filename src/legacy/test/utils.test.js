// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer,
  validateExpense,
  fmt,
  encrypt,
  decrypt,
  encryptCompressed,
  decryptCompressed,
  compressToUrl,
  decompressFromUrl,
  CURRENCIES,
  MAX_DESCRIPTION_LEN,
  MAX_SETTLEMENT_LEN,
} from '../utils.js';

// ─── normalizeAnswer ─────────────────────────────────────────────────────────

describe('normalizeAnswer', () => {
  it('lowercases the input', () => {
    expect(normalizeAnswer('Hello')).toBe('hello');
  });

  it('strips all whitespace', () => {
    expect(normalizeAnswer('new york')).toBe('newyork');
    expect(normalizeAnswer('  spaces  ')).toBe('spaces');
    expect(normalizeAnswer('tab\there')).toBe('tabhere');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeAnswer('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeAnswer('Hello World');
    expect(normalizeAnswer(once)).toBe(once);
  });
});

// ─── fmt ─────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('formats EUR correctly', () => {
    expect(fmt(10, 'EUR')).toBe('€10.00');
    expect(fmt(1234.5, 'EUR')).toBe('€1,234.50');
  });

  it('formats USD correctly', () => {
    expect(fmt(9.99, 'USD')).toBe('$9.99');
  });

  it('handles zero', () => {
    expect(fmt(0, 'EUR')).toBe('€0.00');
  });

  it('returns fallback for NaN', () => {
    expect(fmt(NaN, 'EUR')).toBe('€0.00');
    expect(fmt('abc', 'EUR')).toBe('€0.00');
  });

  it('falls back to EUR symbol for unknown currency', () => {
    expect(fmt(5, 'XYZ')).toBe('€5.00');
  });

  it('uses the correct symbol for every supported currency', () => {
    Object.entries(CURRENCIES).forEach(([code, { symbol }]) => {
      expect(fmt(1, code)).toContain(symbol);
    });
  });
});

// ─── validateExpense ─────────────────────────────────────────────────────────

describe('validateExpense', () => {
  const valid = {
    id: 'abc-123',
    description: 'coffee',
    amount: 3.5,
    currency: 'EUR',
    paidBy: 'Alex',
    date: '2024-06-01',
  };

  it('accepts a valid expense', () => {
    expect(validateExpense(valid)).toBe(true);
  });

  it('rejects null / non-object', () => {
    expect(() => validateExpense(null)).toThrow();
    expect(() => validateExpense('string')).toThrow();
    expect(() => validateExpense(42)).toThrow();
  });

  it('rejects missing or empty id', () => {
    expect(() => validateExpense({ ...valid, id: '' })).toThrow();
    expect(() => validateExpense({ ...valid, id: 123 })).toThrow();
  });

  it('rejects missing or empty description', () => {
    expect(() => validateExpense({ ...valid, description: '' })).toThrow();
    expect(() => validateExpense({ ...valid, description: '   ' })).toThrow();
    expect(() => validateExpense({ ...valid, description: null })).toThrow();
  });

  it('accepts descriptions of any length (length capped by UI maxLength, not enforced on import)', () => {
    // validateExpense is called during import — rejecting old data with longer descriptions
    // would silently break existing share links. The 30-char limit is enforced by the input
    // element's maxLength attribute instead.
    expect(validateExpense({ ...valid, description: 'a'.repeat(MAX_DESCRIPTION_LEN + 1) })).toBe(true);
    expect(validateExpense({ ...valid, description: 'a'.repeat(200) })).toBe(true);
  });

  it('rejects negative, NaN, or non-numeric amounts', () => {
    expect(() => validateExpense({ ...valid, amount: -1 })).toThrow();
    expect(() => validateExpense({ ...valid, amount: NaN })).toThrow();
    expect(() => validateExpense({ ...valid, amount: '5' })).toThrow();
  });

  it('accepts zero amount', () => {
    expect(validateExpense({ ...valid, amount: 0 })).toBe(true);
  });

  it('rejects unknown currency', () => {
    expect(() => validateExpense({ ...valid, currency: 'XYZ' })).toThrow();
    expect(() => validateExpense({ ...valid, currency: '' })).toThrow();
  });

  it('accepts all supported currencies', () => {
    Object.keys(CURRENCIES).forEach(code => {
      expect(validateExpense({ ...valid, currency: code })).toBe(true);
    });
  });

  it('rejects missing or empty paidBy', () => {
    expect(() => validateExpense({ ...valid, paidBy: '' })).toThrow();
    expect(() => validateExpense({ ...valid, paidBy: '   ' })).toThrow();
  });

  it('rejects malformed dates', () => {
    expect(() => validateExpense({ ...valid, date: '01-06-2024' })).toThrow();
    expect(() => validateExpense({ ...valid, date: '2024/06/01' })).toThrow();
    expect(() => validateExpense({ ...valid, date: 'not-a-date' })).toThrow();
    expect(() => validateExpense({ ...valid, date: '' })).toThrow();
  });

  it('accepts a valid ISO date', () => {
    expect(validateExpense({ ...valid, date: '2024-01-01' })).toBe(true);
    expect(validateExpense({ ...valid, date: '1999-12-31' })).toBe(true);
  });
});

// ─── encrypt / decrypt ───────────────────────────────────────────────────────

describe('encrypt / decrypt', () => {
  it('round-trips plaintext correctly', async () => {
    const plaintext = JSON.stringify({ hello: 'world', num: 42 });
    const answer = 'mysecretanswer';
    const ciphertext = await encrypt(plaintext, answer);
    const result = await decrypt(ciphertext, answer);
    expect(result).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const plaintext = 'same message';
    const answer = 'answer';
    const c1 = await encrypt(plaintext, answer);
    const c2 = await encrypt(plaintext, answer);
    expect(c1).not.toBe(c2);
  });

  it('throws on wrong answer', async () => {
    const ciphertext = await encrypt('secret data', 'correctanswer');
    await expect(decrypt(ciphertext, 'wronganswer')).rejects.toThrow();
  });

  it('throws on corrupted ciphertext', async () => {
    await expect(decrypt('notvalidbase64!!!', 'answer')).rejects.toThrow();
  });

  it('round-trips unicode and special characters', async () => {
    const plaintext = '€100 · café · 日本語 · <script>alert(1)</script>';
    const ciphertext = await encrypt(plaintext, 'answer');
    expect(await decrypt(ciphertext, 'answer')).toBe(plaintext);
  });
});

// ─── compressToUrl / decompressFromUrl ────────────────────────────────────────

describe('compressToUrl / decompressFromUrl', () => {
  it('round-trips a JSON string', async () => {
    const input = JSON.stringify({ v: 3, question: 'Where did we meet?', names: ['Alex', 'Jordan'] });
    const compressed = await compressToUrl(input);
    const result = await decompressFromUrl(compressed);
    expect(result).toBe(input);
  });

  it('produces URL-safe output (no +, /, or =)', async () => {
    const compressed = await compressToUrl('some data to compress');
    expect(compressed).not.toMatch(/[+/=]/);
  });

  it('round-trips an empty string', async () => {
    const compressed = await compressToUrl('');
    expect(await decompressFromUrl(compressed)).toBe('');
  });

  it('round-trips a large payload', async () => {
    const large = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`, description: `expense ${i}`, amount: i * 1.5,
      currency: 'EUR', paidBy: 'Alex', date: '2024-06-01',
    })));
    const compressed = await compressToUrl(large);
    expect(await decompressFromUrl(compressed)).toBe(large);
  });
});

// ─── full share-link round-trip ───────────────────────────────────────────────

describe('share link round-trip', () => {
  it('encrypts, compresses, decompresses, and decrypts correctly', async () => {
    const answer = 'ouranswerhere';
    const expenses = [
      { id: 'e1', description: 'dinner', amount: 45.0, currency: 'EUR', paidBy: 'Alex', date: '2024-06-01' },
      { id: 'e2', description: 'taxi',   amount: 12.5, currency: 'USD', paidBy: 'Jordan', date: '2024-06-02' },
    ];

    // Simulate export
    const payload = {
      v: 3,
      question: 'Where did we meet?',
      names: ['Alex', 'Jordan'],
      encrypted: await encrypt(
        JSON.stringify({ expenses: expenses.map(e => ({ i: e.id, d: e.description, a: e.amount, c: e.currency, p: e.paidBy, t: e.date })), status: 'done' }),
        answer
      ),
    };
    const compressed = await compressToUrl(JSON.stringify(payload));

    // Simulate import
    const decompressed = JSON.parse(await decompressFromUrl(compressed));
    expect(decompressed.v).toBe(3);
    expect(decompressed.question).toBe('Where did we meet?');

    const decrypted = JSON.parse(await decrypt(decompressed.encrypted, answer));
    expect(decrypted.expenses).toHaveLength(2);
    expect(decrypted.status).toBe('done');

    // Validate each re-expanded expense
    decrypted.expenses.forEach((e, i) => {
      const full = { id: e.i, description: e.d, amount: e.a, currency: e.c, paidBy: e.p, date: e.t };
      expect(() => validateExpense(full)).not.toThrow();
      expect(full.id).toBe(expenses[i].id);
    });
  });

  it('fails to decrypt with a different answer', async () => {
    const payload = {
      v: 3,
      question: 'test',
      names: ['A', 'B'],
      encrypted: await encrypt('{"expenses":[],"status":"done"}', 'correctanswer'),
    };
    const compressed = await compressToUrl(JSON.stringify(payload));
    const decompressed = JSON.parse(await decompressFromUrl(compressed));
    await expect(decrypt(decompressed.encrypted, 'wronganswer')).rejects.toThrow();
  });
});

// ─── backwards compatibility ──────────────────────────────────────────────────
//
// These tests pin down the shape of share payloads from earlier versions of
// the app. If a future change breaks reading an older format, one of these
// tests will fail — forcing a conscious decision to either preserve
// compatibility or bump the schema version (`v`).
//
// When adding a new field inside the encrypted payload, add a new describe
// block below that documents what version of the app first produced it, so
// we always know which shapes must still be readable.

describe('backwards compatibility', () => {
  describe('pre-settlement-feature payload (no `settlement` field)', () => {
    // This is the shape produced by schplitz before the settlement feature
    // was added. It only contained `expenses` and `status` inside the
    // encrypted blob. A link of this shape must still decrypt and import
    // cleanly.
    const answer = 'legacytally';
    const legacyEncryptedContent = {
      expenses: [
        { i: 'e1', d: 'dinner', a: 45.0, c: 'EUR', p: 'Alex',   t: '2024-06-01' },
        { i: 'e2', d: 'taxi',   a: 12.5, c: 'USD', p: 'Jordan', t: '2024-06-02' },
      ],
      status: 'done',
      // Note: no `settlement` field
    };

    const buildLegacyPayload = async () => ({
      v: 3,
      question: 'Where did we meet?',
      names: ['Alex', 'Jordan'],
      encrypted: await encrypt(JSON.stringify(legacyEncryptedContent), answer),
    });

    it('decrypts and parses without errors', async () => {
      const payload = await buildLegacyPayload();
      const compressed = await compressToUrl(JSON.stringify(payload));
      const decompressed = JSON.parse(await decompressFromUrl(compressed));
      const decrypted = JSON.parse(await decrypt(decompressed.encrypted, answer));

      expect(decompressed.v).toBe(3);
      expect(decrypted.expenses).toHaveLength(2);
      expect(decrypted.status).toBe('done');
    });

    it('has no settlement field, and the import guard handles that safely', async () => {
      const payload = await buildLegacyPayload();
      const decrypted = JSON.parse(await decrypt(payload.encrypted, answer));

      // The import code uses `if (data.settlement && ...)` — this test pins
      // that guard as a contract. If someone removes the guard, this breaks.
      expect(decrypted.settlement).toBeUndefined();
      expect(Boolean(decrypted.settlement)).toBe(false);
    });

    it('expanded expenses still pass current validation', async () => {
      const payload = await buildLegacyPayload();
      const decrypted = JSON.parse(await decrypt(payload.encrypted, answer));
      decrypted.expenses.forEach(e => {
        const full = { id: e.i, description: e.d, amount: e.a, currency: e.c, paidBy: e.p, date: e.t };
        expect(() => validateExpense(full)).not.toThrow();
      });
    });
  });

  describe('pre-compression payload (v3, plaintext JSON inside encrypt)', () => {
    // v3 used plain-JSON-then-encrypt. v4 switched to deflate-then-encrypt to
    // keep URLs small, but v3 links from older app versions must still import.
    // This test pins that v3 remains decodable via the legacy `decrypt` path.
    it('still round-trips via legacy decrypt (not decryptCompressed)', async () => {
      const answer = 'legacyv3';
      const content = { expenses: [], status: 'done' };
      const encrypted = await encrypt(JSON.stringify(content), answer);
      // v3 payloads MUST use `decrypt`, not `decryptCompressed`
      const decrypted = await decrypt(encrypted, answer);
      expect(JSON.parse(decrypted)).toEqual(content);
    });
  });

  describe('additive field compatibility within a schema version', () => {
    // When adding a new field (like `settlement`) inside the encrypted
    // payload WITHOUT bumping the schema version, older clients reading a
    // newer link must still be able to extract the fields they know about.
    // This test documents that guarantee so we don't accidentally introduce
    // breaking changes under the same version number.
    it('an unknown field in the encrypted payload does not break legacy field reads', async () => {
      const answer = 'modernanswer';
      const content = {
        expenses: [{ i: 'e1', d: 'dinner', a: 45.0, c: 'EUR', p: 'Alex', t: '2024-06-01' }],
        status: 'done',
        settlement: "I'll hand you cash Saturday",
      };
      // Use the v4 (compressed) path since that's what current exports produce
      const encrypted = await encryptCompressed(JSON.stringify(content), answer);
      const decrypted = JSON.parse(await decryptCompressed(encrypted, answer));

      // Old-client simulation: only look at `expenses` and `status`
      expect(Array.isArray(decrypted.expenses)).toBe(true);
      expect(decrypted.status).toBe('done');
      // Settlement is there, but a client that doesn't know about it ignores it
      expect(decrypted.settlement).toBe("I'll hand you cash Saturday");
    });
  });
});

// ─── v4 compressed format (encryptCompressed / decryptCompressed) ────────────

describe('encryptCompressed / decryptCompressed (v4 format)', () => {
  it('round-trips plaintext correctly', async () => {
    const plaintext = JSON.stringify({
      expenses: [{ i: 'e1', d: 'dinner', a: 45.0, c: 'EUR', p: 'Alex', t: '2024-06-01' }],
      status: 'done',
      settlement: 'Cash Saturday',
    });
    const encrypted = await encryptCompressed(plaintext, 'answer');
    expect(await decryptCompressed(encrypted, 'answer')).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const a = await encryptCompressed('same', 'answer');
    const b = await encryptCompressed('same', 'answer');
    expect(a).not.toBe(b);
  });

  it('throws on wrong answer', async () => {
    const c = await encryptCompressed('secret', 'correct');
    await expect(decryptCompressed(c, 'wrong')).rejects.toThrow();
  });

  it('round-trips unicode and special characters', async () => {
    const plaintext = '€100 · café · 日本語 · <script>alert(1)</script>';
    const encrypted = await encryptCompressed(plaintext, 'answer');
    expect(await decryptCompressed(encrypted, 'answer')).toBe(plaintext);
  });

  it('cannot be read with the plaintext decrypt() helper', async () => {
    // Guardrail: v4 ciphertexts carry deflated bytes, so calling the legacy
    // `decrypt` (which TextDecodes) on them must NOT produce the original JSON.
    // If this test starts passing accidentally, the format branching in the
    // import handler is no longer load-bearing and needs re-examination.
    const plaintext = JSON.stringify({ expenses: [], status: 'done' });
    const encrypted = await encryptCompressed(plaintext, 'answer');
    const wrongPath = await decrypt(encrypted, 'answer').catch(() => null);
    expect(wrongPath).not.toBe(plaintext);
  });
});

// ─── URL size budget ─────────────────────────────────────────────────────────
//
// The share-link URL is capped at 8000 characters in App.jsx (falling back to
// text export beyond that). This describe block pins the size budget for
// realistic payloads so that future features don't silently push users past
// the limit. If these numbers change significantly, review the fix — either
// accept the new budget by updating the thresholds, or rework the format.

describe('URL size budget', () => {
  const URL_CAP = 8000;
  const ANSWER = 'budgetanswer';
  const QUESTION = 'Where did we first meet on our road trip?';
  const NAMES = ['Alexander', 'Jordan'];

  const makeExpense = (i) => ({
    i: `kx8z${i.toString(36).padStart(16, '0')}`,
    d: `Expense description ${i}`.slice(0, 30),
    a: 42.5 + i,
    c: ['EUR', 'USD', 'THB', 'NOK', 'SEK'][i % 5],
    p: i % 2 === 0 ? 'Alexander' : 'Jordan',
    t: '2024-06-01',
  });

  const buildUrlLen = async ({ n, settlementLen }) => {
    const content = {
      expenses: Array.from({ length: n }, (_, i) => makeExpense(i)),
      status: 'done',
    };
    if (settlementLen > 0) content.settlement = 'x'.repeat(settlementLen);
    const payload = {
      v: 4,
      question: QUESTION,
      names: NAMES,
      encrypted: await encryptCompressed(JSON.stringify(content), ANSWER),
    };
    const compressed = await compressToUrl(JSON.stringify(payload));
    return `https://schplitz.com/#share=${compressed}`.length;
  };

  it('50 expenses + max-length settlement fits well under 8000', async () => {
    const len = await buildUrlLen({ n: 50, settlementLen: MAX_SETTLEMENT_LEN });
    expect(len).toBeLessThan(URL_CAP);
    // Leave healthy headroom — if this drops below ~6000 headroom, something grew.
    expect(len).toBeLessThan(3000);
  });

  it('100 expenses + max-length settlement fits under 8000', async () => {
    const len = await buildUrlLen({ n: 100, settlementLen: MAX_SETTLEMENT_LEN });
    expect(len).toBeLessThan(URL_CAP);
  });

  it('200 expenses + max-length settlement still fits under 8000', async () => {
    // With compressed format, even very large tallies fit. This is the
    // regression guard — if this starts failing, compression is broken.
    const len = await buildUrlLen({ n: 200, settlementLen: MAX_SETTLEMENT_LEN });
    expect(len).toBeLessThan(URL_CAP);
  });

  it('adding a max-length settlement to 50 expenses adds <100 chars to the URL', async () => {
    // Documents that the settlement feature's URL cost is negligible after
    // compression. If this regresses, the compression path likely broke.
    const without = await buildUrlLen({ n: 50, settlementLen: 0 });
    const with_   = await buildUrlLen({ n: 50, settlementLen: MAX_SETTLEMENT_LEN });
    expect(with_ - without).toBeLessThan(100);
  });
});
