import { useEffect, useCallback, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LEVEL_XP = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];

function getLevel(xp: number) {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) level = i + 1;
    else break;
  }
  return level;
}

const levelTitles = [
  "Iniciante", "Aprendiz", "Planejador", "Organizador", "Estrategista",
  "Investidor", "Expert", "Guru", "Mestre", "Lenda Financeira"
];

export function useGamification() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const checkedRef = useRef(false);
  const [pendingAchievement, setPendingAchievement] = useState<any>(null);
  const [pendingLevelUp, setPendingLevelUp] = useState<{ level: number; title: string } | null>(null);

  const { data: gamification } = useQuery({
    queryKey: ["user-gamification", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_gamification")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!data) {
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

  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const { data } = await supabase.from("achievements").select("*");
      return data || [];
    },
  });

  const { data: userAchievements = [] } = useQuery({
    queryKey: ["user-achievements", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_achievements")
        .select("achievement_id")
        .eq("user_id", user!.id);
      return data || [];
    },
    enabled: !!user,
  });

  const unlockedKeys = new Set(
    userAchievements.map((ua: any) => {
      const ach = achievements.find((a: any) => a.id === ua.achievement_id);
      return ach?.key;
    }).filter(Boolean)
  );

  const grantXP = useCallback(async (amount: number) => {
    if (!user || !gamification) return;
    const newXp = (gamification.xp || 0) + amount;
    const oldLevel = getLevel(gamification.xp || 0);
    const newLevel = getLevel(newXp);

    await supabase
      .from("user_gamification")
      .update({ xp: newXp, level: newLevel, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    queryClient.invalidateQueries({ queryKey: ["user-gamification"] });

    if (newLevel > oldLevel) {
      setPendingLevelUp({ level: newLevel, title: levelTitles[newLevel - 1] });
      notifyWhatsApp(user.id, `level_up`, `Nível ${newLevel}: ${levelTitles[newLevel - 1]}`);
    }
  }, [user, gamification, queryClient]);

  const unlockAchievement = useCallback(async (key: string) => {
    if (!user || unlockedKeys.has(key)) return;
    const achievement = achievements.find((a: any) => a.key === key);
    if (!achievement) return;

    const { error } = await supabase
      .from("user_achievements")
      .insert({ user_id: user.id, achievement_id: achievement.id });

    if (error) {
      // Already unlocked (unique constraint)
      if (error.code === "23505") return;
      console.error("Error unlocking achievement:", error);
      return;
    }

    setPendingAchievement(achievement);
    queryClient.invalidateQueries({ queryKey: ["user-achievements"] });

    // Grant XP
    await grantXP(achievement.xp_reward);

    // Notify via WhatsApp
    notifyWhatsApp(user.id, "achievement", achievement.name);
  }, [user, unlockedKeys, achievements, grantXP, queryClient]);

  // Auto-check achievements
  const checkAchievements = useCallback(async () => {
    if (!user || achievements.length === 0) return;

    // Check first_transaction
    if (!unlockedKeys.has("first_transaction")) {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (count && count > 0) await unlockAchievement("first_transaction");
    }

    // Check wallet_created
    if (!unlockedKeys.has("wallet_created")) {
      const { count } = await supabase
        .from("wallets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (count && count > 0) await unlockAchievement("wallet_created");
    }

    // Check categories_5
    if (!unlockedKeys.has("categories_5")) {
      const { count } = await supabase
        .from("categories")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (count && count >= 5) await unlockAchievement("categories_5");
    }

    // Check goal_achieved
    if (!unlockedKeys.has("goal_achieved")) {
      const { data: goals } = await supabase
        .from("financial_goals")
        .select("current_amount, target_amount")
        .eq("user_id", user.id);
      const achieved = goals?.some(g =>
        Number(g.target_amount) > 0 && Number(g.current_amount) >= Number(g.target_amount)
      );
      if (achieved) await unlockAchievement("goal_achieved");
    }

    // Check family_joined
    if (!unlockedKeys.has("family_joined")) {
      const { count } = await supabase
        .from("family_memberships")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active");
      const { count: ownedCount } = await supabase
        .from("family_groups")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      if ((count && count > 0) || (ownedCount && ownedCount > 0)) {
        await unlockAchievement("family_joined");
      }
    }

    // Check streak_7 and streak_30
    if (gamification) {
      if (!unlockedKeys.has("streak_7") && gamification.streak_current >= 7) {
        await unlockAchievement("streak_7");
      }
      if (!unlockedKeys.has("streak_30") && gamification.streak_current >= 30) {
        await unlockAchievement("streak_30");
      }
    }

    // Check budget_guardian (all categories with budget within limit this month)
    if (!unlockedKeys.has("budget_guardian")) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name, budget_limit")
        .eq("user_id", user.id)
        .not("budget_limit", "is", null);

      if (cats && cats.length > 0) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("category_id, amount")
          .eq("user_id", user.id)
          .eq("type", "expense")
          .gte("date", startOfMonth);

        const catSpending: Record<string, number> = {};
        txs?.forEach(t => {
          if (t.category_id) catSpending[t.category_id] = (catSpending[t.category_id] || 0) + Number(t.amount);
        });

        const allWithin = cats.every(c => (catSpending[c.id] || 0) <= Number(c.budget_limit));
        // Only grant near end of month (day >= 28)
        if (allWithin && now.getDate() >= 28) {
          await unlockAchievement("budget_guardian");
        }
      }
    }
  }, [user, achievements, unlockedKeys, unlockAchievement, gamification]);

  // Update streak on load
  useEffect(() => {
    if (!user || !gamification || checkedRef.current) return;
    checkedRef.current = true;

    const today = new Date().toISOString().slice(0, 10);
    if (gamification.last_activity_date === today) {
      // Already updated today, just check achievements
      checkAchievements();
      return;
    }

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
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["user-gamification"] });
        // Grant daily XP
        grantXP(5);
        checkAchievements();
      });
  }, [user, gamification, checkAchievements, grantXP, queryClient]);

  return {
    gamification,
    achievements,
    userAchievements,
    unlockedKeys,
    grantXP,
    unlockAchievement,
    checkAchievements,
    xp: gamification?.xp || 0,
    level: getLevel(gamification?.xp || 0),
    levelTitle: levelTitles[getLevel(gamification?.xp || 0) - 1] || "Lenda",
    streak: gamification?.streak_current || 0,
    bestStreak: gamification?.streak_best || 0,
    pendingAchievement,
    clearPendingAchievement: () => setPendingAchievement(null),
    pendingLevelUp,
    clearPendingLevelUp: () => setPendingLevelUp(null),
  };
}

async function notifyWhatsApp(userId: string, type: "achievement" | "level_up", detail: string) {
  try {
    const { data: link } = await supabase
      .from("whatsapp_links")
      .select("phone_number")
      .eq("user_id", userId)
      .eq("verified", true)
      .maybeSingle();

    if (!link?.phone_number) return;

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    if (!projectId) return;

    await supabase.functions.invoke("gamification-notify", {
      body: { phone: link.phone_number, type, detail },
    });
  } catch (e) {
    console.error("WhatsApp gamification notify error:", e);
  }
}
