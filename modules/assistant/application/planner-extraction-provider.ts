import {
  modelExtractionSchema,
  plannerExtractionRequestSchema,
  validateExtractionReferences,
  type PlannerExtractionProvider,
} from "./contracts";
import { createConfiguredOpenAIResponsesProvider } from "../infrastructure/openai-responses-provider";

export function createPlannerExtractionProvider(apiKey?: string | null): PlannerExtractionProvider | null {
  const provider = createConfiguredOpenAIResponsesProvider(
    {
      requestSchema: plannerExtractionRequestSchema,
      responseSchema: modelExtractionSchema,
      validateOutput: validateExtractionReferences,
    },
    apiKey,
  );
  if (!provider) return null;

  return {
    extract(request) {
      return provider.extract(request);
    },
  };
}
