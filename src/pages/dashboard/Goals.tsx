import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Target, Calculator, AlertCircle, Pencil, PlusCircle, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addMonths, format } from "date-fns";
import { EditGoalDialog } from "@/components/EditGoalDialog";
import { GoalSkeleton } from "@/components/ui/skeletons";

export default function Goals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCalc, setShowCalc] = useState(false);
  const [amount, setAmount] = useState(0);
  const [months, setMonths] = useState(0);
  const [goalName, setGoalName] = useState("");
  const [editGoal, setEditGoal] = useState<any>(null);
  const [depositGoalId, setDepositGoalId] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");

  const { data: goals = [], isLoading: loadingGoals } = useQuery({
    queryKey: ["goals", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_goals")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const createGoal = useMutation({
    mutationFn: async () => {
      const deadline = format(addMonths(new Date(), months), "yyyy-MM-dd");
      const { error } = await supabase.from("financial_goals").insert({
        user_id: user!.id,
        name: goalName || `Meta de R$ ${amount.toLocaleString("pt-BR")}`,
        target_amount: amount,
        current_amount: 0,
        deadline,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast({ title: "Meta criada com sucesso!" });
      setGoalName("");
      setShowCalc(false);
    },
  });

  const addDeposit = useMutation({
    mutationFn: async ({ goalId, currentAmount, deposit }: { goalId: string; currentAmount: number; deposit: number }) => {
      const { error } = await supabase
        .from("financial_goals")
        .update({ current_amount: currentAmount + deposit })
        .eq("id", goalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals"] });
      toast({ title: "Aporte registrado! 🎯" });
      setDepositGoalId(null);
      setDepositAmount("");
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("monthly_income").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const perMonth = months > 0 ? amount / months : 0;
  const perWeek = months > 0 ? amount / (months * 4.33) : 0;
  const perDay = months > 0 ? amount / (months * 30) : 0;
  const incomeEstimate = Number(profile?.monthly_income) || 0;
  const pctIncome = incomeEstimate > 0 ? (perMonth / incomeEstimate) * 100 : 0;

  const getDifficultyLabel = () => {
    if (pctIncome > 50) return { text: "Muito difícil - considere aumentar o prazo", color: "text-rose-500" };
    if (pctIncome > 30) return { text: "Desafiador - mas possível com disciplina", color: "text-amber-500" };
    return { text: "Tranquilo - meta bem planejada!", color: "text-emerald-500" };
  };
  const difficulty = getDifficultyLabel();
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-3 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg md:text-2xl font-bold text-foreground">Metas Financeiras</h1>
          <p className="text-muted-foreground text-xs md:text-sm">Acompanhe seus objetivos</p>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <Button variant={showCalc ? "default" : "outline"} size="sm" className={`rounded-full gap-1 text-xs h-8 px-2.5 md:px-3 ${showCalc ? "bg-primary text-primary-foreground" : "border-border text-foreground"}`} onClick={() => setShowCalc(!showCalc)}>
            <Calculator className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Calculadora</span>
          </Button>
          <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1 text-xs h-8 px-2.5 md:px-3" onClick={() => setShowCalc(true)}>
            <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Nova Meta</span>
          </Button>
        </div>
      </div>

      {showCalc && (
        <Card className="p-4 md:p-6 space-y-4 md:space-y-5 animate-fade-in">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <h2 className="font-bold text-foreground text-sm md:text-base">Calculadora de Metas</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Quanto juntar? (R$)</label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="rounded-lg h-9" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Em quantos meses?</label>
              <Input type="number" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="rounded-lg h-9" min={1} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="rounded-xl bg-gradient-to-br from-pink-100 to-rose-200 dark:from-pink-950/30 dark:to-rose-950/20 p-3 text-center">
              <p className="text-[10px] md:text-xs text-muted-foreground">Por mês</p>
              <p className="font-bold text-primary text-sm md:text-lg">R$ {fmt(perMonth)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-[10px] md:text-xs text-muted-foreground">Por semana</p>
              <p className="font-bold text-foreground text-sm md:text-lg">R$ {fmt(perWeek)}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-[10px] md:text-xs text-muted-foreground">Por dia</p>
              <p className="font-bold text-foreground text-sm md:text-lg">R$ {fmt(perDay)}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Da sua renda mensal</span>
              <span className="text-xs font-bold text-foreground">{pctIncome.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-pink-400 transition-all duration-500" style={{ width: `${Math.min(pctIncome, 100)}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className={`h-3.5 w-3.5 ${difficulty.color}`} />
            <span className={`text-xs font-medium ${difficulty.color}`}>{difficulty.text}</span>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Nome da meta (opcional)</label>
            <Input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Ex: Reserva de emergência" className="rounded-lg h-9" />
          </div>
          <Button className="w-full rounded-xl bg-gradient-to-r from-primary to-pink-400 hover:brightness-110 text-primary-foreground gap-2 h-10 md:h-12 text-sm" onClick={() => createGoal.mutate()} disabled={createGoal.isPending || amount <= 0 || months <= 0}>
            <Target className="h-4 w-4" /> Criar esta Meta
          </Button>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="font-semibold text-foreground text-xs md:text-sm">Metas Ativas ({goals.length})</span>
      </div>

      <Card className="p-3 md:p-6">
        {loadingGoals ? (
          <div className="space-y-3 md:space-y-4">
            {[1, 2, 3].map(i => <GoalSkeleton key={i} />)}
          </div>
        ) : goals.length === 0 ? (
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <Target className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground text-sm">Nenhuma meta ativa</p>
            <p className="text-xs mt-1">Crie sua primeira meta para começar</p>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            {goals.map((goal) => {
              const pct = goal.target_amount > 0 ? Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100) : 0;
              const goalColor = (goal as any).color || undefined;
              const remaining = Number(goal.target_amount) - Number(goal.current_amount);
              const isDepositing = depositGoalId === goal.id;

              return (
                <Card key={goal.id} className="p-3.5 md:p-5 hover:shadow-md transition-shadow group relative">
                  <button
                    className="absolute top-2.5 right-2.5 md:top-3 md:right-3 opacity-60 md:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted"
                    onClick={() => setEditGoal(goal)}
                  >
                    <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5 text-muted-foreground" />
                  </button>

                  <div className="cursor-pointer" onClick={() => !isDepositing && setEditGoal(goal)}>
                    <div className="flex items-center justify-between mb-2.5 md:mb-3 pr-6">
                      <div className="flex items-center gap-2 min-w-0">
                        {goalColor && <div className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-full shrink-0" style={{ backgroundColor: goalColor }} />}
                        <p className="font-semibold text-foreground text-xs md:text-base truncate">{goal.name}</p>
                      </div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: goalColor ? `${goalColor}20` : 'hsl(var(--primary) / 0.12)',
                          color: goalColor || 'hsl(var(--primary))',
                        }}
                      >
                        {pct.toFixed(0)}%
                      </span>
                    </div>

                    <div className="w-full h-2.5 md:h-3 bg-muted rounded-full overflow-hidden mb-1.5 md:mb-2">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: goalColor || 'hsl(var(--primary))' }}
                      />
                    </div>

                    <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">
                          R$ {Number(goal.current_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        {" "}/ R$ {Number(goal.target_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                      {remaining > 0 && (
                        <span className="hidden sm:inline">Faltam R$ {remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      )}
                      {remaining <= 0 && (
                        <span className="text-emerald-600 font-semibold">✓ Meta atingida!</span>
                      )}
                    </div>

                    {goal.deadline && (
                      <p className="text-[10px] md:text-xs text-muted-foreground mt-1.5 md:mt-2">
                        Prazo: {new Date(goal.deadline).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>

                  {isDepositing ? (
                    <div className="mt-2.5 md:mt-3 pt-2.5 md:pt-3 border-t border-border flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">R$</span>
                        <Input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="0,00"
                          className="h-8 md:h-9 rounded-xl pl-9 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && parseFloat(depositAmount) > 0) {
                              addDeposit.mutate({ goalId: goal.id, currentAmount: Number(goal.current_amount), deposit: parseFloat(depositAmount) });
                            }
                            if (e.key === "Escape") {
                              setDepositGoalId(null);
                              setDepositAmount("");
                            }
                          }}
                        />
                      </div>
                      <Button
                        size="icon"
                        className="h-8 w-8 md:h-9 md:w-9 rounded-xl shrink-0"
                        style={{ backgroundColor: goalColor || undefined }}
                        disabled={!depositAmount || parseFloat(depositAmount) <= 0 || addDeposit.isPending}
                        onClick={() => addDeposit.mutate({ goalId: goal.id, currentAmount: Number(goal.current_amount), deposit: parseFloat(depositAmount) })}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 md:h-9 md:w-9 rounded-xl shrink-0"
                        onClick={() => { setDepositGoalId(null); setDepositAmount(""); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2.5 md:mt-3 pt-2.5 md:pt-3 border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full h-7 md:h-8 rounded-xl text-[10px] md:text-xs font-semibold gap-1.5 hover:bg-primary/10"
                        style={{ color: goalColor || undefined }}
                        onClick={(e) => { e.stopPropagation(); setDepositGoalId(goal.id); setDepositAmount(""); }}
                      >
                        <PlusCircle className="h-3 w-3 md:h-3.5 md:w-3.5" />
                        Registrar aporte
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Card>

      <EditGoalDialog goal={editGoal} open={!!editGoal} onOpenChange={(o) => !o && setEditGoal(null)} />
    </div>
  );
}