
CREATE TABLE IF NOT EXISTS public.checkout_rate_limits (
  user_id uuid NOT NULL PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checkout_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role should access this
CREATE POLICY "Service role manages checkout rate limits"
  ON public.checkout_rate_limits FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_checkout_rate_limit(_user_id uuid, _max_attempts integer DEFAULT 5, _window_minutes integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _count INT; _start TIMESTAMPTZ;
BEGIN
  SELECT attempt_count, window_start INTO _count, _start
  FROM checkout_rate_limits WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO checkout_rate_limits (user_id, attempt_count, window_start) VALUES (_user_id, 1, now());
    RETURN TRUE;
  END IF;

  IF _start < now() - (_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE checkout_rate_limits SET attempt_count = 1, window_start = now() WHERE user_id = _user_id;
    RETURN TRUE;
  END IF;

  IF _count >= _max_attempts THEN RETURN FALSE; END IF;

  UPDATE checkout_rate_limits SET attempt_count = _count + 1 WHERE user_id = _user_id;
  RETURN TRUE;
END;
$$;
