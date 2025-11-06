/**
 * Docker Manager Tests
 */

import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { DockerManager } from "./dockerManager.js";
import Docker from "dockerode";

// Mock dockerode
vi.mock("dockerode");

describe("DockerManager", () => {
  let dockerManager: DockerManager;
  let mockDocker: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock Docker instance
    mockDocker = {
      info: vi.fn(),
      listImages: vi.fn(),
      listContainers: vi.fn(),
      pull: vi.fn(),
      ping: vi.fn(),
      listVolumes: vi.fn(),
      listNetworks: vi.fn(),
      getVolume: vi.fn(),
      getNetwork: vi.fn(),
      getContainer: vi.fn(),
      modem: {
        followProgress: vi.fn(),
      },
    };

    // Mock Docker constructor
    (Docker as unknown as Mock).mockImplementation(() => mockDocker);

    dockerManager = new DockerManager();
  });

  describe("validateDockerEnvironment", () => {
    it("should validate Docker environment successfully", async () => {
      // Mock successful Docker info
      mockDocker.info.mockResolvedValue({
        ServerVersion: "24.0.7",
        ApiVersion: "1.43",
        OSType: "linux",
        Architecture: "x86_64",
      });

      // Mock listImages to return dev-bot image
      mockDocker.listImages.mockResolvedValue([
        {
          Id: "sha256:123456",
          Created: 1234567890,
          Size: 1000000000,
        },
      ]);

      // Mock listContainers
      mockDocker.listContainers.mockResolvedValue([]);

      const result = await dockerManager.validateDockerEnvironment();

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.info.dockerVersion).toBe("24.0.7");
      expect(mockDocker.info).toHaveBeenCalled();
    });

    it("should detect missing Docker daemon", async () => {
      mockDocker.info.mockResolvedValue({
        ServerVersion: null,
      });

      const result = await dockerManager.validateDockerEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Docker daemon is not running or not accessible",
      );
    });

    it("should warn about missing required images", async () => {
      mockDocker.info.mockResolvedValue({
        ServerVersion: "24.0.7",
        ApiVersion: "1.43",
        OSType: "linux",
        Architecture: "x86_64",
      });

      // Mock listImages to return empty (no dev-bot image)
      mockDocker.listImages.mockResolvedValue([]);
      mockDocker.listContainers.mockResolvedValue([]);

      const result = await dockerManager.validateDockerEnvironment();

      expect(result.isValid).toBe(true); // Still valid, just warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Required image");
    });

    it("should detect permission errors", async () => {
      mockDocker.info.mockResolvedValue({
        ServerVersion: "24.0.7",
      });

      mockDocker.listImages.mockResolvedValue([]);
      mockDocker.listContainers.mockRejectedValue(
        new Error("Permission denied"),
      );

      const result = await dockerManager.validateDockerEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Insufficient permissions to access Docker socket",
      );
    });

    it("should handle Docker connectivity failure", async () => {
      mockDocker.info.mockRejectedValue(new Error("Connection refused"));

      const result = await dockerManager.validateDockerEnvironment();

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Docker validation failed");
    });
  });

  describe("checkImage", () => {
    it("should find existing image", async () => {
      mockDocker.listImages.mockResolvedValue([
        {
          Id: "sha256:123456",
          Created: 1234567890,
          Size: 1000000000,
        },
      ]);

      const result = await dockerManager.checkImage("dev-bot:latest");

      expect(result.exists).toBe(true);
      expect(result.name).toBe("dev-bot");
      expect(result.tag).toBe("latest");
      expect(result.id).toBe("sha256:123456");
    });

    it("should handle missing image", async () => {
      mockDocker.listImages.mockResolvedValue([]);

      const result = await dockerManager.checkImage("missing-image:latest");

      expect(result.exists).toBe(false);
      expect(result.name).toBe("missing-image");
      expect(result.tag).toBe("latest");
    });

    it("should default to latest tag", async () => {
      mockDocker.listImages.mockResolvedValue([]);

      const result = await dockerManager.checkImage("some-image");

      expect(result.tag).toBe("latest");
    });

    it("should handle errors gracefully", async () => {
      mockDocker.listImages.mockRejectedValue(new Error("API error"));

      const result = await dockerManager.checkImage("test-image");

      expect(result.exists).toBe(false);
    });
  });

  describe("pullImage", () => {
    it("should pull image successfully", async () => {
      const mockStream = {};
      mockDocker.pull.mockResolvedValue(mockStream);
      mockDocker.modem.followProgress.mockImplementation(
        (stream: any, onFinished: any) => {
          onFinished(null, []);
        },
      );

      const result = await dockerManager.pullImage("node:18-alpine");

      expect(result).toBe(true);
      expect(mockDocker.pull).toHaveBeenCalledWith("node:18-alpine");
    });

    it("should handle pull failure", async () => {
      mockDocker.pull.mockRejectedValue(new Error("Pull failed"));

      const result = await dockerManager.pullImage("invalid-image");

      expect(result).toBe(false);
    });

    it("should report progress", async () => {
      const mockStream = {};
      mockDocker.pull.mockResolvedValue(mockStream);

      const progressCallback = vi.fn();
      const progressEvents = [
        { status: "Downloading", progress: "10%" },
        { status: "Extracting", progress: "50%" },
      ];

      mockDocker.modem.followProgress.mockImplementation(
        (stream: any, onFinished: any, onProgress: any) => {
          progressEvents.forEach(onProgress);
          onFinished(null, []);
        },
      );

      await dockerManager.pullImage("test:latest", progressCallback);

      expect(progressCallback).toHaveBeenCalledWith("Downloading10%");
      expect(progressCallback).toHaveBeenCalledWith("Extracting50%");
    });
  });

  describe("ensureRequiredImages", () => {
    it("should succeed when all images exist", async () => {
      mockDocker.listImages.mockResolvedValue([
        {
          Id: "sha256:123456",
          Created: 1234567890,
          Size: 1000000000,
        },
      ]);

      const result = await dockerManager.ensureRequiredImages();

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should provide build instructions for custom images", async () => {
      mockDocker.listImages.mockResolvedValue([]);

      const result = await dockerManager.ensureRequiredImages();

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("build-dev-bot-image.sh");
    });
  });

  describe("healthCheck", () => {
    it("should pass health check when Docker is responsive", async () => {
      mockDocker.ping.mockResolvedValue(true);

      const result = await dockerManager.healthCheck();

      expect(result).toBe(true);
      expect(mockDocker.ping).toHaveBeenCalled();
    });

    it("should fail health check when Docker is unresponsive", async () => {
      mockDocker.ping.mockRejectedValue(new Error("Timeout"));

      const result = await dockerManager.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("cleanupOrphanedVolumes", () => {
    it("should clean up dangling volumes", async () => {
      mockDocker.listVolumes.mockResolvedValue({
        Volumes: [{ Name: "orphan-vol-1" }, { Name: "orphan-vol-2" }],
      });

      const mockVolume = {
        remove: vi.fn().mockResolvedValue(true),
      };
      mockDocker.getVolume.mockReturnValue(mockVolume);

      const cleaned = await dockerManager.cleanupOrphanedVolumes();

      expect(cleaned).toBe(2);
      expect(mockVolume.remove).toHaveBeenCalledTimes(2);
    });

    it("should handle cleanup errors gracefully", async () => {
      mockDocker.listVolumes.mockResolvedValue({
        Volumes: [{ Name: "problematic-vol" }],
      });

      const mockVolume = {
        remove: vi.fn().mockRejectedValue(new Error("Volume in use")),
      };
      mockDocker.getVolume.mockReturnValue(mockVolume);

      const cleaned = await dockerManager.cleanupOrphanedVolumes();

      expect(cleaned).toBe(0);
    });
  });

  describe("cleanupOrphanedNetworks", () => {
    it("should clean up dangling networks", async () => {
      mockDocker.listNetworks.mockResolvedValue([
        { Id: "net-1", Name: "orphan-net-1" },
        { Id: "net-2", Name: "orphan-net-2" },
      ]);

      const mockNetwork = {
        remove: vi.fn().mockResolvedValue(true),
      };
      mockDocker.getNetwork.mockReturnValue(mockNetwork);

      const cleaned = await dockerManager.cleanupOrphanedNetworks();

      expect(cleaned).toBe(2);
      expect(mockNetwork.remove).toHaveBeenCalledTimes(2);
    });
  });

  describe("getContainerLogs", () => {
    it("should retrieve container logs", async () => {
      const mockLogs = Buffer.from("Log line 1\nLog line 2\n");
      const mockContainer = {
        logs: vi.fn().mockResolvedValue(mockLogs),
      };
      mockDocker.getContainer.mockReturnValue(mockContainer);

      const logs = await dockerManager.getContainerLogs("container-123");

      expect(logs).toContain("Log line 1");
      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        tail: 100,
        timestamps: true,
      });
    });

    it("should handle log retrieval errors", async () => {
      mockDocker.getContainer.mockReturnValue({
        logs: vi.fn().mockRejectedValue(new Error("Container not found")),
      });

      const logs = await dockerManager.getContainerLogs("invalid-container");

      expect(logs).toBe("");
    });
  });

  describe("Static methods", () => {
    it("should return Dev-Bot image name", () => {
      const imageName = DockerManager.getClaudeWorkerImage();
      expect(imageName).toBe("dev-bot:latest");
    });
  });
});
