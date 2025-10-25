import styles from './SystemHealthTab.module.css';

export function SystemHealthTab() {
  return (
    <div className={styles.placeholder}>
      <h3 className={styles.title}>System Health Tab</h3>
      <p className={styles.description}>
        This tab will display real-time Firestore metrics including:
        <br />
        • Job matches count
        <br />
        • Job queue items (total, pending, processing)
        <br />
        • Content items count
        <br />
        • Database health and response times
      </p>
      <p className={styles.note}>
        Component implementation in progress...
      </p>
    </div>
  );
}
