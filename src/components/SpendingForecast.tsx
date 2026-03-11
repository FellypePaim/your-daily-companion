import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, TrendingUp, TrendingDown } from "lucide-react";

export function SpendingForecast() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<{
    predicted_expense: number;
    predicted_income: number;
    top_categories: { name: string; predicted: number }[];
    tip: string;
  } | null>(null);

  // Get last 3 months of transactions for context
  const { data: recentTx = [] } = useQuery({
    queryKey: ["forecast-tx", user?.id],
    queryFn: async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const { data } = await supabase
        .from("transactions")
        .select("date, amount, type, categories(name)")
        .gte("date", threeMonthsAgo.toISOString().slice(0, 10))
        .order("date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const handleForecast = async () => {
    if (recentTx.length === 0) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("predict-spending", {
        body: { transactions: recentTx },
      });
      if (error) throw error;
      setForecast(data);
    } catch (err: any) {
      console.error("Forecast error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Card className="border-primary/20">
      <CardContent className="p-3 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Previsão com IA</h3>
              <p className="text-[10px] text-muted-foreground">Baseada nos últimos 3 meses</p>
            </div>
          </div>
          {!forecast && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full text-xs gap-1.5"
              onClick={handleForecast}
              disabled={loading || recentTx.length === 0}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Prever
            </Button>
          )}
        </div>

        {forecast ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-destructive/10">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-[10px] text-muted-foreground">Despesas previstas</span>
                </div>
                <p className="text-sm font-bold text-destructive">{fmt(forecast.predicted_expense)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-500/10">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] text-muted-foreground">Receitas previstas</span>
                </div>
                <p className="text-sm font-bold text-emerald-500">{fmt(forecast.predicted_income)}</p>
              </div>
            </div>

            {forecast.top_categories?.length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1.5">Top categorias previstas:</p>
                <div className="space-y-1">
                  {forecast.top_categories.slice(0, 3).map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{cat.name}</span>
                      <span className="font-medium text-destructive">{fmt(cat.predicted)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {forecast.tip && (
              <p className="text-xs text-primary bg-primary/5 rounded-lg p-2.5 leading-relaxed">
                💡 {forecast.tip}
              </p>
            )}

            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setForecast(null)}>
              Refazer previsão
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {recentTx.length === 0
              ? "Registre transações para usar a previsão com IA."
              : "Clique em \"Prever\" para ver a previsão do próximo mês."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
