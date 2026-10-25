// Pure form utility functions for dirty checks, field normalization, and change tracking

// Compares two values for equality, normalizing null, undefined, and empty string equivalents
function areValuesEqual(a: unknown, b: unknown): boolean {
  // Treat undefined and null as identical
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true;
  }

  // Treat empty string and null/undefined as identical for text inputs
  if (
    (a === "" && (b === null || b === undefined)) ||
    (b === "" && (a === null || a === undefined))
  ) {
    return true;
  }

  // Array comparison (e.g. topics_include, post_days)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!areValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Strict primitive equality
  return a === b;
}

// Determines whether form fields have been modified compared to initial state
export function isFormDirty<T extends Record<string, unknown>>(
  current: T,
  initial: T,
  fieldsToCompare?: (keyof T)[]
): boolean {
  if (!current || !initial) return false;

  const keys = fieldsToCompare || (Object.keys(current) as (keyof T)[]);

  for (const key of keys) {
    const currentVal = current[key];
    const initialVal = initial[key];
    if (!areValuesEqual(currentVal, initialVal)) {
      return true;
    }
  }

  return false;
}
