import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  income: number;
  expenses: { category: string; amount: number }[];
}

const RULE_CATEGORIES: Record<string, { label: string; pct: number; color: string; keywords: string[] }> = {
  needs: {
    label: "Necessidades",
    pct: 50,
    color: "bg-blue-500",
    keywords: ["alimentação", "moradia", "saúde", "transporte", "educação"],
  },
  wants: {
    label: "Desejos",
    pct: 30,
    color: "bg-violet-500",
    keywords: ["lazer", "vestuário", "outros"],
  },
  savings: {
    label: "Investimentos",
    pct: 20,
    color: "bg-emerald-500",
    keywords: [],
  },
};

export function BudgetRuleWidget({ income, expenses }: Props) {
  const distribution = useMemo(() => {
    let needsTotal = 0;
    let wantsTotal = 0;
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

    expenses.forEach(({ category, amount }) => {
      const catLower = category.toLowerCase();
      if (RULE_CATEGORIES.needs.keywords.some(k => catLower.includes(k))) {
        needsTotal += amount;
      } else {
        wantsTotal += amount;
      }
    });

    const savingsReal = Math.max(income - totalExpenses, 0);

    return [
      { ...RULE_CATEGORIES.needs, real: needsTotal, ideal: income * 0.5 },
      { ...RULE_CATEGORIES.wants, real: wantsTotal, ideal: income * 0.3 },
      { ...RULE_CATEGORIES.savings, real: savingsReal, ideal: income * 0.2 },
    ];
  }, [income, expenses]);

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (income <= 0) return null;

  return (
    <Card>
      <CardContent className="p-3 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">💰</span>
          <div>
            <h3 className="font-semibold text-foreground text-sm md:text-base">Regra 50/30/20</h3>
            <p className="text-[10px] md:text-xs text-muted-foreground">Distribuição ideal vs real</p>
          </div>
        </div>
        <div className="space-y-4">
          {distribution.map((item) => {
            const realPct = income > 0 ? (item.real / income) * 100 : 0;
            const isOver = item.real > item.ideal && item.label !== "Investimentos";
            const isGood = item.label === "Investimentos" ? item.real >= item.ideal : item.real <= item.ideal;

            return (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                    <span className="text-xs md:text-sm font-medium text-foreground">{item.label}</span>
                    <span className="text-[10px] md:text-xs text-muted-foreground">({item.pct}%)</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs md:text-sm font-bold ${isGood ? "text-emerald-500" : "text-destructive"}`}>
                      {fmt(item.real)}
                    </span>
                    <span className="text-[10px] md:text-xs text-muted-foreground ml-1">/ {fmt(item.ideal)}</span>
                  </div>
                </div>
                <div className="relative">
                  <Progress value={Math.min(realPct, 100)} className="h-2" />
                  {/* Ideal marker */}
                  <div
                    className="absolute top-0 h-2 w-0.5 bg-foreground/40 rounded"
                    style={{ left: `${item.pct}%` }}
                  />
                </div>
                <p className={`text-[10px] mt-0.5 ${isGood ? "text-emerald-500" : "text-destructive"}`}>
                  {realPct.toFixed(0)}% do total
                  {isOver && " — acima do ideal"}
                  {isGood && item.label !== "Investimentos" && " — dentro do ideal ✓"}
                  {isGood && item.label === "Investimentos" && " — meta atingida ✓"}
                  {!isGood && item.label === "Investimentos" && " — abaixo do ideal"}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
