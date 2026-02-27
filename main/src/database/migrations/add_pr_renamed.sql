-- Add pr_renamed flag to track if session was auto-renamed to PR title
ALTER TABLE sessions ADD COLUMN pr_renamed BOOLEAN DEFAULT 0;
