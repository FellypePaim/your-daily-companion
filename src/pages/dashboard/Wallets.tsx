import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Wallet, TrendingUp, TrendingDown, Landmark, Plus,
  CalendarDays, ArrowRight, LayoutGrid, ArrowDownUp, Building2,
  Download, Search, Filter, ChevronLeft, ChevronRight, Pencil, AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AddWalletDialog } from "@/components/AddWalletDialog";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { EditWalletDialog } from "@/components/EditWalletDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { TransferDialog } from "@/components/TransferDialog";

type Tab = "overview" | "transactions" | "accounts";
type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "Hoje", week: "Semana", month: "Mês",
};

export default function Wallets() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [editWallet, setEditWallet] = useState<any>(null);
  const [editTx, setEditTx] = useState<any>(null);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("wallets").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["wallet-transactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions").select("*").order("date", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());

  const handlePrevMonth = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  };
  const handleNextMonth = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  };

  const monthStart = new Date(selYear, selMonth, 1).toISOString().slice(0, 10);
  const selDate = new Date(selYear, selMonth, 1);
  const monthName = selDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const monthEnd = new Date(selYear, selMonth + 1, 0);
  const dateRange = `${new Date(selYear, selMonth, 1).toLocaleDateString("pt-BR")} até ${monthEnd.toLocaleDateString("pt-BR")}`;

  const monthIncome = transactions.filter((t) => t.type === "income" && t.date >= monthStart).reduce((sum, t) => sum + Number(t.amount), 0);
  const monthExpense = transactions.filter((t) => t.type === "expense" && t.date >= monthStart).reduce((sum, t) => sum + Number(t.amount), 0);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const tabs: { id: Tab; label: string; shortLabel: string; icon: typeof LayoutGrid }[] = [
    { id: "overview", label: "Visão Geral", shortLabel: "Visão", icon: LayoutGrid },
    { id: "transactions", label: "Transações", shortLabel: "Transações", icon: ArrowDownUp },
    { id: "accounts", label: "Contas", shortLabel: "Contas", icon: Building2 },
  ];

  const WalletCard = ({ w }: { w: any }) => {
    const bgColor = w.color || "hsl(270, 60%, 55%)";
    const isNegative = Number(w.balance) < 0;
    return (
      <div
        key={w.id}
        className={`rounded-xl text-white p-3 md:p-4 min-w-[140px] md:min-w-[160px] flex items-center gap-2.5 md:gap-3 cursor-pointer hover:brightness-110 transition-all group relative ${isNegative ? "ring-2 ring-destructive ring-offset-2 ring-offset-background" : ""}`}
        style={{ background: isNegative ? "linear-gradient(135deg, #dc2626, #b91c1c)" : bgColor }}
        onClick={() => setEditWallet(w)}
      >
        <Pencil className="absolute top-2 right-2 h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity" />
        {isNegative && (
          <div className="absolute top-2 left-2">
            <AlertTriangle className="h-3 w-3 text-yellow-300" />
          </div>
        )}
        <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0 text-base md:text-lg">
          {w.icon || "🏦"}
        </div>
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-semibold leading-tight truncate">{w.name}</p>
          <p className={`text-xs md:text-sm font-bold ${isNegative ? "text-yellow-300" : ""}`}>{fmt(Number(w.balance))}</p>
          {isNegative && <p className="text-[9px] md:text-[10px] text-white/80 mt-0.5">Saldo negativo</p>}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-3 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg md:text-3xl font-bold text-foreground">Carteira</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Gerencie seu dinheiro e transações</p>
        </div>
        <TransferDialog />
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 rounded-xl border border-border bg-card overflow-hidden">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center justify-center gap-1.5 md:gap-2 py-2.5 md:py-3 text-xs md:text-sm font-medium transition-colors ${tab === t.id ? "bg-background text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5 md:h-4 md:w-4" /> <span className="md:hidden">{t.shortLabel}</span><span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <Card className="border-l-4 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Wallet className="h-5 w-5 md:h-6 md:w-6 text-primary" /></div>
                <div>
                  <p className="text-[10px] md:text-xs text-muted-foreground">Saldo Total</p>
                  <p className="text-lg md:text-2xl font-bold text-foreground">{fmt(totalBalance)}</p>
                  <p className="text-[10px] md:text-[11px] text-muted-foreground">{wallets.length} {wallets.length === 1 ? "conta" : "contas"}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-primary/[0.03]">
              <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-primary" /></div>
                <div><p className="text-[10px] md:text-xs text-muted-foreground">Receitas do Mês</p><p className="text-lg md:text-2xl font-bold text-primary">{fmt(monthIncome)}</p></div>
              </CardContent>
            </Card>
            <Card className="bg-primary/[0.03]">
              <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
                <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-primary" /></div>
                <div><p className="text-[10px] md:text-xs text-muted-foreground">Despesas do Mês</p><p className="text-lg md:text-2xl font-bold text-primary">{fmt(monthExpense)}</p></div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground text-sm md:text-base">Minhas Contas</h3>
                </div>
              </div>
              <div className="mt-3 md:mt-4 flex flex-wrap gap-2.5 md:gap-4">
                {wallets.map((w) => <WalletCard key={w.id} w={w} />)}
                <AddWalletDialog />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 md:p-5">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground text-sm md:text-base">Últimas Transações</h3>
                </div>
                <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Receitas</span>
                  <span className="flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-destructive" /> Despesas</span>
                </div>
              </div>
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center text-center pb-4">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-muted flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-xs md:text-sm font-medium text-muted-foreground">Nenhuma transação encontrada</p>
                </div>
              ) : (
                <div className="space-y-0.5 md:space-y-1">
                  {transactions.slice(0, 8).map((t) => (
                    <div key={t.id} className={`flex items-center gap-2.5 md:gap-3 py-2 border-b border-border last:border-0 cursor-pointer rounded-lg px-2 -mx-2 transition-colors group ${t.type === "income" ? "hover:bg-emerald-500/5" : "hover:bg-destructive/5"}`} onClick={() => setEditTx(t)}>
                      <div className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center shrink-0 ${t.type === "income" ? "bg-emerald-500/15" : "bg-destructive/10"}`}>
                        {t.type === "income" ? <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-destructive" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs md:text-sm font-medium truncate ${t.type === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>{t.description}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")} · <span className={t.type === "income" ? "text-emerald-500 font-medium" : "text-destructive font-medium"}>{t.type === "income" ? "Receita" : "Despesa"}</span></p>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                        <p className={`text-xs md:text-sm font-bold ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>{t.type === "income" ? "+" : "-"}{fmt(Number(t.amount))}</p>
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "transactions" && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 md:gap-3">
            <p className="text-xs md:text-sm text-muted-foreground">Todas as transações</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs h-8"><Download className="h-3 w-3" /> Exportar</Button>
              <AddTransactionDialog trigger={<Button size="sm" className="rounded-full gap-1.5 text-xs h-8"><Plus className="h-3 w-3" /> Nova</Button>} />
            </div>
          </div>
          <Card>
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10 h-8 w-8" onClick={handlePrevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="text-center">
                  <p className="font-semibold text-foreground text-sm md:text-base">{monthCapitalized}</p>
                  <div className="flex items-center gap-1.5 mt-1.5 justify-center">
                    {(["today", "week", "month"] as Period[]).map((p) => (
                      <button key={p} onClick={() => setPeriod(p)} className={`px-2.5 py-1 rounded-full text-[10px] md:text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>{periodLabels[p]}</button>
                    ))}
                  </div>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-1">{dateRange}</p>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full text-primary hover:bg-primary/10 h-8 w-8" onClick={handleNextMonth}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-l-4 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-3 md:p-4 flex items-center gap-2.5 md:gap-4">
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-primary" /></div>
                <div><p className="text-[10px] md:text-xs text-muted-foreground">Receitas</p><p className="text-sm md:text-xl font-bold text-primary">{fmt(monthIncome)}</p></div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-3 md:p-4 flex items-center gap-2.5 md:gap-4">
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-primary" /></div>
                <div><p className="text-[10px] md:text-xs text-muted-foreground">Despesas</p><p className="text-sm md:text-xl font-bold text-primary">{fmt(monthExpense)}</p></div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-3 md:p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                <Input placeholder="Buscar transações..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 md:pl-9 h-8 md:h-10 text-xs md:text-sm" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-5">
              {transactions.length === 0 ? (
                <div className="py-8 md:py-10 flex flex-col items-center text-center">
                  <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-muted flex items-center justify-center"><CalendarDays className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground/50" /></div>
                  <p className="mt-3 text-xs md:text-sm font-medium text-muted-foreground">Nenhuma transação encontrada</p>
                </div>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  {transactions.filter(t => !search || t.description.toLowerCase().includes(search.toLowerCase())).map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 rounded-lg px-2 -mx-2 transition-colors group" onClick={() => setEditTx(t)}>
                      <div className="min-w-0">
                        <p className="text-xs md:text-sm font-medium text-foreground truncate">{t.description}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                        <p className={`text-xs md:text-sm font-semibold ${t.type === "income" ? "text-emerald-500" : "text-destructive"}`}>{t.type === "income" ? "+" : "-"} {fmt(Number(t.amount))}</p>
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "accounts" && (
        <Card>
          <CardContent className="p-3 md:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <h3 className="font-semibold text-foreground text-sm md:text-base">Todas as Contas</h3>
              </div>
            </div>
            <div className="mt-3 md:mt-4 flex flex-wrap gap-2.5 md:gap-4">
              {wallets.map((w) => <WalletCard key={w.id} w={w} />)}
              <AddWalletDialog />
            </div>
          </CardContent>
        </Card>
      )}

      <EditWalletDialog wallet={editWallet} open={!!editWallet} onOpenChange={(o) => !o && setEditWallet(null)} />
      <EditTransactionDialog transaction={editTx} open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)} />
    </div>
  );
}