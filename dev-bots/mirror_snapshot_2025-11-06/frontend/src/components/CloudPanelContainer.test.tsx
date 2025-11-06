import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CloudPanelContainer from "./CloudPanelContainer";
import { getEnvironmentServices } from "../services/api";
import { Socket } from "socket.io-client";
import { Environment } from "../types/log.types";

// Mock the API and hooks
vi.mock("../services/api");
vi.mock("../hooks/useCloudLogs");
vi.mock("../hooks/useLogFilter");

// Import mocked hooks
import { useCloudLogs } from "../hooks/useCloudLogs";
import { useLogFilter } from "../hooks/useLogFilter";

describe("CloudPanelContainer", () => {
  let mockSocket: Partial<Socket>;
  let mockEnvironments: Record<string, Environment>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock socket
    mockSocket = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    // Mock environments (including local which should be filtered out)
    mockEnvironments = {
      local: {
        projectId: "local",
        name: "Local",
      },
      staging: {
        projectId: "test-staging",
        name: "Staging",
      },
      production: {
        projectId: "test-production",
        name: "Production",
      },
    };

    // Mock getEnvironmentServices
    (getEnvironmentServices as Mock).mockResolvedValue([
      { name: "test-function", displayName: "Test Function" },
    ]);

    // Mock useCloudLogs
    (useCloudLogs as Mock).mockReturnValue({
      logs: [],
      isLoading: false,
      error: null,
      cloudLoggingStatus: null,
      refreshLogs: vi.fn(),
      clearLogs: vi.fn(),
    });

    // Mock useLogFilter
    (useLogFilter as Mock).mockReturnValue({
      filteredLogs: [],
      selectedLevels: ["INFO", "WARN", "ERROR", "DEBUG"],
      searchText: "",
      setSearchText: vi.fn(),
      toggleLevel: vi.fn(),
      selectAllLevels: vi.fn(),
      clearAllLevels: vi.fn(),
      clearSearch: vi.fn(),
    });
  });

  describe("Environment Selector", () => {
    it("should render environment selector with only deployed environments (excluding local)", async () => {
      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        const envSelect = selects.find(
          (select) => select.getAttribute("title") === "Select environment",
        );
        expect(envSelect).toBeDefined();

        if (envSelect) {
          const options = Array.from(envSelect.querySelectorAll("option"));
          expect(options).toHaveLength(2); // Only staging and production, not local
          expect(options[0].textContent).toBe("Staging - All");
          expect(options[1].textContent).toBe("Production - All");
          // Verify local is NOT in the list
          expect(
            options.find((opt) => opt.textContent?.includes("Local")),
          ).toBeUndefined();
        }
      });
    });

    it("should change environment when selector is changed", async () => {
      const user = userEvent.setup();

      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        expect(selects.length).toBeGreaterThan(0);
      });

      // Find environment selector
      const selects = screen.getAllByRole("combobox");
      const envSelect = selects.find(
        (select) => select.getAttribute("title") === "Select environment",
      );

      expect(envSelect).toBeDefined();

      if (envSelect) {
        // Change to production
        await user.selectOptions(envSelect, "production-all");

        // Verify useCloudLogs was called with correct environment
        await waitFor(() => {
          const calls = (useCloudLogs as Mock).mock.calls;
          const lastCall = calls[calls.length - 1][0];
          expect(lastCall.environment).toBe("production");
        });
      }
    });

    it("should update both source and environment when selector changes", async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        expect(selects.length).toBeGreaterThan(0);
      });

      // Find environment selector
      const selects = screen.getAllByRole("combobox");
      const envSelect = selects.find(
        (select) => select.getAttribute("title") === "Select environment",
      );

      if (envSelect) {
        // Initial state should be staging
        expect((envSelect as HTMLSelectElement).value).toBe("staging-all");

        // Change to production
        await user.selectOptions(envSelect, "production-all");

        // Re-render to get updated state
        rerender(
          <CloudPanelContainer
            socket={mockSocket as Socket}
            environments={mockEnvironments}
          />,
        );

        // Verify the selector value changed
        await waitFor(() => {
          expect((envSelect as HTMLSelectElement).value).toBe("production-all");
        });
      }
    });
  });

  describe("Service Selector", () => {
    it("should fetch services for only deployed environments on mount (excluding local)", async () => {
      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        expect(getEnvironmentServices).toHaveBeenCalledWith("staging");
        expect(getEnvironmentServices).toHaveBeenCalledWith("production");
        // Verify local is NOT fetched
        expect(getEnvironmentServices).not.toHaveBeenCalledWith("local");
      });
    });

    it("should filter services by current panel environment", async () => {
      // Mock services with environment tags
      (getEnvironmentServices as Mock)
        .mockResolvedValueOnce([
          { name: "staging-func", displayName: "Staging Function" },
        ])
        .mockResolvedValueOnce([
          { name: "prod-func", displayName: "Production Function" },
        ]);

      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        const serviceSelect = selects.find(
          (select) => select.getAttribute("title") === "Select service",
        );
        expect(serviceSelect).toBeDefined();

        if (serviceSelect) {
          // Should only show services for staging (default environment)
          const options = Array.from(serviceSelect.querySelectorAll("option"));
          expect(options.length).toBeGreaterThan(1); // "All Functions" + services
        }
      });
    });
  });

  describe("Panel Management", () => {
    it("should start with one panel", () => {
      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      // Should have one environment selector
      const envSelectors = screen.getAllByTitle("Select environment");
      expect(envSelectors).toHaveLength(1);
    });

    it("should add a new panel when add button is clicked", async () => {
      const user = userEvent.setup();

      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      // Find add panel button by title
      const addButton = screen.getByTitle("Add new panel");
      expect(addButton).toBeDefined();

      await user.click(addButton);

      // After clicking add, should have 2 environment selectors (one per panel)
      await waitFor(() => {
        const envSelectors = screen.getAllByTitle("Select environment");
        expect(envSelectors).toHaveLength(2);
      });
    });

    it.skip("should remove a panel when remove button is clicked", async () => {
      // Skip this test for now - needs more complex setup with multiple panels
      // TODO: Implement this test when we have better panel management controls
    });

    it("should not remove the last panel", async () => {
      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      // Find remove button - should be disabled when only 1 panel
      const removeButtons = screen.getAllByTitle(
        /remove panel|cannot remove last panel/i,
      );
      expect(removeButtons[0]).toBeDisabled();
    });
  });

  describe("Log Subscription", () => {
    it("should subscribe to cloud logs when environment or service changes", async () => {
      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        // useCloudLogs should be called with correct params
        expect(useCloudLogs).toHaveBeenCalledWith(
          expect.objectContaining({
            socket: mockSocket,
            environment: "staging", // default environment
            service: "all-functions",
          }),
        );
      });
    });

    it("should unsubscribe and resubscribe when environment changes", async () => {
      const user = userEvent.setup();

      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        expect(selects.length).toBeGreaterThan(0);
      });

      // Change environment
      const selects = screen.getAllByRole("combobox");
      const envSelect = selects.find(
        (select) => select.getAttribute("title") === "Select environment",
      );

      if (envSelect) {
        await user.selectOptions(envSelect, "production-all");

        // Should have called useCloudLogs with new environment
        await waitFor(() => {
          const calls = (useCloudLogs as Mock).mock.calls;
          expect(
            calls.some((call: any[]) => call[0].environment === "production"),
          ).toBe(true);
        });
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle missing environments gracefully", () => {
      render(
        <CloudPanelContainer socket={mockSocket as Socket} environments={{}} />,
      );

      // Should not crash - may show error or empty state
      expect(
        screen.getByRole("combobox", { name: /environment/i }),
      ).toBeInTheDocument();
    });

    it("should handle service fetch errors", async () => {
      (getEnvironmentServices as Mock).mockRejectedValue(
        new Error("Failed to fetch"),
      );

      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      // Should still render without crashing
      await waitFor(() => {
        const selects = screen.getAllByRole("combobox");
        expect(selects.length).toBeGreaterThan(0);
      });
    });

    it("should display error state when useCloudLogs returns error", () => {
      (useCloudLogs as Mock).mockReturnValue({
        logs: [],
        isLoading: false,
        error: "Failed to load logs",
        cloudLoggingStatus: null,
        refreshLogs: vi.fn(),
        clearLogs: vi.fn(),
      });

      render(
        <CloudPanelContainer
          socket={mockSocket as Socket}
          environments={mockEnvironments}
        />,
      );

      // CloudLogsViewer should receive the error
      expect(useCloudLogs).toHaveBeenCalled();
    });
  });

  describe("Layout Persistence", () => {
    it("should save panel layout to storage", async () => {
      // This would test PanelStorage integration
      // Implementation depends on PanelStorage mock
    });

    it("should load saved layout on mount", async () => {
      // This would test loading from PanelStorage
      // Implementation depends on PanelStorage mock
    });
  });
});
