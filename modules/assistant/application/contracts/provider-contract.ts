import type { ModelExtraction, PlannerExtractionRequest } from "./extraction-contract";

export type PlannerExtractionResult = Readonly<{
  extraction: ModelExtraction;
  model: string;
}>;

export type PlannerExtractionProvider = Readonly<{
  extract(request: PlannerExtractionRequest): Promise<PlannerExtractionResult>;
}>;
