import { describe, it, expect } from 'vitest';
import { buildSchemaExample, circularMarker, pickPrimarySuccessResponse, resolveUnion, withUnionNotes } from './example';
import type { JSONSchemaLike } from './types';

describe('resolveUnion()', () => {
  it('returns the schema unchanged when there is no union', () => {
    const schema = { type: 'string' };
    expect(resolveUnion(schema)).toEqual({ schema });
  });

  it('resolves oneOf to its first variant and reports the size', () => {
    const a = { type: 'string' };
    const b = { type: 'number' };
    expect(resolveUnion({ oneOf: [a, b] })).toEqual({ schema: a, unionSize: 2 });
  });

  it('resolves anyOf the same way', () => {
    const a = { type: 'boolean' };
    expect(resolveUnion({ anyOf: [a] })).toEqual({ schema: a, unionSize: 1 });
  });

  it('returns undefined schema for undefined input', () => {
    expect(resolveUnion(undefined)).toEqual({ schema: undefined });
  });

  it('merges allOf branches into a single object schema', () => {
    const base = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };
    const extension = { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] };
    const { schema } = resolveUnion({ allOf: [base, extension] });
    expect(schema?.type).toBe('object');
    expect(schema?.properties).toEqual({ id: { type: 'string' }, name: { type: 'string' } });
    expect(schema?.required).toEqual(['id', 'name']);
  });

  it('merges allOf inside the chosen oneOf variant (regression: ProductResponse = oneOf[DigitalProduct, PhysicalProduct], each an allOf composition)', () => {
    const base = { type: 'object', properties: { id: { type: 'string' } } };
    const digitalProduct = { allOf: [base, { type: 'object', properties: { downloadUrl: { type: 'string' } } }] };
    const physicalProduct = { allOf: [base, { type: 'object', properties: { weight: { type: 'number' } } }] };
    const { schema, unionSize } = resolveUnion({ oneOf: [digitalProduct, physicalProduct] });
    expect(schema?.type).toBe('object');
    expect(schema?.properties).toEqual({ id: { type: 'string' }, downloadUrl: { type: 'string' } });
    expect(unionSize).toBe(2);
  });

  it('resolves a oneOf nested inside allOf after merging', () => {
    const base = { type: 'object', properties: { id: { type: 'string' } } };
    const variant = { type: 'string' };
    const { schema, unionSize } = resolveUnion({ allOf: [base], oneOf: [variant] });
    expect(schema).toEqual(variant);
    expect(unionSize).toBe(1);
  });
});

