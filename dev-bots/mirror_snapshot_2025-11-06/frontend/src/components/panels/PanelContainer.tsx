import React, { useState, useEffect } from "react";
import {
  Panel,
  LayoutType,
  LogSource,
  LocalService,
} from "../../types/panel.types";
import { PanelStorage } from "../../services/panelStorage";
import { useLogContext } from "../../contexts/LogContext";
import {
  filterLogs,
  sourceToServices,
  getUniqueServices,
} from "../../utils/panelFilters";
import PanelToolbar from "./PanelToolbar";
import PanelWrapper from "./PanelWrapper";
import LogsViewer from "../LogsViewer";
import "../../styles/panel-layouts.css";

const PanelContainer: React.FC = () => {
  const { getLogsForService, clearLogs, isConnected } = useLogContext();

  const [panels, setPanels] = useState<Panel[]>([
    {
      id: "1",
      source: "local-all",
      paused: false,
      showMetadata: true,
      searchText: "",
      selectedServices: [],
      selectedLevels: ["INFO", "WARN", "ERROR", "DEBUG"],
    },
  ]);

  const [layoutType, setLayoutType] = useState<LayoutType>("single");
  const maxPanels = 4;

  // Load saved layout on mount
  useEffect(() => {
    const savedLayout = PanelStorage.loadCurrentLayout();
    if (savedLayout && savedLayout.panels.length > 0) {
      setPanels(savedLayout.panels);
      setLayoutType(savedLayout.layoutType);
    }
  }, []);

  // Save layout whenever it changes
  useEffect(() => {
    if (panels.length > 0) {
      PanelStorage.saveCurrentLayout(panels, layoutType);
    }
  }, [panels, layoutType]);

  // Auto-adjust layout when adding panels
  useEffect(() => {
    const count = panels.length;

    if (count === 2 && layoutType === "single") {
      setLayoutType("horizontal");
    } else if (count === 3 && layoutType === "horizontal") {
      setLayoutType("main-sidebar");
    } else if (count === 4 && layoutType === "main-sidebar") {
      setLayoutType("quad");
    } else if (count === 1 && layoutType !== "single") {
      setLayoutType("single");
    }
  }, [panels.length, layoutType]);

  // Add a new panel
  const addPanel = () => {
    if (panels.length >= maxPanels) return;

    const newPanel: Panel = {
      id: Date.now().toString(),
      source: "local-all",
      paused: false,
      showMetadata: false,
      searchText: "",
      selectedServices: [],
      selectedLevels: ["INFO", "WARN", "ERROR", "DEBUG"],
    };

    setPanels([...panels, newPanel]);
  };

  // Remove a panel
  const removePanel = (id: string) => {
    if (panels.length <= 1) return;
    setPanels(panels.filter((p) => p.id !== id));
  };

  // Update panel state
  const updatePanel = (id: string, updates: Partial<Panel>) => {
    setPanels(panels.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  // Get filtered logs for a specific panel
  const getFilteredLogsForPanel = (panel: Panel) => {
    // Get all logs from context
    const allLogs = getLogsForService("all");

    // If paused, don't update (would need to track paused logs per panel)
    // For now, we'll just filter the current logs
    const filtered = filterLogs(allLogs, {
      source: panel.source,
      selectedServices: panel.selectedServices,
      selectedLevels: panel.selectedLevels,
      searchText: panel.searchText,
      paused: panel.paused,
    });

    return filtered;
  };

  // Get available services for a panel based on its source
  const getAvailableServicesForPanel = (panel: Panel): LocalService[] => {
    const sourceServices = sourceToServices(panel.source);
    const allLogs = getLogsForService("all");

    // Filter logs by source first
    const logsForSource = allLogs.filter((log) =>
      sourceServices.includes(log.service),
    );

    // Get unique services from those logs
    return getUniqueServices(logsForSource);
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  };

  return (
    <div style={containerStyle} className="panel-container">
      <PanelToolbar
        onAddPanel={addPanel}
        onLayoutChange={setLayoutType}
        currentLayout={layoutType}
        panelCount={panels.length}
        maxPanels={maxPanels}
      />

      <div className={`panel-grid layout-${layoutType}`}>
        {panels.map((panel) => {
          const filteredLogs = getFilteredLogsForPanel(panel);
          const availableServices = getAvailableServicesForPanel(panel);

          return (
            <PanelWrapper
              key={panel.id}
              panel={panel}
              onRemove={() => removePanel(panel.id)}
              onSourceChange={(source: LogSource) =>
                updatePanel(panel.id, { source })
              }
              onMetadataToggle={() =>
                updatePanel(panel.id, { showMetadata: !panel.showMetadata })
              }
              canRemove={panels.length > 1}
            >
              <LogsViewer
                logs={filteredLogs}
                availableServices={availableServices}
                selectedServices={panel.selectedServices}
                selectedLevels={panel.selectedLevels}
                searchText={panel.searchText}
                onToggleService={(service) => {
                  const newSelected = panel.selectedServices.includes(service)
                    ? panel.selectedServices.filter((s) => s !== service)
                    : [...panel.selectedServices, service];
                  updatePanel(panel.id, { selectedServices: newSelected });
                }}
                onToggleLevel={(level) => {
                  const newLevels = panel.selectedLevels.includes(level)
                    ? panel.selectedLevels.filter((l) => l !== level)
                    : [...panel.selectedLevels, level];
                  updatePanel(panel.id, { selectedLevels: newLevels });
                }}
                onSearchChange={(text) =>
                  updatePanel(panel.id, { searchText: text })
                }
                onSelectAllServices={() =>
                  updatePanel(panel.id, { selectedServices: [] })
                }
                onSelectAllLevels={() =>
                  updatePanel(panel.id, {
                    selectedLevels: ["INFO", "WARN", "ERROR", "DEBUG"],
                  })
                }
                onClearAllLevels={() =>
                  updatePanel(panel.id, { selectedLevels: [] })
                }
                onClearSearch={() => updatePanel(panel.id, { searchText: "" })}
                showMetadata={panel.showMetadata}
                isPaused={panel.paused}
                onTogglePause={() =>
                  updatePanel(panel.id, { paused: !panel.paused })
                }
                onClear={() => {
                  // Clear logs for services in this panel's source
                  const sourceServices = sourceToServices(panel.source);
                  sourceServices.forEach((service) => clearLogs(service));
                }}
              />
            </PanelWrapper>
          );
        })}
      </div>

      {/* Connection indicator */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          backgroundColor: isConnected ? "#28a745" : "#dc3545",
          color: "#fff",
          borderRadius: "12px",
          fontSize: "11px",
          fontWeight: 600,
          zIndex: 1000,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#fff",
            animation: isConnected ? "pulse 2s ease-in-out infinite" : "none",
          }}
        />
        {isConnected ? "Connected" : "Disconnected"}
      </div>
    </div>
  );
};

export default PanelContainer;
