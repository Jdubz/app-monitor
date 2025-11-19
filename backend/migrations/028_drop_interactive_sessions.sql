-- Drop interactive_sessions table - feature being completely rewritten with tmux
-- Old implementation was too complex (~1800 lines) with session state machine,
-- database persistence, event coordination, and container orchestration.
--
-- New implementation will use tmux for session persistence (no database needed)

DROP TABLE IF EXISTS interactive_sessions;
