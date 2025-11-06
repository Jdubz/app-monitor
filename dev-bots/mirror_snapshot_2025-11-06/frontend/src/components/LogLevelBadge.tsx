import React from "react";
import { LogLevel } from "../types/log.types";
import { StyledBadge, BadgeVariant } from "./common/StyledBadge";
import { theme } from "../styles/theme";

interface LogLevelBadgeProps {
  level: LogLevel;
}

const LogLevelBadge: React.FC<LogLevelBadgeProps> = ({ level }) => {
  const getVariant = (): BadgeVariant => {
    switch (level) {
      case "ERROR":
        return "error";
      case "WARN":
        return "warning";
      case "INFO":
        return "info";
      case "DEBUG":
        return "neutral";
      default:
        return "neutral";
    }
  };

  return (
    <StyledBadge
      variant={getVariant()}
      size="sm"
      style={{
        fontFamily: "monospace",
        minWidth: "50px",
        textAlign: "center",
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.semibold,
      }}
    >
      {level}
    </StyledBadge>
  );
};

export default LogLevelBadge;
