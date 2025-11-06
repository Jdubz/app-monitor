import { memo } from "react";
import { LogLine as LogLineType } from "../types/log.types";
import LogLevelBadge from "./LogLevelBadge";

interface LogLineProps {
  log: LogLineType;
  searchText?: string;
  showMetadata?: boolean; // If false, shows only the message
}

const LogLine: React.FC<LogLineProps> = memo(
  ({ log, searchText, showMetadata = true }) => {
    const formatTimestamp = (timestamp: number) => {
      const date = new Date(timestamp);
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      const seconds = date.getSeconds().toString().padStart(2, "0");
      const ms = date.getMilliseconds().toString().padStart(3, "0");
      return `${hours}:${minutes}:${seconds}.${ms}`;
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

    const getServiceColor = (service: string) => {
      const colors: Record<string, string> = {
        "firebase-emulators": "#FFA500",
        "frontend-dev": "#61DAFB",
        "backend-functions": "#68A063",
        "python-worker": "#3776AB",
      };
      return colors[service] || "#6c757d";
    };

    const lineStyle: React.CSSProperties = {
      display: "flex",
      gap: "8px",
      padding: "4px 8px",
      fontSize: "13px",
      fontFamily: "monospace",
      borderBottom: "1px solid #2a2a2a",
      alignItems: "flex-start",
      lineHeight: "1.5",
      wordBreak: "break-word",
      userSelect: "text", // Enable text selection for copying
      cursor: "text",
    };

    const timestampStyle: React.CSSProperties = {
      color: "#888",
      minWidth: "90px",
      flexShrink: 0,
    };

    const serviceStyle: React.CSSProperties = {
      color: getServiceColor(log.service),
      fontWeight: 600,
      minWidth: "120px",
      flexShrink: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
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
    };

    const messageOnlyStyle: React.CSSProperties = {
      ...messageStyle,
      flex: undefined,
      width: "100%",
    };

    // If showMetadata is false, display only the message
    if (!showMetadata) {
      return (
        <div style={lineStyle}>
          <span style={messageOnlyStyle}>
            {searchText ? highlightText(log.message, searchText) : log.message}
          </span>
        </div>
      );
    }

    // Default: show full metadata
    return (
      <div style={lineStyle}>
        <span style={timestampStyle}>{formatTimestamp(log.timestamp)}</span>
        <span style={serviceStyle} title={log.service}>
          {log.service}
        </span>
        <LogLevelBadge level={log.level} />
        <span style={messageStyle}>
          {searchText ? highlightText(log.message, searchText) : log.message}
        </span>
      </div>
    );
  },
);

LogLine.displayName = "LogLine";

export default LogLine;
