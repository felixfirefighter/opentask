const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

export function chooseTaskTreeDeletionInstant(
  preferred: Date,
  existingChildDeletions: readonly Date[],
): Date {
  const preferredMilliseconds = validDateMilliseconds(preferred);
  const occupied = new Set(existingChildDeletions.map(validDateMilliseconds));

  for (let offset = 0; offset <= occupied.size; offset += 1) {
    const candidate = preferredMilliseconds + offset;
    if (candidate <= MAX_DATE_MILLISECONDS && !occupied.has(candidate)) return new Date(candidate);
  }

  for (let offset = 1; offset <= occupied.size + 1; offset += 1) {
    const candidate = preferredMilliseconds - offset;
    if (candidate >= -MAX_DATE_MILLISECONDS && !occupied.has(candidate)) return new Date(candidate);
  }

  throw new RangeError("A distinct task-tree deletion instant could not be represented.");
}

function validDateMilliseconds(value: Date): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds))
    throw new RangeError("Task-tree deletion instants must be valid dates.");
  return milliseconds;
}
