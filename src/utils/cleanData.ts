function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively walks plain objects and arrays before Firestore writes (`setDoc`,
 * `updateDoc`, `addDoc`, `batch.set`) and strips all properties or array items
 * whose value is `undefined`.
 *
 * Non-plain objects such as Firestore `FieldValue` sentinels (`serverTimestamp()`),
 * `Timestamp`, and `Date` instances are preserved untouched.
 */
export function cleanData<T>(value: T): T {
  if (Array.isArray(value)) {
    const cleanedArray = value
      .filter((item) => item !== undefined)
      .map((item) => cleanData(item));
    return cleanedArray as unknown as T;
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) continue;
      result[key] = cleanData(val);
    }
    return result as T;
  }

  return value;
}