describe('buildSchemaExample()', () => {
  it('returns undefined for an undefined schema', () => {
    expect(buildSchemaExample(undefined)).toBeUndefined();
  });

  it('flattens object properties to type-name tokens', () => {
    const result = buildSchemaExample({
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
    });
    expect(result?.example).toEqual({ name: 'string', age: 'integer' });
  });

  it('represents arrays as a single-item array of the item schema', () => {
    const result = buildSchemaExample({ type: 'array', items: { type: 'string' } });
    expect(result?.example).toEqual(['string']);
  });

  it('flattens allOf composition (base + extension) into one merged object', () => {
    const result = buildSchemaExample({
      allOf: [
        { type: 'object', properties: { id: { type: 'string' } } },
        { type: 'object', properties: { name: { type: 'string' } } },
      ],
    });
    expect(result?.example).toEqual({ id: 'string', name: 'string' });
  });

  it('flattens an array of oneOf-of-allOf items instead of rendering the literal string "object" (regression: GET /products data items)', () => {
    const base = { type: 'object', properties: { id: { type: 'string' } } };
    const digitalProduct = { allOf: [base, { type: 'object', properties: { downloadUrl: { type: 'string' } } }] };
    const physicalProduct = { allOf: [base, { type: 'object', properties: { weight: { type: 'number' } } }] };
    const result = buildSchemaExample({
      type: 'object',
      properties: { data: { type: 'array', items: { oneOf: [digitalProduct, physicalProduct] } } },
    });
    expect(result?.example).toEqual({ data: [{ id: 'string', downloadUrl: 'string' }] });
  });

  it('reports union sizes for oneOf/anyOf encountered', () => {
    const result = buildSchemaExample({
      oneOf: [{ type: 'object', properties: { a: { type: 'string' } } }, { type: 'object', properties: { b: { type: 'string' } } }],
    });
    expect(result?.unionSizes).toEqual([2]);
  });

  describe('circular schemas (recursive DTOs)', () => {
    it('detects a cycle through a recursive schema that uses allOf (regression: User.manager: User kept re-merging into fresh objects, defeating cycle detection)', () => {
      const user: JSONSchemaLike = {
        allOf: [
          { type: 'object', properties: { id: { type: 'string' } } },
          { type: 'object', properties: {} },
        ],
      };
      ((user.allOf as JSONSchemaLike[])[1].properties as Record<string, unknown>).manager = user;

      const result = buildSchemaExample(user);
      expect(result?.example).toEqual({ id: 'string', manager: '(circular reference)' });
    });


    it('replaces a direct self-reference with a single circular marker, not repeated nesting', () => {
      const user: JSONSchemaLike = { type: 'object', properties: { id: { type: 'string' } } };
      user.properties = { ...(user.properties as object), parent: user };

      const result = buildSchemaExample(user);
      expect(result?.example).toEqual({ id: 'string', parent: '(circular reference)' });
    });

    it('includes the schema title in the marker when present', () => {
      const user: JSONSchemaLike = { type: 'object', title: 'User', properties: { id: { type: 'string' } } };
      (user.properties as Record<string, unknown>).parent = user;

      const result = buildSchemaExample(user);
      expect(result?.example).toEqual({ id: 'string', parent: '(circular reference to User)' });
    });

    it('handles mutual recursion (A -> B -> A) without infinite recursion', () => {
      const a: JSONSchemaLike = { type: 'object', properties: {} };
      const b: JSONSchemaLike = { type: 'object', properties: { a } };
      (a.properties as Record<string, unknown>).b = b;

      const result = buildSchemaExample(a);
      expect(result?.example).toEqual({ b: { a: '(circular reference)' } });
    });

    it('detects a self-referencing array item (Category.children: Category[])', () => {
      const category: JSONSchemaLike = { type: 'object', properties: { name: { type: 'string' } } };
      (category.properties as Record<string, unknown>).children = { type: 'array', items: category };

      const result = buildSchemaExample(category);
      expect(result?.example).toEqual({ name: 'string', children: ['(circular reference)'] });
    });

    it('does NOT flag the same schema object appearing in two sibling branches as circular', () => {
      const role: JSONSchemaLike = { type: 'object', properties: { name: { type: 'string' } } };
      const result = buildSchemaExample({
        type: 'object',
        properties: { createdBy: role, updatedBy: role },
      });
      expect(result?.example).toEqual({ createdBy: { name: 'string' }, updatedBy: { name: 'string' } });
    });

    it('detects a cycle hidden behind oneOf/anyOf', () => {
      const user: JSONSchemaLike = { type: 'object', properties: { id: { type: 'string' } } };
      (user.properties as Record<string, unknown>).parent = { oneOf: [user] };

      const result = buildSchemaExample(user);
      expect(result?.example).toEqual({ id: 'string', parent: '(circular reference)' });
    });

    it('produces output safe to JSON.stringify with no thrown errors or stack overflow', () => {
      const user: JSONSchemaLike = { type: 'object', properties: { id: { type: 'string' } } };
      (user.properties as Record<string, unknown>).parent = user;
      (user.properties as Record<string, unknown>).friends = { type: 'array', items: user };

      expect(() => buildSchemaExample(user)).not.toThrow();
      const result = buildSchemaExample(user);
      expect(() => JSON.stringify(result?.example)).not.toThrow();
    });
  });
});

describe('circularMarker()', () => {
  it('returns a generic marker when the schema has no title', () => {
    expect(circularMarker({ type: 'object' })).toBe('(circular reference)');
  });

  it('includes the title when present', () => {
    expect(circularMarker({ type: 'object', title: 'User' })).toBe('(circular reference to User)');
  });
});

describe('withUnionNotes()', () => {
  it('returns the body unchanged when there are no union sizes', () => {
    expect(withUnionNotes('body', [])).toBe('body');
  });

  it('appends one annotation line per union size', () => {
    expect(withUnionNotes('body', [2, 3])).toBe('body\n(one of 2 possible shapes)\n(one of 3 possible shapes)');
  });
});

describe('pickPrimarySuccessResponse()', () => {
  it('picks the smallest numeric 2xx', () => {
    const result = pickPrimarySuccessResponse([
      { status: '201', description: undefined, contentType: undefined, schema: undefined },
      { status: '200', description: undefined, contentType: undefined, schema: undefined },
    ]);
    expect(result?.status).toBe('200');
  });

  it('returns undefined when no 2xx is declared', () => {
    const result = pickPrimarySuccessResponse([
      { status: '400', description: undefined, contentType: undefined, schema: undefined },
    ]);
    expect(result).toBeUndefined();
  });
});
