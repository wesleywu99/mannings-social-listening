import { describe, it, expect } from 'vitest';
import { isAuthorized } from '@/lib/auth';

describe('isAuthorized', () => {
  it('accepts matching token', () => {
    expect(isAuthorized('mannings', 'mannings')).toBe(true);
  });
  it('rejects wrong/missing token', () => {
    expect(isAuthorized('nope', 'mannings')).toBe(false);
    expect(isAuthorized(null, 'mannings')).toBe(false);
  });
  it('rejects when no expected token configured', () => {
    expect(isAuthorized('mannings', undefined)).toBe(false);
  });
});
