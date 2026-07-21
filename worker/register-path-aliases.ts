import { registerHooks } from "node:module";

import { resolveWorkspaceImport } from "./path-alias-resolver.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const workspaceUrl = resolveWorkspaceImport(specifier, context.parentURL);
    return workspaceUrl ? { shortCircuit: true, url: workspaceUrl } : nextResolve(specifier, context);
  },
});
