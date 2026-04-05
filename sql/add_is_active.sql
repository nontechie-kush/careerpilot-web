-- Add is_active flag to users table for controlling matcher eligibility
-- Default true so existing users aren't skipped until the matcher evaluates them
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Mark currently inactive users (no activity in 2+ days) as inactive
UPDATE users
SET is_active = false
WHERE last_active_at IS NULL
   OR last_active_at < NOW() - INTERVAL '2 days';
