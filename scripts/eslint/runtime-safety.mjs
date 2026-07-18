import { noRuntimeLoaderEscapesRule } from "./runtime-loader-safety.mjs";
import { noUnreviewedOutputRule } from "./runtime-output-safety.mjs";

export const runtimeSafety = {
  rules: {
    "no-runtime-loader-escapes": noRuntimeLoaderEscapesRule,
    "no-unreviewed-output": noUnreviewedOutputRule,
  },
};
