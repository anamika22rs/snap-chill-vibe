CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.hidden_accounts (
  owner_id uuid NOT NULL,
  hidden_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, hidden_id),
  CHECK (owner_id <> hidden_id)
);
GRANT SELECT, INSERT, DELETE ON public.hidden_accounts TO authenticated;
GRANT ALL ON public.hidden_accounts TO service_role;
ALTER TABLE public.hidden_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hidden read" ON public.hidden_accounts FOR SELECT TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "own hidden insert" ON public.hidden_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "own hidden delete" ON public.hidden_accounts FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE public.hidden_pins (
  user_id uuid PRIMARY KEY,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.hidden_pins TO service_role;
ALTER TABLE public.hidden_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_hidden_pin(_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must be 4-8 digits'; END IF;
  INSERT INTO public.hidden_pins (user_id, pin_hash) VALUES (auth.uid(), crypt(_pin, gen_salt('bf', 10)))
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.check_hidden_pin(_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT COALESCE((SELECT pin_hash = crypt(_pin, pin_hash) FROM public.hidden_pins WHERE user_id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.has_hidden_pin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.hidden_pins WHERE user_id = auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.set_hidden_pin(text), public.check_hidden_pin(text), public.has_hidden_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hidden_pin(text), public.check_hidden_pin(text), public.has_hidden_pin() TO authenticated;