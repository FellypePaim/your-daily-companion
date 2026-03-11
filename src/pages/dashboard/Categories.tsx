import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCategories } from "@/hooks/useSharedQueries";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Plus, Target, Pencil, UtensilsCrossed, ShoppingCart, GraduationCap, Gamepad2, Home, Package, DollarSign, Heart, Car, BookOpen, Shirt, MoreHorizontal, AlertTriangle, CheckCircle2 } from "lucide-react";
import { EditCategoryDialog } from "@/components/EditCategoryDialog";
import { CategorySkeleton } from "@/components/ui/skeletons";

const iconMap: Record<string, React.ElementType> = {
  utensils: UtensilsCrossed, shopping: ShoppingCart, education: GraduationCap, gamepad: Gamepad2,
  home: Home, package: Package, dollar: DollarSign, heart: Heart, car: Car, book: BookOpen,
  shirt: Shirt, "more-horizontal": MoreHorizontal,
};

const styleMap: Record<string, { dot: string; bg: string; text: string; bar: string }> = {
  "#ef4444": { dot: "bg-rose-500", bg: "bg-gradient-to-br from-rose-100 to-red-200", text: "text-rose-600", bar: "bg-rose-500" },
  "#f97316": { dot: "bg-orange-500", bg: "bg-gradient-to-br from-orange-100 to-amber-200", text: "text-orange-600", bar: "bg-orange-500" },
  "#ec4899": { dot: "bg-pink-500", bg: "bg-gradient-to-br from-pink-100 to-fuchsia-200", text: "text-pink-600", bar: "bg-pink-500" },
  "#10b981": { dot: "bg-emerald-500", bg: "bg-gradient-to-br from-emerald-100 to-green-200", text: "text-emerald-600", bar: "bg-emerald-500" },
  "#3b82f6": { dot: "bg-blue-500", bg: "bg-gradient-to-br from-blue-100 to-sky-200", text: "text-blue-600", bar: "bg-blue-500" },
  "#06b6d4": { dot: "bg-cyan-500", bg: "bg-gradient-to-br from-cyan-100 to-teal-200", text: "text-cyan-600", bar: "bg-cyan-500" },
  "#6b7280": { dot: "bg-slate-500", bg: "bg-gradient-to-br from-slate-100 to-gray-200", text: "text-slate-600", bar: "bg-slate-500" },
  "#f59e0b": { dot: "bg-amber-500", bg: "bg-gradient-to-br from-amber-100 to-yellow-200", text: "text-amber-600", bar: "bg-amber-500" },
  "#8b5cf6": { dot: "bg-violet-500", bg: "bg-gradient-to-br from-violet-100 to-purple-200", text: "text-violet-600", bar: "bg-violet-500" },
};

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Categories() {
  const { user } = useAuth();
  const [editCategory, setEditCategory] = useState<any>(null);
  const [showNew, setShowNew] = useState(false);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: categories = [], isLoading: loadingCats } = useCategories();

  const { data: monthTransactions = [] } = useQuery({
    queryKey: ["categories-month-tx", user?.id, monthStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount, category_id, type")
        .eq("type", "expense")
        .gte("date", monthStart)
        .lte("date", monthEnd);
      return data || [];
    },
    enabled: !!user,
  });

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions.forEach(t => {
      if (t.category_id) {
        map[t.category_id] = (map[t.category_id] || 0) + Number(t.amount);
      }
    });
    return map;
  }, [monthTransactions]);

  const totalWithBudget = categories.filter(c => c.budget_limit).length;
  const exceeded = categories.filter(c => c.budget_limit && (spentByCategory[c.id] || 0) >= Number(c.budget_limit)).length;

  return (
    <div className="space-y-3 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-foreground">Categorias</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Orçamentos e gastos do mês</p>
        </div>
        <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1 text-xs h-8 px-3" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova
        </Button>
      </div>

      {/* Summary */}
      {totalWithBudget > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
          <Card className="p-3 md:p-4 flex items-center gap-2.5 md:gap-3">
            <div className="h-8 w-8 md:h-9 md:w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Com orçamento</p>
              <p className="font-bold text-foreground text-xs md:text-sm">{totalWithBudget} cat.</p>
            </div>
          </Card>
          <Card className={`p-3 md:p-4 flex items-center gap-2.5 md:gap-3 ${exceeded > 0 ? "border-destructive/30" : ""}`}>
            <div className={`h-8 w-8 md:h-9 md:w-9 rounded-xl flex items-center justify-center shrink-0 ${exceeded > 0 ? "bg-destructive/10" : "bg-emerald-500/10"}`}>
              {exceeded > 0
                ? <AlertTriangle className="h-3.5 w-3.5 md:h-4 md:w-4 text-destructive" />
                : <CheckCircle2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-600" />
              }
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Estouradas</p>
              <p className={`font-bold text-xs md:text-sm ${exceeded > 0 ? "text-destructive" : "text-emerald-600"}`}>{exceeded}</p>
            </div>
          </Card>
          <Card className="p-3 md:p-4 flex items-center gap-2.5 md:gap-3 col-span-2 sm:col-span-1">
            <div className="h-8 w-8 md:h-9 md:w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Total gasto</p>
              <p className="font-bold text-foreground text-xs md:text-sm">{fmt(Object.values(spentByCategory).reduce((s, v) => s + v, 0))}</p>
            </div>
          </Card>
        </div>
      )}

      {loadingCats ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <CategorySkeleton key={i} />)}
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {categories.map((cat, i) => {
          const IconComp = iconMap[cat.icon || ""] || Package;
          const style = styleMap[cat.color || ""] || styleMap["#6b7280"];
          const spent = spentByCategory[cat.id] || 0;
          const limit = cat.budget_limit ? Number(cat.budget_limit) : null;
          const pct = limit ? Math.min(100, (spent / limit) * 100) : null;
          const isOver = limit !== null && spent > limit;
          const isClose = limit !== null && !isOver && pct !== null && pct >= 80;

          return (
            <Card
              key={cat.id}
              className={`p-3.5 md:p-5 relative hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer group animate-fade-in ${isOver ? "border-destructive/40 ring-1 ring-destructive/20" : ""}`}
              style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
              onClick={() => setEditCategory(cat)}
            >
              <button className="absolute top-2.5 right-7 md:top-3 md:right-8 opacity-60 md:opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-muted z-10">
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </button>

              <div className="flex items-start gap-2.5 md:gap-3 mb-2.5 md:mb-3">
                <div className={`h-10 w-10 md:h-12 md:w-12 rounded-2xl ${style.bg} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300`}>
                  <IconComp className={`h-5 w-5 md:h-6 md:w-6 ${style.text} drop-shadow-sm`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground text-xs md:text-sm">{cat.name}</p>
                  {limit ? (
                    <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">
                      {fmt(spent)} <span className="text-muted-foreground/60">de</span> {fmt(limit)}
                    </p>
                  ) : (
                    <button
                      className="mt-1 flex items-center gap-1 text-[10px] md:text-[11px] font-medium text-primary/80 hover:text-primary border border-dashed border-primary/30 hover:border-primary/60 rounded-lg px-1.5 md:px-2 py-0.5 transition-all hover:bg-primary/5"
                      onClick={(e) => { e.stopPropagation(); setEditCategory(cat); }}
                    >
                      <Target className="h-2.5 w-2.5 md:h-3 md:w-3" />
                      Definir orçamento
                    </button>
                  )}
                </div>
                <div className={`absolute top-3.5 right-3.5 md:top-4 md:right-4 h-3 w-3 md:h-3.5 md:w-3.5 rounded-full ${isOver ? "bg-destructive" : style.dot} shadow-md group-hover:scale-125 transition-transform duration-300`} />
              </div>

              {limit !== null && pct !== null && (
                <div className="space-y-1">
                  <div className="h-1.5 md:h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${isOver ? "bg-destructive" : isClose ? "bg-amber-500" : style.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] md:text-[10px] font-medium ${isOver ? "text-destructive" : isClose ? "text-amber-600" : "text-muted-foreground"}`}>
                      {isOver ? `⚠ +${fmt(spent - limit)}` : `${pct.toFixed(0)}%`}
                    </span>
                    <span className="text-[9px] md:text-[10px] text-muted-foreground">{fmt(Math.max(0, limit - spent))} restam</span>
                  </div>
                </div>
              )}

              {!limit && spent > 0 && (
                <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
                  Gasto: <span className="font-semibold text-foreground">{fmt(spent)}</span>
                </p>
              )}
            </Card>
          );
        })}

        {categories.length === 0 && (
          <div className="col-span-full text-center py-8 md:py-12 text-muted-foreground">
            <Package className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-sm">Nenhuma categoria ainda</p>
            <p className="text-xs mt-1">Crie sua primeira categoria</p>
          </div>
        )}
      </div>
      )}

      <EditCategoryDialog category={editCategory} open={!!editCategory || showNew} onOpenChange={(o) => { if (!o) { setEditCategory(null); setShowNew(false); } }} />
    </div>
  );
}