import Database from 'better-sqlite3';
const db = new Database('/opt/app-monitor/shared/backend/data/app-monitor.db');

const migrations = [
  '002_tasks_table',
  '005_pr_workflow',
  '011_add_chain_tracking',
  '012_staged_queue',
  '013_remove_duplicate_pr_columns',
  '014_slim_pr_review_comments',
  '015_clean_quality_observations',
  '016_add_fingerprint_column',
  '020_add_context_bundle_fields'
];

migrations.forEach(name => {
  const existing = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(name);
  if (!existing) {
    db.prepare(`INSERT INTO migrations (name, filename, applied_at, status) VALUES (?, ?, ?, 'skipped')`).run(
      name,
      name + '.sql',
      Date.now()
    );
    console.log('Skipped:', name);
  } else {
    console.log('Already exists:', name);
  }
});

console.log('Done!');
