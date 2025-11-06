import { Socket } from "socket.io-client";
import CloudPanelContainer from "../CloudPanelContainer";
import { Environment } from "../../types/log.types";

interface EnvironmentTabProps {
  socket: Socket | null;
  environment: string;
  environments: Record<string, Environment>;
}

export function EnvironmentTab({
  socket,
  environment,
  environments,
}: EnvironmentTabProps) {
  const env = environments[environment];
  if (!env) return null;

  return (
    <CloudPanelContainer
      socket={socket}
      environment={environment}
      projectId={env.projectId}
    />
  );
}
