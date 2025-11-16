-- Migration 025: Add Screenshot and Meta Fields to Issues
-- Adds support for screenshot attachments and flexible metadata

ALTER TABLE issues ADD COLUMN screenshot TEXT;
ALTER TABLE issues ADD COLUMN screenshot_error TEXT;
ALTER TABLE issues ADD COLUMN meta TEXT;
