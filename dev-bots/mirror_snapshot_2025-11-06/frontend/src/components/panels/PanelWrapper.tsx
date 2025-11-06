import React, { useState, useRef } from "react";
import { Panel, LogSource } from "../../types/panel.types";

interface PanelWrapperProps {
  panel: Panel;
  onRemove: () => void;
  onSourceChange: (source: LogSource) => void;
  onMetadataToggle: () => void;
  canRemove: boolean;
  children: React.ReactNode;
}

const PanelWrapper: React.FC<PanelWrapperProps> = ({
  panel,
  onRemove,
  onSourceChange,
  onMetadataToggle,
  canRemove,
  children,
}) => {
  const [copyFeedback, setCopyFeedback] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleCopyAll = async () => {
    if (!panelRef.current) return;

    const logText = panelRef.current.innerText;
    await navigator.clipboard.writeText(logText);

    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const wrapperStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    border: "1px solid #444",
    borderRadius: "8px",
    overflow: "hidden",
    backgroundColor: "#1a1a1a",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    backgroundColor: "#252525",
    borderBottom: "1px solid #444",
    gap: "12px",
  };

  const selectStyle: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: "12px",
    border: "1px solid #555",
    borderRadius: "4px",
    backgroundColor: "#3a3a3a",
    color: "#e0e0e0",
    cursor: "pointer",
    outline: "none",
    minWidth: "150px",
  };

  const controlsStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const toggleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "12px",
    color: "#ccc",
    cursor: "pointer",
    userSelect: "none",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: "12px",
    border: "1px solid #555",
    borderRadius: "4px",
    backgroundColor: "#3a3a3a",
    color: "#ccc",
    cursor: "pointer",
    transition: "all 0.2s",
  };

  const removeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: canRemove ? "#dc3545" : "#555",
    color: "#fff",
    cursor: canRemove ? "pointer" : "not-allowed",
    opacity: canRemove ? 1 : 0.5,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    overflow: "hidden",
  };

  return (
    <div style={wrapperStyle}>
      <div style={headerStyle}>
        <select
          value={panel.source}
          onChange={(e) => onSourceChange(e.target.value as LogSource)}
          style={selectStyle}
          title="Select log source"
        >
          <option value="local-all">Local - All Services</option>
          <option value="local-frontend">Local - Frontend</option>
          <option value="local-backend">Local - Backend</option>
          <option value="local-worker">Local - Worker</option>
          <option value="staging-all">Staging - All</option>
          <option value="production-all">Production - All</option>
        </select>

        <div style={controlsStyle}>
          <label style={toggleStyle}>
            <input
              type="checkbox"
              checked={panel.showMetadata}
              onChange={onMetadataToggle}
              style={{ cursor: "pointer" }}
            />
            Show metadata
          </label>

          <button
            onClick={handleCopyAll}
            style={buttonStyle}
            title="Copy all logs to clipboard"
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#4a4a4a")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#3a3a3a")
            }
          >
            {copyFeedback ? "✓ Copied" : "📋 Copy"}
          </button>

          <button
            onClick={onRemove}
            disabled={!canRemove}
            style={removeButtonStyle}
            title={canRemove ? "Remove this panel" : "Cannot remove last panel"}
            onMouseEnter={(e) => {
              if (canRemove) {
                e.currentTarget.style.backgroundColor = "#c82333";
              }
            }}
            onMouseLeave={(e) => {
              if (canRemove) {
                e.currentTarget.style.backgroundColor = "#dc3545";
              }
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div ref={panelRef} style={contentStyle}>
        {children}
      </div>
    </div>
  );
};

export default PanelWrapper;
