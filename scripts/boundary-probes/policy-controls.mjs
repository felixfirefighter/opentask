export function createPolicyControlProbes(probeModule) {
  return [
    {
      filePath: "shared/db/schema.ts",
      source: 'import "../../modules/identity/infrastructure/schema.ts";\n',
      expected: {},
    },
    {
      filePath: "shared/db/__schema_deep_import_probe__.ts",
      source: 'import "../../modules/identity/infrastructure/schema.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: `modules/${probeModule}/application/database-use-control.ts`,
      source:
        'import { getDatabasePool } from "../../../shared/db/client.ts";\nexport function hasDatabasePort() { return Boolean(getDatabasePool); }\n',
      expected: {},
    },
    {
      filePath: `modules/${probeModule}/application/database-scalar-result-control.ts`,
      source:
        'import { getDatabasePool as pool } from "../../../shared/db/client.ts";\nexport async function databaseReady(): Promise<boolean> {\n  return (await pool().query("select 1")).rowCount === 1;\n}\n',
      expected: {},
    },
    {
      filePath: "app/__benign_loader_names_control__.ts",
      source:
        "export function invoke(require: () => void) { require(); }\nexport const service = { require: true, getBuiltinModule: () => true };\n",
      expected: {},
    },
    {
      filePath: "app/__member_names_control__.ts",
      source:
        "interface Reporter { console(): void; require: boolean }\ntype Metadata = { module: string; eval: boolean; Function: string };\nclass Service { console() { return true; } require() { return true; } }\nexport type { Metadata, Reporter };\nexport { Service };\n",
      expected: {},
    },
    {
      filePath: "app/__label_names_control__.ts",
      source: "require: { break require; }\nexport const safe = true;\n",
      expected: {},
    },
    {
      filePath: "app/__shadowed_function_control__.ts",
      source: "export function invoke(Function: () => void) { Function(); }\n",
      expected: {},
    },
    {
      filePath: "app/__tty_read_control__.ts",
      source: "export const isTty = process.stdout.isTTY;\n",
      expected: {},
    },
    {
      filePath: "app/__ordinary_file_descriptor_control__.ts",
      source:
        'import { openSync, writeSync } from "node:fs";\nconst descriptor = openSync("/tmp/report.txt", "w");\nwriteSync(descriptor, "file content");\n',
      expected: {},
    },
    {
      filePath: "shared/config/__imported_member_names_control__.ts",
      source:
        'import { console as channel, eval as evaluate, Function as Factory, module as featureModule, require as needs } from "./environment";\nvoid [channel, evaluate, Factory, featureModule, needs];\n',
      expected: {},
    },
    {
      filePath: "shared/config/__reexported_member_names_control__.ts",
      source:
        'export { console as channel, eval as evaluate, Function as Factory, module as featureModule, require as needs } from "./environment";\n',
      expected: {},
    },
    {
      filePath: "app/__direct_node_modules_probe__.ts",
      source: 'import "../node_modules/pg/esm/index.mjs";\n',
      expected: { "opentask/direct-node-modules": 1 },
    },
    {
      filePath: "worker/__module_boundary_probe__.ts",
      source: 'import "../modules/planning/presentation/TodayScreen.tsx";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "worker/__presentation_index_probe__.ts",
      source: 'import "../modules/planning/presentation/index.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "worker/__application_index_control__.ts",
      source: 'import "../modules/planning/index.ts";\n',
      expected: {},
    },
    {
      filePath: "worker/__dynamic_package_probe__.ts",
      source: 'void import("pg/lib/client");\n',
      expected: { "opentask/no-data-packages": 1 },
    },
    {
      filePath: "shared/presentation/__database_package_probe__.tsx",
      source: 'import "drizzle-orm";\nimport "pg";\n',
      expected: { "opentask/no-data-packages": 2 },
    },
    {
      filePath: "shared/presentation/__feature_boundary_probe__.tsx",
      source: 'import "../../modules/planning/index.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "shared/presentation/__server_boundary_probe__.tsx",
      source: 'import "../config/environment.ts";\n',
      expected: { "boundaries/dependencies": 1 },
    },
    {
      filePath: "shared/time/__database_package_probe__.ts",
      source: 'import "pg/lib/client";\n',
      expected: { "opentask/no-data-packages": 1 },
    },
    {
      filePath: `modules/${probeModule}/domain/import-type.ts`,
      source:
        'type Screen = typeof import("../../planning/presentation/TodayScreen.tsx").TodayScreen;\nexport type { Screen };\n',
      expected: { "opentask/explicit-type-imports": 1 },
    },
    {
      filePath: `modules/${probeModule}/infrastructure/component.tsx`,
      source: 'import "pg";\nexport function Component() { return <div />; }\n',
      expected: { "no-restricted-syntax": 1 },
    },
    {
      filePath: `modules/${probeModule}/presentation/raw-logger.ts`,
      source: 'void import("pino/pino.js");\n',
      expected: { "opentask/no-raw-pino": 1 },
    },
    {
      filePath: `modules/${probeModule}/ui/unknown-layer.ts`,
      source: 'import "pg";\n',
      expected: { "no-restricted-syntax": 1 },
    },
    {
      filePath: `modules/${probeModule}/private.ts`,
      source: 'import "pg";\n',
      expected: { "no-restricted-syntax": 1 },
    },
    {
      filePath: "scripts/__logger_boundary_probe__.ts",
      source: 'import pino from "pino";\nexport default pino;\n',
      expected: { "opentask/no-raw-pino": 1 },
    },
  ];
}
