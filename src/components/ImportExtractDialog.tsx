import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { autoCategorize } from "@/lib/auto-categorize";

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  selected: boolean;
}

function parseCSV(text: string): ParsedTransaction[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase();
  const sep = header.includes(";") ? ";" : ",";
  const cols = header.split(sep).map(c => c.replace(/"/g, "").trim());

  const dateIdx = cols.findIndex(c => /data|date/.test(c));
  const descIdx = cols.findIndex(c => /descri|description|memo|hist/.test(c));
  const amountIdx = cols.findIndex(c => /valor|amount|value/.test(c));

  if (dateIdx === -1 || amountIdx === -1) return [];

  const results: ParsedTransaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map(p => p.replace(/"/g, "").trim());
    if (parts.length <= Math.max(dateIdx, amountIdx)) continue;

    const rawDate = parts[dateIdx];
    const rawAmount = parts[amountIdx].replace(/[rR$\s]/g, "").replace(",", ".");
    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    // Parse date: DD/MM/YYYY or YYYY-MM-DD
    let date = "";
    const dmyMatch = rawDate.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      const year = y.length === 2 ? `20${y}` : y;
      date = `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else {
      continue;
    }

    results.push({
      date,
      description: descIdx >= 0 ? parts[descIdx] : `Transação ${i}`,
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
      selected: true,
    });
  }
  return results;
}

function parseOFX(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const txRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = txRegex.exec(text)) !== null) {
    const block = match[1];
    const getTag = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\n]+)`, "i"));
      return m ? m[1].trim() : "";
    };

    const rawAmount = getTag("TRNAMT").replace(",", ".");
    const amount = parseFloat(rawAmount);
    if (isNaN(amount)) continue;

    const rawDate = getTag("DTPOSTED");
    let date = "";
    if (rawDate.length >= 8) {
      date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    } else continue;

    const memo = getTag("MEMO") || getTag("NAME") || "Importado OFX";

    results.push({
      date,
      description: memo,
      amount: Math.abs(amount),
      type: amount < 0 ? "expense" : "income",
      selected: true,
    });
  }
  return results;
}

export function ImportExtractDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const text = await file.text();
    const ext = file.name.toLowerCase();

    let txs: ParsedTransaction[] = [];
    if (ext.endsWith(".ofx") || ext.endsWith(".qfx")) {
      txs = parseOFX(text);
    } else {
      txs = parseCSV(text);
    }

    if (txs.length === 0) {
      toast.error("Nenhuma transação encontrada no arquivo");
      return;
    }
    setParsed(txs);
  };

  const toggleItem = (idx: number) => {
    setParsed(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
  };

  const handleImport = async () => {
    if (!user) return;
    const selected = parsed.filter(p => p.selected);
    if (selected.length === 0) return;

    setImporting(true);
    try {
      // Get user categories for auto-categorization
      const { data: cats } = await supabase.from("categories").select("id, name");
      const userCats = cats || [];

      const rows = selected.map(tx => {
        const cat = autoCategorize(tx.description, userCats);
        return {
          user_id: user.id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          is_paid: true,
          category_id: cat?.id || null,
        };
      });

      const { error } = await supabase.from("transactions").insert(rows);
      if (error) throw error;

      toast.success(`${rows.length} transações importadas com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["day-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-transactions"] });
      setOpen(false);
      setParsed([]);
      setFileName("");
    } catch (err: any) {
      toast.error("Erro ao importar", { description: err.message });
    } finally {
      setImporting(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const selectedCount = parsed.filter(p => p.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setParsed([]); setFileName(""); } }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="rounded-full gap-1.5 text-xs h-8 px-3">
            <Upload className="h-3.5 w-3.5" /> Importar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Importar Extrato
          </DialogTitle>
        </DialogHeader>

        {parsed.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Importe arquivos <strong>CSV</strong> ou <strong>OFX</strong> do seu banco para criar transações automaticamente.
            </p>
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">Clique para selecionar</p>
              <p className="text-xs text-muted-foreground mt-1">Formatos: .csv, .ofx, .qfx</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.ofx,.qfx"
              className="hidden"
              onChange={handleFile}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <strong>{parsed.length}</strong> transações em <strong>{fileName}</strong>
              </p>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setParsed([]); setFileName(""); }}>
                Trocar arquivo
              </Button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
              {parsed.map((tx, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                    tx.selected ? "bg-primary/5" : "opacity-50"
                  }`}
                  onClick={() => toggleItem(i)}
                >
                  <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                    tx.selected ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {tx.selected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{tx.description}</p>
                    <p className="text-muted-foreground">{new Date(tx.date + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                  </div>
                  <span className={`font-bold shrink-0 ${tx.type === "income" ? "text-emerald-500" : "text-destructive"}`}>
                    {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
                  </span>
                </div>
              ))}
            </div>

            <Button className="w-full rounded-full gap-2" disabled={importing || selectedCount === 0} onClick={handleImport}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar {selectedCount} transações
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
