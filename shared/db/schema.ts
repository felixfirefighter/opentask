import { createAssistantSchema } from "../../modules/assistant/infrastructure/schema.ts";
import { createFocusSchema } from "../../modules/focus/infrastructure/schema.ts";
import { createIdentitySchema } from "../../modules/identity/infrastructure/schema.ts";
import { createNotificationSchema } from "../../modules/notifications/infrastructure/schema.ts";
import { createHabitSchema } from "../../modules/habits/infrastructure/schema.ts";
import { createTaskSchema } from "../../modules/tasks/infrastructure/schema.ts";

// This is the sole schema composition root. Feature modules own table definitions;
// consumers import the composed instances from here so references stay canonical.
const identitySchema = createIdentitySchema();
const habitSchema = createHabitSchema(() => identitySchema.user.id);
const taskSchema = createTaskSchema(() => identitySchema.user.id);
const notificationSchema = createNotificationSchema({
  authUserId: () => identitySchema.user.id,
  taskUserId: () => taskSchema.tasks.userId,
  taskId: () => taskSchema.tasks.id,
});
const focusSchema = createFocusSchema({
  authUserId: () => identitySchema.user.id,
  taskUserId: () => taskSchema.tasks.userId,
  taskId: () => taskSchema.tasks.id,
  habitUserId: () => habitSchema.habits.userId,
  habitId: () => habitSchema.habits.id,
});
const assistantSchema = createAssistantSchema(() => identitySchema.user.id);

export const user = identitySchema.user;
export const session = identitySchema.session;
export const account = identitySchema.account;
export const verification = identitySchema.verification;
export const rateLimit = identitySchema.rateLimit;
export const userPreferences = identitySchema.userPreferences;
export const habits = habitSchema.habits;
export const habitSchedules = habitSchema.habitSchedules;
export const habitLogs = habitSchema.habitLogs;
export const focusSessions = focusSchema.focusSessions;
export const listFolders = taskSchema.listFolders;
export const taskLists = taskSchema.taskLists;
export const listSections = taskSchema.listSections;
export const tasks = taskSchema.tasks;
export const taskSchedules = taskSchema.taskSchedules;
export const taskRecurrences = taskSchema.taskRecurrences;
export const taskOccurrenceEvents = taskSchema.taskOccurrenceEvents;
export const checklistItems = taskSchema.checklistItems;
export const tags = taskSchema.tags;
export const taskTags = taskSchema.taskTags;
export const taskReminders = notificationSchema.taskReminders;
export const pushSubscriptions = notificationSchema.pushSubscriptions;
export const notificationDeliveries = notificationSchema.notificationDeliveries;
export const plannerProposals = assistantSchema.plannerProposals;

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  userPreferences,
  habits,
  habitSchedules,
  habitLogs,
  focusSessions,
  listFolders,
  taskLists,
  listSections,
  tasks,
  taskSchedules,
  taskRecurrences,
  taskOccurrenceEvents,
  checklistItems,
  tags,
  taskTags,
  taskReminders,
  pushSubscriptions,
  notificationDeliveries,
  plannerProposals,
};
