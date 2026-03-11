import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  X, ChevronLeft, ChevronRight, Plus, MessageSquare,
  TrendingDown, TrendingUp, Clock, DollarSign, FileText, Smile, Frown, Meh,
  RefreshCw, Sparkles, Check, CalendarCheck, AlertTriangle, ArrowRight, CalendarDays,
  Trophy, Star, Flame
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { OnboardingTour } from "@/components/OnboardingTour";
import { AnimatePresence } from "framer-motion";
import { useGamification } from "@/hooks/useGamification";
import RecurrenceSuggestions from "@/components/RecurrenceSuggestions";

type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "Hoje",
  week: "Essa semana",
  month: "Esse mês",
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário";
  const [showWelcome, setShowWelcome] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [showTour, setShowTour] = useState(false);
  const { xp, level, levelTitle, streak, bestStreak } = useGamification();

  const LEVEL_XP = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];
  const currentLevelXp = LEVEL_XP[level - 1] || 0;
  const nextLevelXp = LEVEL_XP[level] || LEVEL_XP[LEVEL_XP.length - 1] + 5000;
  const levelProgress = Math.min(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100, 100);

  // Check if user needs onboarding
  const { data: profile } = useQuery({
    queryKey: ["profile-onboarding", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("has_completed_onboarding")
        .eq("id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  const { data: whatsappLink } = useQuery({
    queryKey: ["whatsapp-link-dashboard", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_links")
        .select("verified")
        .eq("user_id", user!.id)
        .eq("verified", true)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile && !profile.has_completed_onboarding) {
      setShowTour(true);
    }
  }, [profile]);

  const handleTourComplete = async () => {
    setShowTour(false);
    if (user) {
      await supabase
        .from("profiles")
        .update({ has_completed_onboarding: true })
        .eq("id", user.id);
      queryClient.invalidateQueries({ queryKey: ["profile-onboarding"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
    }
  };

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const selectedDate = new Date(selectedYear, selectedMonth, 1);
  const monthName = selectedDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };

  const getDateRange = () => {
    const y = selectedYear, m = selectedMonth;
    if (period === "today") return now.toLocaleDateString("pt-BR");
    if (period === "week") {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
      return `${fmt(start)} até ${fmt(end)}`;
    }
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${fmt(start)} até ${fmt(end)}`;
  };

  const getStartDate = () => {
    const y = selectedYear, m = selectedMonth;
    if (period === "today") return now.toISOString().slice(0, 10);
    if (period === "week") {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      return start.toISOString().slice(0, 10);
    }
    return new Date(y, m, 1).toISOString().slice(0, 10);
  };

  const { data: transactions = [] } = useQuery({
    queryKey: ["dashboard-transactions", user?.id, period],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .gte("date", getStartDate())
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").order("created_at");
      return data || [];
    },
    enabled: !!user,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*").order("name");
      return data || [];
    },
    enabled: !!user,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("financial_goals").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: overdueBills = [] } = useQuery({
    queryKey: ["overdue-bills", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .eq("is_paid", false)
        .lt("due_date", today)
        .order("due_date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: upcomingBills = [] } = useQuery({
    queryKey: ["upcoming-bills", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const next7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .eq("is_paid", false)
        .gte("due_date", today)
        .lte("due_date", next7)
        .order("due_date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const paidExpenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const receivedIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalBalance = wallets.reduce((s, w) => s + Number(w.balance), 0);
  const balance = receivedIncome - paidExpenses;

  // Category breakdown
  const catSpending: Record<string, number> = {};
  transactions.filter(t => t.type === "expense").forEach(t => {
    const catName = (t as any).categories?.name || "Sem categoria";
    catSpending[catName] = (catSpending[catName] || 0) + Number(t.amount);
  });
  const catEntries = Object.entries(catSpending).sort((a, b) => b[1] - a[1]);

  // Mood based on balance
  const getMood = () => {
    if (paidExpenses === 0 && receivedIncome === 0) return { icon: Meh, label: "Neutro", color: "text-muted-foreground" };
    if (balance > 0) return { icon: Smile, label: "Positivo", color: "text-emerald-500" };
    return { icon: Frown, label: "Negativo", color: "text-destructive" };
  };
  const mood = getMood();

  const summaryCards = [
    { label: "Valores Pagos", value: fmt(paidExpenses), subtitle: "Período selecionado", icon: TrendingDown, iconBg: "bg-destructive", iconColor: "text-destructive-foreground", borderColor: "border-destructive/30", valueColor: "text-destructive" },
    { label: "Valores Recebidos", value: fmt(receivedIncome), subtitle: "Período selecionado", icon: TrendingUp, iconBg: "bg-emerald-500", iconColor: "text-white", borderColor: "border-emerald-500/30", valueColor: "text-emerald-500" },
    { label: "Saldo Carteiras", value: fmt(totalBalance), subtitle: `${wallets.length} carteira(s)`, icon: Clock, iconBg: "bg-orange-500", iconColor: "text-white", borderColor: "border-orange-500/30", valueColor: totalBalance < 0 ? "text-destructive" : "text-orange-500" },
    { label: "Balanço do Período", value: fmt(balance), subtitle: balance >= 0 ? "Positivo" : "Negativo", icon: DollarSign, iconBg: "bg-blue-500", iconColor: "text-white", borderColor: "border-blue-500/30", valueColor: balance < 0 ? "text-destructive" : "text-blue-500" },
  ];

  // Category color map
  const catColors = ["bg-rose-500", "bg-orange-500", "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-slate-500"];

  return (
    <>
    <AnimatePresence>
      {showTour && <OnboardingTour onComplete={handleTourComplete} />}
    </AnimatePresence>
    <div className="max-w-6xl mx-auto space-y-3 md:space-y-6">
      {showWelcome && !whatsappLink && (
        <Card className="border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 dark:border-emerald-800/40 relative overflow-hidden">
          <button onClick={() => setShowWelcome(false)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <CardContent className="p-3 md:p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">👋</span>
              <div>
                <h3 className="font-semibold text-foreground">Bem-vindo ao Brave!</h3>
                <p className="text-sm text-muted-foreground mt-1">Veja como aproveitar ao máximo seu assessor financeiro</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-emerald-100/60 dark:bg-emerald-900/20 p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-sm">Conecte seu WhatsApp</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Registre gastos enviando mensagens como "gastei 50 no mercado" direto pelo WhatsApp</p>
                </div>
              </div>
                <Button variant="outline" size="sm" className="mt-3 rounded-full border-emerald-300 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30" onClick={() => navigate("/dashboard/settings")}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Conectar Meu WhatsApp
                </Button>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex gap-1.5">
                <div className="h-1.5 w-6 rounded-full bg-primary" />
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2 md:gap-4">
        <div>
          <h1 className="text-lg md:text-3xl font-bold text-foreground">Olá, {displayName}! 👋</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-0.5 md:mt-1">Aqui está seu resumo financeiro</p>
        </div>
        <div className="flex items-center gap-2">
          <AddTransactionDialog />
          <Button
            size="sm"
            variant="outline"
            className="rounded-full text-xs gap-1.5"
            onClick={() => navigate("/dashboard/bills")}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nova Conta</span>
            <span className="sm:hidden">Conta</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full text-xs gap-1.5"
            onClick={() => navigate("/dashboard/reminders")}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Novo Lembrete</span>
            <span className="sm:hidden">Lembrete</span>
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10" onClick={handlePrevMonth}><ChevronLeft className="h-5 w-5" /></Button>
            <div className="text-center">
              <p className="font-semibold text-foreground">{monthCapitalized}</p>
              <div className="flex items-center gap-2 mt-2 justify-center">
                {(["today", "week", "month"] as Period[]).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                    {periodLabels[p]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{getDateRange()}</p>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10" onClick={handleNextMonth}><ChevronRight className="h-5 w-5" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className={`border-l-4 ${card.borderColor}`}>
            <CardContent className="p-2.5 md:p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs text-muted-foreground truncate">{card.label}</p>
                <p className={`text-sm md:text-xl font-bold mt-0.5 md:mt-1 ${card.valueColor} truncate`}>{card.value}</p>
                <p className="text-[9px] md:text-[11px] text-muted-foreground mt-0.5 hidden sm:block">{card.subtitle}</p>
              </div>
              <div className={`h-8 w-8 md:h-10 md:w-10 rounded-full ${card.iconBg} ${card.iconColor} flex items-center justify-center shrink-0`}>
                <card.icon className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gamification Widget */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/dashboard/gamification")}>
        <CardContent className="p-3 md:p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-9 w-9 md:h-11 md:w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Star className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Nível {level}</span>
                  <span className="text-xs text-primary font-medium">{levelTitle}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">{xp} XP</span>
                  <div className="flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-orange-500" />
                    <span className="text-xs font-semibold text-foreground">{streak}</span>
                    <span className="text-[10px] text-muted-foreground">dias</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-24">
                <Progress value={levelProgress} className="h-2" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 md:gap-4">
        <Card className="lg:col-span-2 border-l-4 border-emerald-500/30">
          <CardContent className="p-3 md:p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Balanço Previsto</p>
              <p className={`text-lg md:text-xl font-bold ${balance >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(balance)}</p>
              <p className="text-[11px] text-muted-foreground">Receitas - Despesas do período</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 flex items-center justify-end gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Humor</p>
              <p className={`text-sm font-semibold ${mood.color}`}>{mood.label}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <mood.icon className={`h-6 w-6 ${mood.color}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gastos por Categoria + Metas */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-2 md:gap-4">
        <Card className="lg:col-span-3">
          <CardContent className="p-3 md:p-5">
            <h3 className="font-semibold text-foreground text-sm md:text-base">Gastos por Categoria</h3>
            {catEntries.length === 0 ? (
              <div className="mt-6 flex flex-col items-center text-center pb-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingDown className="h-7 w-7 text-primary/50" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">Nenhum gasto registrado</p>
                <p className="text-xs text-muted-foreground mt-1">Registre sua primeira despesa para ver os gastos por categoria</p>
                <AddTransactionDialog
                  trigger={
                    <Button size="sm" className="mt-4 rounded-full gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Registrar gasto
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {catEntries.slice(0, 6).map(([cat, total], i) => (
                  <div key={cat} className="flex items-center gap-3">
                    <div className={`h-3 w-3 rounded-full ${catColors[i % catColors.length]} shrink-0`} />
                    <span className="text-sm text-foreground flex-1">{cat}</span>
                    <span className="text-sm font-semibold text-foreground">{fmt(total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><CalendarCheck className="h-4 w-4 text-primary" /></div>
              <div>
                <h3 className="font-semibold text-foreground">Metas Ativas</h3>
                <p className="text-xs text-muted-foreground">{goals.length} meta(s)</p>
              </div>
            </div>
            {goals.length === 0 ? (
              <div className="mt-6 flex flex-col items-center text-center">
                <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <CalendarCheck className="h-7 w-7 text-emerald-500/60" />
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">Crie sua primeira meta</p>
                <p className="text-xs text-muted-foreground mt-1">Defina objetivos como viagens ou reserva de emergência</p>
                <Button size="sm" variant="outline" className="mt-4 rounded-full gap-1.5 border-emerald-300 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => navigate("/dashboard/goals")}>
                  <Plus className="h-3.5 w-3.5" /> Criar meta
                </Button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {goals.slice(0, 3).map((g) => {
                  const pct = g.target_amount > 0 ? Math.min((Number(g.current_amount) / Number(g.target_amount)) * 100, 100) : 0;
                  return (
                    <div key={g.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-foreground font-medium">{g.name}</span>
                        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-border text-center">
              <button onClick={() => navigate("/dashboard/goals")} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                Ver todas as metas <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Últimas Transações */}
      <Card>
          <CardContent className="p-3 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-primary" /></div>
              <h3 className="font-semibold text-foreground">Últimas Transações</h3>
            </div>
            <button onClick={() => navigate("/dashboard/wallets")} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              Ver todas <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-7 w-7 text-primary/50" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">Nenhuma transação no período</p>
              <p className="text-xs text-muted-foreground mt-1">Adicione receitas e despesas para acompanhar suas finanças</p>
              <AddTransactionDialog
                trigger={
                  <Button size="sm" className="mt-4 rounded-full gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Adicionar transação
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-1">
              {transactions.slice(0, 5).map((t) => (
                <div key={t.id} className={`flex items-center gap-3 py-2 border-b border-border last:border-0 rounded-lg px-2 -mx-2 transition-colors ${t.type === "income" ? "hover:bg-emerald-500/5" : "hover:bg-destructive/5"}`}>
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-emerald-500/15" : "bg-destructive/10"}`}>
                    {t.type === "income" ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${t.type === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("pt-BR")} · <span className={`font-medium ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>{t.type === "income" ? "Receita" : "Despesa"}</span>
                      {(t as any).categories?.name && <> · {(t as any).categories.name}</>}
                    </p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                    {t.type === "income" ? "+" : "-"}{fmt(Number(t.amount))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recurrence Suggestions */}
      <RecurrenceSuggestions />

      {/* Alertas */}
      <Card>
        <CardContent className="p-3 md:p-5">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><AlertTriangle className="h-4 w-4 text-orange-500" /></div>
            <h3 className="font-semibold text-foreground">Alertas Inteligentes</h3>
          </div>

          {(overdueBills.length > 0 || upcomingBills.length > 0 || catEntries.some(([catName, v]) => {
            const cat = categories.find(c => c.name === catName);
            return cat?.budget_limit && v > Number(cat.budget_limit);
          })) ? (
            <div className="mt-4 space-y-2">
              {/* Overdue bills */}
              {overdueBills.map((bill: any) => (
                <div key={bill.id} className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg cursor-pointer hover:bg-destructive/15 transition-colors" onClick={() => navigate("/dashboard/transactions")}>
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      <strong>{bill.description}</strong> está vencida!
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Venceu em {new Date(bill.due_date).toLocaleDateString("pt-BR")} • {fmt(Number(bill.amount))}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}

              {/* Upcoming bills (next 7 days) */}
              {upcomingBills.map((bill: any) => (
                <div key={bill.id} className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-lg cursor-pointer hover:bg-amber-500/15 transition-colors" onClick={() => navigate("/dashboard/transactions")}>
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      <strong>{bill.description}</strong> vence em breve
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vence em {new Date(bill.due_date).toLocaleDateString("pt-BR")} • {fmt(Number(bill.amount))}
                    </p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}

              {/* Budget alerts */}
              {catEntries.filter(([catName, v]) => {
                const cat = categories.find(c => c.name === catName);
                return cat?.budget_limit && v > Number(cat.budget_limit);
              }).map(([catName, v]) => {
                const cat = categories.find(c => c.name === catName);
                return (
                  <div key={catName} className="flex items-center gap-3 p-3 bg-destructive/5 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <p className="text-sm text-foreground">
                      <strong>{catName}</strong> ultrapassou o orçamento: {fmt(v)} / {fmt(Number(cat!.budget_limit))}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center text-center pb-4">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Sparkles className="h-6 w-6 text-muted-foreground/50" /></div>
              <p className="mt-3 text-sm text-muted-foreground">Nenhum alerta por enquanto</p>
              <p className="text-xs text-muted-foreground">Continue registrando seus gastos!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
