import ServiceGrid from "../ServiceGrid";
import MinimalPanelContainer from "../MinimalPanelContainer";
import { QuickActions } from "../common";
import type { QuickAction } from "../common";
import styles from "./LocalTab.module.css";

export function LocalTab() {
  // Quick actions for services
  const serviceActions: QuickAction[] = [
    {
      id: "start-all",
      label: "Start All",
      icon: "▶️",
      description: "Start all services",
      variant: "success",
      onClick: () => {
        // This would integrate with the actual service management
        console.log("Start all services");
      },
    },
    {
      id: "stop-all",
      label: "Stop All",
      icon: "⏹️",
      description: "Stop all services",
      variant: "danger",
      onClick: () => {
        console.log("Stop all services");
      },
    },
    {
      id: "restart-all",
      label: "Restart All",
      icon: "🔄",
      description: "Restart all services",
      variant: "warning",
      onClick: () => {
        console.log("Restart all services");
      },
    },
    {
      id: "view-logs",
      label: "View All Logs",
      icon: "📋",
      description: "View logs for all services",
      onClick: () => {
        console.log("View all logs");
      },
    },
  ];

  return (
    <>
      <QuickActions
        actions={serviceActions}
        title="Service Actions"
        collapsible
      />

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Services</h2>
        </div>
        <ServiceGrid />
      </section>

      <section className={styles.logsSection}>
        <MinimalPanelContainer />
      </section>
    </>
  );
}
