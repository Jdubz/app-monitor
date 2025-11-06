import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "../../.."); // backend/scripts -> backend -> app-monitor -> root

console.log("🔍 Verifying App Monitor Configuration...\n");

const hasValue = (value) => Boolean(value && value.trim().length > 0);

const resolveLogPath = (source) => {
  if (source.envPathVar) {
    const override = process.env[source.envPathVar];
    if (hasValue(override)) {
      return { path: path.resolve(override.trim()), overridden: true };
    }
  }

  if (source.defaultResolvedPath) {
    return { path: path.resolve(source.defaultResolvedPath), overridden: false };
  }

  const baseDir = source.projectRoot || path.join(__dirname, "..");
  const rawPath = source.path;
  const resolved = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(baseDir, rawPath);

  return { path: resolved, overridden: false };
};

// Check paths
const paths = [
  { name: "Root dir", path: ROOT_DIR },
  {
    name: "App Monitor Backend",
    path: path.join(ROOT_DIR, "app-monitor/backend"),
  },
  {
    name: "App Monitor Frontend",
    path: path.join(ROOT_DIR, "app-monitor/frontend"),
  },
  {
    name: "App Monitor logs dir",
    path: path.join(ROOT_DIR, "app-monitor/logs"),
  },
  {
    name: "Dev-bots logs dir",
    path: path.join(ROOT_DIR, "app-monitor/dev-bots/logs"),
  },
  { name: "Job Finder BE", path: path.join(ROOT_DIR, "job-finder-BE") },
  { name: "Job Finder FE", path: path.join(ROOT_DIR, "job-finder-FE") },
  { name: "Job Finder Worker", path: path.join(ROOT_DIR, "job-finder-worker") },
  { name: "BE logs dir", path: path.join(ROOT_DIR, "job-finder-BE/logs") },
  { name: "FE logs dir", path: path.join(ROOT_DIR, "job-finder-FE/logs") },
  {
    name: "Worker logs dir",
    path: path.join(ROOT_DIR, "job-finder-worker/logs"),
  },
  {
    name: "Log sources config",
    path: path.join(__dirname, "../config/log-sources.json"),
  },
  { name: "Backend .env", path: path.join(__dirname, "../.env") },
  {
    name: "Frontend .env",
    path: path.join(ROOT_DIR, "app-monitor/frontend/.env"),
  },
];

let allGood = true;
console.log("📁 Path Checks:");
paths.forEach(({ name, path: p }) => {
  const exists = fs.existsSync(p);
  console.log(`  ${exists ? "✅" : "❌"} ${name}: ${p}`);
  if (!exists) allGood = false;
});

// Check ports
console.log("\n🔌 Port Configuration:");
const ports = {
  "App Monitor Backend": 5000,
  "App Monitor Frontend": 5174,
  "Job Finder Backend": 5001,
  "Job Finder Frontend": 5173,
  "Firebase Emulator UI": 4000,
  "Firebase Emulator Hub": 4400,
  "Firebase Functions": 8080,
  "Firebase Auth": 9099,
  "Firebase Storage": 9199,
  "Job Finder Worker": 5555,
};

Object.entries(ports).forEach(([name, port]) => {
  console.log(`  📌 ${name}: ${port}`);
});

// Load and validate log sources config
console.log("\n📋 Log Sources Configuration:");
try {
  const configPath = path.join(__dirname, "../config/log-sources.json");
  const configDir = path.dirname(configPath);
  const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const workTargets = [];
  const sources = [];

  (rawConfig.workTargets || []).forEach((descriptor) => {
    const targetPath = path.resolve(configDir, descriptor.configPath);
    const targetConfig = JSON.parse(fs.readFileSync(targetPath, "utf-8"));

    const projectId = targetConfig.projectId || descriptor.id;
    const workTargetId = targetConfig.workTarget || descriptor.id;
    const displayName =
      targetConfig.displayName || descriptor.displayName || projectId;

    const projectRootEnv = targetConfig.projectRootEnv;
    const envRoot =
      projectRootEnv && hasValue(process.env[projectRootEnv])
        ? path.resolve(process.env[projectRootEnv].trim())
        : null;
    const defaultRoot = targetConfig.defaultRoot || ".";
    const projectRoot =
      envRoot || path.resolve(path.dirname(targetPath), defaultRoot);

    workTargets.push({
      id: workTargetId,
      projectId,
      displayName,
      projectRoot,
      projectRootEnv,
    });

    (targetConfig.logSources || []).forEach((source) => {
      sources.push({
        ...source,
        projectId,
        projectDisplayName: displayName,
        workTarget: workTargetId,
        projectRoot,
        projectRootEnv,
        defaultResolvedPath: path.isAbsolute(source.path)
          ? source.path
          : path.resolve(projectRoot, source.path),
      });
    });
  });

  const enabled = sources.filter((src) => src.enabled);

  console.log(`  Version: ${rawConfig.version}`);
  console.log(`  Work targets: ${workTargets.length}`);
  console.log(`  Total sources: ${sources.length}`);
  console.log(`  Enabled sources: ${enabled.length}`);
  console.log("");

  enabled.forEach((src) => {
    const { path: resolvedPath, overridden } = resolveLogPath(src);
    const dirExists = fs.existsSync(path.dirname(resolvedPath));
    console.log(
      `  ${dirExists ? "✅" : "⚠️"} ${src.name} (${src.projectDisplayName})`,
    );
    console.log(
      `     Path: ${resolvedPath}${overridden ? " (env override)" : ""}`,
    );
    console.log(
      `     Format: ${src.format} | Parser: ${src.parser} | Target: ${src.workTarget}`,
    );
  });
} catch (err) {
  console.log(`  ❌ Failed to load config: ${err.message}`);
  allGood = false;
}

// Environment variables
console.log("\n🌍 Environment Configuration:");
try {
  const envPath = path.join(__dirname, "../.env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  const envVars = envContent
    .split("\n")
    .filter((line) => line && !line.startsWith("#"));
  envVars.forEach((line) => {
    const [key] = line.split("=");
    console.log(`  ✅ ${key}`);
  });
} catch (err) {
  console.log(`  ❌ Failed to load .env: ${err.message}`);
  allGood = false;
}

console.log("\n" + "═".repeat(70));
if (allGood) {
  console.log("✅ All checks passed! Configuration is ready.");
  console.log("\nNext steps:");
  console.log("  1. cd app-monitor");
  console.log("  2. make dev-backend  (start backend)");
  console.log("  3. make dev-frontend (start frontend in new terminal)");
  console.log("  4. Open http://localhost:5174");
} else {
  console.log("❌ Some checks failed. Review errors above.");
  process.exit(1);
}
console.log("═".repeat(70));

process.exit(0);
