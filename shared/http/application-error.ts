import type { ProblemCode } from "./problem.ts";

export class ApplicationError extends Error {
  readonly code: ProblemCode;
  readonly currentVersion: number | undefined;

  constructor(code: ProblemCode, message: string, options?: ErrorOptions & { currentVersion?: number }) {
    super(message, options);
    if (
      options?.currentVersion !== undefined &&
      (!Number.isSafeInteger(options.currentVersion) || options.currentVersion < 1)
    ) {
      throw new RangeError("currentVersion must be a positive safe integer.");
    }
    this.name = "ApplicationError";
    this.code = code;
    this.currentVersion = options?.currentVersion;
  }
}
