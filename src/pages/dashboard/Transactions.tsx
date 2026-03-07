import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, ChevronLeft, ChevronRight, DollarSign, Pencil, Clock,
  CheckCircle2, AlertTriangle, Check, ArrowUpCircle, ArrowDownCircle, Filter,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, startOfWeek, endOfWeek, isBefore, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AddTransactionDialog } from "@/components/AddTransactionDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { useToast } from "@/hooks/use-toast";

type Period = "today" | "week" | "month";

export default function Transactions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [period, setPeriod] = useState<Period>("month");
  const [editTx, setEditTx] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const monthLabel = format(currentDate, "MMMM yyyy", { locale: ptBR });
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const getRange = () => {
    if (period === "today") { const d = format(currentDate, "yyyy-MM-dd"); return { start: d, end: d }; }
    if (period === "week") return { start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    return { start: format(startOfMonth(currentDate), "yyyy-MM-dd"), end: format(endOfMonth(currentDate), "yyyy-MM-dd") };
  };
  const range = getRange();

  const getDateRangeLabel = () => {
    if (period === "today") return format(currentDate, "dd/MM/yyyy");
    if (period === "week") return `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy")} até ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), "dd/MM/yyyy")}`;
    return `${format(startOfMonth(currentDate), "dd/MM/yyyy")} até ${format(endOfMonth(currentDate), "dd/MM/yyyy")}`;
  };

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data || [];
    },
    enabled: !!user,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["day-transactions", user?.id, range.start, range.end],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .is("recurring_id", null)
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const filteredTransactions = useMemo(() => {
    if (selectedCategory === "all") return transactions;
    if (selectedCategory === "none") return transactions.filter(t => !t.category_id);
    return transactions.filter(t => t.category_id === selectedCategory);
  }, [transactions, selectedCategory]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const today = format(new Date(), "yyyy-MM-dd");

  const computed = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === "income");
    const expenses = filteredTransactions.filter(t => t.type === "expense");
    const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0);
    const totalExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0);
    const balance = totalIncome - totalExpenses;
    return { income, expenses, totalIncome, totalExpenses, balance };
  }, [filteredTransactions]);

  const summaryCards = [
    { label: "Receitas", value: fmt(computed.totalIncome), icon: ArrowUpCircle, bg: "bg-gradient-to-br from-emerald-100 to-green-200 dark:from-emerald-950/40 dark:to-green-950/30", text: "text-emerald-600 dark:text-emerald-400", valueColor: "text-emerald-500" },
    { label: "Despesas", value: fmt(computed.totalExpenses), icon: ArrowDownCircle, bg: "bg-gradient-to-br from-rose-100 to-red-200 dark:from-rose-950/40 dark:to-red-950/30", text: "text-rose-600 dark:text-rose-400", valueColor: "text-rose-500" },
    { label: "Saldo", value: fmt(computed.balance), icon: DollarSign, bg: "bg-gradient-to-br from-blue-100 to-sky-200 dark:from-blue-950/40 dark:to-sky-950/30", text: "text-blue-600 dark:text-blue-400", valueColor: computed.balance >= 0 ? "text-emerald-500" : "text-rose-500" },
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
    toast({ title: "Transação marcada como paga!" });
    queryClient.invalidateQueries({ queryKey: ["day-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["wallets"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
  };

  const renderTransactionItem = (t: any) => (
    <div key={t.id} className="flex items-center justify-between py-2.5 md:py-3 border-b border-border last:border-0 group">
      <div className="flex items-center gap-2.5 md:gap-3 cursor-pointer min-w-0 flex-1" onClick={() => setEditTx(t)}>
        <div className={`h-8 w-8 md:h-9 md:w-9 rounded-full flex items-center justify-center shrink-0 ${
          t.type === "income" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-rose-100 dark:bg-rose-900/30"
        }`}>
          {t.type === "income" ? (
            <ArrowUpCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-500" />
          ) : (
            <ArrowDownCircle className="h-3.5 w-3.5 md:h-4 md:w-4 text-rose-500" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-medium text-foreground truncate">{t.description}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {format(parseISO(t.date), "dd MMM", { locale: ptBR })}
            {(t as any).categories?.name ? ` • ${(t as any).categories.name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <span className={`text-xs md:text-sm font-bold ${t.type === "income" ? "text-emerald-500" : "text-foreground"}`}>
          {t.type === "expense" ? "- " : "+ "}R$ {Number(t.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
        </span>
        {!t.is_paid && (
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
          <h1 className="text-lg md:text-2xl font-bold text-primary">Transações</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Receitas e despesas do dia a dia</p>
        </div>
        <AddTransactionDialog
          trigger={
            <Button size="sm" className="rounded-full gap-1.5 bg-primary hover:bg-primary/90 text-xs md:text-sm h-8 md:h-9 px-3 md:px-4">
              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" /> <span className="hidden sm:inline">Nova</span> <span className="sm:hidden">+</span>
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
            <div className="flex items-center gap-1.5 md:gap-2 mt-1.5 md:mt-2 justify-center">
              {(["today", "week", "month"] as Period[]).map((p) => (
                <Button key={p} variant={period === p ? "default" : "outline"} size="sm" className={`rounded-full text-[10px] md:text-xs px-2.5 md:px-4 h-6 md:h-7 ${period === p ? "" : "border-border text-muted-foreground hover:text-foreground"}`} onClick={() => setPeriod(p)}>
                  {p === "today" ? "Hoje" : p === "week" ? "Semana" : "Mês"}
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
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {summaryCards.map((item) => (
          <Card key={item.label} className="p-2.5 md:p-4 flex flex-col items-center text-center gap-1.5 md:gap-2">
            <div className={`h-8 w-8 md:h-10 md:w-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
              <item.icon className={`h-4 w-4 md:h-5 md:w-5 ${item.text}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs text-muted-foreground">{item.label}</p>
              <p className={`font-bold text-[11px] md:text-sm ${item.valueColor} truncate`}>{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Transactions list */}
      <Card className="p-3 md:p-6">
        <div className="mb-3 md:mb-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-foreground text-sm md:text-base">Transações do Período</h2>
            <p className="text-[10px] md:text-sm text-muted-foreground">{filteredTransactions.length} transações</p>
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[140px] md:w-[180px] h-8 md:h-9 rounded-full text-[10px] md:text-xs">
              <Filter className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="none">Sem categoria</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <div className="h-12 w-12 md:h-16 md:w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-sky-200 dark:from-blue-950/40 dark:to-sky-950/30 flex items-center justify-center mx-auto mb-3 md:mb-4">
              <DollarSign className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <p className="font-semibold text-foreground text-sm">Nenhuma transação neste período</p>
            <p className="text-xs mt-1">Adicione suas receitas e despesas.</p>
          </div>
        ) : (
          <div>
            {filteredTransactions.map(t => renderTransactionItem(t))}
          </div>
        )}
      </Card>

      <EditTransactionDialog transaction={editTx} open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)} />
    </div>
  );
}