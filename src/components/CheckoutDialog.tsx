import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, CheckCircle2, CreditCard, QrCode, FileText, AlertCircle } from "lucide-react";

interface CheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: "mensal" | "anual";
  planName: string;
  planPrice: string;
  planValue: number;
}

type PaymentStatus = "idle" | "loading" | "pending" | "confirmed" | "error";

export default function CheckoutDialog({
  open,
  onOpenChange,
  plan,
  planName,
  planPrice,
  planValue,
}: CheckoutDialogProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState("pix");
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // PIX state
  const [pixQrCode, setPixQrCode] = useState("");
  const [pixPayload, setPixPayload] = useState("");
  const [pixCopied, setPixCopied] = useState(false);

  // Boleto state
  const [boletoBarCode, setBoletoBarCode] = useState("");
  const [boletoUrl, setBoletoUrl] = useState("");
  const [boletoCopied, setBoletoCopied] = useState(false);

  // Card state
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardCpf, setCardCpf] = useState("");
  const [cardPhone, setCardPhone] = useState("");
  const [cardPostalCode, setCardPostalCode] = useState("");
  const [cardAddressNumber, setCardAddressNumber] = useState("");

  // CPF for PIX/Boleto
  const [cpfCnpj, setCpfCnpj] = useState("");

  // Payment tracking
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStatus("idle");
    setErrorMsg("");
    setPixQrCode("");
    setPixPayload("");
    setPixCopied(false);
    setBoletoBarCode("");
    setBoletoUrl("");
    setBoletoCopied(false);
    setPaymentId(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  // Poll payment status when PIX or Boleto is pending
  useEffect(() => {
    if (status !== "pending" || !paymentId) return;
    if (tab !== "pix" && tab !== "boleto") return;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-payment-status", {
          body: { paymentId },
        });
        if (error || data?.error) return;
        if (data?.status === "CONFIRMED" || data?.status === "RECEIVED" || data?.status === "RECEIVED_IN_CASH") {
          setStatus("confirmed");
          toast({ title: "Pagamento confirmado!", description: "Seu plano será ativado em instantes." });
          clearInterval(interval);
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 2500);
        }
      } catch { /* ignore polling errors */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [status, paymentId, tab, toast]);

  const handlePixCheckout = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan, billingType: "PIX", cpfCnpj: cpfCnpj.replace(/\D/g, "") || undefined },
      });
      if (error) {
        const errBody = typeof error === "object" && error.message ? error.message : String(error);
        throw new Error(errBody);
      }
      if (data?.error) throw new Error(data.error);

      setPixQrCode(data.pixQrCode || "");
      setPixPayload(data.pixPayload || "");
      setPaymentId(data.paymentId);
      setStatus("pending");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  };

  const handleBoletoCheckout = async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan, billingType: "BOLETO", cpfCnpj: cpfCnpj.replace(/\D/g, "") || undefined },
      });
      if (error) {
        const errBody = typeof error === "object" && error.message ? error.message : String(error);
        throw new Error(errBody);
      }
      if (data?.error) throw new Error(data.error);

      setBoletoBarCode(data.boletoBarCode || "");
      setBoletoUrl(data.boletoUrl || data.invoiceUrl || "");
      setPaymentId(data.paymentId);
      setStatus("pending");
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  };

  const handleCardCheckout = async () => {
    if (!cardNumber || !cardName || !cardExpiry || !cardCvv || !cardCpf) {
      setErrorMsg("Preencha todos os campos obrigatórios do cartão.");
      setStatus("error");
      return;
    }

    const [expMonth, expYear] = cardExpiry.split("/");
    if (!expMonth || !expYear) {
      setErrorMsg("Data de validade inválida. Use MM/AA.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          plan,
          billingType: "CREDIT_CARD",
          creditCard: {
            holderName: cardName,
            number: cardNumber.replace(/\s/g, ""),
            expiryMonth: expMonth.trim(),
            expiryYear: `20${expYear.trim()}`,
            ccv: cardCvv,
          },
          creditCardHolderInfo: {
            name: cardName,
            cpfCnpj: cardCpf.replace(/\D/g, ""),
            phone: cardPhone.replace(/\D/g, "") || undefined,
            postalCode: cardPostalCode.replace(/\D/g, "") || undefined,
            addressNumber: cardAddressNumber || undefined,
          },
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      if (data.status === "CONFIRMED" || data.status === "RECEIVED") {
        setStatus("confirmed");
        toast({ title: "Pagamento aprovado!", description: "Seu plano será ativado em instantes." });
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 2000);
      } else if (data.status === "PENDING") {
        setStatus("pending");
        setPaymentId(data.paymentId);
      } else {
        throw new Error(`Pagamento não aprovado. Status: ${data.status}. Verifique os dados do cartão.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  };

  const copyToClipboard = (text: string, type: "pix" | "boleto") => {
    navigator.clipboard.writeText(text);
    if (type === "pix") {
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 3000);
    } else {
      setBoletoCopied(true);
      setTimeout(() => setBoletoCopied(false), 3000);
    }
    toast({ title: "Copiado!", description: "Código copiado para a área de transferência." });
  };

  const formatCardNumber = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Assinar {planName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Valor: <span className="font-bold text-foreground">{planPrice}</span>
          </p>
        </DialogHeader>

        {status === "confirmed" ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <p className="font-bold text-foreground text-lg">Pagamento confirmado!</p>
            <p className="text-sm text-muted-foreground text-center">
              Seu plano será ativado automaticamente. Redirecionando...
            </p>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => { setTab(v); resetState(); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pix" className="text-xs gap-1.5">
                <QrCode className="h-3.5 w-3.5" /> PIX
              </TabsTrigger>
              <TabsTrigger value="boleto" className="text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Boleto
              </TabsTrigger>
              <TabsTrigger value="card" className="text-xs gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Cartão
              </TabsTrigger>
            </TabsList>

            {/* PIX Tab */}
            <TabsContent value="pix" className="mt-4 space-y-4">
              {status === "idle" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">CPF/CNPJ *</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handlePixCheckout} className="w-full">
                    <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code PIX
                  </Button>
                </div>
              )}
              {status === "loading" && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              {status === "pending" && pixQrCode && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <img
                      src={`data:image/png;base64,${pixQrCode}`}
                      alt="QR Code PIX"
                      className="w-48 h-48 rounded-lg border border-border"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Código copia e cola</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={pixPayload}
                        readOnly
                        className="text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(pixPayload, "pix")}
                      >
                        {pixCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Escaneie o QR Code ou copie o código acima para pagar via PIX.
                    O pagamento é confirmado automaticamente.
                  </p>
                </div>
              )}
              {status === "error" && (
                <ErrorBox message={errorMsg} onRetry={() => { resetState(); }} />
              )}
            </TabsContent>

            {/* Boleto Tab */}
            <TabsContent value="boleto" className="mt-4 space-y-4">
              {status === "idle" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">CPF/CNPJ *</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handleBoletoCheckout} className="w-full">
                    <FileText className="h-4 w-4 mr-2" /> Gerar Boleto
                  </Button>
                </div>
              )}
              {status === "loading" && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              )}
              {status === "pending" && (
                <div className="space-y-4">
                  {boletoBarCode && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Código de barras</Label>
                      <div className="flex gap-2 mt-1">
                        <Input value={boletoBarCode} readOnly className="text-xs font-mono" />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(boletoBarCode, "boleto")}
                        >
                          {boletoCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}
                  {boletoUrl && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.open(boletoUrl, "_blank")}
                    >
                      <FileText className="h-4 w-4 mr-2" /> Visualizar Boleto
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Copie o código de barras ou visualize o boleto para efetuar o pagamento.
                    A confirmação pode levar até 3 dias úteis.
                  </p>
                </div>
              )}
              {status === "error" && (
                <ErrorBox message={errorMsg} onRetry={() => { resetState(); }} />
              )}
            </TabsContent>

            {/* Card Tab */}
            <TabsContent value="card" className="mt-4 space-y-3">
              {status === "loading" ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : status === "error" ? (
                <ErrorBox message={errorMsg} onRetry={() => { setStatus("idle"); setErrorMsg(""); }} />
              ) : (
                <>
                  <div>
                    <Label className="text-xs">Número do cartão *</Label>
                    <Input
                      placeholder="0000 0000 0000 0000"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      className="mt-1"
                      maxLength={19}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Nome no cartão *</Label>
                    <Input
                      placeholder="Como impresso no cartão"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Validade *</Label>
                      <Input
                        placeholder="MM/AA"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        className="mt-1"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">CVV *</Label>
                      <Input
                        placeholder="123"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className="mt-1"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">CPF do titular *</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={cardCpf}
                      onChange={(e) => setCardCpf(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Telefone</Label>
                      <Input
                        placeholder="(00) 00000-0000"
                        value={cardPhone}
                        onChange={(e) => setCardPhone(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">CEP</Label>
                      <Input
                        placeholder="00000-000"
                        value={cardPostalCode}
                        onChange={(e) => setCardPostalCode(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Nº do endereço</Label>
                    <Input
                      placeholder="123"
                      value={cardAddressNumber}
                      onChange={(e) => setCardAddressNumber(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button onClick={handleCardCheckout} className="w-full mt-2">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pagar R$ {planValue.toFixed(2).replace(".", ",")}
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Pagamento processado de forma segura via Asaas. Seus dados são criptografados.
                  </p>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <p className="text-sm text-destructive">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="w-full">
        Tentar novamente
      </Button>
    </div>
  );
}
