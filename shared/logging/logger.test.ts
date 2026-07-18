import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./logger";

describe("structured logging", () => {
  it("redacts credentials, user content, provider input, and push endpoints", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const secrets = {
      authorization: "Bearer sentinel-authorization",
      cookie: "sentinel-cookie",
      password: "sentinel-password",
      task: "sentinel-task-content",
      plannerInput: "sentinel-planner-input",
      plannerOutput: "sentinel-planner-output",
      pushEndpoint: "https://push.invalid/sentinel-endpoint",
      OPENAI_API_KEY: "sentinel-openai-key",
      VAPID_PRIVATE_KEY: "sentinel-vapid-key",
    };

    createLogger(destination).info(
      { request: { headers: secrets }, ...secrets, code: "TEST" },
      "redaction check",
    );

    for (const value of Object.values(secrets)) {
      expect(output).not.toContain(value);
    }
    expect(output).toContain("[Redacted]");
    expect(output).toContain('"code":"TEST"');
  });
});
