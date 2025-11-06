/**
 * Cloud Logging Service Simple Tests
 *
 * Tests the basic functionality of CloudLogging service
 * focusing on what actually works in the implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CloudLogging } from "./cloudLogging.js";
import { Logging } from "@google-cloud/logging";
import { logger } from "../utils/logger.js";
import * as fs from "fs";

// Mock dependencies
vi.mock("@google-cloud/logging");
vi.mock("../utils/logger.js");
vi.mock("fs");

describe("CloudLogging Simple Tests", () => {
  let cloudLogging: CloudLogging;
  let mockLogging: any;
  let mockFs: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs
    mockFs = vi.mocked(fs);
    mockFs.existsSync.mockReturnValue(true);

    // Mock Google Cloud Logging
    mockLogging = {
      getEntries: vi.fn(),
      entry: vi.fn(),
    };
    vi.mocked(Logging).mockImplementation(() => mockLogging);

    // Mock logger
    vi.mocked(logger.info).mockImplementation(() => {});
    vi.mocked(logger.warn).mockImplementation(() => {});
    vi.mocked(logger.error).mockImplementation(() => {});
    vi.mocked(logger.debug).mockImplementation(() => {});

    cloudLogging = new CloudLogging();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Functionality", () => {
    it("should initialize successfully", () => {
      // Given: CloudLogging is created
      // When: Initialization completes
      // Then: No errors are thrown
      expect(cloudLogging).toBeDefined();
      expect(Logging).toHaveBeenCalled();
    });

    it("should check for GCP key file", () => {
      // Given: CloudLogging is created
      // When: Initialization completes
      // Then: GCP key file is checked
      expect(mockFs.existsSync).toHaveBeenCalled();
    });

    it("should return availability status", () => {
      // Given: CloudLogging instance
      // When: Checking availability
      const isAvailable = cloudLogging.isAvailable();

      // Then: Boolean is returned
      expect(typeof isAvailable).toBe("boolean");
    });
  });

  describe("Environment Management", () => {
    it("should get available environments", () => {
      // Given: CloudLogging instance
      // When: Getting environments
      const environments = cloudLogging.getEnvironments();

      // Then: Environments object is returned
      expect(environments).toBeDefined();
      expect(typeof environments).toBe("object");
    });

    it("should get services for valid environment", () => {
      // Given: Valid environment name
      const environmentName = "staging";

      // When: Getting services
      const services = cloudLogging.getServicesForEnvironment(environmentName);

      // Then: Services array is returned
      expect(services).toBeDefined();
      expect(Array.isArray(services)).toBe(true);
    });

    it("should throw error for unknown environment", () => {
      // Given: Unknown environment
      const environmentName = "unknown-environment";

      // When: Getting services
      // Then: Error is thrown
      expect(() => {
        cloudLogging.getServicesForEnvironment(environmentName);
      }).toThrow('Environment "unknown-environment" not found');
    });
  });

  describe("Trace URL Generation", () => {
    it("should generate trace URL", () => {
      // Given: Project ID and trace ID
      const projectId = "test-project";
      const traceId = "test-trace-id";

      // When: Generating trace URL
      const url = cloudLogging.getTraceUrl(projectId, traceId);

      // Then: URL is generated
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
      expect(url).toContain(projectId);
      expect(url).toContain(traceId);
    });

    it("should handle empty project ID", () => {
      // Given: Empty project ID
      const projectId = "";
      const traceId = "test-trace-id";

      // When: Generating trace URL
      const url = cloudLogging.getTraceUrl(projectId, traceId);

      // Then: URL is still generated
      expect(url).toBeDefined();
      expect(typeof url).toBe("string");
    });
  });

  describe("Log Retrieval - Valid Cases", () => {
    it("should get logs for valid staging query", async () => {
      // Given: Valid staging query
      const query = {
        environment: "staging",
        service: "job-finder-backend",
      };

      const mockEntries = [
        {
          metadata: {
            resource: { type: "cloud_function" },
            labels: { severity: "INFO" },
          },
          data: { message: "Test message" },
          timestamp: { seconds: 1640995200 },
        },
      ];

      mockLogging.getEntries.mockResolvedValue([mockEntries]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Logs are returned
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(mockLogging.getEntries).toHaveBeenCalled();
    });

    it("should get logs for valid production query", async () => {
      // Given: Valid production query
      const query = {
        environment: "production",
        service: "job-finder-frontend",
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Logs are returned
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should throw error for empty environment", async () => {
      // Given: Query with empty environment
      const query = {
        environment: "",
        service: "job-finder-backend",
      };

      // When: Getting logs
      // Then: Error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow(
        'Environment "" not found',
      );
    });

    it("should throw error for local environment", async () => {
      // Given: Query for local environment
      const query = {
        environment: "local",
        service: "job-finder-backend",
      };

      // When: Getting logs
      // Then: Error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow(
        "Cannot fetch cloud logs for local environment",
      );
    });

    it("should throw error for unknown environment", async () => {
      // Given: Query for unknown environment
      const query = {
        environment: "unknown",
        service: "job-finder-backend",
      };

      // When: Getting logs
      // Then: Error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow(
        'Environment "unknown" not found',
      );
    });

    it("should handle Google Cloud API errors", async () => {
      // Given: Query that will cause API error
      const query = {
        environment: "staging",
        service: "job-finder-backend",
      };

      mockLogging.getEntries.mockRejectedValue(new Error("API Error"));

      // When: Getting logs
      // Then: Error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow(
        "Failed to fetch cloud logs: API Error",
      );
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limiting between requests", async () => {
      // Given: Valid query
      const query = {
        environment: "staging",
        service: "job-finder-backend",
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Making first request
      await cloudLogging.getLogs(query);

      // And: Making immediate second request
      // Then: Rate limit error is thrown
      await expect(cloudLogging.getLogs(query)).rejects.toThrow("Rate limit:");
    });
  });

  describe("Log Parsing", () => {
    it("should parse valid log entry", async () => {
      // Given: Valid log entry
      const mockEntry = {
        metadata: {
          resource: {
            type: "cloud_function",
            labels: { function_name: "test-function" },
          },
          labels: { severity: "INFO" },
        },
        data: { message: "Test message" },
        timestamp: { seconds: 1640995200 },
      };

      mockLogging.getEntries.mockResolvedValue([[mockEntry]]);

      const query = {
        environment: "staging",
        service: "test-function",
      };

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Log is parsed
      expect(logs).toHaveLength(1);
      const log = logs[0];
      expect(log.id).toBeDefined();
      expect(log.service).toBe("test-function");
      expect(log.message).toBe("Test message");
      expect(log.timestamp).toBeGreaterThan(0);
    });

    it("should handle string data in log entry", async () => {
      // Given: Log entry with string data
      const mockEntry = {
        metadata: {
          resource: { type: "cloud_function" },
          labels: { severity: "INFO" },
        },
        data: "Simple string message",
        timestamp: { seconds: 1640995200 },
      };

      mockLogging.getEntries.mockResolvedValue([[mockEntry]]);

      const query = {
        environment: "staging",
        service: "test-function",
      };

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: String data is handled
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe("Simple string message");
    });
  });

  describe("Query Options", () => {
    it("should handle query with severity filter", async () => {
      // Given: Query with severity
      const query = {
        environment: "staging",
        service: "job-finder-backend",
        severity: "ERROR",
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Query is processed
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining('severity="ERROR"'),
        }),
      );
    });

    it("should handle query with limit", async () => {
      // Given: Query with limit
      const query = {
        environment: "staging",
        service: "job-finder-backend",
        limit: 10,
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Query is processed
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 10,
        }),
      );
    });

    it("should handle query with time range", async () => {
      // Given: Query with time range
      const query = {
        environment: "staging",
        service: "job-finder-backend",
        timeRange: {
          start: new Date("2023-01-01"),
          end: new Date("2023-01-02"),
        },
      };

      mockLogging.getEntries.mockResolvedValue([[]]);

      // When: Getting logs
      const logs = await cloudLogging.getLogs(query);

      // Then: Query is processed
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(mockLogging.getEntries).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.stringContaining("timestamp >="),
        }),
      );
    });
  });
});
