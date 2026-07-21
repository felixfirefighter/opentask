import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { randomBytes } from "node:crypto";

import { getDesktopTarget, getExecutableSuffix } from "./target.js";
import {
  fileExists,
  getNodeExecutable,
  requireDirectory,
  requireFile,
  reservePort,
  runCommand,
  stopProcess,
  waitForHttp,
  waitForTcp,
} from "./runtime-process.js";

export type DesktopRuntimeMode = "development" | "production";

export type DesktopRuntime = Readonly<{
  serverUrl: string;
  stop(): Promise<void>;
}>;

type RuntimeOptions = Readonly<{
  mode: DesktopRuntimeMode;
  projectRoot: string;
  resourcesPath: string;
  userDataPath: string;
}>;

type DatabaseRuntime = Readonly<{
  connectionString: string;
  stop(): Promise<void>;
}>;

export async function startDesktopRuntime(options: RuntimeOptions): Promise<DesktopRuntime> {
  const serverPort = await reservePort();
  const database = await startDatabase(options);
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const environment = await createServerEnvironment(
    options,
    database.connectionString,
    serverPort,
    serverUrl,
  );
  let server: ChildProcess | undefined;

  try {
    if (options.mode === "production") {
      await runMigrations(options, environment);
    }
    server = startNextServer(options, environment);
    await waitForHttp(`${serverUrl}/api/health/ready`, 45_000, server);
    return {
      serverUrl,
      stop: async () => {
        await stopProcess(server);
        await database.stop();
      },
    };
  } catch (error) {
    await stopProcess(server);
    await database.stop();
    throw error;
  }
}

async function startDatabase(options: RuntimeOptions): Promise<DatabaseRuntime> {
  if (options.mode === "development") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for Electron development. Run pnpm db:up first.");
    }
    return { connectionString, stop: async () => undefined };
  }

  const target = getDesktopTarget();
  const runtimeRoot = join(options.resourcesPath, "runtime");
  const postgresRoot = join(runtimeRoot, "postgres", target);
  const binaryDirectory = join(postgresRoot, "bin");
  const libraryDirectory = join(postgresRoot, "lib");
  const shareDirectory = join(postgresRoot, "share");
  const executable = (name: string) => join(binaryDirectory, `${name}${getExecutableSuffix()}`);
  const postgres = executable("postgres");
  const initdb = executable("initdb");
  const createdb = executable("createdb");
  const pgctl = executable("pg_ctl");
  const psql = executable("psql");
  for (const file of [postgres, initdb, createdb, pgctl, psql]) await requireFile(file);
  await requireDirectory(libraryDirectory);
  await requireDirectory(shareDirectory);
  const localeDirectory = join(shareDirectory, "locale");

  const dataDirectory = join(options.userDataPath, "postgres-data");
  await mkdir(dataDirectory, { recursive: true });
  const port = await reservePort();
  const processEnvironment: NodeJS.ProcessEnv = {
    ...getChildEnvironment(),
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGUSER: "omplish",
    PATH: [binaryDirectory, libraryDirectory, process.env.PATH].filter(Boolean).join(delimiter),
    ...((await fileExists(localeDirectory)) ? { PGLOCALEDIR: localeDirectory } : {}),
  };
  if (process.platform === "darwin") {
    processEnvironment.DYLD_LIBRARY_PATH = [libraryDirectory, process.env.DYLD_LIBRARY_PATH]
      .filter(Boolean)
      .join(delimiter);
  }

  if (!(await fileExists(join(dataDirectory, "PG_VERSION")))) {
    await runCommand(
      initdb,
      ["-D", dataDirectory, "--username=omplish", "--auth=trust", "--no-locale", "--encoding=UTF8"],
      {
        env: processEnvironment,
      },
    );
  }

  const server = spawn(postgres, ["-D", dataDirectory, "-h", "127.0.0.1", "-p", String(port)], {
    cwd: postgresRoot,
    env: processEnvironment,
    stdio: "ignore",
    windowsHide: true,
  });
  try {
    await waitForTcp(port, 30_000, server);
    const databaseExists = await runCommand(
      psql,
      ["--dbname=postgres", "-Atqc", "select 1 from pg_database where datname = 'omplish'"],
      {
        env: processEnvironment,
      },
    );
    if (databaseExists.trim() !== "1") {
      await runCommand(createdb, ["omplish"], { env: processEnvironment });
    }
  } catch (error) {
    await stopPostgres(pgctl, dataDirectory, processEnvironment, server);
    throw error;
  }

  return {
    connectionString: `postgresql://omplish@127.0.0.1:${port}/omplish`,
    stop: async () => {
      await stopPostgres(pgctl, dataDirectory, processEnvironment, server);
    },
  };
}

async function stopPostgres(
  pgctl: string,
  dataDirectory: string,
  environment: NodeJS.ProcessEnv,
  server: ChildProcess,
): Promise<void> {
  if (server.exitCode !== null) return;
  await runCommand(pgctl, ["-D", dataDirectory, "-m", "fast", "stop"], {
    env: environment,
  }).catch(() => undefined);
  await stopProcess(server);
}

async function createServerEnvironment(
  options: RuntimeOptions,
  databaseUrl: string,
  serverPort: number,
  serverUrl: string,
): Promise<NodeJS.ProcessEnv> {
  return {
    ...getChildEnvironment(),
    NODE_ENV: options.mode === "production" ? "production" : "development",
    HOSTNAME: "127.0.0.1",
    PORT: String(serverPort),
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: serverUrl,
    BETTER_AUTH_SECRET: await getStableSecret(options.userDataPath),
  };
}

function startNextServer(options: RuntimeOptions, environment: NodeJS.ProcessEnv): ChildProcess {
  if (options.mode === "development") {
    const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    return spawn(packageManager, ["dev"], {
      cwd: options.projectRoot,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
  }

  const serverRoot = join(options.resourcesPath, "next-server");
  const serverFile = join(serverRoot, "server.js");
  const node = getNodeExecutable(options.resourcesPath, getDesktopTarget(), getExecutableSuffix());
  return spawn(node, [serverFile], {
    cwd: serverRoot,
    env: environment,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function runMigrations(options: RuntimeOptions, environment: NodeJS.ProcessEnv): Promise<void> {
  const serverRoot = join(options.resourcesPath, "next-server");
  const migrationScript = join(serverRoot, "scripts", "migrate.ts");
  const node = getNodeExecutable(options.resourcesPath, getDesktopTarget(), getExecutableSuffix());
  await requireFile(migrationScript);
  await runCommand(node, ["--experimental-strip-types", migrationScript], {
    cwd: serverRoot,
    env: environment,
  });
}

async function getStableSecret(userDataPath: string): Promise<string> {
  const secretFile = join(userDataPath, "instance-secret");
  await mkdir(userDataPath, { recursive: true, mode: 0o700 });
  try {
    const existing = (await readFile(secretFile, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Another process may create the file between the read and write attempts.
  }
  const secret = randomBytes(32).toString("base64url");
  await writeFile(secretFile, `${secret}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }).catch(
    async () => undefined,
  );
  const stored = (await readFile(secretFile, "utf8")).trim();
  if (stored.length < 32) throw new Error("The local instance secret is invalid.");
  return stored;
}

function getChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.NODE_OPTIONS;
  return environment;
}
