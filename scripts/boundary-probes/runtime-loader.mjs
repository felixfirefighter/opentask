export const runtimeLoaderProbes = [
  {
    filePath: "app/__alternate_loader_probe__.ts",
    source:
      'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\nload("pg");\n',
    expected: { "opentask/no-alternate-loaders": 1 },
  },
  {
    filePath: "app/__aliased_require_probe__.ts",
    source: 'const load = require;\nload("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__module_require_probe__.ts",
    source: 'module.require("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__builtin_loader_probe__.ts",
    source: 'process.getBuiltinModule("node:module").createRequire(import.meta.url)("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__direct_require_probe__.ts",
    source: 'require("pg");\n',
    expected: {
      "@typescript-eslint/no-require-imports": 1,
      "opentask/no-data-packages": 1,
      "opentask/no-runtime-loader-escapes": 1,
    },
  },
  {
    filePath: "app/__eval_probe__.ts",
    source: "eval('import(\"pg\")');\n",
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__function_constructor_probe__.ts",
    source: "new Function('return import(\"pg\")');\n",
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__computed_module_loader_probe__.ts",
    source: 'const key = "require";\nmodule[key]("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__reflect_module_loader_probe__.ts",
    source: 'Reflect.get(module, "require")("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__destructured_module_loader_probe__.ts",
    source: 'const { ["require"]: load } = module;\nload("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__destructured_builtin_loader_probe__.ts",
    source: 'const { getBuiltinModule } = process;\ngetBuiltinModule("node:module");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__computed_builtin_loader_probe__.ts",
    source: 'const key = "get" + "BuiltinModule";\nprocess[key]("node:module");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__reflect_builtin_loader_probe__.ts",
    source: 'Reflect.get(process, "getBuiltinModule")("node:module");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__webpack_loader_probe__.ts",
    source: '__non_webpack_require__("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__aliased_eval_probe__.ts",
    source: "const run = eval;\nrun('import(\"pg\")');\n",
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__global_eval_probe__.ts",
    source: 'globalThis["e" + "val"](\'import("pg")\');\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__aliased_function_probe__.ts",
    source: 'const Factory = Function;\nnew Factory("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__global_function_probe__.ts",
    source: 'globalThis["Func" + "tion"]("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__host_global_eval_probe__.ts",
    source: "global.eval('import(\"pg\")');\n",
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__window_eval_probe__.ts",
    source: "window.eval('import(\"pg\")');\n",
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__self_function_probe__.ts",
    source: 'self.Function("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__host_global_require_probe__.ts",
    source: 'global.require("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__destructured_window_eval_probe__.ts",
    source: "const { eval: run } = window;\nrun('import(\"pg\")');\n",
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__declared_webpack_loader_probe__.ts",
    source:
      'const __non_webpack_require__ = (packageName: string) => packageName;\n__non_webpack_require__("pg");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__ambient_require_probe__.ts",
    source: 'declare const require: (packageName: string) => unknown;\nrequire("pg");\n',
    expected: {
      "opentask/no-data-packages": 1,
      "opentask/no-runtime-loader-escapes": 1,
    },
  },
  {
    filePath: "app/__imported_process_loader_probe__.ts",
    source: 'import runtimeProcess from "node:process";\nruntimeProcess.getBuiltinModule("node:module");\n',
    expected: { "opentask/no-alternate-loaders": 1 },
  },
  {
    filePath: "app/__implied_eval_probe__.ts",
    source: 'setTimeout("globalThis.console.log(1)", 0);\n',
    expected: { "no-implied-eval": 1 },
  },
  {
    filePath: "app/__async_function_constructor_probe__.ts",
    source: 'new AsyncFunction("return import(\\"pg\\")");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__derived_async_function_probe__.ts",
    source:
      'const AsyncFactory = Object.getPrototypeOf(async function () {}).constructor;\nnew AsyncFactory("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__computed_async_function_probe__.ts",
    source: 'const Factory = (async () => {})["constructor"];\nnew Factory("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__aliased_async_function_probe__.ts",
    source:
      'const source = async () => undefined;\nconst Factory = source.constructor;\nnew Factory("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__reflect_function_constructor_probe__.ts",
    source:
      'async function source() {}\nconst Factory = Reflect.get(source, "constructor");\nnew Factory("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__descriptor_eval_probe__.ts",
    source: 'Object.getOwnPropertyDescriptor(globalThis, "eval")?.value("return 1");\n',
    expected: { "opentask/no-runtime-loader-escapes": 1 },
  },
  {
    filePath: "app/__virtual_machine_probe__.ts",
    source: 'import vm from "node:vm";\nvm.runInThisContext("return 1");\n',
    expected: { "opentask/no-alternate-loaders": 1 },
  },
  {
    filePath: "app/__process_spread_probe__.ts",
    source: 'const runtime = { ...process };\nruntime.getBuiltinModule("node:module");\n',
    expected: {
      "opentask/no-runtime-loader-escapes": 1,
      "opentask/no-unreviewed-output": 1,
    },
  },
  {
    filePath: "app/__process_assign_probe__.ts",
    source: 'const runtime = Object.assign({}, process);\nruntime.getBuiltinModule("node:module");\n',
    expected: {
      "opentask/no-runtime-loader-escapes": 1,
      "opentask/no-unreviewed-output": 1,
    },
  },
];
