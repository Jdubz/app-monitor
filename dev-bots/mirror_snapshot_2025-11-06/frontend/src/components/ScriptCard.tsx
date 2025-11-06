import { useState } from "react";
import { Script } from "../types/script.types";

interface ScriptCardProps {
  script: Script;
  isRunning: boolean;
  onExecute: (scriptId: string) => void;
}

export default function ScriptCard({
  script,
  isRunning,
  onExecute,
}: ScriptCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (script.requiresConfirmation && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    onExecute(script.id);
    setShowConfirm(false);
  };

  const dangerColors = {
    safe: { bg: "#e7f5ff", border: "#339af0", text: "#1971c2" },
    warning: { bg: "#fff3cd", border: "#ffc107", text: "#856404" },
    danger: { bg: "#ffe5e5", border: "#ff6b6b", text: "#c92a2a" },
  };

  const colors = dangerColors[script.dangerLevel || "safe"];

  return (
    <div
      style={{
        backgroundColor: "#fff",
        border: `2px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "16px",
        cursor: isRunning ? "not-allowed" : "pointer",
        opacity: isRunning ? 0.6 : 1,
        transition: "all 0.2s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontSize: "24px" }}>{script.icon}</span>
        <div style={{ flex: 1 }}>
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "#333",
            }}
          >
            {script.displayName}
          </h3>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "13px",
              color: "#666",
            }}
          >
            {script.description}
          </p>
        </div>
      </div>

      {showConfirm ? (
        <div
          style={{
            marginTop: "12px",
            padding: "12px",
            backgroundColor: colors.bg,
            borderRadius: "4px",
            border: `1px solid ${colors.border}`,
          }}
        >
          <p
            style={{
              margin: "0 0 8px 0",
              fontSize: "13px",
              color: colors.text,
              fontWeight: 500,
            }}
          >
            Are you sure? This action cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleClick}
              style={{
                padding: "6px 12px",
                backgroundColor: colors.border,
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
              }}
            >
              Confirm
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{
                padding: "6px 12px",
                backgroundColor: "#fff",
                color: "#666",
                border: "1px solid #ddd",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleClick}
          disabled={isRunning}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: isRunning ? "#ccc" : colors.border,
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: isRunning ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: 500,
            marginTop: "8px",
          }}
        >
          {isRunning ? "⏳ Running..." : "▶ Run Script"}
        </button>
      )}
    </div>
  );
}
