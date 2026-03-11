import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, BarChart3, RefreshCw, Bitcoin, Landmark, BarChart2, Receipt, Trash2 } from "lucide-react";
import { AddInvestmentDialog } from "@/components/AddInvestmentDialog";
import { toast } from "sonner";

interface MarketItem {
  label: string;
  value: string;
  change: string | null;
  positive: boolean;
}

const iconMap: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  "DÓLAR": { icon: DollarSign, bg: "bg-emerald-100", color: "text-emerald-600" },
  "EURO": { icon: Landmark, bg: "bg-blue-100", color: "text-blue-600" },
  "LIBRA (GBP)": { icon: Landmark, bg: "bg-indigo-100", color: "text-indigo-600" },
  "EUR/USD": { icon: DollarSign, bg: "bg-violet-100", color: "text-violet-600" },
  "BITCOIN": { icon: Bitcoin, bg: "bg-amber-100", color: "text-amber-600" },
  "IBOVESPA": { icon: TrendingUp, bg: "bg-rose-100", color: "text-rose-600" },
  "IFIX": { icon: BarChart2, bg: "bg-violet-100", color: "text-violet-600" },
  "NASDAQ": { icon: BarChart3, bg: "bg-sky-100", color: "text-sky-600" },
  "DOW JONES": { icon: TrendingUp, bg: "bg-slate-100", color: "text-slate-600" },
  "CDI": { icon: Receipt, bg: "bg-cyan-100", color: "text-cyan-600" },
  "SELIC": { icon: Receipt, bg: "bg-teal-100", color: "text-teal-600" },
};

const typeLabels: Record<string, string> = {
  renda_fixa: "Renda Fixa",
  acoes: "Ações",
  fiis: "FIIs",
  cripto: "Criptomoedas",
  tesouro: "Tesouro Direto",
  poupanca: "Poupança",
  outro: "Outro",
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Investments() {
  const { user } = useAuth();
  const [secondsAgo, setSecondsAgo] = useState(0);

  const { data: marketResult, refetch, isFetching: isFetchingMarket } = useQuery({
    queryKey: ["market-data"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("market-data");
      if (error) throw error;
      return data as { market: MarketItem[]; updatedAt: string };
    },
    refetchInterval: 30000,
    staleTime: 25000,
  });

  const { data: investments = [], refetch: refetchInvestments } = useQuery({
    queryKey: ["investments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("investments" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    setSecondsAgo(0);
    const interval = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [marketResult?.updatedAt]);

  const marketData = marketResult?.market ?? [];

  const timeLabel = secondsAgo < 5
    ? "agora mesmo"
    : secondsAgo < 60
      ? `há ${secondsAgo}s`
      : `há ${Math.floor(secondsAgo / 60)}min`;

  const totalInvested = investments.reduce((s: number, i: any) => s + Number(i.invested_amount), 0);
  const totalCurrent = investments.reduce((s: number, i: any) => s + Number(i.current_amount), 0);
  const totalReturn = totalCurrent - totalInvested;
  const returnPct = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("investments" as any).delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir", { description: error.message });
    } else {
      toast.success("Investimento removido");
      refetchInvestments();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Investimentos</h1>
          </div>
          <p className="text-muted-foreground text-sm">Acompanhe seu patrimônio e o mercado em tempo real</p>
        </div>
        <AddInvestmentDialog />
      </div>

      {/* Market Ticker */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">Mercado Hoje</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{timeLabel}</span>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetchingMarket ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {marketData.map((item) => {
            const style = iconMap[item.label] || { icon: DollarSign, bg: "bg-muted", color: "text-muted-foreground" };
            const IconComp = style.icon;
            return (
              <div key={item.label} className="flex-shrink-0 bg-card border border-border rounded-xl px-4 py-3 min-w-[140px]">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`h-5 w-5 rounded ${style.bg} flex items-center justify-center`}>
                    <IconComp className={`h-3 w-3 ${style.color}`} />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
                </div>
                <p className="font-bold text-foreground text-sm">{item.value}</p>
                {item.change && (
                  <p className={`text-xs mt-0.5 ${item.positive ? "text-emerald-500" : "text-rose-500"}`}>
                    {item.positive ? "↗" : "↘"} {item.change}
                  </p>
                )}
              </div>
            );
          })}
          {marketData.length === 0 && !isFetchingMarket && (
            <p className="text-sm text-muted-foreground py-4">Dados indisponíveis no momento</p>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Patrimônio Total</p>
            <p className="font-bold text-foreground text-lg">{fmt(totalCurrent)}</p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-100 to-green-200 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rendimento Total</p>
            <p className={`font-bold text-lg ${totalReturn >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {totalReturn >= 0 ? "+" : ""}{fmt(totalReturn)}
            </p>
          </div>
        </Card>
        <Card className="p-5 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-100 to-green-200 flex items-center justify-center shrink-0">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rentabilidade</p>
            <p className={`font-bold text-lg ${returnPct >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
            </p>
          </div>
        </Card>
      </div>

      {/* Investments List */}
      <Card className="p-6">
        <h2 className="font-bold text-foreground mb-6">Seus Investimentos</h2>
        {investments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="font-medium">Nenhum investimento cadastrado</p>
            <AddInvestmentDialog trigger={
              <Button className="rounded-full bg-emerald-500 hover:bg-emerald-600 text-white gap-1.5 mt-4">
                Adicionar primeiro investimento
              </Button>
            } />
          </div>
        ) : (
          <div className="space-y-3">
            {investments.map((inv: any) => {
              const ret = Number(inv.current_amount) - Number(inv.invested_amount);
              const retPct = Number(inv.invested_amount) > 0 ? (ret / Number(inv.invested_amount)) * 100 : 0;
              return (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors group">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{inv.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabels[inv.type] || inv.type} · {new Date(inv.purchase_date).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{fmt(Number(inv.current_amount))}</p>
                      <p className={`text-xs ${ret >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                        {ret >= 0 ? "+" : ""}{fmt(ret)} ({retPct >= 0 ? "+" : ""}{retPct.toFixed(1)}%)
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(inv.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
