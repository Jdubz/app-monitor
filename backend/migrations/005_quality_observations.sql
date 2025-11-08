-- Quality Observations Migration
-- Adds tables for tracking quality observations and improvement opportunities

-- Table for storing quality observations
CREATE TABLE IF NOT EXISTS quality_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  pr_number INTEGER,
  branch TEXT,
  timestamp TEXT NOT NULL,

  -- Overall metrics
  overall_score INTEGER NOT NULL,
  quality_level TEXT NOT NULL CHECK(quality_level IN ('excellent', 'good', 'fair', 'needs-improvement')),
  ready_for_merge INTEGER NOT NULL DEFAULT 0,

  -- Observation details (JSON)
  acceptance_criteria_observation TEXT, -- JSON
  test_coverage_observation TEXT,       -- JSON
  scope_boundaries_observation TEXT,    -- JSON
  quality_gates_observation TEXT,       -- JSON

  -- Improvement opportunities (JSON array)
  improvement_opportunities TEXT,       -- JSON array

  -- Blockers (JSON array)
  blockers TEXT,                        -- JSON array

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quality_observations_task_id ON quality_observations(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_observations_pr_number ON quality_observations(pr_number);
CREATE INDEX IF NOT EXISTS idx_quality_observations_quality_level ON quality_observations(quality_level);
CREATE INDEX IF NOT EXISTS idx_quality_observations_ready_for_merge ON quality_observations(ready_for_merge);
CREATE INDEX IF NOT EXISTS idx_quality_observations_created_at ON quality_observations(created_at);

-- Table for tracking improvement tasks spawned from observations
CREATE TABLE IF NOT EXISTS quality_improvement_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_task_id TEXT NOT NULL,
  improvement_task_id TEXT NOT NULL,
  observation_id INTEGER NOT NULL,

  -- Improvement details
  improvement_type TEXT NOT NULL CHECK(improvement_type IN ('coverage', 'lint', 'test', 'docs', 'criteria', 'scope', 'typecheck', 'build')),
  priority TEXT NOT NULL CHECK(priority IN ('critical', 'high', 'medium', 'low')),
  description TEXT NOT NULL,
  estimated_effort_minutes INTEGER NOT NULL,

  -- Status tracking
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  started_at INTEGER,
  completed_at INTEGER,

  -- Results
  outcome TEXT, -- 'success', 'partial', 'failed'
  improvements_achieved TEXT, -- JSON object describing improvements

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),

  FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (improvement_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (observation_id) REFERENCES quality_observations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quality_improvement_tasks_parent ON quality_improvement_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_quality_improvement_tasks_improvement ON quality_improvement_tasks(improvement_task_id);
CREATE INDEX IF NOT EXISTS idx_quality_improvement_tasks_observation ON quality_improvement_tasks(observation_id);
CREATE INDEX IF NOT EXISTS idx_quality_improvement_tasks_type ON quality_improvement_tasks(improvement_type);
CREATE INDEX IF NOT EXISTS idx_quality_improvement_tasks_status ON quality_improvement_tasks(status);

-- Table for tracking quality metrics over time
CREATE TABLE IF NOT EXISTS quality_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  pr_number INTEGER,

  -- Metric type and value
  metric_type TEXT NOT NULL CHECK(metric_type IN ('acceptance_criteria', 'test_coverage', 'lint_score', 'quality_score')),
  value_before REAL,
  value_after REAL,
  improvement REAL,

  -- Improvement task tracking
  improvement_task_ids TEXT, -- JSON array of task IDs that contributed

  -- Timing
  time_to_quality_ms INTEGER,
  measured_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),

  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quality_metrics_task_id ON quality_metrics(task_id);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_pr_number ON quality_metrics(pr_number);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_type ON quality_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_measured_at ON quality_metrics(measured_at);

-- Table for tracking quality patterns (learning system)
CREATE TABLE IF NOT EXISTS quality_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_type TEXT NOT NULL,
  pattern_description TEXT NOT NULL,

  -- Frequency and timing
  frequency INTEGER NOT NULL DEFAULT 1,
  avg_fix_time_ms INTEGER,
  last_seen_at INTEGER NOT NULL,

  -- Automation potential
  auto_fixable INTEGER NOT NULL DEFAULT 0,
  suggested_prevention TEXT,

  -- Related data
  related_task_types TEXT, -- JSON array
  related_file_patterns TEXT, -- JSON array

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_quality_patterns_type ON quality_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_quality_patterns_frequency ON quality_patterns(frequency);
CREATE INDEX IF NOT EXISTS idx_quality_patterns_auto_fixable ON quality_patterns(auto_fixable);
CREATE INDEX IF NOT EXISTS idx_quality_patterns_last_seen ON quality_patterns(last_seen_at);

-- Table for PR quality history (aggregate view)
CREATE TABLE IF NOT EXISTS pr_quality_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pr_number INTEGER NOT NULL UNIQUE,
  branch TEXT,

  -- Initial quality
  initial_score INTEGER NOT NULL,
  initial_quality_level TEXT NOT NULL,

  -- Current quality
  current_score INTEGER NOT NULL,
  current_quality_level TEXT NOT NULL,
  ready_for_merge INTEGER NOT NULL DEFAULT 0,

  -- Improvement tracking
  improvement_count INTEGER NOT NULL DEFAULT 0,
  improvement_task_ids TEXT, -- JSON array
  total_improvement_time_ms INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  first_observation_at INTEGER NOT NULL,
  last_observation_at INTEGER NOT NULL,
  ready_for_merge_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_pr_quality_history_pr_number ON pr_quality_history(pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_quality_history_ready ON pr_quality_history(ready_for_merge);
CREATE INDEX IF NOT EXISTS idx_pr_quality_history_updated ON pr_quality_history(updated_at);
