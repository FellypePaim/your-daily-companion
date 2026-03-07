import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import {
  Calendar, FileText, BarChart3, TrendingUp, TrendingDown,
  PieChart, ArrowUpDown, Send, FileSpreadsheet, DollarSign, Tag,
} from "lucide-react";

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLORS = ["#e11d48", "#f97316", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#6b7280"];

export default function Reports() {
  const { user } = useAuth();
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [compareMonth, setCompareMonth] = useState(String(new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1));
  const [compareYear, setCompareYear] = useState(String(new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()));
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [activeView, setActiveView] = useState<"categoria" | "fluxo" | "comparativo">("categoria");

  const handleExportCSV = () => {
    if (transactions.length === 0) return;
    const header = ["Data", "Descrição", "Categoria", "Tipo", "Valor (R$)"];
    const rows = transactions.map((t: any) => [
      t.date,
      `"${t.description.replace(/"/g, '""')}"`,
      `"${(t.categories?.name || "Sem categoria").replace(/"/g, '""')}"`,
      t.type === "income" ? "Receita" : "Despesa",
      Number(t.amount).toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${months[Number(month)]}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startDate = `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;
  const endDate = new Date(Number(year), Number(month) + 1, 0).toISOString().slice(0, 10);

  const cmpStart = `${compareYear}-${String(Number(compareMonth) + 1).padStart(2, "0")}-01`;
  const cmpEnd = new Date(Number(compareYear), Number(compareMonth) + 1, 0).toISOString().slice(0, 10);

  const { data: transactions = [] } = useQuery({
    queryKey: ["reports-transactions", user?.id, startDate, endDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name, color)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: cmpTransactions = [] } = useQuery({
    queryKey: ["reports-cmp-transactions", user?.id, cmpStart, cmpEnd],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .gte("date", cmpStart)
        .lte("date", cmpEnd)
        .order("date", { ascending: true });
      return data || [];
    },
    enabled: !!user && activeView === "comparativo",
  });

  // --- Category breakdown ---
  const categoryData = useMemo(() => {
    const map: Record<string, { name: string; total: number; color: string }> = {};
    transactions.filter(t => t.type === "expense").forEach(t => {
      const name = (t as any).categories?.name || "Sem categoria";
      const color = (t as any).categories?.color || "#6b7280";
      if (!map[name]) map[name] = { name, total: 0, color };
      map[name].total += Number(t.amount);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [transactions]);

  const totalExpense = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);

  // --- Daily cash flow ---
  const dailyFlowData = useMemo(() => {
    const map: Record<string, { day: string; receitas: number; despesas: number }> = {};
    transactions.forEach(t => {
      const d = t.date;
      if (!map[d]) map[d] = { day: new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), receitas: 0, despesas: 0 };
      if (t.type === "income") map[d].receitas += Number(t.amount);
      else map[d].despesas += Number(t.amount);
    });
    return Object.values(map);
  }, [transactions]);

  // --- Comparative ---
  const comparativeData = useMemo(() => {
    const current = { receitas: 0, despesas: 0 };
    const prev = { receitas: 0, despesas: 0 };
    transactions.forEach(t => {
      if (t.type === "income") current.receitas += Number(t.amount);
      else current.despesas += Number(t.amount);
    });
    cmpTransactions.forEach(t => {
      if (t.type === "income") prev.receitas += Number(t.amount);
      else prev.despesas += Number(t.amount);
    });
    return [
      { periodo: months[Number(compareMonth)].substring(0, 3), receitas: prev.receitas, despesas: prev.despesas },
      { periodo: months[Number(month)].substring(0, 3), receitas: current.receitas, despesas: current.despesas },
    ];
  }, [transactions, cmpTransactions, month, compareMonth]);

  const views = [
    { id: "categoria" as const, label: "Por Categoria", icon: PieChart },
    { id: "fluxo" as const, label: "Fluxo de Caixa", icon: ArrowUpDown },
    { id: "comparativo" as const, label: "Comparativo", icon: TrendingUp },
  ];

  return (
    <div className="space-y-3 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Análises das suas finanças</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full gap-1 text-xs h-8 px-3" onClick={handleExportCSV}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
        </Button>
      </div>

      {/* Period Selection */}
      <Card className="p-3 md:p-5">
        <div className="flex flex-wrap gap-2.5 md:gap-4 items-end">
          <div className="flex-1 min-w-[110px] md:min-w-[140px]">
            <label className="text-[10px] md:text-xs font-medium text-muted-foreground mb-1 block">Mês</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="rounded-lg h-8 md:h-10 text-xs md:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[80px] md:min-w-[100px]">
            <label className="text-[10px] md:text-xs font-medium text-muted-foreground mb-1 block">Ano</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="rounded-lg h-8 md:h-10 text-xs md:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 border border-border rounded-lg px-2.5 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-muted-foreground">
            <Send className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span className="whitespace-nowrap hidden sm:inline">WhatsApp</span>
            <Switch checked={sendWhatsApp} onCheckedChange={setSendWhatsApp} />
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-4">
        <Card className="p-3 md:p-4 flex items-center gap-2.5 md:gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Receitas</p>
            <p className="font-bold text-xs md:text-base text-emerald-600">{fmt(totalIncome)}</p>
          </div>
        </Card>
        <Card className="p-3 md:p-4 flex items-center gap-2.5 md:gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Despesas</p>
            <p className="font-bold text-xs md:text-base text-destructive">{fmt(totalExpense)}</p>
          </div>
        </Card>
        <Card className="p-3 md:p-4 flex items-center gap-2.5 md:gap-3 col-span-2 sm:col-span-1">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Saldo</p>
            <p className={`font-bold text-xs md:text-base ${totalIncome - totalExpense >= 0 ? "text-emerald-600" : "text-destructive"}`}>
              {fmt(totalIncome - totalExpense)}
            </p>
          </div>
        </Card>
      </div>

      {/* View Selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              activeView === v.id
                ? "bg-primary text-primary-foreground shadow"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <v.icon className="h-4 w-4" />
            {v.label}
          </button>
        ))}
      </div>

      {/* === POR CATEGORIA === */}
      {activeView === "categoria" && (
        <div className="space-y-4">
          {categoryData.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma despesa registrada neste período</p>
            </Card>
          ) : (
            <>
              <Card className="p-5">
                <h2 className="font-bold text-foreground mb-4 text-sm">Gastos por Categoria</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={categoryData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number) => [fmt(v), "Total"]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                    />
                    <Bar dataKey="total" name="Gasto" radius={[4, 4, 0, 0]}>
                      {categoryData.map((entry, index) => (
                        <rect key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-5">
                <h2 className="font-bold text-foreground mb-4 text-sm">Detalhamento</h2>
                <div className="space-y-3">
                  {categoryData.map((cat, i) => {
                    const pct = totalExpense > 0 ? (cat.total / totalExpense) * 100 : 0;
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-sm text-foreground">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                            <span className="text-sm font-bold text-foreground">{fmt(cat.total)}</span>
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* === FLUXO DE CAIXA === */}
      {activeView === "fluxo" && (
        <Card className="p-5">
          <h2 className="font-bold text-foreground mb-4 text-sm">Fluxo de Caixa — {months[Number(month)]} {year}</h2>
          {dailyFlowData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma transação neste período</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={dailyFlowData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${v}`} />
                <Tooltip
                  formatter={(v: number) => [fmt(v)]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                />
                <Legend />
                <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#e11d48" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}

      {/* === COMPARATIVO === */}
      {activeView === "comparativo" && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap gap-4 items-end mb-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Comparar com</label>
                <div className="flex gap-2">
                  <Select value={compareMonth} onValueChange={setCompareMonth}>
                    <SelectTrigger className="rounded-lg w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={compareYear} onValueChange={setCompareYear}>
                    <SelectTrigger className="rounded-lg w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <h2 className="font-bold text-foreground mb-4 text-sm">Comparativo de Meses</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparativeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="periodo" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => [fmt(v)]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
                />
                <Legend />
                <Bar dataKey="receitas" name="Receitas" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#e11d48" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Delta Cards */}
          <div className="grid grid-cols-2 gap-4">
            {comparativeData.length === 2 && (() => {
              const [prev, curr] = comparativeData;
              const deltaExpense = curr.despesas - prev.despesas;
              const deltaIncome = curr.receitas - prev.receitas;
              return (
                <>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Variação Despesas</p>
                    <p className={`text-xl font-bold ${deltaExpense > 0 ? "text-destructive" : "text-emerald-600"}`}>
                      {deltaExpense > 0 ? "+" : ""}{fmt(deltaExpense)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {deltaExpense > 0 ? "↗ Gastou mais" : "↘ Gastou menos"} em {months[Number(month)]}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Variação Receitas</p>
                    <p className={`text-xl font-bold ${deltaIncome >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {deltaIncome > 0 ? "+" : ""}{fmt(deltaIncome)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {deltaIncome >= 0 ? "↗ Recebeu mais" : "↘ Recebeu menos"} em {months[Number(month)]}
                    </p>
                  </Card>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
