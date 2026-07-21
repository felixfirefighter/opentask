/**
 * Three-way reconciliation for an editor that has received a newer server snapshot.
 * Fields the user changed from the editor's base stay local; untouched fields adopt
 * the latest server value. The caller must then replace its base with `latest`.
 */
export function reconcileHabitDraft<T extends Readonly<Record<string, unknown>>>(
  base: T,
  current: T,
  latest: T,
): T {
  return Object.fromEntries(
    (Object.keys(base) as (keyof T)[]).map((key) => [
      key,
      sameFieldValue(current[key], base[key]) ? latest[key] : current[key],
    ]),
  ) as T;
}

function sameFieldValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}
