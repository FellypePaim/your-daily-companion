import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import WhatsAppLinkCard from "@/components/WhatsAppLinkCard";
import { useGamification } from "@/hooks/useGamification";
import { motion } from "framer-motion";
import {
  User, Camera, MessageSquare, Crown, HeadphonesIcon,
  Bell, Mail, Sparkles,
  FileText, Sun, Moon, CheckCircle2, Zap, Star, Lock, Eye, EyeOff,
  CreditCard, CalendarDays, ExternalLink, Loader2,
  Trophy, Flame, Shield, Wallet, Tags, Receipt, Users as UsersIcon, Award, TrendingUp,
} from "lucide-react";

const badgeIconMap: Record<string, any> = {
  trophy: Trophy, flame: Flame, star: Star, zap: Zap,
  shield: Shield, wallet: Wallet, tags: Tags, receipt: Receipt,
  users: UsersIcon, award: Award, "fire-extinguisher": Flame,
  "list-checks": CheckCircle2, "piggy-bank": TrendingUp,
};

const NOX_PHONE = "5537999385148";
const NOX_PHONE_DISPLAY = "(37) 9 9938-5148";

const PLANS = [
  {
    key: "teste",
    name: "Plano Teste",
    price: "Grátis",
    period: "· 10 min",
    description: "Liberado pelo administrador",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    features: [
      { label: "Acesso completo por 10 minutos", included: true },
      { label: "Todas as funcionalidades do Mensal", included: true },
      { label: "Modo Família (5 pessoas)", included: false },
      { label: "Análise comportamental", included: false },
    ],
  },
  {
    key: "mensal",
    name: "Brave Mensal",
    price: "R$ 19,90",
    period: "/mês",
    description: "Ideal para começar",
    icon: Zap,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    features: [
      { label: "WhatsApp conectado", included: true },
      { label: "Cartões de crédito", included: true },
      { label: "Orçamentos por categoria", included: true },
      { label: "Relatórios detalhados", included: true },
      { label: "Previsões com IA", included: true },
      { label: "Modo Família (5 pessoas)", included: false },
      { label: "Análise comportamental", included: false },
    ],
  },
  {
    key: "anual",
    name: "Brave Anual",
    price: "R$ 14,90",
    period: "/mês · 12x",
    description: "Melhor custo-benefício",
    icon: Star,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    badge: "Mais Popular",
    features: [
      { label: "WhatsApp conectado", included: true },
      { label: "Cartões de crédito", included: true },
      { label: "Orçamentos por categoria", included: true },
      { label: "Relatórios detalhados", included: true },
      { label: "Previsões com IA", included: true },
      { label: "Modo Família (5 pessoas)", included: true },
      { label: "Análise comportamental", included: true },
    ],
  },
];

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);

  // Security: change email / password
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email || "");

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);

    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    // Ensure bucket exists - upload directly
    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      toast({ title: "Erro", description: uploadErr.message, variant: "destructive" });
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${urlData.publicUrl}?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setAvatarUrl(url);
    setUploadingAvatar(false);
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast({ title: "Foto atualizada!" });
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);

    // Update profile table
    const cleanCpf = cpfCnpj.replace(/\D/g, "");
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      monthly_income: parseFloat(monthlyIncome) || 0,
      cpf_cnpj: cleanCpf || null,
    } as any).eq("id", user.id);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Sync display_name to auth user metadata so greeting updates everywhere
    const { error: metaError } = await supabase.auth.updateUser({
      data: { display_name: displayName },
    });

    if (metaError) {
      toast({ title: "Perfil salvo, mas falha ao sincronizar nome", description: metaError.message, variant: "destructive" });
    } else {
      toast({ title: "Alterações salvas!", description: "Seu nome foi atualizado em todo o sistema." });
    }

    setSaving(false);
  };

  const saveNotifications = async (field: string, value: boolean) => {
    if (!user) return;
    await supabase.from("profiles").update({ [field]: value }).eq("id", user.id);
  };

  const saveSecurityChanges = async () => {
    if (!user) return;

    const hasEmailChange = newEmail.trim() !== "" && newEmail.trim() !== email;
    const hasPasswordChange = newPassword.length >= 6;

    if (!hasEmailChange && !hasPasswordChange) {
      toast({ title: "Nada a alterar", description: "Preencha um novo e-mail ou senha.", variant: "destructive" });
      return;
    }

    if (hasPasswordChange && newPassword !== confirmPassword) {
      toast({ title: "Senhas não conferem", description: "A confirmação deve ser igual à nova senha.", variant: "destructive" });
      return;
    }

    setSavingSecurity(true);

    // Re-authenticate before sensitive changes
    if (currentPassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (signInError) {
        toast({ title: "Senha atual incorreta", description: "Verifique sua senha e tente novamente.", variant: "destructive" });
        setSavingSecurity(false);
        return;
      }
    }

    const updateData: { email?: string; password?: string } = {};
    if (hasEmailChange) updateData.email = newEmail.trim();
    if (hasPasswordChange) updateData.password = newPassword;

    const { error } = await supabase.auth.updateUser(updateData);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Credenciais atualizadas!",
        description: hasEmailChange ? "Verifique seu novo e-mail para confirmar." : "Senha alterada com sucesso.",
      });
      setNewEmail("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }

    setSavingSecurity(false);
  };

  const handlePortal = async () => {
    setLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw new Error(error.message || "Erro ao abrir portal");
      if (data?.noCustomer || data?.noPayments) {
        toast({ title: "Sem cobranças", description: data.error || "Assine um plano primeiro para acessar o portal." });
        return;
      }
      if (!data?.url) throw new Error("Erro ao abrir portal");
      window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPortal(false);
    }
  };

  const currentPlan = PLANS.find(p => p.key === plan);
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "U";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie seu perfil e integrações</p>
      </div>

      {/* Top row: Profile + WhatsApp */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Perfil</h2>
              <p className="text-xs text-muted-foreground">Suas informações pessoais</p>
            </div>
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              {uploadingAvatar ? "Enviando..." : "Alterar foto"}
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">E-mail</label>
              <Input value={email} disabled className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">CPF ou CNPJ</label>
              <Input
                value={cpfCnpj}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                  if (digits.length <= 11) {
                    setCpfCnpj(digits.replace(/(\d{3})(\d{3})?(\d{3})?(\d{2})?/, (_, a, b, c, d) =>
                      [a, b, c].filter(Boolean).join(".") + (d ? `-${d}` : "")
                    ));
                  } else {
                    setCpfCnpj(digits.replace(/(\d{2})(\d{3})?(\d{3})?(\d{4})?(\d{2})?/, (_, a, b, c, d, ee) =>
                      [a, b, c].filter(Boolean).join(".") + (d ? `/${d}` : "") + (ee ? `-${ee}` : "")
                    ));
                  }
                }}
                placeholder="000.000.000-00"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Renda mensal</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <Input
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  className="pl-10"
                  type="number"
                />
              </div>
            </div>
            <Button onClick={saveProfile} disabled={saving} className="w-full">
              <Sparkles className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </Card>

        {/* WhatsApp Card */}
        <WhatsAppLinkCard userId={user?.id} />
      </div>

      {/* Badges Showcase */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Minhas Conquistas</h2>
              <p className="text-xs text-muted-foreground">
                {unlockedKeys.size} de {achievements.length} desbloqueadas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Star className="h-4 w-4 text-primary" />
              <span className="font-bold text-foreground">Nv. {level}</span>
              <span className="text-xs text-muted-foreground">{levelTitle}</span>
            </div>
            <div className="flex items-center gap-1">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="font-bold text-foreground">{streak}</span>
            </div>
          </div>
        </div>

        {/* XP Bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{xp} XP total</span>
            <span>Próximo nível</span>
          </div>
          <Progress value={(() => {
            const LEVEL_XP = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];
            const cur = LEVEL_XP[level - 1] || 0;
            const next = LEVEL_XP[level] || cur + 5000;
            return Math.min(((xp - cur) / (next - cur)) * 100, 100);
          })()} className="h-2.5" />
        </div>

        {/* Badge Grid */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {achievements.map((a: any, i: number) => {
            const unlocked = unlockedKeys.has(a.key);
            const Icon = badgeIconMap[a.icon] || Trophy;
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, type: "spring", bounce: 0.4 }}
                className="group relative"
              >
                <div
                  className={`relative h-14 w-14 mx-auto rounded-xl flex items-center justify-center transition-all ${
                    unlocked
                      ? "bg-primary/10 ring-2 ring-primary/30 hover:ring-primary/50 hover:scale-110"
                      : "bg-muted/60 grayscale opacity-40"
                  }`}
                >
                  {unlocked && (
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-primary/10"
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    />
                  )}
                  {unlocked ? (
                    <Icon className="h-6 w-6 text-primary relative z-10" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                  {unlocked && (
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                      <CheckCircle2 className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
                <p className={`text-[9px] text-center mt-1.5 leading-tight font-medium ${
                  unlocked ? "text-foreground" : "text-muted-foreground/50"
                }`}>
                  {a.name}
                </p>

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-36 bg-popover border border-border rounded-lg p-2 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                  <p className="text-xs font-semibold text-foreground">{a.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.description}</p>
                  <p className="text-[10px] text-primary font-medium mt-1">+{a.xp_reward} XP</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-4 text-center">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate("/dashboard/gamification")}>
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            Ver todas as conquistas
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Crown className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Planos e Assinatura</h2>
            <p className="text-xs text-muted-foreground">Gerencie sua assinatura Nox</p>
          </div>
          {currentPlan && plan !== "free" && (
            <Badge className="ml-auto bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
            </Badge>
          )}
        </div>

        {/* Status atual em destaque */}
        {currentPlan && plan !== "free" ? (
          <div className={`rounded-xl border-2 p-5 mb-6 ${currentPlan.border} bg-gradient-to-r from-background to-muted/30`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`h-11 w-11 rounded-xl ${currentPlan.bg} flex items-center justify-center`}>
                  <currentPlan.icon className={`h-5 w-5 ${currentPlan.color}`} />
                </div>
                <div>
                  <p className="font-bold text-foreground text-base">{currentPlan.name}</p>
                  <p className="text-xs text-muted-foreground">{currentPlan.description}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-extrabold text-foreground">{currentPlan.price}</p>
                <p className="text-xs text-muted-foreground">{currentPlan.period}</p>
              </div>
            </div>
            {subscriptionExpiresAt && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Renova automaticamente em{" "}
                  <span className="font-semibold text-foreground">
                    {new Date(subscriptionExpiresAt).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </span>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={handlePortal}
                disabled={loadingPortal}
              >
                {loadingPortal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CreditCard className="h-3.5 w-3.5" />
                )}
                Gerenciar assinatura
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 p-5 mb-6 text-center">
            <Crown className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Você está no plano gratuito</p>
            <p className="text-xs text-muted-foreground mt-1">Assine um plano para desbloquear todos os recursos</p>
          </div>
        )}

        {/* Plan comparison grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {PLANS.map((p) => {
            const isActive = plan === p.key;
            const PlanIcon = p.icon;
            return (
              <div
                key={p.key}
                className={`relative rounded-xl border-2 p-5 transition-all ${
                  isActive
                    ? `${p.border} bg-gradient-to-b from-background to-muted/20`
                    : "border-border bg-muted/30"
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-xs font-bold bg-amber-500 text-white px-3 py-0.5 rounded-full">
                    {p.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute top-3 right-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </span>
                )}
                <div className={`h-9 w-9 rounded-xl ${p.bg} flex items-center justify-center mb-3`}>
                  <PlanIcon className={`h-4 w-4 ${p.color}`} />
                </div>
                <p className="font-bold text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-extrabold text-foreground">{p.price}</span>
                  <span className="text-xs text-muted-foreground">{p.period}</span>
                </div>
                <div className="space-y-2">
                  {p.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {f.included ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                      )}
                      <span className={f.included ? "text-foreground" : "text-muted-foreground/60 line-through"}>
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>
                {isActive ? (
                  <div className="mt-4 text-center">
                    <p className="text-xs font-medium text-emerald-600">✓ Plano atual</p>
                  </div>
                ) : (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-muted-foreground">Entre em contato para assinar este plano</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
          onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
        >
          <MessageSquare className="h-4 w-4" />
          Assinar ou gerenciar plano via WhatsApp · {NOX_PHONE_DISPLAY}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-3">
          Fale com nossa equipe para assinar, cancelar ou atualizar seu plano
        </p>
      </Card>

      {/* Help Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center">
            <HeadphonesIcon className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Precisa de Ajuda?</h2>
            <p className="text-xs text-muted-foreground">Nossa equipe está pronta para te ajudar</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard/chat")}>
            <HeadphonesIcon className="h-4 w-4 mr-2" />
            Central de Suporte
          </Button>
          <Button
            className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
            onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
          >
            <MessageSquare className="h-4 w-4" />
            WhatsApp · {NOX_PHONE_DISPLAY}
          </Button>
        </div>
      </Card>

      {/* WhatsApp Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">Notificações WhatsApp</h2>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Sun className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Mensagem Matinal</p>
                <p className="text-xs text-muted-foreground">Receba um resumo do dia anterior às 8h</p>
              </div>
            </div>
            <Switch
              checked={notifyMorning}
              onCheckedChange={(v) => { setNotifyMorning(v); saveNotifications("notify_morning", v); }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Moon className="h-4 w-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Mensagem Noturna</p>
                <p className="text-xs text-muted-foreground">Receba um resumo do dia às 22:00</p>
              </div>
            </div>
            <Switch
              checked={notifyNight}
              onCheckedChange={(v) => { setNotifyNight(v); saveNotifications("notify_night", v); }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <FileText className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Relatório Mensal</p>
                <p className="text-xs text-muted-foreground">Receba um relatório completo no último dia do mês</p>
              </div>
            </div>
            <Switch
              checked={notifyMonthlyReport}
              onCheckedChange={(v) => { setNotifyMonthlyReport(v); saveNotifications("notify_monthly_report", v); }}
            />
          </div>
        </div>
      </Card>

      {/* Security: change email & password */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Segurança</h2>
            <p className="text-xs text-muted-foreground">Altere seu e-mail ou senha de acesso</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* New email */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Novo e-mail</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                className="pl-9"
                placeholder={email}
                maxLength={255}
              />
            </div>
          </div>

          {/* Current password (re-auth) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Senha atual <span className="font-normal">(necessária para confirmar alterações)</span></label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type={showCurrentPw ? "text" : "password"}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="pl-9 pr-9"
                placeholder="Sua senha atual"
                maxLength={128}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrentPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nova senha <span className="font-normal">(deixe vazio para não alterar)</span></label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type={showNewPw ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="pl-9 pr-9"
                placeholder="Mínimo 6 caracteres"
                maxLength={128}
              />
              <button
                type="button"
                onClick={() => setShowNewPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          {newPassword && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Confirmar nova senha</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="mt-1"
                placeholder="Repita a nova senha"
                maxLength={128}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[11px] text-destructive mt-1">As senhas não conferem.</p>
              )}
            </div>
          )}

          <Button onClick={saveSecurityChanges} disabled={savingSecurity} className="w-full">
            <Lock className="h-4 w-4 mr-2" />
            {savingSecurity ? "Salvando..." : "Salvar alterações de segurança"}
          </Button>
        </div>
      </Card>

      {/* Email Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">Novidades por Email</h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Novidades e Atualizações</p>
              <p className="text-xs text-muted-foreground">Receba novidades sobre o Nox e novas funcionalidades</p>
            </div>
          </div>
          <Switch
            checked={notifyEmailUpdates}
            onCheckedChange={(v) => { setNotifyEmailUpdates(v); saveNotifications("notify_email_updates", v); }}
          />
        </div>
      </Card>
    </div>
  );
}
