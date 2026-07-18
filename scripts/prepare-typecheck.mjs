import { lstat, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const nextRoot = resolve(".next");
const nextDevRoot = resolve(nextRoot, "dev");
const generatedDevTypes = resolve(nextDevRoot, "types");

if (dirname(dirname(generatedDevTypes)) !== nextRoot) {
  throw new Error("Refusing to clean generated type state outside .next.");
}

for (const path of [nextRoot, nextDevRoot, generatedDevTypes]) {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink()) {
      throw new Error(`Refusing to clean generated type state through symlink ${path}.`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await rm(generatedDevTypes, { force: true, recursive: true });
