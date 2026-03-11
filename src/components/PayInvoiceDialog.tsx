import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  cardId: string;
  cardName: string;
  billAmount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PayInvoiceDialog({ cardId, cardName, billAmount, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [walletId, setWalletId] = useState("");
  const [amount, setAmount] = useState(String(billAmount));
  const [saving, setSaving] = useState(false);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("id, name, balance").eq("user_id", user!.id).order("name");
      return data || [];
    },
    enabled: !!user && open,
  });

  const selectedWallet = wallets.find(w => w.id === walletId);
  const payAmount = parseFloat(amount) || 0;

  const handlePay = async () => {
    if (!user || !walletId || payAmount <= 0) return;
    setSaving(true);

    const wallet = wallets.find(w => w.id === walletId);
    if (!wallet) { setSaving(false); return; }

    if (Number(wallet.balance) < payAmount) {
      toast({ title: "Saldo insuficiente", description: `Saldo da conta: ${fmt(Number(wallet.balance))}`, variant: "destructive" });
      setSaving(false);
      return;
    }

    // 1. Create a payment transaction (income type on the card = paying the bill)
    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: `Pagamento fatura - ${cardName}`,
      amount: payAmount,
      type: "expense",
      wallet_id: walletId,
      card_id: null,
      date: new Date().toISOString().slice(0, 10),
      is_paid: true,
    });

    if (txError) {
      toast({ title: "Erro", description: txError.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // 2. Mark card transactions as paid
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    await supabase.from("transactions")
      .update({ is_paid: true })
      .eq("card_id", cardId)
      .eq("type", "expense")
      .eq("is_paid", false)
      .gte("date", monthStart);

    // 3. Deduct from wallet balance
    const { error: walletError } = await supabase.from("wallets")
      .update({ balance: Number(wallet.balance) - payAmount })
      .eq("id", walletId);

    if (walletError) {
      toast({ title: "Erro ao atualizar saldo", description: walletError.message, variant: "destructive" });
    } else {
      toast({ title: "Fatura paga!", description: `${fmt(payAmount)} descontados de ${wallet.name}` });
      ["transactions", "wallet-transactions", "wallets", "cards", "card-transactions", "dashboard", "dashboard-transactions"].forEach(k =>
        queryClient.invalidateQueries({ queryKey: [k] })
      );
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0 rounded-2xl overflow-hidden border-0 shadow-2xl">
        <div className="p-6 pb-2">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-bold text-foreground">Pagar Fatura</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">{cardName}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Bill summary */}
          <div className="rounded-2xl bg-muted/30 border border-border p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Fatura atual</p>
            <p className="text-2xl font-bold text-foreground">{fmt(billAmount)}</p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Valor do pagamento</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">R$</span>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" className="h-11 rounded-xl border-border pl-10" />
            </div>
            {payAmount > 0 && payAmount < billAmount && (
              <p className="text-[11px] text-amber-600 mt-1">Pagamento parcial — restará {fmt(billAmount - payAmount)}</p>
            )}
          </div>

          {/* Wallet selector */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <Landmark className="h-3.5 w-3.5" /> De qual conta sai?
            </label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger className="h-11 rounded-xl border-border">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} — {fmt(Number(w.balance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWallet && Number(selectedWallet.balance) < payAmount && (
              <p className="text-[11px] text-destructive mt-1">Saldo insuficiente nesta conta</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-11 rounded-2xl font-semibold">
              Cancelar
            </Button>
            <Button
              onClick={handlePay}
              disabled={saving || !walletId || payAmount <= 0 || (selectedWallet ? Number(selectedWallet.balance) < payAmount : true)}
              className="flex-1 h-11 rounded-2xl font-semibold shadow-lg shadow-primary/20 gap-2"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Pagando...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Pagar</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
