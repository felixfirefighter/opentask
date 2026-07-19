import { getEnvironment } from "@/shared/config/environment";

export function isOpenAIConfigured(): boolean {
  const apiKey = getEnvironment().OPENAI_API_KEY;
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}
