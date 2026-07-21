export {
  companionChatRequestSchema,
  companionDailyModeRequestSchema,
  companionMemoryRequestSchema,
  companionPreferenceRequestSchema,
  companionSummarySchema,
} from "./application/contracts";
export type {
  CompanionActionType,
  CompanionChatRequest,
  CompanionPreferencePatch,
} from "./application/contracts";
export {
  awardCompanionXp,
  createCompanionChat,
  deleteCompanionData,
  getCompanionState,
  refreshCompanionSummary,
  removeCompanionMemory,
  saveCompanionMemory,
  setCompanionDailyMode,
  updateCompanionPreferences,
} from "./application/public";
export { readPortableCompanion } from "./application/export-reader";
