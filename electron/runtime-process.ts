import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { basename, join } from "node:path";
import { createServer, Socket, type Server } from "node:net";

export async function waitForHttp(url: string, timeoutMs: number, child?: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let processError: Error | undefined;
  const onProcessError = (error: Error) => {
    processError = error;
  };
  child?.once("error", onProcessError);
  try {
    while (Date.now() < deadline) {
      if (processError) throw new Error(`The local Next.js server could not start: ${processError.message}`);
      if (child && child.exitCode !== null) {
        throw new Error(
          `The local Next.js server exited before becoming ready (code ${child.exitCode ?? "unknown"}).`,
        );
      }
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) return;
      } catch {
        // The local server is expected to be unavailable while it is starting.
      }
      await delay(100);
    }
  } finally {
    child?.removeListener("error", onProcessError);
  }
  throw new Error(`The local Next.js server did not become ready within ${timeoutMs}ms.`);
}

export async function waitForTcp(port: number, timeoutMs: number, child?: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let processError: Error | undefined;
  const onProcessError = (error: Error) => {
    processError = error;
  };
  child?.once("error", onProcessError);
  try {
    while (Date.now() < deadline) {
      if (processError) {
        throw new Error(`The bundled PostgreSQL server could not start: ${processError.message}`);
      }
      if (child && child.exitCode !== null) {
        throw new Error(
          `The bundled PostgreSQL server exited before becoming ready (code ${child.exitCode ?? "unknown"}).`,
        );
      }
      const connected = await new Promise<boolean>((resolve) => {
        const socket = new Socket();
        socket.once("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("error", () => {
          socket.destroy();
          resolve(false);
        });
        socket.connect(port, "127.0.0.1");
      });
      if (connected) return;
      await delay(100);
    }
  } finally {
    child?.removeListener("error", onProcessError);
  }
  throw new Error(`The bundled PostgreSQL server did not become ready within ${timeoutMs}ms.`);
}

export async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await closeServer(server);
  if (!port) throw new Error("Unable to reserve a local port.");
  return port;
}

export async function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd?: string; env: NodeJS.ProcessEnv },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(Buffer.concat(output).toString("utf8"));
      else {
        const detail = Buffer.concat(errors).toString("utf8").trim().slice(-1_000);
        reject(
          new Error(
            `${basename(command)} exited with code ${code ?? "unknown"}.${detail ? ` ${detail}` : ""}`,
          ),
        );
      }
    });
  });
}

export async function stopProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 10_000);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

export async function requireFile(file: string): Promise<void> {
  try {
    await access(file);
  } catch {
    throw new Error(`Desktop runtime file is missing: ${file}`);
  }
}

export async function requireDirectory(directory: string): Promise<void> {
  try {
    await access(directory);
  } catch {
    throw new Error(`Desktop PostgreSQL runtime directory is missing: ${directory}`);
  }
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export function getNodeExecutable(resourcesPath: string, target: string, suffix: string): string {
  return join(resourcesPath, "runtime", "node", target, `node${suffix}`);
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
