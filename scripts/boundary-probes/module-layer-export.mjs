export function createModuleLayerExportProbes(probeModule) {
  return [
    {
      filePath: "app/__forbidden_boundary_probe__.ts",
      source:
        'import { drizzle } from "drizzle-orm";\nimport "@/modules/planning/presentation/TodayScreen";\nexport default drizzle;\n',
      expected: {
        "boundaries/dependencies": 1,
        "opentask/no-data-packages": 1,
      },
    },
    {
      filePath: "modules/boundary-probe/domain/forbidden.ts",
      source: 'import React from "react";\nimport { sql } from "drizzle-orm";\nexport { React, sql };\n',
      expected: {
        "opentask/no-data-packages": 1,
        "opentask/no-framework-packages": 1,
      },
    },
    {
      filePath: `modules/${probeModule}/presentation/leak.ts`,
      source: 'import "../infrastructure/repository.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/presentation/server-shared.ts`,
      source: 'import "../../../shared/config/environment.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/cross-module.ts`,
      source: 'import "../../planning/presentation/TodayScreen.tsx";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/wrong-layer.ts`,
      source: 'import "../presentation/view.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/shared-view.ts`,
      source: 'import "../../../shared/presentation/Button.tsx";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/direct-database-reexport.ts`,
      source: 'export { getDatabasePool } from "../../../shared/db/client.ts";\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/indirect-database-reexport.ts`,
      source: 'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nexport { pool };\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/aliased-database-reexport.ts`,
      source:
        'import * as database from "../../../shared/db/client.ts";\nconst pool = database.getDatabasePool;\nexport { pool };\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/declared-database-reexport.ts`,
      source:
        'import * as database from "../../../shared/db/client.ts";\nexport const pool = database.getDatabasePool;\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/object-database-reexport.ts`,
      source:
        'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nexport const api = { pool };\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/called-database-reexport.ts`,
      source:
        'import { getDatabasePool } from "../../../shared/db/client.ts";\nexport default getDatabasePool();\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/function-database-reexport.ts`,
      source:
        'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nexport function leaked() { return pool; }\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/arrow-database-reexport.ts`,
      source:
        'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nexport const leaked = () => pool;\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/assigned-database-reexport.ts`,
      source:
        'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nlet leaked: unknown = null;\nleaked = pool;\nexport { leaked };\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/wrapped-database-reexport.ts`,
      source:
        'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nconst identity = <T>(value: T) => value;\nexport const leaked = identity(pool);\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/infrastructure-reexport.ts`,
      source: 'export * from "../infrastructure/repository.ts";\n',
      expected: { "opentask/no-private-runtime-reexports": 1 },
    },
    {
      filePath: `modules/${probeModule}/domain/wrong-layer.ts`,
      source: 'import "../presentation/view.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/domain/cross-module.ts`,
      source: 'import "../../planning/index.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/domain/server-shared.ts`,
      source: 'import "../../../shared/logging/logger.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/infrastructure/shared-view.ts`,
      source: 'import "../../../shared/presentation/Button.tsx";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/index.ts`,
      source: 'export * from "./infrastructure/repository.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/index.ts`,
      source: 'export * from "./presentation/view.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/index.ts`,
      source: 'export * from "./domain/value.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/index.ts`,
      source: 'import "pg";\nimport "@/shared/db/client";\n',
      expected: {
        "boundaries/dependencies": 1,
        "no-restricted-imports": 1,
        "opentask/no-data-packages": 1,
      },
    },
    {
      filePath: `modules/${probeModule}/index.ts`,
      source: 'import "../../shared/db/client.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "modules/planning/presentation/root-file.ts",
      source: `import "../../${probeModule}/private.ts";\n`,
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/public-index.ts`,
      source: 'import "../../planning/index.ts";\n',
      expected: {},
    },
    {
      filePath: `modules/${probeModule}/infrastructure/public-index.ts`,
      source: 'import "../../planning/index.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/presentation/public-index.ts`,
      source: 'import "../../planning/index.ts";\n',
      expected: {},
    },
    {
      filePath: `modules/${probeModule}/application/presentation-index.ts`,
      source: 'import "../../planning/presentation/index.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "app/__presentation_index_control__.ts",
      source: 'import "../modules/planning/presentation/index.ts";\n',
      expected: {},
    },
    {
      filePath: "app/__presentation_alias_control__.ts",
      source: 'import "@/modules/planning/presentation/index.ts";\n',
      expected: {},
    },
    {
      filePath: "app/__database_boundary_probe__.ts",
      source: 'import "../shared/db/client.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "app/__module_root_boundary_probe__.ts",
      source: `import "../modules/${probeModule}/private.ts";\n`,
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "app/__dynamic_boundary_probe__.ts",
      source: 'void import("../modules/planning/presentation/TodayScreen.tsx");\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "app/__dynamic_package_probe__.ts",
      source: 'void import("pg/lib/client");\n',
      expected: { "opentask/no-data-packages": 1 },
    },
    {
      filePath: "app/__computed_import_probe__.ts",
      source: 'const path = "../shared/db/client.ts";\nvoid import(path);\n',
      expected: { "opentask/literal-dynamic-imports": 1 },
    },
    {
      filePath: "app/__javascript_boundary_probe__.js",
      source: 'import "../shared/db/client.ts";\n',
      expected: { "no-restricted-syntax": 1 },
    },
    {
      filePath: "app/__alternate_extension_probe__.mts",
      source: 'import "pg";\n',
      expected: { "no-restricted-syntax": 1 },
    },
  ];
}
