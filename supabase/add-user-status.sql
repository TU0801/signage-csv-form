-- ========================================
-- Add user status (active/inactive) to signage_profiles
-- ========================================

-- Add status column
ALTER TABLE signage_profiles
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_status ON signage_profiles(status);

-- Update RLS policy to prevent inactive users from accessing data
-- Drop existing policy if exists
DROP POLICY IF EXISTS "Users can view own profile" ON signage_profiles;

-- Recreate with status check
CREATE POLICY "Users can view own profile"
  ON signage_profiles FOR SELECT
  USING (auth.uid() = id AND status = 'active');

-- Admin can view all profiles (including inactive)
-- This policy already exists, no change needed

-- Prevent inactive users from inserting/updating entries
DROP POLICY IF EXISTS "Users can insert own entries" ON signage_entries;
DROP POLICY IF EXISTS "Users can update own entries" ON signage_entries;
DROP POLICY IF EXISTS "Users can delete own entries" ON signage_entries;

CREATE POLICY "Users can insert own entries"
  ON signage_entries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can update own entries"
  ON signage_entries FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can delete own entries"
  ON signage_entries FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND status = 'active'
    )
  );
