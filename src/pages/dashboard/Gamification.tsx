import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Trophy, Flame, Star, Zap, Target, Users, Lock,
  CheckCircle2, Award, TrendingUp, Shield, Wallet,
  Tags, Receipt, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const iconMap: Record<string, any> = {
  trophy: Trophy, flame: Flame, star: Star, zap: Zap,
  target: Target, users: Users, shield: Shield, wallet: Wallet,
  tags: Tags, receipt: Receipt, award: Award,
  "fire-extinguisher": Flame, "list-checks": CheckCircle2,
  "piggy-bank": TrendingUp,
};

const LEVEL_XP = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];

function getLevelInfo(xp: number) {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) level = i + 1;
    else break;
  }
  const currentLevelXp = LEVEL_XP[level - 1] || 0;
  const nextLevelXp = LEVEL_XP[level] || LEVEL_XP[LEVEL_XP.length - 1] + 5000;
  const progress = ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return { level, progress: Math.min(progress, 100), currentLevelXp, nextLevelXp };
}

const levelTitles = [
  "Iniciante", "Aprendiz", "Planejador", "Organizador", "Estrategista",
  "Investidor", "Expert", "Guru", "Mestre", "Lenda Financeira"
];

type Tab = "badges" | "challenges" | "ranking";

export default function Gamification() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("badges");

  // Gamification stats
  const { data: gamification } = useQuery({
    queryKey: ["user-gamification", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_gamification")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!data && !error) {
        // Initialize if not exists
        const { data: newData } = await supabase
          .from("user_gamification")
          .insert({ user_id: user!.id })
          .select()
          .single();
        return newData;
      }
      return data;
    },
    enabled: !!user,
  });

  // All achievements
  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const { data } = await supabase.from("achievements").select("*").order("category");
      return data || [];
    },
  });

  // User unlocked achievements
  const { data: userAchievements = [] } = useQuery({
    queryKey: ["user-achievements", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_achievements")
        .select("*, achievements(*)")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  // Challenges
  const { data: challenges = [] } = useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data } = await supabase.from("challenges").select("*").eq("is_active", true);
      return data || [];
    },
  });

  // User challenges
  const { data: userChallenges = [] } = useQuery({
    queryKey: ["user-challenges", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_challenges")
        .select("*, challenges(*)")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  // Family ranking
  const { data: familyRanking = [] } = useQuery({
    queryKey: ["family-ranking", user?.id],
    queryFn: async () => {
      // Get family members
      const { data: memberships } = await supabase
        .from("family_memberships")
        .select("family_group_id")
        .eq("user_id", user!.id)
        .eq("status", "active");
      
      if (!memberships?.length) {
        // Check if owner
        const { data: owned } = await supabase
          .from("family_groups")
          .select("id")
          .eq("owner_id", user!.id);
        if (!owned?.length) return [];
        
        const groupId = owned[0].id;
        const { data: members } = await supabase
          .from("family_memberships")
          .select("user_id")
          .eq("family_group_id", groupId)
          .eq("status", "active");
        
        const memberIds = [user!.id, ...(members?.map(m => m.user_id) || [])];
        const { data: rankings } = await supabase
          .from("user_gamification")
          .select("*")
          .in("user_id", memberIds)
          .order("xp", { ascending: false });
        
        // Get profiles for display names
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", memberIds);
        
        return (rankings || []).map(r => ({
          ...r,
          display_name: profiles?.find(p => p.id === r.user_id)?.display_name || "Usuário"
        }));
      }

      const groupId = memberships[0].family_group_id;
      const { data: allMembers } = await supabase
        .from("family_memberships")
        .select("user_id")
        .eq("family_group_id", groupId)
        .eq("status", "active");
      
      const { data: group } = await supabase
        .from("family_groups")
        .select("owner_id")
        .eq("id", groupId)
        .single();
      
      const memberIds = [...(allMembers?.map(m => m.user_id) || [])];
      if (group?.owner_id && !memberIds.includes(group.owner_id)) memberIds.push(group.owner_id);
      
      const { data: rankings } = await supabase
        .from("user_gamification")
        .select("*")
        .in("user_id", memberIds)
        .order("xp", { ascending: false });
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", memberIds);
      
      return (rankings || []).map(r => ({
        ...r,
        display_name: profiles?.find(p => p.id === r.user_id)?.display_name || "Usuário"
      }));
    },
    enabled: !!user,
  });

  // Join challenge mutation
  const joinChallenge = useMutation({
    mutationFn: async (challengeId: string) => {
      const { error } = await supabase
        .from("user_challenges")
        .insert({ user_id: user!.id, challenge_id: challengeId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-challenges"] });
      toast.success("Desafio aceito! 🎯");
    },
    onError: () => toast.error("Erro ao participar do desafio"),
  });

  // Check and update streak
  useEffect(() => {
    if (!user || !gamification) return;
    const today = new Date().toISOString().slice(0, 10);
    if (gamification.last_activity_date === today) return;

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const isConsecutive = gamification.last_activity_date === yesterday;
    const newStreak = isConsecutive ? gamification.streak_current + 1 : 1;
    const newBest = Math.max(newStreak, gamification.streak_best);

    supabase
      .from("user_gamification")
      .update({
        streak_current: newStreak,
        streak_best: newBest,
        last_activity_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["user-gamification"] }));
  }, [user, gamification]);

  const xp = gamification?.xp || 0;
  const levelInfo = getLevelInfo(xp);
  const streak = gamification?.streak_current || 0;
  const bestStreak = gamification?.streak_best || 0;
  const unlockedIds = new Set(userAchievements.map((ua: any) => ua.achievement_id));
  const joinedChallengeIds = new Set(userChallenges.map((uc: any) => uc.challenge_id));

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "badges", label: "Conquistas", icon: Trophy },
    { key: "challenges", label: "Desafios", icon: Zap },
    { key: "ranking", label: "Ranking", icon: Users },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="h-7 w-7 text-primary" /> Gamificação
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Conquiste badges, suba de nível e desafie sua família!</p>
      </div>

      {/* XP & Level Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Star className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Nível {levelInfo.level}</p>
                <p className="text-xl font-bold text-foreground">{levelTitles[levelInfo.level - 1] || "Lenda"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{xp} XP total</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="flex items-center gap-1.5">
                  <Flame className="h-5 w-5 text-orange-500" />
                  <span className="text-2xl font-bold text-foreground">{streak}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">dias seguidos</p>
              </div>
              <div className="text-center">
                <span className="text-lg font-semibold text-muted-foreground">{bestStreak}</span>
                <p className="text-[10px] text-muted-foreground">melhor streak</p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{xp - levelInfo.currentLevelXp} / {levelInfo.nextLevelXp - levelInfo.currentLevelXp} XP</span>
              <span>Nível {levelInfo.level + 1}</span>
            </div>
            <Progress value={levelInfo.progress} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Tab Selector */}
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Badges Tab */}
      <AnimatePresence mode="wait">
        {tab === "badges" && (
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {achievements.map((a: any) => {
              const unlocked = unlockedIds.has(a.id);
              const Icon = iconMap[a.icon] || Trophy;
              return (
                <Card
                  key={a.id}
                  className={`transition-all ${
                    unlocked
                      ? "border-primary/30 bg-primary/5"
                      : "opacity-60 grayscale"
                  }`}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${
                      unlocked ? "bg-primary/10" : "bg-muted"
                    }`}>
                      {unlocked ? (
                        <Icon className="h-6 w-6 text-primary" />
                      ) : (
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground text-sm truncate">{a.name}</p>
                        {unlocked && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                      <p className="text-[10px] text-primary font-medium mt-1">+{a.xp_reward} XP</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </motion.div>
        )}

        {/* Challenges Tab */}
        {tab === "challenges" && (
          <motion.div
            key="challenges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-3"
          >
            {challenges.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-3">Nenhum desafio ativo no momento</p>
                </CardContent>
              </Card>
            ) : (
              challenges.map((c: any) => {
                const joined = joinedChallengeIds.has(c.id);
                const userChallenge = userChallenges.find((uc: any) => uc.challenge_id === c.id);
                const progress = userChallenge
                  ? Math.min((Number(userChallenge.current_value) / Number(c.target_value)) * 100, 100)
                  : 0;
                const Icon = iconMap[c.icon] || Zap;
                const endsAt = c.ends_at ? new Date(c.ends_at) : null;
                const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86400000)) : null;

                return (
                  <Card key={c.id} className={`${userChallenge?.is_completed ? "border-primary/30 bg-primary/5" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                          userChallenge?.is_completed ? "bg-primary/10" : "bg-muted"
                        }`}>
                          <Icon className={`h-5 w-5 ${userChallenge?.is_completed ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-foreground text-sm">{c.title}</p>
                            <span className="text-xs text-primary font-medium shrink-0">+{c.xp_reward} XP</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                          {daysLeft !== null && (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {daysLeft > 0 ? `${daysLeft} dia(s) restante(s)` : "Expirado"}
                            </p>
                          )}
                          {joined && (
                            <div className="mt-2">
                              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                                <span>{Number(userChallenge?.current_value || 0).toFixed(0)} / {Number(c.target_value).toFixed(0)}</span>
                                <span>{progress.toFixed(0)}%</span>
                              </div>
                              <Progress value={progress} className="h-2" />
                            </div>
                          )}
                          {!joined && (
                            <Button
                              size="sm"
                              className="mt-2 rounded-full text-xs h-7"
                              onClick={() => joinChallenge.mutate(c.id)}
                              disabled={joinChallenge.isPending}
                            >
                              Participar <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </motion.div>
        )}

        {/* Ranking Tab */}
        {tab === "ranking" && (
          <motion.div
            key="ranking"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {familyRanking.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground mt-3">Entre em um grupo familiar para ver o ranking</p>
                  <p className="text-xs text-muted-foreground">Acesse "Família" no menu para criar ou entrar em um grupo</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" /> Ranking Familiar
                  </h3>
                  <div className="space-y-3">
                    {familyRanking.map((member: any, i: number) => {
                      const isMe = member.user_id === user?.id;
                      const medalColors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
                      return (
                        <div
                          key={member.user_id}
                          className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                            isMe ? "bg-primary/5 border border-primary/20" : "bg-muted/30"
                          }`}
                        >
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold shrink-0">
                            {i < 3 ? (
                              <Trophy className={`h-4 w-4 ${medalColors[i]}`} />
                            ) : (
                              <span className="text-muted-foreground">{i + 1}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isMe ? "text-primary" : "text-foreground"}`}>
                              {member.display_name} {isMe && "(você)"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Nível {getLevelInfo(member.xp || 0).level} • {levelTitles[getLevelInfo(member.xp || 0).level - 1]}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-foreground">{member.xp || 0} XP</p>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
                              <Flame className="h-3 w-3 text-orange-500" /> {member.streak_current || 0}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
