import styles from './TabNav.module.css';

export type TabType = 'local' | 'scripts' | 'staging' | 'production' | 'health' | 'dev-bots';

interface TabNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface Tab {
  id: TabType;
  label: string;
}

const tabs: Tab[] = [
  { id: 'local', label: 'Local Development' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'staging', label: 'Staging' },
  { id: 'production', label: 'Production' },
  { id: 'health', label: 'System Health' },
  { id: 'dev-bots', label: 'Dev-Bots' },
];

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <div className={styles.tabContainer}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
