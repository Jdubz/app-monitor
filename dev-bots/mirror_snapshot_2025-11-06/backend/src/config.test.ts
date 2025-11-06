import { describe, it, expect } from "vitest";
import { config, services, environments, scripts } from "./config";

describe("Config", () => {
  describe("Basic Configuration", () => {
    it("should have required configuration", () => {
      expect(config.port).toBeDefined();
      expect(config.corsOrigin).toBeDefined();
      expect(config.nodeEnv).toBeDefined();
      expect(config.gcpKeyFile).toBeDefined();
    });

    it("should have valid port number", () => {
      expect(config.port).toBeGreaterThan(0);
      expect(config.port).toBeLessThan(65536);
    });

    it("should have CORS origin configured", () => {
      expect(config.corsOrigin).toBeTruthy();
      expect(typeof config.corsOrigin).toBe("string");
    });

    it("should have node environment set", () => {
      expect(config.nodeEnv).toBeTruthy();
      expect(typeof config.nodeEnv).toBe("string");
    });

    it("should have GCP key file path", () => {
      expect(config.gcpKeyFile).toBeTruthy();
      expect(typeof config.gcpKeyFile).toBe("string");
    });
  });

  describe("Services Configuration", () => {
    it("should define service configurations", () => {
      expect(services).toBeDefined();
      expect(typeof services).toBe("object");
      expect(Object.keys(services).length).toBeGreaterThan(0);
    });

    it("should have job-finder-backend service", () => {
      expect(services["job-finder-backend"]).toBeDefined();
      expect(services["job-finder-backend"].name).toBe("job-finder-backend");
      expect(services["job-finder-backend"].displayName).toBeTruthy();
      expect(services["job-finder-backend"].command).toBe("npm");
      expect(services["job-finder-backend"].ports).toBeDefined();
      expect(Array.isArray(services["job-finder-backend"].ports)).toBe(true);
    });

    it("should have job-finder-frontend service", () => {
      expect(services["job-finder-frontend"]).toBeDefined();
      expect(services["job-finder-frontend"].name).toBe("job-finder-frontend");
      expect(services["job-finder-frontend"].command).toBe("npm");
    });

    it("should have job-finder-worker service", () => {
      expect(services["job-finder-worker"]).toBeDefined();
      expect(services["job-finder-worker"].name).toBe("job-finder-worker");
      expect(services["job-finder-worker"].command).toBe("python3");
    });

    it("should have valid service structure for all services", () => {
      Object.values(services).forEach((service) => {
        expect(service.name).toBeTruthy();
        expect(service.displayName).toBeTruthy();
        expect(service.description).toBeTruthy();
        expect(service.command).toBeTruthy();
        expect(Array.isArray(service.args)).toBe(true);
        expect(service.cwd).toBeTruthy();
      });
    });
  });

  describe("Environments Configuration", () => {
    it("should define environment configurations", () => {
      expect(environments).toBeDefined();
      expect(typeof environments).toBe("object");
      expect(Object.keys(environments).length).toBeGreaterThan(0);
    });

    it("should have local environment", () => {
      expect(environments.local).toBeDefined();
      expect(environments.local.name).toBe("local");
      expect(environments.local.displayName).toBeTruthy();
      expect(environments.local.projectId).toBe("local");
      expect(environments.local.readOnly).toBe(false);
      expect(Array.isArray(environments.local.services)).toBe(true);
    });

    it("should have staging environment", () => {
      expect(environments.staging).toBeDefined();
      expect(environments.staging.name).toBe("staging");
      expect(environments.staging.readOnly).toBe(true);
      expect(environments.staging.projectId).toBeTruthy();
    });

    it("should have production environment", () => {
      expect(environments.production).toBeDefined();
      expect(environments.production.name).toBe("production");
      expect(environments.production.readOnly).toBe(true);
    });

    it("should have valid environment structure", () => {
      Object.values(environments).forEach((env) => {
        expect(env.name).toBeTruthy();
        expect(env.displayName).toBeTruthy();
        expect(env.projectId).toBeTruthy();
        expect(Array.isArray(env.services)).toBe(true);
        expect(typeof env.readOnly).toBe("boolean");
      });
    });
  });

  describe("Scripts Configuration", () => {
    it("should define script configurations", () => {
      expect(scripts).toBeDefined();
      expect(typeof scripts).toBe("object");
      expect(Object.keys(scripts).length).toBeGreaterThan(0);
    });

    it("should have valid script structure for all scripts", () => {
      Object.values(scripts).forEach((script) => {
        expect(script.id).toBeTruthy();
        expect(script.name).toBeTruthy();
        expect(script.displayName).toBeTruthy();
        expect(script.description).toBeTruthy();
        expect(script.category).toBeTruthy();
        expect([
          "build",
          "test",
          "quality",
          "database",
          "deployment",
          "utility",
        ]).toContain(script.category);
        expect(script.command).toBeTruthy();
        expect(Array.isArray(script.args)).toBe(true);
        expect(script.cwd).toBeTruthy();
      });
    });

    it("should categorize scripts correctly", () => {
      const testScripts = Object.values(scripts).filter(
        (s) => s.category === "test",
      );
      const buildScripts = Object.values(scripts).filter(
        (s) => s.category === "build",
      );
      const databaseScripts = Object.values(scripts).filter(
        (s) => s.category === "database",
      );

      expect(testScripts.length).toBeGreaterThan(0);
      expect(buildScripts.length).toBeGreaterThan(0);
      expect(databaseScripts.length).toBeGreaterThan(0);
    });

    it("should have danger levels for dangerous scripts", () => {
      const dangerousScripts = Object.values(scripts).filter(
        (s) =>
          s.id.includes("clear") ||
          s.id.includes("production") ||
          s.id.includes("copy"),
      );

      dangerousScripts.forEach((script) => {
        expect(script.dangerLevel).toBeDefined();
        expect(["safe", "warning", "danger"]).toContain(script.dangerLevel);
      });
    });

    it("should require confirmation for dangerous operations", () => {
      const productionScripts = Object.values(scripts).filter((s) =>
        s.id.includes("production"),
      );

      productionScripts.forEach((script) => {
        expect(script.requiresConfirmation).toBe(true);
        expect(script.dangerLevel).toBe("danger");
      });
    });

    it("should have frontend scripts", () => {
      const feScripts = Object.values(scripts).filter((s) =>
        s.id.startsWith("fe-"),
      );
      expect(feScripts.length).toBeGreaterThan(0);

      feScripts.forEach((script) => {
        expect(script.cwd).toContain("job-finder-FE");
      });
    });

    it("should have backend scripts", () => {
      const beScripts = Object.values(scripts).filter((s) =>
        s.id.startsWith("be-"),
      );
      expect(beScripts.length).toBeGreaterThan(0);

      beScripts.forEach((script) => {
        expect(script.cwd).toContain("job-finder-BE");
      });
    });

    it("should have worker scripts", () => {
      const workerScripts = Object.values(scripts).filter((s) =>
        s.id.startsWith("worker-"),
      );
      expect(workerScripts.length).toBeGreaterThan(0);

      workerScripts.forEach((script) => {
        expect(script.cwd).toContain("job-finder-worker");
      });
    });
  });
});
