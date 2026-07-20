import type {
  NextRecurrenceCandidateRequest,
  RecurrenceExpansionRequest,
  RecurrenceExpansionResult,
} from "../domain/recurrence/recurrence-expansion";
import type { LocalRecurrenceStart } from "../domain/recurrence/recurrence-time-policy";

export interface RecurrenceExpansionPort {
  expand(request: RecurrenceExpansionRequest): RecurrenceExpansionResult;
  next(request: NextRecurrenceCandidateRequest): LocalRecurrenceStart | null;
}
