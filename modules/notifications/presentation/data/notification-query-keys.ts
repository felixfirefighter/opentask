export const notificationQueryKeys = {
  all: ["notifications"] as const,
  browserEnrollment: ["notifications", "browser-enrollment"] as const,
  capability: ["notifications", "capability"] as const,
  reminderRoot: ["notifications", "reminder"] as const,
  reminder: (taskId: string) => ["notifications", "reminder", taskId] as const,
} as const;
