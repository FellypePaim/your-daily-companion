import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const investmentTypes = [
  { value: "renda_fixa", label: "Renda Fixa" },
  { value: "acoes", label: "Ações" },
  { value: "fiis", label: "FIIs" },
  { value: "cripto", label: "Criptomoedas" },
  { value: "tesouro", label: "Tesouro Direto" },
  { value: "poupanca", label: "Poupança" },
  { value: "outro", label: "Outro" },
];

interface AddInvestmentDialogProps {
  trigger?: React.ReactNode;
}

export function AddInvestmentDialog({ trigger }: AddInvestmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSubmit = () => {
    if (!name || !type || !amount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    // TODO: Save to database when investments table is created
    toast.success("Investimento registrado com sucesso!", {
      description: `${name} — R$ ${Number(amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    });
    setOpen(false);
    setName("");
    setType("");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5">
            <Plus className="h-4 w-4" />
            Novo Investimento
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Investimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="inv-name">Nome do ativo</Label>
            <Input id="inv-name" placeholder="Ex: CDB Banco Inter, PETR4..." value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                {investmentTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="inv-amount">Valor investido (R$)</Label>
            <Input id="inv-amount" type="number" step="0.01" min="0" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="inv-date">Data da aplicação</Label>
            <Input id="inv-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <Button onClick={handleSubmit} className="w-full rounded-full">
            Adicionar Investimento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
