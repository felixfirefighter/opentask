import { createAssistantSchema } from "../../modules/assistant/infrastructure/schema.ts";
import { createCompanionSchema } from "../../modules/companion/infrastructure/schema.ts";
import { createPromptsSchema } from "../../modules/prompts/infrastructure/schema.ts";
import { createIdentitySchema } from "../../modules/identity/infrastructure/schema.ts";
import { createTaskSchema } from "../../modules/tasks/infrastructure/schema.ts";

// This is the sole schema composition root. Feature modules own table definitions;
// consumers import the composed instances from here so references stay canonical.
const identitySchema = createIdentitySchema();
const taskSchema = createTaskSchema(() => identitySchema.user.id);
const assistantSchema = createAssistantSchema(() => identitySchema.user.id);
const companionSchema = createCompanionSchema(() => identitySchema.user.id);
const promptsSchema = createPromptsSchema(() => identitySchema.user.id);

export const user = identitySchema.user;
export const session = identitySchema.session;
export const account = identitySchema.account;
export const verification = identitySchema.verification;
export const rateLimit = identitySchema.rateLimit;
export const userPreferences = identitySchema.userPreferences;
export const openaiCredentials = assistantSchema.openaiCredentials;
export const listFolders = taskSchema.listFolders;
export const taskLists = taskSchema.taskLists;
export const listSections = taskSchema.listSections;
export const tasks = taskSchema.tasks;
export const taskSchedules = taskSchema.taskSchedules;
export const checklistItems = taskSchema.checklistItems;
export const tags = taskSchema.tags;
export const taskTags = taskSchema.taskTags;
export const plannerProposals = assistantSchema.plannerProposals;
export const companionProfiles = companionSchema.companionProfiles;
export const companionXpEvents = companionSchema.companionXpEvents;
export const companionBehaviorSummaries = companionSchema.companionBehaviorSummaries;
export const companionMemories = companionSchema.companionMemories;
export const savedPrompts = promptsSchema.savedPrompts;
export const savedPromptTags = promptsSchema.savedPromptTags;

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  userPreferences,
  openaiCredentials,
  listFolders,
  taskLists,
  listSections,
  tasks,
  taskSchedules,
  checklistItems,
  tags,
  taskTags,
  plannerProposals,
  companionProfiles,
  companionXpEvents,
  companionBehaviorSummaries,
  companionMemories,
  savedPrompts,
  savedPromptTags,
};
