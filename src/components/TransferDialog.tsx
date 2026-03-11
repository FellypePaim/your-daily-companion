import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface TransferDialogProps {
  trigger?: React.ReactNode;
}

export function TransferDialog({ trigger }: TransferDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fromWallet, setFromWallet] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: wallets = [] } = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").order("created_at");
      return data || [];
    },
    enabled: !!user && open,
  });

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleTransfer = async () => {
    if (!user || !fromWallet || !toWallet || !amount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (fromWallet === toWallet) {
      toast.error("Selecione carteiras diferentes");
      return;
    }
    const transferAmount = parseFloat(amount);
    if (transferAmount <= 0) {
      toast.error("O valor deve ser maior que zero");
      return;
    }

    setSaving(true);
    const fromW = wallets.find(w => w.id === fromWallet);
    const toW = wallets.find(w => w.id === toWallet);
    const desc = description.trim() || `Transferência: ${fromW?.name} → ${toW?.name}`;
    const today = new Date().toISOString().slice(0, 10);

    // Create expense transaction (from wallet)
    const { error: e1 } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: desc,
      amount: transferAmount,
      type: "expense",
      wallet_id: fromWallet,
      date: today,
      is_paid: true,
    });

    // Create income transaction (to wallet)
    const { error: e2 } = await supabase.from("transactions").insert({
      user_id: user.id,
      description: desc,
      amount: transferAmount,
      type: "income",
      wallet_id: toWallet,
      date: today,
      is_paid: true,
    });

    // Update wallet balances
    const { error: e3 } = await supabase
      .from("wallets")
      .update({ balance: Number(fromW?.balance || 0) - transferAmount })
      .eq("id", fromWallet);

    const { error: e4 } = await supabase
      .from("wallets")
      .update({ balance: Number(toW?.balance || 0) + transferAmount })
      .eq("id", toWallet);

    const anyError = e1 || e2 || e3 || e4;
    if (anyError) {
      toast.error("Erro na transferência", { description: anyError.message });
    } else {
      toast.success("Transferência realizada!", {
        description: `${fmt(transferAmount)} de ${fromW?.name} para ${toW?.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      setOpen(false);
      setFromWallet(""); setToWallet(""); setAmount(""); setDescription("");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="rounded-full gap-1.5 text-xs">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Transferir
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transferência entre Carteiras
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>De (origem) *</Label>
            <Select value={fromWallet} onValueChange={setFromWallet}>
              <SelectTrigger><SelectValue placeholder="Selecione a carteira de origem" /></SelectTrigger>
              <SelectContent>
                {wallets.map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.icon} {w.name} — {fmt(Number(w.balance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Para (destino) *</Label>
            <Select value={toWallet} onValueChange={setToWallet}>
              <SelectTrigger><SelectValue placeholder="Selecione a carteira de destino" /></SelectTrigger>
              <SelectContent>
                {wallets.filter(w => w.id !== fromWallet).map(w => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.icon} {w.name} — {fmt(Number(w.balance))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="transfer-amount">Valor (R$) *</Label>
            <Input id="transfer-amount" type="number" step="0.01" min="0" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="transfer-desc">Descrição (opcional)</Label>
            <Input id="transfer-desc" placeholder="Ex: Reserva de emergência..." value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <Button onClick={handleTransfer} disabled={saving} className="w-full rounded-full">
            {saving ? "Transferindo..." : "Confirmar Transferência"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
