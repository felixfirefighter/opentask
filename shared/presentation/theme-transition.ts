const suppressionValue = "suppressed";

export function withThemeTransitionSuppressed<Result>(update: () => Result): Result {
  if (typeof document === "undefined") return update();

  const root = document.documentElement;
  const previousValue = root.dataset.themeTransition;
  root.dataset.themeTransition = suppressionValue;

  try {
    return update();
  } finally {
    // Resolve the new token values while the global transition override is active. Restoring the
    // normal transition declarations after this synchronous layout read cannot animate the theme swap.
    root.getBoundingClientRect();
    if (previousValue === undefined) delete root.dataset.themeTransition;
    else root.dataset.themeTransition = previousValue;
  }
}
