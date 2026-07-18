export const runtimeOutputProbes = [
  {
    filePath: "app/__raw_console_probe__.ts",
    source: 'console.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__raw_stream_probe__.ts",
    source: 'process.stdout.write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__aliased_console_probe__.ts",
    source: 'const output = console;\noutput.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__global_console_probe__.ts",
    source: 'globalThis.console.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__host_global_console_probe__.ts",
    source: 'global.console.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__window_console_probe__.ts",
    source: 'window.console.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__self_console_probe__.ts",
    source: 'self.console.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__destructured_stream_probe__.ts",
    source: 'const { stdout: output } = process;\noutput.write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__computed_stream_probe__.ts",
    source: 'const key = "stdout";\nconst output = process[key];\noutput.write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__reflect_stream_probe__.ts",
    source: 'Reflect.get(process, "stdout").write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__warning_output_probe__.ts",
    source: 'process.emitWarning("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__file_descriptor_output_probe__.ts",
    source: 'import * as fs from "node:fs";\nfs.writeSync(1, "task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__dynamic_file_descriptor_output_probe__.ts",
    source:
      'import * as fs from "node:fs";\nconst descriptor = Number(process.env.OUTPUT_FD);\nfs.write(descriptor, "task title", () => undefined);\n',
    expected: {},
  },
  {
    filePath: "app/__device_output_probe__.ts",
    source: 'import { writeFileSync } from "node:fs";\nwriteFileSync("/dev/stdout", "task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__console_module_output_probe__.ts",
    source:
      'import { Console } from "node:console";\nconst writer = new Console(process.stdout);\nwriter.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__dynamic_console_module_output_probe__.ts",
    source: 'void import("node:console");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__promise_device_output_probe__.ts",
    source: 'import { writeFile } from "node:fs/promises";\nvoid writeFile("/dev/stderr", "task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__descriptor_file_output_probe__.ts",
    source: 'import { writeFileSync } from "node:fs";\nwriteFileSync(1, "task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__vector_file_output_probe__.ts",
    source: 'import * as fs from "node:fs";\nfs.writevSync(2, [Buffer.from("task title")]);\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__stream_file_output_probe__.ts",
    source:
      'import { createWriteStream } from "node:fs";\ncreateWriteStream("/dev/stdout").write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__alternate_device_output_probe__.ts",
    source: 'import { writeFileSync } from "node:fs";\nwriteFileSync("/dev/fd/1", "task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__file_handle_output_probe__.ts",
    source:
      'import { open } from "node:fs/promises";\nconst output = await open("/dev/stdout", "w");\nawait output.write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__destructured_file_output_probe__.ts",
    source:
      'import * as fs from "node:fs";\nconst { writeFileSync } = fs;\nwriteFileSync("/dev/stdout", "task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__descriptor_console_output_probe__.ts",
    source: 'Object.getOwnPropertyDescriptor(globalThis, "console")?.value.log("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__descriptor_stream_output_probe__.ts",
    source: 'Object.getOwnPropertyDescriptor(process, "stdout")?.value.write("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__private_stream_output_probe__.ts",
    source: 'process.stdout._write("task title", "utf8", () => undefined);\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
  {
    filePath: "app/__raw_debug_output_probe__.ts",
    source: 'process._rawDebug("task title");\n',
    expected: { "opentask/no-unreviewed-output": 1 },
  },
];
