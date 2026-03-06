
-- 1. Achievements table (static definitions)
CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'trophy',
  category text NOT NULL DEFAULT 'general',
  xp_reward integer NOT NULL DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read achievements"
  ON public.achievements FOR SELECT TO authenticated
  USING (true);

-- 2. User achievements (unlocked badges)
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own achievements"
  ON public.user_achievements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON public.user_achievements FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 3. User gamification (XP, level, streak)
CREATE TABLE public.user_gamification (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  streak_current integer NOT NULL DEFAULT 0,
  streak_best integer NOT NULL DEFAULT 0,
  last_activity_date date,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_gamification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own gamification"
  ON public.user_gamification FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own gamification"
  ON public.user_gamification FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gamification"
  ON public.user_gamification FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Family members can view gamification for ranking
CREATE POLICY "Family can view gamification"
  ON public.user_gamification FOR SELECT TO authenticated
  USING (can_access_family_resource(user_id, auth.uid()));

-- 4. Challenges table
CREATE TABLE public.challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL DEFAULT 'weekly',
  target_value numeric NOT NULL DEFAULT 0,
  xp_reward integer NOT NULL DEFAULT 50,
  icon text NOT NULL DEFAULT 'zap',
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read active challenges"
  ON public.challenges FOR SELECT TO authenticated
  USING (is_active = true);

-- 5. User challenges (progress tracking)
CREATE TABLE public.user_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  current_value numeric NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, challenge_id)
);

ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own challenges"
  ON public.user_challenges FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenges"
  ON public.user_challenges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own challenges"
  ON public.user_challenges FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Seed initial achievements
INSERT INTO public.achievements (key, name, description, icon, category, xp_reward) VALUES
  ('first_transaction', 'Primeira Transação', 'Registrou sua primeira despesa ou receita', 'receipt', 'beginner', 10),
  ('budget_guardian', 'Guardião do Orçamento', 'Ficou dentro do orçamento por um mês inteiro', 'shield', 'budget', 50),
  ('goal_achieved', 'Meta Batida', 'Atingiu 100% de uma meta financeira', 'trophy', 'goals', 100),
  ('streak_7', 'Consistência Semanal', 'Usou o app 7 dias seguidos', 'flame', 'streak', 30),
  ('streak_30', 'Mestre da Consistência', 'Usou o app 30 dias seguidos', 'fire-extinguisher', 'streak', 100),
  ('categories_5', 'Organizador', 'Criou 5 ou mais categorias', 'tags', 'organization', 20),
  ('wallet_created', 'Primeira Carteira', 'Criou sua primeira carteira', 'wallet', 'beginner', 10),
  ('family_joined', 'Em Família', 'Entrou em um grupo familiar', 'users', 'social', 25);

-- Seed initial challenges
INSERT INTO public.challenges (title, description, type, target_value, xp_reward, icon, starts_at, ends_at) VALUES
  ('Registre 5 transações', 'Registre pelo menos 5 transações esta semana', 'weekly', 5, 30, 'list-checks', now(), now() + interval '7 days'),
  ('Economize R$100', 'Economize pelo menos R$100 este mês', 'monthly', 100, 75, 'piggy-bank', now(), now() + interval '30 days'),
  ('Streak de 5 dias', 'Use o app por 5 dias consecutivos', 'weekly', 5, 40, 'flame', now(), now() + interval '7 days'),
  ('Categorize tudo', 'Tenha todas as transações categorizadas', 'weekly', 100, 25, 'tags', now(), now() + interval '7 days');

-- Initialize gamification for existing users
INSERT INTO public.user_gamification (user_id, xp, level, streak_current, streak_best)
SELECT id, 0, 1, 0, 0 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
