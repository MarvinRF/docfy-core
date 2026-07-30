import { describe, it, expect } from 'vitest';
import { validateAgainstSchema } from './validate-response';
import type { JSONSchemaLike } from './types';

describe('validateAgainstSchema()', () => {
  it('returns no issues when there is no schema to check against', () => {
    expect(validateAgainstSchema(undefined, { anything: true })).toEqual([]);
  });

  it('passes a value that matches type/required/properties', () => {
    const schema: JSONSchemaLike = {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' }, name: { type: 'string' } },
    };
    expect(validateAgainstSchema(schema, { id: '1', name: 'a' })).toEqual([]);
  });

  it('flags a missing required property', () => {
    const schema: JSONSchemaLike = { type: 'object', required: ['id'], properties: { id: { type: 'string' } } };
    expect(validateAgainstSchema(schema, {})).toEqual([{ path: 'body.id', message: 'required property missing' }]);
  });

  it('does not flag extra properties not declared in the schema', () => {
    const schema: JSONSchemaLike = { type: 'object', properties: { id: { type: 'string' } } };
    expect(validateAgainstSchema(schema, { id: '1', extra: true })).toEqual([]);
  });

  it('flags a type mismatch on a property', () => {
    const schema: JSONSchemaLike = { type: 'object', properties: { id: { type: 'string' } } };
    expect(validateAgainstSchema(schema, { id: 42 })).toEqual([
      { path: 'body.id', message: 'expected string, got number' },
    ]);
  });

  it('treats integer-typed schemas as satisfied by whole numbers', () => {
    const schema: JSONSchemaLike = { type: 'object', properties: { count: { type: 'integer' } } };
    expect(validateAgainstSchema(schema, { count: 3 })).toEqual([]);
  });

  it('accepts null when nullable is true (OpenAPI 3.0 style)', () => {
    const schema: JSONSchemaLike = { type: 'object', properties: { name: { type: 'string', nullable: true } } };
    expect(validateAgainstSchema(schema, { name: null })).toEqual([]);
  });

  it('flags a value outside an enum', () => {
    const schema: JSONSchemaLike = { type: 'string', enum: ['a', 'b'] };
    expect(validateAgainstSchema(schema, 'c')).toEqual([{ path: 'body', message: 'expected one of [a, b], got "c"' }]);
  });

  it('validates array items, capped, reporting each offending index', () => {
    const schema: JSONSchemaLike = { type: 'array', items: { type: 'string' } };
    expect(validateAgainstSchema(schema, ['a', 2, 'c'])).toEqual([
      { path: 'body[1]', message: 'expected string, got number' },
    ]);
  });

  it('requires every allOf branch to hold', () => {
    const schema: JSONSchemaLike = {
      allOf: [
        { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
      ],
    };
    expect(validateAgainstSchema(schema, { id: '1' })).toEqual([
      { path: 'body.name', message: 'required property missing' },
    ]);
  });

  it('passes oneOf when at least one branch matches', () => {
    const schema: JSONSchemaLike = { oneOf: [{ type: 'string' }, { type: 'number' }] };
    expect(validateAgainstSchema(schema, 42)).toEqual([]);
  });

  it('reports the closest branch when no oneOf branch matches', () => {
    const schema: JSONSchemaLike = {
      oneOf: [
        { type: 'object', required: ['a', 'b'], properties: { a: { type: 'string' }, b: { type: 'string' } } },
        { type: 'object', required: ['c'], properties: { c: { type: 'string' } } },
      ],
    };
    expect(validateAgainstSchema(schema, { c: 1 })).toEqual([
      { path: 'body.c', message: 'expected string, got number' },
    ]);
  });
});
