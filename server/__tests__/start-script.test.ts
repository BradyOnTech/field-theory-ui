import { describe, it, expect } from "vitest";
import { readFileSync, statSync, accessSync, constants } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = resolve(PROJECT_ROOT, "start.sh");

describe("start.sh launch script", () => {
  it("exists at project root", () => {
    const stat = statSync(SCRIPT_PATH);
    expect(stat.isFile()).toBe(true);
  });

  it("has proper shebang (#!/usr/bin/env bash)", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
  });

  it("is executable", () => {
    expect(() => {
      accessSync(SCRIPT_PATH, constants.X_OK);
    }).not.toThrow();
  });

  it("checks for dist/ directory before building", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain('[ ! -d "dist" ]');
    expect(content).toContain("npm run build");
  });

  it("supports PORT env var override with default 3939", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain('PORT="${PORT:-3939}"');
  });

  it("starts the server with tsx", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain("npx tsx server/index.ts");
  });

  it("prints local URL", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain("LOCAL_URL");
    expect(content).toContain("http://localhost");
  });

  it("detects LAN IP and prints LAN URL", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain("LAN_IP");
    expect(content).toContain("LAN_URL");
    expect(content).toContain("networkInterfaces");
  });

  it("generates QR code using qrcode-terminal", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain("qrcode-terminal");
    expect(content).toContain("qr.generate");
  });

  it("passes LAN URL to QR code generator", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    // QR code should receive the LAN_URL via env var
    expect(content).toContain("LAN_URL");
    expect(content).toContain("process.env.LAN_URL");
  });

  it("waits for server health check before printing URLs", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain("/api/stats");
    expect(content).toContain("READY");
  });

  it("handles cleanup on signal", () => {
    const content = readFileSync(SCRIPT_PATH, "utf-8");
    expect(content).toContain("trap cleanup");
    expect(content).toContain("kill");
  });

  it("qrcode-terminal package is installed", () => {
    const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf-8"));
    expect(pkg.dependencies["qrcode-terminal"]).toBeDefined();
  });

  it("qrcode-terminal generates valid QR code for a URL", () => {
    // Execute qrcode-terminal and verify it produces block character output
    const output = execSync(
      `node -e "const qr = require('qrcode-terminal'); qr.generate('http://192.168.1.1:3939', {small: true}, (c) => console.log(c))"`,
      { cwd: PROJECT_ROOT, encoding: "utf-8" },
    );
    // QR code should contain block characters (▄, █, etc.)
    expect(output).toMatch(/[▄█▀]/);
    // QR code should have multiple lines
    expect(output.split("\n").length).toBeGreaterThan(5);
  });
});
