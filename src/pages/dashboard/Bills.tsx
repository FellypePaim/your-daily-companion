import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, ChevronLeft, ChevronRight, FileText, CheckCircle2,
  AlertTriangle, CalendarClock, DollarSign, Clock,
  Repeat, Check, RefreshCw,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek, isBefore, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { useToast } from "@/hooks/use-toast";

type Period = "today" | "week" | "month" | "next7" | "nextMonth";

export default function Bills() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [period, setPeriod] = useState<Period>("month");
  const [editTx, setEditTx] = useState<any>(null);

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const getRange = () => {
    const now = new Date();
    if (period === "today") { const d = format(currentDate, "yyyy-MM-dd"); return { start: d, end: d }; }
    if (period === "week") return { start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    if (period === "next7") return { start: format(now, "yyyy-MM-dd"), end: format(addDays(now, 7), "yyyy-MM-dd") };
    if (period === "nextMonth") return { start: format(now, "yyyy-MM-dd"), end: format(addMonths(now, 1), "yyyy-MM-dd") };
    return { start: format(startOfMonth(currentDate), "yyyy-MM-dd"), end: format(endOfMonth(currentDate), "yyyy-MM-dd") };
  };
  const range = getRange();

  const getDateRangeLabel = () => {
    const now = new Date();
    if (period === "today") return format(currentDate, "dd/MM/yyyy");
    if (period === "week") return `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy")} até ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy")}`;
    if (period === "next7") return `${format(now, "dd/MM/yyyy")} até ${format(addDays(now, 7), "dd/MM/yyyy")}`;
    if (period === "nextMonth") return `${format(now, "dd/MM/yyyy")} até ${format(addMonths(now, 1), "dd/MM/yyyy")}`;
    return `${format(startOfMonth(currentDate), "dd/MM/yyyy")} até ${format(endOfMonth(currentDate), "dd/MM/yyyy")}`;
  };

  const { data: transactions = [] } = useQuery({
    queryKey: ["bills-recurring-tx", user?.id, range.start, range.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .not("recurring_id", "is", null)
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: recurringTransactions = [] } = useQuery({
    queryKey: ["recurring-transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("recurring_transactions")
        .select("*, categories(name)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const today = format(new Date(), "yyyy-MM-dd");
  const next7 = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const computed = useMemo(() => {
    const unpaidExpenses = transactions.filter(t => t.type === "expense" && !t.is_paid);
    const unpaidIncome = transactions.filter(t => t.type === "income" && !t.is_paid);
    const overdue = transactions.filter(t => !t.is_paid && t.due_date && isBefore(parseISO(t.due_date), parseISO(today)));
    const paid = transactions.filter(t => t.is_paid);
    const upcoming = transactions.filter(t => !t.is_paid && t.due_date && t.due_date >= today && t.due_date <= next7);
    const pending = transactions.filter(t => !t.is_paid && (!t.due_date || !isBefore(parseISO(t.due_date), parseISO(today))));

    return {
      toPay: unpaidExpenses.reduce((s, t) => s + Number(t.amount), 0),
      toReceive: unpaidIncome.reduce((s, t) => s + Number(t.amount), 0),
      overdueTotal: overdue.reduce((s, t) => s + Number(t.amount), 0),
      paidTotal: paid.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0),
      upcomingCount: upcoming.length,
      overdue,
      pending,
      paid,
    };
  }, [transactions, today, next7]);

  const summaryCards = [
    { label: "A Pagar", value: fmt(computed.toPay), icon: FileText, bg: "bg-gradient-to-br from-rose-100 to-red-200 dark:from-rose-950/40 dark:to-red-950/30", text: "text-rose-600 dark:text-rose-400", valueColor: "text-rose-500" },
    { label: "A Receber", value: fmt(computed.toReceive), icon: CheckCircle2, bg: "bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-950/40 dark:to-green-950/30", text: "text-emerald-600 dark:text-emerald-400", valueColor: "text-emerald-500" },
    { label: "Vencidas", value: fmt(computed.overdueTotal), icon: AlertTriangle, bg: "bg-gradient-to-br from-amber-100 to-yellow-200 dark:from-amber-950/40 dark:to-yellow-950/30", text: "text-amber-600 dark:text-amber-400", valueColor: "text-amber-500" },
    { label: "Pagas", value: fmt(computed.paidTotal), icon: CheckCircle2, bg: "bg-gradient-to-br from-cyan-100 to-sky-200 dark:from-cyan-950/40 dark:to-sky-950/30", text: "text-cyan-600 dark:text-cyan-400", valueColor: "text-cyan-500" },
  ];

  const handleMarkPaid = async (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    await supabase.from("transactions").update({ is_paid: true }).eq("id", txId);
    if (tx.wallet_id) {
      const { data: wallet } = await supabase.from("wallets").select("balance").eq("id", tx.wallet_id).single();
      if (wallet) {
        const delta = tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
        await supabase.from("wallets").update({ balance: Number(wallet.balance) + delta }).eq("id", tx.wallet_id);
      }
    }
    toast({ title: "Conta marcada como paga!" });
    queryClient.invalidateQueries({ queryKey: ["bills-recurring-tx"] });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
  };

  const handleDeleteRecurring = async (recId: string) => {
    await supabase.from("recurring_transactions").update({ is_active: false }).eq("id", recId);
    toast({ title: "Automação desativada" });
    queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
  };

  const handleGenerateNow = async () => {
    try {
      const { error } = await supabase.functions.invoke("generate-recurring-bills");
      if (error) throw error;
      toast({ title: "Contas geradas com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["bills-recurring-tx"] });
    } catch {
      toast({ title: "Erro ao gerar contas", variant: "destructive" });
    }
  };

  const renderTransactionItem = (t: any, showPayButton = false) => (
    <div key={t.id} className="flex items-center justify-between py-2.5 md:py-3 border-b border-border last:border-0 group">
      <div className="flex items-center gap-2.5 md:gap-3 cursor-pointer min-w-0 flex-1" onClick={() => setEditTx(t)}>
        <div className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center shrink-0 ${
          t.is_paid
            ? "bg-emerald-100 dark:bg-emerald-900/30"
            : t.due_date && isBefore(parseISO(t.due_date), parseISO(today))
              ? "bg-destructive/10"
              : "bg-muted"
        }`}>
          {t.is_paid ? (
            <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-500" />
          ) : t.due_date && isBefore(parseISO(t.due_date), parseISO(today)) ? (
            <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4 text-destructive" />
          ) : (
            <Clock className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-medium text-foreground flex items-center gap-1 truncate">
            {t.description}
            <Repeat className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground shrink-0" />
          </p>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {t.due_date ? format(parseISO(t.due_date), "dd MMM", { locale: ptBR }) : format(parseISO(t.date), "dd MMM", { locale: ptBR })}
            {(t as any).categories?.name ? ` • ${(t as any).categories.name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <span className={`text-xs md:text-sm font-bold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>
          R$ {Number(t.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        {showPayButton && !t.is_paid && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 md:h-8 md:w-8 rounded-full text-emerald-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
            onClick={(e) => { e.stopPropagation(); handleMarkPaid(t.id); }}
            title="Marcar como paga"
          >
            <Check className="h-3.5 w-3.5 md:h-4 md:w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-primary">Contas a Pagar</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Contas recorrentes e automações</p>
        </div>
        <AddTransactionDialog
          trigger={
            <Button size="sm" className="rounded-full gap-1.5 bg-primary hover:bg-primary/90 text-xs h-8 px-3">
              <Plus className="h-3.5 w-3.5" /> Nova
            </Button>
          }
        />
      </div>

      {/* Period selector */}
      <Card className="p-3 md:p-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-8 w-8 md:h-9 md:w-9" onClick={() => setCurrentDate((d) => subMonths(d, 1))}>
            <ChevronLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <div className="text-center">
            <p className="font-bold text-foreground text-sm md:text-lg">{monthCapitalized}</p>
            <div className="flex items-center gap-1 md:gap-2 mt-1.5 md:mt-2 justify-center flex-wrap">
              {(["today", "week", "month", "next7", "nextMonth"] as Period[]).map((p) => (
                <Button key={p} variant={period === p ? "default" : "outline"} size="sm" className={`rounded-full text-[9px] md:text-xs px-2 md:px-4 h-6 md:h-7 ${period === p ? "" : "border-border text-muted-foreground hover:text-foreground"}`} onClick={() => setPeriod(p)}>
                  {p === "today" ? "Hoje" : p === "week" ? "Semana" : p === "month" ? "Mês" : p === "next7" ? "7 dias" : "Próx. mês"}
                </Button>
              ))}
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground mt-1 md:mt-2">{getDateRangeLabel()}</p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-8 w-8 md:h-9 md:w-9" onClick={() => setCurrentDate((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {summaryCards.map((item) => (
          <Card key={item.label} className="p-2.5 md:p-4 flex items-center gap-2.5 md:gap-3">
            <div className={`h-8 w-8 md:h-11 md:w-11 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
              <item.icon className={`h-4 w-4 md:h-5 md:w-5 ${item.text}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs text-muted-foreground">{item.label}</p>
              <p className={`font-bold text-xs md:text-sm ${item.valueColor} truncate`}>{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Recurring bills */}
      <Card className="p-3 md:p-6">
        <div className="mb-3 md:mb-4">
          <h2 className="font-bold text-foreground text-sm md:text-base">Contas Recorrentes do Período</h2>
          <p className="text-[10px] md:text-sm text-muted-foreground">{transactions.length} conta(s) recorrente(s)</p>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <div className="h-12 w-12 md:h-16 md:w-16 rounded-2xl bg-gradient-to-br from-rose-100 to-pink-200 dark:from-rose-950/40 dark:to-pink-950/30 flex items-center justify-center mx-auto mb-3 md:mb-4">
              <Repeat className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm">Nenhuma conta recorrente</p>
            <p className="text-xs mt-1">Ative automações abaixo.</p>
          </div>
        ) : (
          <div>
            {computed.overdue.length > 0 && (
              <div className="mb-3 md:mb-4">
                <p className="text-xs font-semibold text-destructive mb-1.5 md:mb-2">Vencidas ({computed.overdue.length})</p>
                {computed.overdue.map(t => renderTransactionItem(t, true))}
              </div>
            )}
            {computed.pending.length > 0 && (
              <div className="mb-3 md:mb-4">
                <p className="text-xs font-semibold text-primary mb-1.5 md:mb-2">Pendentes ({computed.pending.length})</p>
                {computed.pending.map(t => renderTransactionItem(t, true))}
              </div>
            )}
            {computed.paid.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-emerald-500 mb-1.5 md:mb-2">Pagas ({computed.paid.length})</p>
                {computed.paid.map(t => renderTransactionItem(t, false))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Automations */}
      <Card className="p-3 md:p-5">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Repeat className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          <div>
            <h3 className="font-bold text-foreground text-sm md:text-base">Automações ({recurringTransactions.length})</h3>
            <p className="text-[10px] md:text-xs text-muted-foreground">Contas geradas automaticamente</p>
          </div>
        </div>
        <div className="space-y-2 md:space-y-3">
          {recurringTransactions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma automação ativa.</p>
          ) : (
            <>
              {recurringTransactions.map((rec: any) => (
                <div key={rec.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                    <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Repeat className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs md:text-sm font-medium text-foreground truncate">{rec.description}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground">
                        Dia {rec.day_of_month} • {rec.categories?.name || "Sem categoria"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                    <span className="text-xs md:text-sm font-bold text-foreground">
                      R$ {Number(rec.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 md:h-7 md:w-7 rounded-full text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteRecurring(rec.id)}
                      title="Desativar"
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full mt-2 rounded-full text-xs h-8" onClick={handleGenerateNow}>
                <RefreshCw className="h-3 w-3 mr-1.5" /> Gerar contas agora
              </Button>
            </>
          )}
        </div>
      </Card>

      <EditTransactionDialog transaction={editTx} open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)} />
    </div>
  );
}