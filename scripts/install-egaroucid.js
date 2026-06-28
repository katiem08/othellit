#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.join(__dirname, "..");
const installDir = path.join(rootDir, "vendor", "egaroucid");
const binaryPath = path.join(installDir, "Egaroucid_for_Console.out");
const resourcesPath = path.join(installDir, "resources");
const defaultLocalSource = "/Users/katiemirne/Documents/Egaroucid-console_v7.8.1";
const sourceDir = process.env.EGAROUCID_SOURCE_DIR || (fs.existsSync(defaultLocalSource) ? defaultLocalSource : "");
const repoUrl = process.env.EGAROUCID_REPO || "https://github.com/Nyanyan/Egaroucid.git";
const repoRef = process.env.EGAROUCID_REF || "";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function hasEngine() {
  return fs.existsSync(binaryPath)
    && fs.existsSync(path.join(resourcesPath, "book.egbk3"))
    && fs.existsSync(path.join(resourcesPath, "eval.egev2"));
}

function compilerCommand() {
  return process.env.CXX || (process.platform === "darwin" ? "clang++" : "g++");
}

function compile(sourceRoot) {
  const sourceFile = path.join(sourceRoot, "src", "Egaroucid_for_Console.cpp");
  const sourceResources = path.join(sourceRoot, "bin", "resources");
  if (!fs.existsSync(sourceFile)) throw new Error(`Missing Egaroucid source file: ${sourceFile}`);
  if (!fs.existsSync(sourceResources)) throw new Error(`Missing Egaroucid resources: ${sourceResources}`);

  fs.mkdirSync(installDir, { recursive: true });
  const defines = ["-DHAS_NO_AVX2"];
  if (process.platform === "darwin" && process.arch === "arm64") defines.push("-DHAS_ARM_PROCESSOR");
  const args = [
    "-O2",
    "-pthread",
    "-std=c++20",
    ...defines,
    sourceFile,
    "-o",
    binaryPath
  ];
  run(compilerCommand(), args);
  copyDir(sourceResources, resourcesPath);
  fs.chmodSync(binaryPath, 0o755);
}

function cloneSource() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "othellit-egaroucid-"));
  const target = path.join(tempRoot, "source");
  const args = ["clone", "--depth", "1"];
  if (repoRef) args.push("--branch", repoRef);
  args.push(repoUrl, target);
  run("git", args);
  return target;
}

function main() {
  if (process.env.SKIP_EGAROUCID_INSTALL === "1") {
    console.log("Skipping Egaroucid install.");
    return;
  }
  if (hasEngine()) {
    console.log("Egaroucid already installed.");
    return;
  }

  try {
    const sourceRoot = sourceDir && fs.existsSync(sourceDir) ? sourceDir : cloneSource();
    compile(sourceRoot);
    console.log(`Egaroucid installed at ${binaryPath}`);
  } catch (error) {
    if (process.env.REQUIRE_EGAROUCID === "1") {
      console.error(`Egaroucid install failed: ${error.message}`);
      process.exit(1);
    }
    console.warn(`Egaroucid install skipped: ${error.message}`);
    console.warn("Othellit will still run with the built-in fallback bot.");
  }
}

main();
