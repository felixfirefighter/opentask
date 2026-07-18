import { createIdentitySchema } from "../../modules/identity/infrastructure/schema.ts";
import { createTaskSchema } from "../../modules/tasks/infrastructure/schema.ts";

// This is the sole schema composition root. Feature modules own table definitions;
// consumers import the composed instances from here so references stay canonical.
const identitySchema = createIdentitySchema();
const taskSchema = createTaskSchema(() => identitySchema.user.id);

export const user = identitySchema.user;
export const session = identitySchema.session;
export const account = identitySchema.account;
export const verification = identitySchema.verification;
export const rateLimit = identitySchema.rateLimit;
export const userPreferences = identitySchema.userPreferences;
export const taskLists = taskSchema.taskLists;

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  userPreferences,
  taskLists,
};
