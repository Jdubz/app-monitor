import { Socket } from "socket.io-client";
import ScriptsPanel from "../ScriptsPanel";

interface ScriptsTabProps {
  socket: Socket | null;
}

export function ScriptsTab({ socket }: ScriptsTabProps) {
  return <ScriptsPanel socket={socket} />;
}
