import React, { useState } from "react";

interface PortInfo {
  port: number;
  pid: number | null;
  inUse: boolean;
}

interface PortBadgeProps {
  portInfo: PortInfo;
  onKillPort: (port: number) => Promise<void>;
}

const PortBadge: React.FC<PortBadgeProps> = ({ portInfo, onKillPort }) => {
  const [killing, setKilling] = useState(false);

  const handleKillPort = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!portInfo.inUse || killing) return;

    const confirmed = window.confirm(
      `Stop process on port ${portInfo.port}?\n\n` +
        `This will kill PID ${portInfo.pid}.\n` +
        `The service will attempt graceful shutdown first.`,
    );

    if (!confirmed) return;

    setKilling(true);
    try {
      await onKillPort(portInfo.port);
    } catch (error) {
      console.error(`Failed to kill port ${portInfo.port}:`, error);
    } finally {
      setKilling(false);
    }
  };

  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "3px 8px",
    borderRadius: "12px",
    fontSize: "12px",
    fontFamily: "monospace",
    fontWeight: 600,
    backgroundColor: portInfo.inUse ? "#ffe0e0" : "#e8f5e9",
    color: portInfo.inUse ? "#c62828" : "#2e7d32",
    border: portInfo.inUse ? "1px solid #ef9a9a" : "1px solid #a5d6a7",
    cursor: portInfo.inUse ? "pointer" : "default",
    transition: "all 0.2s",
  };

  const dotStyle: React.CSSProperties = {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: portInfo.inUse ? "#d32f2f" : "#4caf50",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "0 4px",
    fontSize: "11px",
    border: "none",
    background: "none",
    color: portInfo.inUse ? "#b71c1c" : "#1b5e20",
    cursor: killing ? "wait" : "pointer",
    fontWeight: 700,
    opacity: killing ? 0.5 : 1,
  };

  return (
    <span
      style={badgeStyle}
      title={
        portInfo.inUse
          ? `Port ${portInfo.port} IN USE (PID: ${portInfo.pid}) - Click to stop`
          : `Port ${portInfo.port} available`
      }
      onMouseEnter={(e) => {
        if (portInfo.inUse) {
          e.currentTarget.style.backgroundColor = "#ffcdd2";
          e.currentTarget.style.transform = "scale(1.05)";
        }
      }}
      onMouseLeave={(e) => {
        if (portInfo.inUse) {
          e.currentTarget.style.backgroundColor = "#ffe0e0";
          e.currentTarget.style.transform = "scale(1)";
        }
      }}
    >
      <span style={dotStyle} />
      {portInfo.port}
      {portInfo.inUse && (
        <>
          {" "}
          <button
            onClick={handleKillPort}
            style={buttonStyle}
            disabled={killing}
            title={killing ? "Stopping..." : "Stop process on this port"}
          >
            {killing ? "..." : "✕"}
          </button>
        </>
      )}
    </span>
  );
};

export default PortBadge;
