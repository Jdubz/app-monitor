import styles from './Header.module.css';

export function Header() {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Dev Console Monitor</h1>
      <p className={styles.subtitle}>
        Manage and monitor all job-finder development processes
      </p>
    </header>
  );
}
