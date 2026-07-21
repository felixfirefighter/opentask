export type DesktopTarget = "windows-x64" | "macos-x64" | "macos-arm64";

export function getDesktopTarget(
  platform: NodeJS.Platform = process.platform,
  architecture: NodeJS.Architecture = process.arch,
): DesktopTarget {
  if (platform === "win32" && architecture === "x64") return "windows-x64";
  if (platform === "darwin" && architecture === "x64") return "macos-x64";
  if (platform === "darwin" && architecture === "arm64") return "macos-arm64";
  if (platform === "win32") throw new Error("Windows desktop packaging currently supports x64 only.");
  throw new Error(`Unsupported desktop target: ${platform}/${architecture}.`);
}

export function getExecutableSuffix(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? ".exe" : "";
}
