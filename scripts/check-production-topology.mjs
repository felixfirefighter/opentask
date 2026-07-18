import { execFileSync } from "node:child_process";

const expectedServices = ["postgres", "web", "worker"];

const live = await readHealth("live", "ok");
const ready = await readHealth("ready", "ready");

if (live.status !== "ok" || ready.status !== "ready") {
  throw new Error("Production health endpoints returned an unexpected payload.");
}

const services = readComposeServices();
for (const service of expectedServices) {
  const current = services.get(service);
  if (!current || current.state.toLowerCase() !== "running") {
    throw new Error(`Compose service ${service} is not running.`);
  }
}

for (const service of ["postgres", "web"]) {
  if (services.get(service)?.health.toLowerCase() !== "healthy") {
    throw new Error(`Compose service ${service} is not healthy.`);
  }
}

for (const service of ["web", "worker"]) {
  const containerId = compose(["ps", "--quiet", service]).trim();
  const pidOne = docker([
    "exec",
    containerId,
    "node",
    "-e",
    "process.stdout.write(require('node:path').basename(require('node:fs').readlinkSync('/proc/1/exe')))",
  ]).trim();

  if (pidOne !== "node") {
    throw new Error(`Compose service ${service} does not run Node as PID 1.`);
  }
}

const applicationImages = new Set(
  ["web", "worker"].map((service) => {
    const containerId = compose(["ps", "--quiet", service]).trim();
    return docker(["inspect", "--format", "{{.Image}}", containerId]).trim();
  }),
);
if (applicationImages.size !== 1) {
  throw new Error("Web and worker are not running the same production image.");
}

const workerEvents = compose(["logs", "--no-color", "worker"])
  .split("\n")
  .map((line) => line.slice(line.indexOf("{")).trim())
  .filter((line) => line.startsWith("{"))
  .flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
const readyEvent = workerEvents.find((event) => event.code === "WORKER_READY");

if (!readyEvent || readyEvent.registeredJobCount !== 0) {
  throw new Error("The production worker did not report a zero-job ready event.");
}

compose(["stop", "--timeout", "15", "web", "worker"], "inherit");
for (const service of ["web", "worker"]) {
  const containerId = compose(["ps", "--all", "--quiet", service]).trim();
  const state = JSON.parse(docker(["inspect", "--format", "{{json .State}}", containerId]));
  const acceptedExitCodes = service === "web" ? [0, 143] : [0];
  if (state.Running || state.OOMKilled || !acceptedExitCodes.includes(state.ExitCode)) {
    throw new Error(`Compose service ${service} did not stop cleanly after SIGTERM.`);
  }
}

process.stdout.write(
  "Production topology passed health, shared-image process, zero-job worker, and graceful-stop checks.\n",
);

async function readHealth(path, expectedStatus) {
  const response = await fetch(`http://127.0.0.1:3000/api/health/${path}`);
  if (!response.ok) throw new Error(`Production ${path} health returned HTTP ${response.status}.`);
  const body = await response.json();
  if (body.status !== expectedStatus) {
    throw new Error(`Production ${path} health returned an unexpected status.`);
  }
  return body;
}

function readComposeServices() {
  const output = compose(["ps", "--format", "json"]).trim();
  const rows = output.startsWith("[")
    ? JSON.parse(output)
    : output
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

  return new Map(
    rows.map((row) => [row.Service, { state: String(row.State ?? ""), health: String(row.Health ?? "") }]),
  );
}

function compose(args, stdio = "pipe") {
  return execFileSync("docker", ["compose", ...args], { encoding: "utf8", stdio });
}

function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8" });
}
