import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, TrendingDown, TrendingUp, Wallet, CreditCard, Landmark, Repeat, Shuffle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { autoCategorize } from "@/lib/auto-categorize";

interface Props {
  trigger?: React.ReactNode;
}

export function AddTransactionDialog({ trigger }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("expense");
  const [expenseType, setExpenseType] = useState<"fixed" | "variable">("variable");
  const [categoryId, setCategoryId] = useState("");
  const [walletId, setWalletId] = useState("");
  const [cardId, setCardId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [payMethod, setPayMethod] = useState<"wallet" | "card">("wallet");
  const [isRecurring, setIsRecurring] = useState(false);
  const [installments, setInstallments] = useState(1);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").eq("user_id", user!.id).order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("id, name, balance").order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ["cards", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("id, name, brand, credit_limit, color, due_day").eq("user_id", user!.id).order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const handleSave = async () => {
    if (!user || !amount) return;
    setSaving(true);

    const desc = description.trim() || (type === "expense" ? "Despesa" : "Receita");
    const parsedAmount = parseFloat(amount);
    const dayOfMonth = new Date(date).getDate();

    // If recurring, create the recurring template first
    let recurringId: string | null = null;
    if (isRecurring) {
      const { data: recData, error: recError } = await supabase.from("recurring_transactions").insert({
        user_id: user.id,
        description: desc,
        amount: parsedAmount,
        type,
        expense_type: expenseType,
        category_id: categoryId || null,
        wallet_id: walletId || null,
        day_of_month: dayOfMonth,
      }).select("id").single();

      if (recError) {
        toast({ title: "Erro ao criar recorrência", description: recError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      recurringId = recData.id;
    }

    // Handle installments for credit card
    const numInstallments = payMethod === "card" && installments > 1 ? installments : 1;
    const installmentAmount = Math.round((parsedAmount / numInstallments) * 100) / 100;

    // Get card's due_day for setting proper due dates on each installment
    const cardDueDay = selectedCard?.due_day || null;

    const transactionsToInsert = [];
    for (let i = 0; i < numInstallments; i++) {
      const installmentDate = new Date(date);
      installmentDate.setMonth(installmentDate.getMonth() + i);
      const installmentDesc = numInstallments > 1
        ? `${desc} (${i + 1}/${numInstallments})`
        : desc;

      // Calculate due_date: use card's due_day for each installment month
      let dueDate: string | null = null;
      if (effectivePayMethod === "card" && cardDueDay) {
        const dueMonth = new Date(date);
        // If purchase day > card due day, bill goes to next month
        const purchaseDay = new Date(date).getDate();
        const monthOffset = purchaseDay > cardDueDay ? i + 1 : i;
        dueMonth.setMonth(dueMonth.getMonth() + monthOffset);
        dueMonth.setDate(Math.min(cardDueDay, new Date(dueMonth.getFullYear(), dueMonth.getMonth() + 1, 0).getDate()));
        dueDate = dueMonth.toISOString().slice(0, 10);
      } else if (isRecurring) {
        dueDate = date;
      }

      transactionsToInsert.push({
        user_id: user.id,
        description: installmentDesc,
        amount: installmentAmount,
        type,
        category_id: categoryId || null,
        wallet_id: effectivePayMethod === "wallet" ? (effectiveWalletId || null) : null,
        card_id: effectivePayMethod === "card" ? (cardId || null) : null,
        date: installmentDate.toISOString().slice(0, 10),
        due_date: dueDate,
        is_paid: !isRecurring && i === 0 && effectivePayMethod === "wallet",
        recurring_id: recurringId,
      });
    }

    const { error } = await supabase.from("transactions").insert(transactionsToInsert);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      if (effectiveWalletId && !isRecurring && effectivePayMethod === "wallet") {
        const delta = type === "income" ? parsedAmount : -parsedAmount;
        const wallet = wallets.find(w => w.id === effectiveWalletId);
        if (wallet) {
          await supabase.from("wallets").update({ balance: Number((wallet as any).balance || 0) + delta }).eq("id", effectiveWalletId);
        }
      }
      toast({ title: isRecurring ? "Conta recorrente criada!" : "Transação adicionada!" });
      queryClient.invalidateQueries({ queryKey: ["cards"] });
      queryClient.invalidateQueries({ queryKey: ["card-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["bills-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
      setOpen(false);
      resetForm();
    }
    setSaving(false);
  };

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setType("expense");
    setExpenseType("variable");
    setCategoryId("");
    setWalletId("");
    setCardId("");
    setDate(new Date().toISOString().slice(0, 10));
    setPayMethod("wallet");
    setIsRecurring(false);
    setInstallments(1);
  };

  const hasMultipleWallets = wallets.length > 1;
  const hasCards = cards.length > 0;

  // Auto-select single wallet
  const effectiveWalletId = walletId || (wallets.length === 1 ? wallets[0].id : "");

  // If no cards, force wallet method
  const effectivePayMethod = hasCards ? payMethod : "wallet";

  const selectedWallet = wallets.find(w => w.id === effectiveWalletId);
  const selectedCard = cards.find(c => c.id === cardId);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-full gap-2">
            <Plus className="h-4 w-4" /> Nova Transação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="px-5 pt-5 pb-2">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Nova Transação</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Registre rapidamente uma receita ou despesa
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => setType("expense")}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all ${
                type === "expense"
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              Despesa
            </button>
            <button
              onClick={() => setType("income")}
              className={`flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-all ${
                type === "income"
                  ? "bg-foreground text-background"
                  : "bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Receita
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Valor (R$)</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="0.01"
              placeholder="0,00"
              className="h-11 rounded-xl border-border text-lg font-medium"
            />
          </div>

          {/* Expense type: Fixa / Variável */}
          {type === "expense" && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Tipo de Despesa</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setExpenseType("fixed")}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                    expenseType === "fixed"
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <Repeat className="h-4 w-4" />
                  <span className="text-sm font-semibold">Fixa</span>
                  <span className="text-[10px] opacity-80">Aluguel, Internet...</span>
                </button>
                <button
                  onClick={() => setExpenseType("variable")}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                    expenseType === "variable"
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <Shuffle className="h-4 w-4" />
                  <span className="text-sm font-semibold">Variável</span>
                  <span className="text-[10px] opacity-80">Mercado, Uber...</span>
                </button>
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Categoria</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11 rounded-xl border-border">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Transação Recorrente</span>
            </div>
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
          </div>

          {/* Payment method - only show if user has cards */}
          {hasCards && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Como você vai pagar?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPayMethod("wallet")}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
                    effectivePayMethod === "wallet"
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <Wallet className="h-5 w-5" />
                  <span className="text-sm font-semibold">Conta Corrente</span>
                  <span className="text-[10px] opacity-80">Pix / Débito</span>
                </button>
                <button
                  onClick={() => setPayMethod("card")}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
                    effectivePayMethod === "card"
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span className="text-sm font-semibold">Cartão de Crédito</span>
                  <span className="text-[10px] opacity-80">Fatura</span>
                </button>
              </div>
            </div>
          )}

          {/* Wallet selector - show when wallet method AND multiple wallets */}
          {effectivePayMethod === "wallet" && hasMultipleWallets && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <Landmark className="h-3.5 w-3.5" /> {type === "income" ? "Em qual conta entra?" : "De qual conta sai?"}
              </label>
              <Select value={effectiveWalletId} onValueChange={setWalletId}>
                <SelectTrigger className="h-11 rounded-xl border-border">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Selected wallet preview */}
          {effectivePayMethod === "wallet" && selectedWallet && (
            <div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/50 border border-border">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Landmark className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{selectedWallet.name}</span>
                </div>
                <span className={`text-sm font-bold ${type === "expense" ? "text-destructive" : "text-primary"}`}>
                  {type === "expense" ? "-" : "+"}R$ {amount ? Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0,00"}
                </span>
              </div>
              {amount && (
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  O saldo será {type === "income" ? "adicionado" : "deduzido"} automaticamente
                </p>
              )}
            </div>
          )}

          {/* Card selector */}
          {effectivePayMethod === "card" && (
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Qual cartão?
              </label>
              <Select value={cardId} onValueChange={setCardId}>
                <SelectTrigger className="h-11 rounded-xl border-border">
                  <SelectValue placeholder="Selecione o cartão" />
                </SelectTrigger>
                <SelectContent>
                  {cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.brand ? `(${c.brand})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCard && (
                <div className="mt-2 flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/50 border border-border">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{selectedCard.name}</span>
                  </div>
                  {selectedCard.credit_limit && (
                    <span className="text-xs text-muted-foreground">
                      Limite: {Number(selectedCard.credit_limit).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  )}
                </div>
              )}
              {/* Installments */}
              {selectedCard && (
                <div className="mt-3">
                  <label className="text-sm font-semibold text-foreground mb-2 block">Parcelas</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallments(n)}
                        className={`h-9 min-w-[2.25rem] px-2 rounded-lg text-sm font-semibold transition-all ${
                          installments === n
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                  {installments > 1 && amount && (
                    <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                      {installments}x de R$ {(Math.round((parseFloat(amount) / installments) * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} na fatura
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Descrição (opcional)</label>
            <Input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                // Auto-categorize based on description
                if (!categoryId && e.target.value.length >= 3) {
                  const match = autoCategorize(e.target.value, categories);
                  if (match) setCategoryId(match.id);
                }
              }}
              placeholder="Ex: Almoço no restaurante"
              className="h-11 rounded-xl border-border"
            />
          </div>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || !amount}
            className="w-full h-12 rounded-2xl font-semibold text-base shadow-lg shadow-primary/20"
          >
            {saving ? "Salvando..." : "Salvar Transação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
