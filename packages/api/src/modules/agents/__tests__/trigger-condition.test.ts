import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../trigger-condition.js';

/* -------------------------------------------------------------------------- */
/*  eq operator                                                               */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — eq', () => {
  it('returns true when field equals value', () => {
    expect(
      evaluateCondition(
        { action: 'opened' },
        { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
      ),
    ).toBe(true);
  });

  it('returns false when field does not equal value', () => {
    expect(
      evaluateCondition(
        { action: 'closed' },
        { all: [{ field: 'action', op: 'eq', value: 'opened' }] },
      ),
    ).toBe(false);
  });

  it('coerces non-string values to string for comparison', () => {
    expect(
      evaluateCondition({ count: 42 }, { all: [{ field: 'count', op: 'eq', value: '42' }] }),
    ).toBe(true);
  });

  it('returns false for missing field (eq "undefined")', () => {
    expect(
      evaluateCondition({}, { all: [{ field: 'missing', op: 'eq', value: 'something' }] }),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  neq operator                                                              */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — neq', () => {
  it('returns true when field does not equal value', () => {
    expect(
      evaluateCondition(
        { status: 'active' },
        { all: [{ field: 'status', op: 'neq', value: 'inactive' }] },
      ),
    ).toBe(true);
  });

  it('returns false when field equals value', () => {
    expect(
      evaluateCondition(
        { status: 'active' },
        { all: [{ field: 'status', op: 'neq', value: 'active' }] },
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  contains operator                                                         */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — contains', () => {
  it('returns true when field contains substring', () => {
    expect(
      evaluateCondition(
        { message: 'hello world' },
        { all: [{ field: 'message', op: 'contains', value: 'world' }] },
      ),
    ).toBe(true);
  });

  it('returns false when field does not contain substring', () => {
    expect(
      evaluateCondition(
        { message: 'hello world' },
        { all: [{ field: 'message', op: 'contains', value: 'foo' }] },
      ),
    ).toBe(false);
  });

  it('returns false when field is not a string', () => {
    expect(
      evaluateCondition({ count: 42 }, { all: [{ field: 'count', op: 'contains', value: '4' }] }),
    ).toBe(false);
  });

  it('returns false when value is undefined', () => {
    expect(
      evaluateCondition({ message: 'hello' }, { all: [{ field: 'message', op: 'contains' }] }),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  exists operator                                                           */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — exists', () => {
  it('returns true when field exists', () => {
    expect(evaluateCondition({ key: 'value' }, { all: [{ field: 'key', op: 'exists' }] })).toBe(
      true,
    );
  });

  it('returns false when field does not exist', () => {
    expect(evaluateCondition({}, { all: [{ field: 'key', op: 'exists' }] })).toBe(false);
  });

  it('returns false when field is null', () => {
    expect(evaluateCondition({ key: null }, { all: [{ field: 'key', op: 'exists' }] })).toBe(false);
  });

  it('returns true when field is empty string', () => {
    expect(evaluateCondition({ key: '' }, { all: [{ field: 'key', op: 'exists' }] })).toBe(true);
  });

  it('returns true when field is zero', () => {
    expect(evaluateCondition({ key: 0 }, { all: [{ field: 'key', op: 'exists' }] })).toBe(true);
  });

  it('returns true when field is false', () => {
    expect(evaluateCondition({ key: false }, { all: [{ field: 'key', op: 'exists' }] })).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  Nested field access (dot notation)                                        */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — nested fields', () => {
  it('resolves dot-notation paths', () => {
    const payload = { pull_request: { base: { ref: 'main' } } };
    expect(
      evaluateCondition(payload, {
        all: [{ field: 'pull_request.base.ref', op: 'eq', value: 'main' }],
      }),
    ).toBe(true);
  });

  it('returns false for missing intermediate key', () => {
    const payload = { pull_request: {} };
    expect(
      evaluateCondition(payload, {
        all: [{ field: 'pull_request.base.ref', op: 'eq', value: 'main' }],
      }),
    ).toBe(false);
  });

  it('returns false for non-object intermediate', () => {
    const payload = { pull_request: 'not-an-object' };
    expect(
      evaluateCondition(payload, { all: [{ field: 'pull_request.base.ref', op: 'exists' }] }),
    ).toBe(false);
  });

  it('handles deeply nested structures', () => {
    const payload = { a: { b: { c: { d: { e: 'found' } } } } };
    expect(
      evaluateCondition(payload, { all: [{ field: 'a.b.c.d.e', op: 'eq', value: 'found' }] }),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*  all / any combinators                                                     */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — all combinator', () => {
  it('passes when all conditions match', () => {
    expect(
      evaluateCondition(
        { action: 'opened', ref: 'main' },
        {
          all: [
            { field: 'action', op: 'eq', value: 'opened' },
            { field: 'ref', op: 'eq', value: 'main' },
          ],
        },
      ),
    ).toBe(true);
  });

  it('fails when one condition does not match', () => {
    expect(
      evaluateCondition(
        { action: 'opened', ref: 'develop' },
        {
          all: [
            { field: 'action', op: 'eq', value: 'opened' },
            { field: 'ref', op: 'eq', value: 'main' },
          ],
        },
      ),
    ).toBe(false);
  });
});

describe('trigger-condition — any combinator', () => {
  it('passes when at least one condition matches', () => {
    expect(
      evaluateCondition(
        { action: 'closed' },
        {
          any: [
            { field: 'action', op: 'eq', value: 'opened' },
            { field: 'action', op: 'eq', value: 'closed' },
          ],
        },
      ),
    ).toBe(true);
  });

  it('fails when no conditions match', () => {
    expect(
      evaluateCondition(
        { action: 'merged' },
        {
          any: [
            { field: 'action', op: 'eq', value: 'opened' },
            { field: 'action', op: 'eq', value: 'closed' },
          ],
        },
      ),
    ).toBe(false);
  });
});

describe('trigger-condition — combined all + any', () => {
  it('requires both all and any to pass', () => {
    expect(
      evaluateCondition(
        { action: 'opened', ref: 'main', label: 'bug' },
        {
          all: [{ field: 'action', op: 'eq', value: 'opened' }],
          any: [
            { field: 'label', op: 'eq', value: 'bug' },
            { field: 'label', op: 'eq', value: 'feature' },
          ],
        },
      ),
    ).toBe(true);
  });

  it('fails when all passes but any does not', () => {
    expect(
      evaluateCondition(
        { action: 'opened', label: 'docs' },
        {
          all: [{ field: 'action', op: 'eq', value: 'opened' }],
          any: [
            { field: 'label', op: 'eq', value: 'bug' },
            { field: 'label', op: 'eq', value: 'feature' },
          ],
        },
      ),
    ).toBe(false);
  });

  it('fails when any passes but all does not', () => {
    expect(
      evaluateCondition(
        { action: 'closed', label: 'bug' },
        {
          all: [{ field: 'action', op: 'eq', value: 'opened' }],
          any: [
            { field: 'label', op: 'eq', value: 'bug' },
            { field: 'label', op: 'eq', value: 'feature' },
          ],
        },
      ),
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Edge cases                                                                */
/* -------------------------------------------------------------------------- */

describe('trigger-condition — edge cases', () => {
  it('returns true for empty condition group', () => {
    expect(evaluateCondition({ any: 'data' }, {})).toBe(true);
  });

  it('returns true for condition group with empty arrays', () => {
    expect(evaluateCondition({ any: 'data' }, { all: [], any: [] })).toBe(true);
  });

  it('handles undefined all/any gracefully', () => {
    expect(evaluateCondition({ any: 'data' }, { all: undefined, any: undefined })).toBe(true);
  });
});
