import { Link, useLocation } from "react-router-dom";
import styles from "./TabNav.module.css";

export type TabType = "local" | "scripts" | "deployed" | "dev-bots";

interface Tab {
  id: TabType;
  label: string;
  path: string;
}

const tabs: Tab[] = [
  { id: "local", label: "Local Development", path: "/local" },
  { id: "scripts", label: "Scripts", path: "/scripts" },
  { id: "deployed", label: "Deployed Services", path: "/deployed" },
  { id: "dev-bots", label: "Dev-Bots", path: "/dev-bots" },
];

export function TabNav() {
  const location = useLocation();

  return (
    <div className={styles.tabContainer}>
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;
        return (
          <Link
            key={tab.id}
            to={tab.path}
            className={`${styles.tab} ${isActive ? styles.active : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
