import { execFileSync } from "node:child_process";

const expectedServices = ["postgres", "web", "worker"];

const live = await readHealth("live", "ok");
const ready = await readHealth("ready", "ready");
await verifyPwaSurface();

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
  assertSecurityHeaders(response.headers);
  const body = await response.json();
  if (body.status !== expectedStatus) {
    throw new Error(`Production ${path} health returned an unexpected status.`);
  }
  return body;
}

async function verifyPwaSurface() {
  const manifestResponse = await readPublicPwaResource("/manifest.webmanifest");
  const manifestContentType = manifestResponse.headers.get("content-type") ?? "";
  if (!manifestContentType.includes("application/manifest+json")) {
    throw new Error("Production manifest has an unexpected content type.");
  }
  const manifest = await manifestResponse.json();
  if (
    manifest.id !== "/" ||
    manifest.scope !== "/" ||
    manifest.start_url !== "/today" ||
    manifest.display !== "standalone" ||
    manifest.prefer_related_applications !== false
  ) {
    throw new Error("Production manifest does not match the installable shell contract.");
  }

  const expectedIcons = new Map([
    ["/icons/opentask-192.png", "192x192"],
    ["/icons/opentask-512.png", "512x512"],
    ["/icons/opentask-maskable-512.png", "512x512"],
  ]);
  for (const icon of manifest.icons ?? []) {
    if (expectedIcons.get(icon.src) !== icon.sizes || icon.type !== "image/png") {
      throw new Error("Production manifest contains an unreviewed icon entry.");
    }
    const iconResponse = await readPublicPwaResource(icon.src);
    if (iconResponse.headers.get("content-type") !== "image/png") {
      throw new Error(`Production icon ${icon.src} has an unexpected content type.`);
    }
    if ((await iconResponse.arrayBuffer()).byteLength < 256) {
      throw new Error(`Production icon ${icon.src} is empty or truncated.`);
    }
    expectedIcons.delete(icon.src);
  }
  if (expectedIcons.size > 0) throw new Error("Production manifest is missing a required app icon.");

  const workerResponse = await readPublicPwaResource("/sw.js");
  const workerContentType = workerResponse.headers.get("content-type") ?? "";
  if (!workerContentType.includes("javascript")) {
    throw new Error("Production service worker has an unexpected content type.");
  }
  if (!workerResponse.headers.get("cache-control")?.includes("no-store")) {
    throw new Error("Production service worker is missing its update-safe cache policy.");
  }
  if (workerResponse.headers.get("service-worker-allowed") !== "/") {
    throw new Error("Production service worker is missing its explicit root scope.");
  }
  const workerSource = await workerResponse.text();
  for (const marker of ["opentask-static-", "SKIP_WAITING", "REPAIR_STATIC_SHELL"]) {
    if (!workerSource.includes(marker)) throw new Error(`Production service worker is missing ${marker}.`);
  }

  const fallbackResponse = await readPublicPwaResource("/offline.html");
  if (!fallbackResponse.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Production offline fallback has an unexpected content type.");
  }
  const fallback = await fallbackResponse.text();
  if (
    !fallback.includes('data-opentask-offline-fallback="content-free"') ||
    !fallback.includes("no account or task data")
  ) {
    throw new Error("Production offline fallback does not prove its content-free contract.");
  }
}

async function readPublicPwaResource(path) {
  const response = await fetch(`http://127.0.0.1:3000${path}`);
  if (!response.ok) throw new Error(`Production PWA resource ${path} returned HTTP ${response.status}.`);
  assertSecurityHeaders(response.headers);
  return response;
}

function assertSecurityHeaders(headers) {
  const policy = headers.get("content-security-policy") ?? "";
  if (!policy.includes("default-src 'self'") || !policy.includes("frame-ancestors 'none'")) {
    throw new Error("Production response is missing the required Content Security Policy.");
  }
  if (policy.includes("'unsafe-eval'")) {
    throw new Error("Production Content Security Policy permits unsafe evaluation.");
  }

  const expected = new Map([
    ["cross-origin-opener-policy", "same-origin"],
    ["permissions-policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["strict-transport-security", "max-age=31536000"],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
  ]);
  for (const [name, value] of expected) {
    if (headers.get(name) !== value) throw new Error(`Production response has an invalid ${name} header.`);
  }
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
