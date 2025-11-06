import { useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

interface ScriptOutputModalProps {
  socket: Socket | null;
  executionId: string | null;
  scriptName: string;
  onClose: () => void;
}

interface ScriptExecution {
  id: string;
  scriptId: string;
  config: {
    displayName: string;
    description: string;
    icon?: string;
  };
  status: "running" | "completed" | "failed";
  exitCode?: number;
  startTime: string;
  endTime?: string;
  output: string[];
}

export default function ScriptOutputModal({
  socket,
  executionId,
  scriptName,
  onClose,
}: ScriptOutputModalProps) {
  const [execution, setExecution] = useState<ScriptExecution | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Fetch initial execution data
  useEffect(() => {
    if (!executionId) return;

    fetch(`http://localhost:5000/api/scripts/executions/${executionId}`)
      .then((res) => res.json())
      .then((data) => {
        setExecution(data);
        setOutput(data.output || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch execution:", err);
        setIsLoading(false);
      });
  }, [executionId]);

  // Listen for real-time output
  useEffect(() => {
    if (!socket || !executionId) return;

    const handleOutput = (data: { executionId: string; line: string }) => {
      if (data.executionId === executionId) {
        setOutput((prev) => [...prev, data.line]);
      }
    };

    const handleCompleted = (exec: ScriptExecution) => {
      if (exec.id === executionId) {
        setExecution(exec);
      }
    };

    const handleFailed = (exec: ScriptExecution) => {
      if (exec.id === executionId) {
        setExecution(exec);
      }
    };

    socket.on("script:output", handleOutput);
    socket.on("script:completed", handleCompleted);
    socket.on("script:failed", handleFailed);

    return () => {
      socket.off("script:output", handleOutput);
      socket.off("script:completed", handleCompleted);
      socket.off("script:failed", handleFailed);
    };
  }, [socket, executionId]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (autoScroll && outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [output, autoScroll]);

  // Handle kill script
  const handleKillScript = async () => {
    if (!executionId) return;

    if (!confirm("Are you sure you want to kill this script?")) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:5000/api/scripts/executions/${executionId}/kill`,
        {
          method: "POST",
        },
      );

      if (response.ok) {
        setOutput((prev) => [...prev, "\n⚠️ Script killed by user"]);
      }
    } catch (err) {
      console.error("Failed to kill script:", err);
    }
  };

  // Calculate duration
  const getDuration = () => {
    if (!execution) return "0s";

    const start = new Date(execution.startTime).getTime();
    const end = execution.endTime
      ? new Date(execution.endTime).getTime()
      : Date.now();
    const duration = Math.floor((end - start) / 1000);

    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  // Get status color and icon
  const getStatusDisplay = () => {
    if (!execution) return { color: "#868e96", icon: "⏳", text: "Loading..." };

    switch (execution.status) {
      case "running":
        return { color: "#1971c2", icon: "⏳", text: "Running" };
      case "completed":
        return { color: "#2f9e44", icon: "✓", text: "Completed" };
      case "failed":
        return { color: "#c92a2a", icon: "✗", text: "Failed" };
      default:
        return { color: "#868e96", icon: "?", text: "Unknown" };
    }
  };

  const status = getStatusDisplay();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "8px",
          width: "90%",
          maxWidth: "1200px",
          height: "80%",
          maxHeight: "800px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #dee2e6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1 }}>
            <h2
              style={{
                margin: "0 0 8px 0",
                fontSize: "20px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {execution?.config.icon && <span>{execution.config.icon}</span>}
              {scriptName}
            </h2>
            {execution && (
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#868e96",
                }}
              >
                {execution.config.description}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            {/* Status Badge */}
            <div
              style={{
                padding: "6px 12px",
                borderRadius: "4px",
                backgroundColor: `${status.color}15`,
                color: status.color,
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>{status.icon}</span>
              {status.text}
            </div>

            {/* Duration */}
            <div
              style={{
                fontSize: "14px",
                color: "#495057",
              }}
            >
              {getDuration()}
            </div>

            {/* Kill Button */}
            {execution?.status === "running" && (
              <button
                onClick={handleKillScript}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#c92a2a",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Kill
              </button>
            )}

            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                padding: "6px 12px",
                backgroundColor: "#495057",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>

        {/* Output */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            backgroundColor: "#1e1e1e",
            color: "#d4d4d4",
            fontFamily: 'Monaco, "Courier New", monospace',
            fontSize: "13px",
            padding: "16px",
            position: "relative",
          }}
        >
          {isLoading ? (
            <div
              style={{ color: "#868e96", textAlign: "center", padding: "40px" }}
            >
              Loading output...
            </div>
          ) : output.length === 0 ? (
            <div
              style={{ color: "#868e96", textAlign: "center", padding: "40px" }}
            >
              No output yet...
            </div>
          ) : (
            <>
              {output.map((line, index) => (
                <div
                  key={index}
                  style={{
                    padding: "2px 0",
                    lineHeight: "1.5",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    color: line.includes("[ERROR]") ? "#f48771" : "#d4d4d4",
                  }}
                >
                  {line}
                </div>
              ))}
              <div ref={outputEndRef} />
            </>
          )}

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              position: "absolute",
              bottom: "16px",
              right: "16px",
              padding: "8px 12px",
              backgroundColor: autoScroll ? "#1971c2" : "#495057",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              opacity: 0.8,
            }}
          >
            {autoScroll ? "🔒 Auto-scroll ON" : "🔓 Auto-scroll OFF"}
          </button>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #dee2e6",
            backgroundColor: "#f8f9fa",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "13px",
            color: "#868e96",
          }}
        >
          <div>{output.length} lines of output</div>
          {execution?.exitCode !== undefined && (
            <div>Exit code: {execution.exitCode}</div>
          )}
        </div>
      </div>
    </div>
  );
}
