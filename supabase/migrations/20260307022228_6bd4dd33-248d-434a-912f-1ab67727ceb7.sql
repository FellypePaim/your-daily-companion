-- 1. Fix whatsapp_sessions: drop permissive policy, add deny-all fallback
DROP POLICY IF EXISTS "Service role can manage sessions" ON public.whatsapp_sessions;
CREATE POLICY "No direct user access to sessions"
  ON public.whatsapp_sessions FOR ALL
  USING (false);

-- 2. Fix whatsapp_pending_transactions: drop permissive policy, add deny-all
DROP POLICY IF EXISTS "Service role can manage pending transactions" ON public.whatsapp_pending_transactions;
CREATE POLICY "No direct user access to pending transactions"
  ON public.whatsapp_pending_transactions FOR ALL
  USING (false);

-- 3. Fix checkout_rate_limits: drop permissive policy, add deny-all
DROP POLICY IF EXISTS "Service role manages checkout rate limits" ON public.checkout_rate_limits;
CREATE POLICY "No direct user access to checkout rate limits"
  ON public.checkout_rate_limits FOR ALL
  USING (false);

-- 4. Fix profiles subscription escalation: replace UPDATE policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND subscription_plan IS NOT DISTINCT FROM (SELECT p.subscription_plan FROM profiles p WHERE p.id = auth.uid())
    AND subscription_expires_at IS NOT DISTINCT FROM (SELECT p.subscription_expires_at FROM profiles p WHERE p.id = auth.uid())
  );

-- 5. Fix support-attachments bucket: make private
UPDATE storage.buckets SET public = false WHERE id = 'support-attachments';

-- 6. Replace open SELECT policy on support-attachments
DROP POLICY IF EXISTS "Support attachments are publicly readable" ON storage.objects;
CREATE POLICY "Only owners and admins can read attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'support-attachments'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );