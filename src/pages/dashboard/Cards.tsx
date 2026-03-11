import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Pencil, AlertTriangle, CalendarDays, Wifi, ChevronDown, ChevronUp, Banknote, Trash2 } from "lucide-react";
import { AddCardDialog } from "@/components/AddCardDialog";
import { EditCardDialog } from "@/components/EditCardDialog";
import { EditTransactionDialog } from "@/components/EditTransactionDialog";
import { PayInvoiceDialog } from "@/components/PayInvoiceDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { CardSkeleton } from "@/components/ui/skeletons";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Cards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editCard, setEditCard] = useState<any>(null);
  const [editTransaction, setEditTransaction] = useState<any>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [payCard, setPayCard] = useState<{ id: string; name: string; bill: number } | null>(null);
  const [deleteCardId, setDeleteCardId] = useState<string | null>(null);

  const { data: cards = [], isLoading: loadingCards } = useQuery({
    queryKey: ["cards", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleDeleteCard = async () => {
    if (!deleteCardId) return;
    const { error } = await supabase.from("cards").delete().eq("id", deleteCardId);
    if (error) {
      toast.error("Erro ao excluir cartão", { description: error.message });
    } else {
      toast.success("Cartão removido");
      queryClient.invalidateQueries({ queryKey: ["cards"] });
    }
    setDeleteCardId(null);
  };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: cardTransactions = [] } = useQuery({
    queryKey: ["card-transactions", user?.id, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user!.id)
        .not("card_id", "is", null)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getCardBill = (cardId: string) =>
    cardTransactions.filter((t) => t.card_id === cardId && t.type === "expense").reduce((sum, t) => sum + Number(t.amount), 0);

  const getCardTransactions = (cardId: string) =>
    cardTransactions.filter((t) => t.card_id === cardId);

  const getCardAlerts = () => {
    const today = now.getDate();
    return cards.filter((card) => {
      const bill = getCardBill(card.id);
      const limit = Number(card.credit_limit) || 0;
      const usagePercent = limit > 0 ? (bill / limit) * 100 : 0;
      const dueDay = card.due_day || 0;
      const daysUntilDue = dueDay >= today ? dueDay - today : 30 - today + dueDay;
      return usagePercent >= 80 || (dueDay > 0 && daysUntilDue <= 3);
    });
  };

  const alertCards = getCardAlerts();

  const getDueDateLabel = (dueDay: number | null) => {
    if (!dueDay) return null;
    const today = now.getDate();
    const diff = dueDay >= today ? dueDay - today : 30 - today + dueDay;
    if (diff === 0) return { text: "Hoje", urgent: true };
    if (diff === 1) return { text: "Amanhã", urgent: true };
    if (diff <= 3) return { text: `Em ${diff} dias`, urgent: true };
    return { text: `Dia ${dueDay}`, urgent: false };
  };

  return (
    <div className="max-w-6xl mx-auto space-y-3 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg md:text-3xl font-bold text-foreground">Cartões de Crédito</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Gerencie seus cartões e faturas</p>
        </div>
        <AddCardDialog />
      </div>

      {/* Alert Banner */}
      {alertCards.length > 0 && (
        <Card className="border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-3 md:p-4 flex items-start gap-2.5 md:gap-3">
            <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs md:text-sm font-semibold text-amber-800 dark:text-amber-300">Atenção!</p>
              <p className="text-[10px] md:text-xs text-amber-700 dark:text-amber-400/80">
                {alertCards.length} cartão(ões) com limite alto ou vencimento próximo
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingCards ? (
        <div className="space-y-4 md:space-y-6">
          {[1, 2].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : cards.length === 0 ? (
        <Card className="p-4 md:p-6">
          <div className="text-center py-8 md:py-12 text-muted-foreground">
            <CreditCard className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-sm">Nenhum cartão cadastrado</p>
            <p className="text-xs mt-1">Cadastre seu primeiro cartão</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {cards.map((card) => {
            const cardColor = card.color || "hsl(240, 10%, 15%)";
            const bill = getCardBill(card.id);
            const limit = Number(card.credit_limit) || 0;
            const available = Math.max(0, limit - bill);
            const usagePercent = limit > 0 ? Math.min(100, (bill / limit) * 100) : 0;
            const dueInfo = getDueDateLabel(card.due_day);
            const isHighUsage = usagePercent >= 80;
            const transactions = getCardTransactions(card.id);
            const isExpanded = expandedCard === card.id;

            return (
              <Card key={card.id} className="overflow-hidden border-0 shadow-md">
                {/* Visual Credit Card */}
                <div
                  className="p-4 pb-5 md:p-5 md:pb-6 text-white relative cursor-pointer group"
                  style={{ background: cardColor }}
                  onClick={() => setEditCard(card)}
                >
                  <button className="absolute top-2.5 right-2.5 md:top-3 md:right-3 opacity-60 md:opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/20">
                    <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5" />
                  </button>

                  <div className="flex items-center gap-2 mb-4 md:mb-6">
                    <div className="h-7 w-9 md:h-8 md:w-11 rounded-md bg-amber-400/90" />
                    <Wifi className="h-4 w-4 md:h-5 md:w-5 opacity-60 rotate-90" />
                  </div>

                  <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4 text-xs md:text-sm font-mono tracking-widest opacity-90">
                    <span>••••</span>
                    <span>••••</span>
                    <span>••••</span>
                    <span>{card.last_4_digits || "••••"}</span>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[9px] md:text-[10px] uppercase tracking-wider opacity-60">Crédito</p>
                      <p className="text-xs md:text-sm font-bold tracking-wide uppercase">{card.name}</p>
                    </div>
                    {card.brand && (
                      <p className="text-base md:text-lg font-bold italic opacity-90">{card.brand}</p>
                    )}
                  </div>
                </div>

                {/* Invoice Info */}
                <CardContent className="p-3.5 md:p-5 space-y-3 md:space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <p className="text-[10px] md:text-xs text-muted-foreground">Fatura atual</p>
                      <p className="text-base md:text-xl font-bold text-foreground">{fmt(bill)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] md:text-xs text-muted-foreground">Limite disponível</p>
                      <p className="text-base md:text-xl font-bold text-emerald-500">{fmt(available)}</p>
                    </div>
                  </div>

                  {limit > 0 && (
                    <div className="space-y-1">
                      <Progress
                        value={usagePercent}
                        className="h-1.5 md:h-2"
                        style={{
                          "--progress-color": isHighUsage ? "hsl(0, 84%, 60%)" : "hsl(var(--primary))",
                        } as React.CSSProperties}
                      />
                      <p className="text-[10px] md:text-[11px] text-muted-foreground text-right">
                        {usagePercent.toFixed(0)}% utilizado
                      </p>
                    </div>
                  )}

                  {dueInfo && (
                    <div className="flex items-center justify-between py-2 md:py-2.5 border-t border-border">
                      <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        <span>Vence dia {card.due_day}</span>
                      </div>
                      <span className={`text-xs md:text-sm font-semibold ${dueInfo.urgent ? "text-amber-500" : "text-muted-foreground"}`}>
                        {dueInfo.text}
                      </span>
                    </div>
                  )}

                  {isHighUsage && (
                    <div className="flex items-center gap-2 px-2.5 md:px-3 py-1.5 md:py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                      <AlertTriangle className="h-3 w-3 md:h-3.5 md:w-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-[10px] md:text-xs font-medium text-amber-700 dark:text-amber-400">
                        Limite alto ou vencimento próximo
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {bill > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 md:h-10 rounded-xl gap-1.5 md:gap-2 text-xs md:text-sm font-semibold"
                        onClick={(e) => { e.stopPropagation(); setPayCard({ id: card.id, name: card.name, bill }); }}
                      >
                        <Banknote className="h-3.5 w-3.5 md:h-4 md:w-4" /> Pagar Fatura
                      </Button>
                    )}
                    {transactions.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 md:h-10 rounded-xl gap-1.5 md:gap-2 text-xs md:text-sm font-medium text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); setExpandedCard(isExpanded ? null : card.id); }}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5 md:h-4 md:w-4" /> : <ChevronDown className="h-3.5 w-3.5 md:h-4 md:w-4" />}
                        {transactions.length} transaç{transactions.length === 1 ? "ão" : "ões"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 md:h-10 rounded-xl text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteCardId(card.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                    </Button>
                  </div>

                  {isExpanded && transactions.length > 0 && (
                    <div className="border-t border-border pt-2.5 md:pt-3 space-y-1 animate-fade-in">
                      <p className="text-[10px] md:text-xs font-semibold text-muted-foreground mb-1.5 md:mb-2">Últimas transações</p>
                      {transactions.map((t) => (
                        <button
                          key={t.id}
                          className="w-full flex items-center justify-between px-2.5 md:px-3 py-2 md:py-2.5 rounded-xl hover:bg-muted/50 transition-colors text-left group/tx"
                          onClick={(e) => { e.stopPropagation(); setEditTransaction(t); }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs md:text-sm font-medium text-foreground truncate">{t.description}</p>
                            <p className="text-[10px] md:text-[11px] text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                          </div>
                          <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                            <span className={`text-xs md:text-sm font-semibold ${t.type === "expense" ? "text-destructive" : "text-emerald-500"}`}>
                              {t.type === "expense" ? "-" : "+"}{fmt(Number(t.amount))}
                            </span>
                            <Pencil className="h-2.5 w-2.5 md:h-3 md:w-3 text-muted-foreground opacity-0 group-hover/tx:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <EditCardDialog card={editCard} open={!!editCard} onOpenChange={(o) => !o && setEditCard(null)} />
      <EditTransactionDialog transaction={editTransaction} open={!!editTransaction} onOpenChange={(o) => !o && setEditTransaction(null)} />
      {payCard && (
        <PayInvoiceDialog
          cardId={payCard.id}
          cardName={payCard.name}
          billAmount={payCard.bill}
          open={!!payCard}
          onOpenChange={(o) => !o && setPayCard(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={!!deleteCardId}
        onOpenChange={(o) => !o && setDeleteCardId(null)}
        onConfirm={handleDeleteCard}
        title="Excluir cartão?"
        description="O cartão e suas informações serão removidos. Transações existentes não serão afetadas."
      />
    </div>
  );
}