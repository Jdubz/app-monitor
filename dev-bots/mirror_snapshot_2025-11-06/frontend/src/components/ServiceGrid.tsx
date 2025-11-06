import React from "react";
import { useServices } from "../hooks/useServices";
import { usePortStatus } from "../hooks/usePortStatus";
import ServiceCard from "./ServiceCard";

const ServiceGrid: React.FC = () => {
  const {
    services,
    loading,
    error,
    startService,
    stopService,
    restartService,
    killService,
  } = useServices();

  const { portStatuses, killPortProcess } = usePortStatus(3000); // Poll every 3 seconds

  // Defensive check: ensure services is an array
  const serviceArray = Array.isArray(services) ? services : [];

  if (loading && serviceArray.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "#666",
        }}
      >
        <div
          style={{
            fontSize: "16px",
            marginBottom: "8px",
          }}
        >
          Loading services...
        </div>
        <div
          style={{
            fontSize: "14px",
            color: "#999",
          }}
        >
          Connecting to dev monitor backend
        </div>
      </div>
    );
  }

  if (error && serviceArray.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          backgroundColor: "#fee",
          border: "1px solid #fcc",
          borderRadius: "8px",
          margin: "20px",
        }}
      >
        <h3 style={{ color: "#c00", marginTop: 0 }}>Failed to Connect</h3>
        <p style={{ color: "#666" }}>{error}</p>
        <p style={{ fontSize: "14px", color: "#999" }}>
          Make sure the backend server is running on port 5000
        </p>
      </div>
    );
  }

  if (serviceArray.length === 0) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "#666",
        }}
      >
        <p>No services configured</p>
      </div>
    );
  }

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
    gap: "20px",
    padding: "20px",
  };

  // Service order: firebase-emulators, backend-functions, frontend-dev, python-worker
  const serviceOrder = [
    "firebase-emulators",
    "backend-functions",
    "frontend-dev",
    "python-worker",
  ];
  const sortedServices = [...serviceArray].sort((a, b) => {
    const aIndex = serviceOrder.indexOf(a.name);
    const bIndex = serviceOrder.indexOf(b.name);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <div>
      <div style={gridStyle}>
        {sortedServices.map((service) => (
          <ServiceCard
            key={service.name}
            service={service}
            onStart={() => startService(service.name)}
            onStop={() => stopService(service.name)}
            onRestart={() => restartService(service.name)}
            onKill={() => killService(service.name)}
            portStatuses={portStatuses[service.name]}
            onKillPort={killPortProcess}
          />
        ))}
      </div>
      {error && (
        <div
          style={{
            margin: "20px",
            padding: "12px",
            backgroundColor: "#fff3cd",
            border: "1px solid #ffeaa7",
            borderRadius: "4px",
            color: "#856404",
            fontSize: "14px",
          }}
        >
          <strong>Warning:</strong> {error}
        </div>
      )}
    </div>
  );
};

export default ServiceGrid;
