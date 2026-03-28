// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer,
  validateExpense,
  fmt,
  encrypt,
  decrypt,
  compressToUrl,
  decompressFromUrl,
  CURRENCIES,
  MAX_DESCRIPTION_LEN,
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

  it(`rejects descriptions longer than ${MAX_DESCRIPTION_LEN} characters`, () => {
    const long = 'a'.repeat(MAX_DESCRIPTION_LEN + 1);
    expect(() => validateExpense({ ...valid, description: long })).toThrow();
  });

  it(`accepts descriptions exactly ${MAX_DESCRIPTION_LEN} characters`, () => {
    const exact = 'a'.repeat(MAX_DESCRIPTION_LEN);
    expect(validateExpense({ ...valid, description: exact })).toBe(true);
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
