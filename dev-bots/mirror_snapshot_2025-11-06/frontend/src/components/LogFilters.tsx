import React from "react";
import { LogLevel } from "../types/log.types";

interface LogFiltersProps {
  availableServices: string[];
  selectedServices: string[];
  selectedLevels: LogLevel[];
  searchText: string;
  onToggleService: (service: string) => void;
  onToggleLevel: (level: LogLevel) => void;
  onSearchChange: (text: string) => void;
  onSelectAllServices: () => void;
  onSelectAllLevels: () => void;
  onClearAllLevels: () => void;
  onClearSearch: () => void;
}

const LogFilters: React.FC<LogFiltersProps> = ({
  availableServices,
  selectedServices,
  selectedLevels,
  searchText,
  onToggleService,
  onToggleLevel,
  onSearchChange,
  onSelectAllServices,
  onSelectAllLevels,
  onClearAllLevels,
  onClearSearch,
}) => {
  const containerStyle: React.CSSProperties = {
    padding: "12px",
    backgroundColor: "#2d2d2d",
    borderBottom: "1px solid #444",
    display: "flex",
    flexWrap: "wrap",
    gap: "16px",
    alignItems: "center",
  };

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#aaa",
    marginBottom: "4px",
  };

  const checkboxGroupStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "13px",
    color: "#ccc",
    cursor: "pointer",
    userSelect: "none",
  };

  const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: "13px",
    border: "1px solid #555",
    borderRadius: "4px",
    backgroundColor: "#1a1a1a",
    color: "#fff",
    minWidth: "200px",
  };

  const buttonStyle: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: "11px",
    border: "1px solid #555",
    borderRadius: "3px",
    backgroundColor: "#3a3a3a",
    color: "#ccc",
    cursor: "pointer",
    transition: "background-color 0.2s",
  };

  const levels: LogLevel[] = ["ERROR", "WARN", "INFO", "DEBUG"];

  return (
    <div style={containerStyle}>
      {/* Service Filter */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={labelStyle}>Services:</span>
          <button
            onClick={onSelectAllServices}
            style={buttonStyle}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#4a4a4a")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#3a3a3a")
            }
          >
            All
          </button>
        </div>
        <div style={checkboxGroupStyle}>
          {availableServices.map((service) => (
            <label key={service} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={
                  selectedServices.length === 0 ||
                  selectedServices.includes(service)
                }
                onChange={() => onToggleService(service)}
              />
              {service}
            </label>
          ))}
        </div>
      </div>

      {/* Level Filter */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={labelStyle}>Levels:</span>
          <button
            onClick={onSelectAllLevels}
            style={buttonStyle}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#4a4a4a")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#3a3a3a")
            }
          >
            All
          </button>
          <button
            onClick={onClearAllLevels}
            style={buttonStyle}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#4a4a4a")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "#3a3a3a")
            }
          >
            None
          </button>
        </div>
        <div style={checkboxGroupStyle}>
          {levels.map((level) => (
            <label key={level} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={selectedLevels.includes(level)}
                onChange={() => onToggleLevel(level)}
              />
              {level}
            </label>
          ))}
        </div>
      </div>

      {/* Search */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Search:</span>
        <div style={{ display: "flex", gap: "4px" }}>
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter log messages..."
            style={inputStyle}
          />
          {searchText && (
            <button
              onClick={onClearSearch}
              style={{
                ...buttonStyle,
                padding: "6px 10px",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#4a4a4a")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#3a3a3a")
              }
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogFilters;
