import type { ProblemCode } from "./problem.ts";

export class ApplicationError extends Error {
  readonly code: ProblemCode;

  constructor(code: ProblemCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApplicationError";
    this.code = code;
  }
}
