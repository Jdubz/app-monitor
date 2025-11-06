import { Socket } from "socket.io-client";
import CloudPanelContainer from "../CloudPanelContainer";
import { Environment } from "../../types/log.types";

interface DeployedServicesTabProps {
  socket: Socket | null;
  environments: Record<string, Environment>;
}

export function DeployedServicesTab({
  socket,
  environments,
}: DeployedServicesTabProps) {
  // Default to staging environment if available
  const defaultEnv = environments.staging || Object.values(environments)[0];

  if (!defaultEnv) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
        No environments configured
      </div>
    );
  }

  return <CloudPanelContainer socket={socket} environments={environments} />;
}
