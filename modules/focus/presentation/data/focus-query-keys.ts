export const focusQueryKeys = {
  all: ["focus"] as const,
  active: () => ["focus", "active"] as const,
  summary: () => ["focus", "summary"] as const,
  history: () => ["focus", "history"] as const,
  links: (query: string) => ["focus", "links", query] as const,
} as const;
