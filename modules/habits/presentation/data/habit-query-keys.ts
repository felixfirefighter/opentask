export const habitQueryKeys = {
  all: ["habits"] as const,
  listRoot: () => ["habits", "list"] as const,
  list: (lifecycle: "active" | "archived") => ["habits", "list", lifecycle] as const,
  overview: (habitId: string) => ["habits", "overview", habitId] as const,
  detailRoot: () => ["habits", "detail"] as const,
  detail: (habitId: string) => ["habits", "detail", habitId] as const,
  today: () => ["habits", "today"] as const,
  month: (habitId: string, yearMonth: string) => ["habits", "month", habitId, yearMonth] as const,
  history: (habitId: string, startDate: string, endDate: string) =>
    ["habits", "history", habitId, startDate, endDate] as const,
} as const;
