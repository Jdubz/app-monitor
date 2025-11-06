import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useCloudLogs } from "./useCloudLogs";
import { Socket } from "socket.io-client";
import {
  ParsedCloudLog,
  CloudLogHistory,
  CloudLoggingStatus,
} from "../types/log.types";

type EventHandler = (...args: any[]) => void;

describe("useCloudLogs", () => {
  let mockSocket: Partial<Socket> & { handlers: Record<string, EventHandler> };

  beforeEach(() => {
    // Create a mock socket with event handler tracking
    mockSocket = {
      handlers: {},
      emit: vi.fn(),
      on: vi.fn((event: string, handler: EventHandler) => {
        mockSocket.handlers[event] = handler;
        return mockSocket as Socket;
      }),
      off: vi.fn((event: string) => {
        delete mockSocket.handlers[event];
        return mockSocket as Socket;
      }),
    };
  });

  describe("Subscription", () => {
    it("should subscribe to cloud logs on mount", () => {
      renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      expect(mockSocket.emit).toHaveBeenCalledWith("subscribe_cloud_logs", {
        environment: "staging",
        service: "test-service",
        severity: undefined,
      });
    });

    it("should include severity in subscription if provided", () => {
      renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
          severity: "ERROR",
        }),
      );

      expect(mockSocket.emit).toHaveBeenCalledWith("subscribe_cloud_logs", {
        environment: "staging",
        service: "test-service",
        severity: "ERROR",
      });
    });

    it("should unsubscribe when unmounted", () => {
      const { unmount } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      unmount();

      expect(mockSocket.emit).toHaveBeenCalledWith("unsubscribe_cloud_logs", {
        environment: "staging",
        service: "test-service",
      });
    });

    it("should unsubscribe and resubscribe when environment changes", () => {
      const { rerender } = renderHook(
        ({ environment, service }) =>
          useCloudLogs({
            socket: mockSocket as Socket,
            environment,
            service,
          }),
        {
          initialProps: { environment: "staging", service: "test-service" },
        },
      );

      // Clear previous calls
      vi.clearAllMocks();

      // Change environment
      rerender({ environment: "production", service: "test-service" });

      // Should unsubscribe from staging
      expect(mockSocket.emit).toHaveBeenCalledWith("unsubscribe_cloud_logs", {
        environment: "staging",
        service: "test-service",
      });

      // Should subscribe to production
      expect(mockSocket.emit).toHaveBeenCalledWith("subscribe_cloud_logs", {
        environment: "production",
        service: "test-service",
        severity: undefined,
      });
    });

    it("should unsubscribe and resubscribe when service changes", () => {
      const { rerender } = renderHook(
        ({ environment, service }) =>
          useCloudLogs({
            socket: mockSocket as Socket,
            environment,
            service,
          }),
        {
          initialProps: { environment: "staging", service: "service-1" },
        },
      );

      // Clear previous calls
      vi.clearAllMocks();

      // Change service
      rerender({ environment: "staging", service: "service-2" });

      // Should unsubscribe from service-1
      expect(mockSocket.emit).toHaveBeenCalledWith("unsubscribe_cloud_logs", {
        environment: "staging",
        service: "service-1",
      });

      // Should subscribe to service-2
      expect(mockSocket.emit).toHaveBeenCalledWith("subscribe_cloud_logs", {
        environment: "staging",
        service: "service-2",
        severity: undefined,
      });
    });

    it("should unsubscribe and resubscribe when severity changes", () => {
      const { rerender } = renderHook(
        ({ severity }) =>
          useCloudLogs({
            socket: mockSocket as Socket,
            environment: "staging",
            service: "test-service",
            severity,
          }),
        {
          initialProps: { severity: "INFO" },
        },
      );

      // Clear previous calls
      vi.clearAllMocks();

      // Change severity
      rerender({ severity: "ERROR" });

      // Should have unsubscribed and resubscribed
      expect(mockSocket.emit).toHaveBeenCalledWith("unsubscribe_cloud_logs", {
        environment: "staging",
        service: "test-service",
      });

      expect(mockSocket.emit).toHaveBeenCalledWith("subscribe_cloud_logs", {
        environment: "staging",
        service: "test-service",
        severity: "ERROR",
      });
    });

    it("should not subscribe if socket is null", () => {
      renderHook(() =>
        useCloudLogs({
          socket: null,
          environment: "staging",
          service: "test-service",
        }),
      );

      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it("should not subscribe if environment is empty", () => {
      renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "",
          service: "test-service",
        }),
      );

      // Should not subscribe to logs, but may still check status
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        "subscribe_cloud_logs",
        expect.anything(),
      );
    });

    it("should not subscribe if service is empty", () => {
      renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "",
        }),
      );

      // Should not subscribe to logs, but may still check status
      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        "subscribe_cloud_logs",
        expect.anything(),
      );
    });
  });

  describe("Log Handling", () => {
    it("should update logs when cloud_log_history is received", async () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      const mockLogs: ParsedCloudLog[] = [
        {
          timestamp: "2024-01-01T00:00:00Z",
          severity: "INFO",
          message: "Test log",
          service: "test-service",
          metadata: {},
        },
      ];

      const historyData: CloudLogHistory = {
        environment: "staging",
        service: "test-service",
        logs: mockLogs,
      };

      // Simulate receiving log history
      mockSocket.handlers["cloud_log_history"](historyData);

      await waitFor(() => {
        expect(result.current.logs).toEqual(mockLogs);
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should only update logs if environment matches", async () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      const mockLogs: ParsedCloudLog[] = [
        {
          timestamp: "2024-01-01T00:00:00Z",
          severity: "INFO",
          message: "Test log",
          service: "test-service",
          metadata: {},
        },
      ];

      const historyData: CloudLogHistory = {
        environment: "production", // Different environment
        service: "test-service",
        logs: mockLogs,
      };

      // Simulate receiving log history for wrong environment
      mockSocket.handlers["cloud_log_history"](historyData);

      await waitFor(() => {
        expect(result.current.logs).toEqual([]);
      });
    });

    it("should only update logs if service matches", async () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      const mockLogs: ParsedCloudLog[] = [
        {
          timestamp: "2024-01-01T00:00:00Z",
          severity: "INFO",
          message: "Test log",
          service: "other-service",
          metadata: {},
        },
      ];

      const historyData: CloudLogHistory = {
        environment: "staging",
        service: "other-service", // Different service
        logs: mockLogs,
      };

      // Simulate receiving log history for wrong service
      mockSocket.handlers["cloud_log_history"](historyData);

      await waitFor(() => {
        expect(result.current.logs).toEqual([]);
      });
    });

    it("should set loading state when subscribing", () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle error events", async () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      const errorData = { message: "Failed to fetch logs" };

      // Simulate error event
      mockSocket.handlers["error"](errorData);

      await waitFor(() => {
        expect(result.current.error).toBe("Failed to fetch logs");
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("Cloud Logging Status", () => {
    it("should check cloud logging status on mount", () => {
      renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      expect(mockSocket.emit).toHaveBeenCalledWith(
        "check_cloud_logging_status",
      );
    });

    it("should update cloud logging status when received", async () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      const status: CloudLoggingStatus = {
        enabled: true,
        configured: true,
      };

      // Simulate status event
      mockSocket.handlers["cloud_logging_status"](status);

      await waitFor(() => {
        expect(result.current.cloudLoggingStatus).toEqual(status);
      });
    });
  });

  describe("Refresh Logs", () => {
    it("should emit refresh_cloud_logs with correct params", () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
          severity: "ERROR",
        }),
      );

      vi.clearAllMocks();

      result.current.refreshLogs();

      expect(mockSocket.emit).toHaveBeenCalledWith("refresh_cloud_logs", {
        environment: "staging",
        service: "test-service",
        severity: "ERROR",
        limit: 100,
      });
    });

    it("should use custom limit if provided", () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      vi.clearAllMocks();

      result.current.refreshLogs(50);

      expect(mockSocket.emit).toHaveBeenCalledWith("refresh_cloud_logs", {
        environment: "staging",
        service: "test-service",
        severity: undefined,
        limit: 50,
      });
    });

    it("should set loading state when refreshing", () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      // Set initial loading to false
      const historyData: CloudLogHistory = {
        environment: "staging",
        service: "test-service",
        logs: [],
      };
      mockSocket.handlers["cloud_log_history"](historyData);

      result.current.refreshLogs();

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe("Clear Logs", () => {
    it("should clear logs when clearLogs is called", async () => {
      const { result } = renderHook(() =>
        useCloudLogs({
          socket: mockSocket as Socket,
          environment: "staging",
          service: "test-service",
        }),
      );

      // Set some logs first
      const mockLogs: ParsedCloudLog[] = [
        {
          timestamp: "2024-01-01T00:00:00Z",
          severity: "INFO",
          message: "Test log",
          service: "test-service",
          metadata: {},
        },
      ];

      const historyData: CloudLogHistory = {
        environment: "staging",
        service: "test-service",
        logs: mockLogs,
      };

      mockSocket.handlers["cloud_log_history"](historyData);

      await waitFor(() => {
        expect(result.current.logs).toEqual(mockLogs);
      });

      // Clear logs
      result.current.clearLogs();

      await waitFor(() => {
        expect(result.current.logs).toEqual([]);
      });
    });
  });
});
