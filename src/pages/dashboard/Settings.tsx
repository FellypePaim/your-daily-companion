import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/hooks/useGamification";
import WhatsAppLinkCard from "@/components/WhatsAppLinkCard";
import { SettingsProfileSection } from "@/components/settings/SettingsProfileSection";
import { SettingsAchievementsSection } from "@/components/settings/SettingsAchievementsSection";
import { SettingsPlansSection } from "@/components/settings/SettingsPlansSection";
import { SettingsNotificationsSection } from "@/components/settings/SettingsNotificationsSection";
import { SettingsSecuritySection } from "@/components/settings/SettingsSecuritySection";

export default function Settings() {
  const { user } = useAuth();
  const { xp, level, levelTitle, streak, bestStreak, achievements, unlockedKeys } = useGamification();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState("free");
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null);
  const [notifyMorning, setNotifyMorning] = useState(true);
  const [notifyNight, setNotifyNight] = useState(true);
  const [notifyMonthlyReport, setNotifyMonthlyReport] = useState(true);
  const [notifyEmailUpdates, setNotifyEmailUpdates] = useState(true);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || "");
    const fetchProfile = async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setDisplayName(data.display_name || "");
        setCpfCnpj((data as any).cpf_cnpj || "");
        setMonthlyIncome(data.monthly_income?.toString() || "");
        setAvatarUrl(data.avatar_url);
        setPlan(data.subscription_plan || "free");
        setSubscriptionExpiresAt((data as any).subscription_expires_at ?? null);
        setNotifyMorning(data.notify_morning ?? true);
        setNotifyNight(data.notify_night ?? true);
        setNotifyMonthlyReport(data.notify_monthly_report ?? true);
        setNotifyEmailUpdates(data.notify_email_updates ?? true);
      }
    };
    fetchProfile();
  }, [user]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e integrações</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingsProfileSection
          displayName={displayName} setDisplayName={setDisplayName}
          cpfCnpj={cpfCnpj} setCpfCnpj={setCpfCnpj}
          monthlyIncome={monthlyIncome} setMonthlyIncome={setMonthlyIncome}
          email={email} avatarUrl={avatarUrl} setAvatarUrl={setAvatarUrl}
        />
        <WhatsAppLinkCard userId={user?.id} />
      </div>

      <SettingsAchievementsSection
        xp={xp} level={level} levelTitle={levelTitle}
        streak={streak} achievements={achievements} unlockedKeys={unlockedKeys}
      />

      <SettingsPlansSection plan={plan} subscriptionExpiresAt={subscriptionExpiresAt} />

      <SettingsNotificationsSection
        notifyMorning={notifyMorning} setNotifyMorning={setNotifyMorning}
        notifyNight={notifyNight} setNotifyNight={setNotifyNight}
        notifyMonthlyReport={notifyMonthlyReport} setNotifyMonthlyReport={setNotifyMonthlyReport}
      />

      <SettingsSecuritySection email={email} />
    </div>
  );
}
