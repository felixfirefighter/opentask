import { notFound } from "next/navigation";

export function requireVisualProofDevelopment() {
  if (process.env.NODE_ENV !== "development") notFound();
}
