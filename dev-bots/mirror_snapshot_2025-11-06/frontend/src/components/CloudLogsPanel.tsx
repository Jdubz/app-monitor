import React, { useState, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";
import { useCloudLogs } from "../hooks/useCloudLogs";
import { useLogFilter } from "../hooks/useLogFilter";
import { getEnvironmentServices } from "../services/api";
import { CloudService, ParsedCloudLog } from "../types/log.types";
import LogLevelBadge from "./LogLevelBadge";

interface CloudLogsPanelProps {
  socket: Socket | null;
  environment: string;
  projectId: string;
}

const CloudLogsPanel: React.FC<CloudLogsPanelProps> = ({
  socket,
  environment,
  projectId,
}) => {
  const [services, setServices] = useState<CloudService[]>([]);
  const [selectedService, setSelectedService] =
    useState<string>("all-functions");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("");
  const [timeRange, setTimeRange] = useState<string>("1h");
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Fetch services for environment
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const envServices = await getEnvironmentServices(environment);
        setServices(envServices);
      } catch (error) {
        console.error("Failed to fetch services:", error);
      }
    };

    fetchServices();
  }, [environment]);

  const { logs, isLoading, error, cloudLoggingStatus, refreshLogs, clearLogs } =
    useCloudLogs({
      socket,
      environment,
      service: selectedService,
      severity: selectedSeverity,
    });

  const {
    filteredLogs,
    selectedLevels,
    searchText,
    setSearchText,
    toggleLevel,
    selectAllLevels,
    clearAllLevels,
    clearSearch,
  } = useLogFilter(logs as any); // Type assertion since both log types are compatible

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const getTraceUrl = (traceId: string) => {
    if (!traceId) return null;
    // Extract just the trace ID from the full path (projects/PROJECT_ID/traces/TRACE_ID)
    const parts = traceId.split("/");
    const actualTraceId = parts[parts.length - 1];
    return `https://console.cloud.google.com/traces/list?project=${projectId}&tid=${actualTraceId}`;
  };

  const handleRefresh = () => {
    refreshLogs();
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedService(e.target.value);
  };

  const handleSeverityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSeverity(e.target.value);
  };

  const handleTimeRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTimeRange(e.target.value);
    // TODO: Implement time range filtering with API
  };

  const getResourceType = (
    resource: Record<string, unknown> | undefined,
  ): string | null => {
    if (!resource || !resource.type) return null;
    return String(resource.type);
  };

  // Render cloud log line with metadata
  const renderCloudLogLine = (log: ParsedCloudLog) => {
    const lineStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      padding: "8px",
      fontSize: "13px",
      fontFamily: "monospace",
      borderBottom: "1px solid #2a2a2a",
      lineHeight: "1.5",
    };

    const mainLineStyle: React.CSSProperties = {
      display: "flex",
      gap: "8px",
      alignItems: "flex-start",
    };

    const timestampStyle: React.CSSProperties = {
      color: "#888",
      minWidth: "120px",
      flexShrink: 0,
      fontSize: "12px",
    };

    const messageStyle: React.CSSProperties = {
      flex: 1,
      color:
        log.level === "ERROR"
          ? "#ff6b6b"
          : log.level === "WARN"
            ? "#ffa94d"
            : "#e0e0e0",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    };

    const metadataStyle: React.CSSProperties = {
      display: "flex",
      gap: "12px",
      fontSize: "11px",
      color: "#666",
      paddingLeft: "128px",
      flexWrap: "wrap",
    };

    const traceLinkStyle: React.CSSProperties = {
      color: "#4dabf7",
      textDecoration: "none",
      cursor: "pointer",
    };

    const resourceType = getResourceType(log.metadata.resource);

    return (
      <div key={log.id} style={lineStyle}>
        <div style={mainLineStyle}>
          <span style={timestampStyle}>{formatTimestamp(log.timestamp)}</span>
          <LogLevelBadge level={log.level} />
          <span style={messageStyle}>
            {searchText ? highlightText(log.message, searchText) : log.message}
          </span>
        </div>
        {(log.metadata.trace ||
          log.metadata.spanId ||
          log.metadata.severity ||
          resourceType) && (
          <div style={metadataStyle}>
            {log.metadata.trace && (
              <span>
                Trace:{" "}
                <a
                  href={getTraceUrl(log.metadata.trace) || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={traceLinkStyle}
                >
                  {log.metadata.trace.split("/").pop()?.substring(0, 8)}...
                </a>
              </span>
            )}
            {log.metadata.spanId && <span>Span: {log.metadata.spanId}</span>}
            {log.metadata.severity && (
              <span>Severity: {log.metadata.severity}</span>
            )}
            {resourceType && <span>Resource: {resourceType}</span>}
          </div>
        )}
      </div>
    );
  };

  const highlightText = (text: string, highlight: string) => {
    if (!highlight) return text;

    const parts = text.split(new RegExp(`(${highlight})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span
              key={i}
              style={{ backgroundColor: "#ffeb3b", fontWeight: 600 }}
            >
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </>
    );
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "600px",
    backgroundColor: "#1a1a1a",
    border: "1px solid #444",
    borderRadius: "8px",
    overflow: "hidden",
    fontFamily: "monospace",
  };

  const toolbarStyle: React.CSSProperties = {
    display: "flex",
    gap: "12px",
    padding: "12px",
    backgroundColor: "#2a2a2a",
    borderBottom: "1px solid #444",
    flexWrap: "wrap",
    alignItems: "center",
  };

  const selectStyle: React.CSSProperties = {
    padding: "6px 8px",
    backgroundColor: "#1a1a1a",
    color: "#e0e0e0",
    border: "1px solid #444",
    borderRadius: "4px",
    fontSize: "13px",
    cursor: "pointer",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "6px 12px",
    backgroundColor: "#4dabf7",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    fontSize: "13px",
    cursor: "pointer",
    fontWeight: 600,
  };

  const badgeStyle: React.CSSProperties = {
    padding: "4px 8px",
    backgroundColor: "#ffa94d",
    color: "#fff",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: 600,
  };

  const searchInputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: "200px",
    padding: "6px 8px",
    backgroundColor: "#1a1a1a",
    color: "#e0e0e0",
    border: "1px solid #444",
    borderRadius: "4px",
    fontSize: "13px",
  };

  const logsContainerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    backgroundColor: "#1a1a1a",
  };

  const emptyStateStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#666",
    fontSize: "14px",
    flexDirection: "column",
    gap: "12px",
  };

  const warningStyle: React.CSSProperties = {
    padding: "12px",
    backgroundColor: "#fff3cd",
    color: "#856404",
    borderBottom: "1px solid #ffc107",
    fontSize: "13px",
  };

  const errorStyle: React.CSSProperties = {
    padding: "12px",
    backgroundColor: "#f8d7da",
    color: "#721c24",
    borderBottom: "1px solid #f5c6cb",
    fontSize: "13px",
  };

  const filterBarStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    padding: "8px 12px",
    backgroundColor: "#2a2a2a",
    borderBottom: "1px solid #444",
    flexWrap: "wrap",
    alignItems: "center",
    fontSize: "12px",
  };

  const filterButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    backgroundColor: active ? "#4dabf7" : "#444",
    color: "#fff",
    border: "none",
    borderRadius: "4px",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ position: "relative" }}>
      <div style={containerStyle}>
        {/* Warning if cloud logging not available */}
        {cloudLoggingStatus && !cloudLoggingStatus.available && (
          <div style={warningStyle}>
            Cloud Logging is not available: {cloudLoggingStatus.message}
          </div>
        )}

        {/* Error message */}
        {error && <div style={errorStyle}>Error: {error}</div>}

        {/* Toolbar */}
        <div style={toolbarStyle}>
          <span style={badgeStyle}>READ ONLY</span>

          <select
            value={selectedService}
            onChange={handleServiceChange}
            style={selectStyle}
          >
            <option value="all-functions">All Functions</option>
            {services.map((svc) => (
              <option key={svc.name} value={svc.name}>
                {svc.displayName}
              </option>
            ))}
          </select>

          <select
            value={selectedSeverity}
            onChange={handleSeverityChange}
            style={selectStyle}
          >
            <option value="">All Severities</option>
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="ERROR">ERROR</option>
          </select>

          <select
            value={timeRange}
            onChange={handleTimeRangeChange}
            style={selectStyle}
          >
            <option value="1h">Last 1 hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
            <option value="all">All time</option>
          </select>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            style={buttonStyle}
          >
            {isLoading ? "Loading..." : "Refresh"}
          </button>

          <button
            onClick={clearLogs}
            style={{ ...buttonStyle, backgroundColor: "#868e96" }}
          >
            Clear
          </button>

          <span style={{ color: "#888", fontSize: "12px", marginLeft: "auto" }}>
            {filteredLogs.length} logs
          </span>
        </div>

        {/* Filter Bar */}
        <div style={filterBarStyle}>
          <span style={{ color: "#888" }}>Filter by level:</span>
          <button
            onClick={() => toggleLevel("ERROR")}
            style={filterButtonStyle(selectedLevels.includes("ERROR"))}
          >
            ERROR
          </button>
          <button
            onClick={() => toggleLevel("WARN")}
            style={filterButtonStyle(selectedLevels.includes("WARN"))}
          >
            WARN
          </button>
          <button
            onClick={() => toggleLevel("INFO")}
            style={filterButtonStyle(selectedLevels.includes("INFO"))}
          >
            INFO
          </button>
          <button
            onClick={() => toggleLevel("DEBUG")}
            style={filterButtonStyle(selectedLevels.includes("DEBUG"))}
          >
            DEBUG
          </button>
          <button
            onClick={selectAllLevels}
            style={{
              ...buttonStyle,
              backgroundColor: "#868e96",
              padding: "4px 8px",
              fontSize: "12px",
            }}
          >
            All
          </button>
          <button
            onClick={clearAllLevels}
            style={{
              ...buttonStyle,
              backgroundColor: "#868e96",
              padding: "4px 8px",
              fontSize: "12px",
            }}
          >
            None
          </button>

          <span style={{ color: "#888", marginLeft: "16px" }}>Search:</span>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search logs..."
            style={searchInputStyle}
          />
          {searchText && (
            <button
              onClick={clearSearch}
              style={{
                ...buttonStyle,
                backgroundColor: "#868e96",
                padding: "4px 8px",
                fontSize: "12px",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Logs Container */}
        <div style={logsContainerStyle}>
          {isLoading && logs.length === 0 ? (
            <div style={emptyStateStyle}>
              <div>Loading cloud logs...</div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={emptyStateStyle}>
              {logs.length === 0 ? (
                <div>
                  <div>No cloud logs available</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#555",
                      marginTop: "8px",
                    }}
                  >
                    Click Refresh to fetch logs
                  </div>
                </div>
              ) : (
                <div>
                  <div>No logs match the current filters</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#555",
                      marginTop: "8px",
                    }}
                  >
                    Try adjusting your filters
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {filteredLogs.map((log) =>
                renderCloudLogLine(log as ParsedCloudLog),
              )}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: "8px",
          fontSize: "12px",
          color: "#666",
          textAlign: "center",
        }}
      >
        Viewing {environment} environment - Read-only access
      </div>
    </div>
  );
};

export default CloudLogsPanel;
