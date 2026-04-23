-- Run this in Supabase SQL Editor

-- 1. Add credit columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pitch_credits INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'free';

-- 2. Grandfather kushendrasuryavanshi@gmail.com with 999 credits
UPDATE users
SET pitch_credits = 999, plan_tier = 'grandfathered'
WHERE email = 'kushendrasuryavanshi@gmail.com';

-- 3. Orders table for Razorpay payments (payment_id is UNIQUE to prevent replay attacks)
CREATE TABLE IF NOT EXISTS rolepitch_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT UNIQUE,          -- UNIQUE prevents replay
  plan TEXT NOT NULL,                        -- '5' | '25' | '50'
  credits_to_add INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL,             -- amount in paise (₹200 = 20000)
  status TEXT NOT NULL DEFAULT 'created',   -- created | paid | failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

-- 4. RLS for orders — users can only see their own orders
ALTER TABLE rolepitch_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own orders" ON rolepitch_orders FOR SELECT USING (auth.uid() = user_id);

-- 5. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rolepitch_orders_user ON rolepitch_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_rolepitch_orders_rzp_order ON rolepitch_orders(razorpay_order_id);

-- 6. Atomic credit increment function (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_pitch_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_plan_tier TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_credits INTEGER;
BEGIN
  UPDATE users
  SET
    pitch_credits = pitch_credits + p_amount,
    plan_tier = p_plan_tier
  WHERE id = p_user_id
  RETURNING pitch_credits INTO new_credits;

  RETURN new_credits;
END;
$$;

-- 7. Atomic credit deduction function (returns -1 if insufficient credits)
CREATE OR REPLACE FUNCTION deduct_pitch_credit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_credits INTEGER;
BEGIN
  UPDATE users
  SET pitch_credits = pitch_credits - 1
  WHERE id = p_user_id AND pitch_credits > 0
  RETURNING pitch_credits INTO new_credits;

  IF new_credits IS NULL THEN
    RETURN -1;  -- insufficient credits
  END IF;

  RETURN new_credits;
END;
$$;
