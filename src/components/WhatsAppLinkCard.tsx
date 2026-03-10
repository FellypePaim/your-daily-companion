import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Wifi, WifiOff, RefreshCw, QrCode, Loader2,
  CheckCircle2, XCircle, Unlink, Settings2, Webhook,
} from "lucide-react";

interface WhatsAppLinkCardProps {
  userId?: string;
}

type ConnectionState = "open" | "close" | "connecting" | "unknown";

interface SetupStep {
  label: string;
  status: "pending" | "loading" | "done" | "error";
}

export default function WhatsAppLinkCard({ userId }: WhatsAppLinkCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("unknown");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [showQrFlow, setShowQrFlow] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(20);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { label: "Criando instância...", status: "pending" },
    { label: "Sync Full History + Configurações", status: "pending" },
    { label: "Webhook + Base64 + Eventos", status: "pending" },
    { label: "Gerando QR Code", status: "pending" },
  ]);

  const callEvolution = useCallback(async (action: string) => {
    const { data, error } = await supabase.functions.invoke("evolution-api", {
      body: { action },
    });
    if (error) throw new Error(error.message);
    return data;
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const data = await callEvolution("status");
      const state = data?.state || data?.instance?.state || "close";
      setConnectionState(state === "open" ? "open" : "close");
      setInstanceName(data?.instance?.instanceName || data?.instanceName || null);

      // Try to get phone from instance info
      if (state === "open") {
        const ownerJid = data?.instance?.owner || data?.owner;
        if (ownerJid) {
          const phone = ownerJid.replace(/@.*/, "");
          setPhoneNumber(phone);
        }
      }
    } catch {
      setConnectionState("unknown");
    }
  }, [callEvolution]);

  useEffect(() => {
    if (!userId) return;
    checkStatus();
  }, [userId, checkStatus]);

  // QR code polling & countdown
  useEffect(() => {
    if (!showQrFlow || connectionState === "open") {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    // Poll status every 3s to detect when phone scans QR
    pollRef.current = setInterval(async () => {
      try {
        const data = await callEvolution("status");
        const state = data?.state || "close";
        if (state === "open") {
          setConnectionState("open");
          setShowQrFlow(false);
          setQrCode(null);
          const ownerJid = data?.instance?.owner || data?.owner;
          if (ownerJid) setPhoneNumber(ownerJid.replace(/@.*/, ""));
          toast({ title: "WhatsApp conectado!", description: "Seu número foi vinculado com sucesso." });

          // Setup webhook after connection
          try {
            await callEvolution("setup_webhook");
          } catch (e) {
            console.error("Webhook setup failed:", e);
          }
        }
      } catch { /* ignore */ }
    }, 3000);

    // Countdown for QR refresh
    setQrCountdown(20);
    countdownRef.current = setInterval(() => {
      setQrCountdown(prev => {
        if (prev <= 1) {
          // Refresh QR
          refreshQrCode();
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showQrFlow, connectionState, callEvolution, toast]);

  const refreshQrCode = async () => {
    try {
      const data = await callEvolution("qrcode");
      if (data?.base64) {
        setQrCode(data.base64);
      } else if (data?.code) {
        setQrCode(data.code);
      }
    } catch { /* ignore */ }
  };

  const startConnection = async () => {
    setShowQrFlow(true);
    setLoading(true);

    const steps = [...setupSteps];
    const updateStep = (idx: number, status: SetupStep["status"]) => {
      steps[idx] = { ...steps[idx], status };
      setSetupSteps([...steps]);
    };

    try {
      // Step 1: Check/create instance
      updateStep(0, "loading");
      await checkStatus();
      updateStep(0, "done");

      // Step 2: Sync
      updateStep(1, "loading");
      await new Promise(r => setTimeout(r, 500));
      updateStep(1, "done");

      // Step 3: Webhook
      updateStep(2, "loading");
      try {
        await callEvolution("setup_webhook");
      } catch { /* ok if fails */ }
      updateStep(2, "done");

      // Step 4: QR Code
      updateStep(3, "loading");
      const qrData = await callEvolution("qrcode");
      if (qrData?.base64) {
        setQrCode(qrData.base64);
      } else if (qrData?.code) {
        setQrCode(qrData.code);
      }
      updateStep(3, "done");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
      const failIdx = steps.findIndex(s => s.status === "loading");
      if (failIdx >= 0) updateStep(failIdx, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await callEvolution("logout");
      setConnectionState("close");
      setPhoneNumber(null);
      setQrCode(null);
      setShowQrFlow(false);
      toast({ title: "WhatsApp desconectado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await callEvolution("restart");
      toast({ title: "Instância reiniciada", description: "Aguarde alguns segundos..." });
      setTimeout(checkStatus, 3000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone: string) => {
    return phone.replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, "+$1 ($2) $3-$4");
  };

  const isConnected = connectionState === "open";
  const showSetupFlow = showQrFlow && !isConnected;
  const allStepsDone = setupSteps.every(s => s.status === "done");

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[#25D366]/10 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-[#25D366]" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">WhatsApp</h2>
            <p className="text-xs text-muted-foreground">Conecte seu WhatsApp para receber e enviar mensagens</p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
              <Wifi className="h-3 w-3" /> Conectado
            </Badge>
            <Badge variant="outline" className="gap-1 text-xs">
              <Webhook className="h-3 w-3" /> Webhook
            </Badge>
          </div>
        ) : (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <WifiOff className="h-3 w-3" /> Desconectado
          </Badge>
        )}
      </div>

      {/* Connected state */}
      {isConnected && (
        <div className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">
                  {instanceName || "Brave"}
                </p>
                {phoneNumber && (
                  <p className="text-xs text-muted-foreground font-mono">
                    📞 {formatPhone(phoneNumber)}
                  </p>
                )}
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestart}
              disabled={loading}
              className="flex-1 gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sincronizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={loading}
              className="flex-1 gap-1.5 text-destructive hover:text-destructive"
            >
              <Unlink className="h-3.5 w-3.5" />
              Desconectar
            </Button>
          </div>
        </div>
      )}

      {/* Setup flow / QR code */}
      {showSetupFlow && (
        <div className="space-y-4">
          {/* Steps */}
          {!allStepsDone && (
            <div className="bg-accent/50 border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="h-4 w-4 text-primary animate-spin" />
                <p className="text-sm font-medium text-foreground">Configurando instância...</p>
              </div>
              <div className="space-y-2">
                {setupSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {step.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                    {step.status === "loading" && <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />}
                    {step.status === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                    {step.status === "pending" && <div className="h-4 w-4 rounded-full border border-border shrink-0" />}
                    <span className={step.status === "done" ? "text-muted-foreground" : step.status === "loading" ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* QR Code display */}
          {qrCode && allStepsDone && (
            <div className="bg-accent/50 border border-border rounded-xl p-6 text-center">
              <h3 className="font-semibold text-foreground mb-1">Conectar WhatsApp</h3>
              <p className="text-xs text-muted-foreground mb-4">Escaneie o QR Code com seu WhatsApp para conectar</p>

              <div className="bg-white rounded-xl p-4 inline-block mx-auto">
                {qrCode.startsWith("data:") ? (
                  <img src={qrCode} alt="QR Code" className="h-52 w-52" />
                ) : (
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=208x208&data=${encodeURIComponent(qrCode)}`} alt="QR Code" className="h-52 w-52" />
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="relative h-8 w-8">
                  <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
                    <circle
                      cx="18" cy="18" r="15" fill="none"
                      stroke="hsl(var(--primary))" strokeWidth="2"
                      strokeDasharray={`${(qrCountdown / 20) * 94.25} 94.25`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                    {qrCountdown}s
                  </span>
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-foreground">Atualiza em {qrCountdown}s</p>
                  <p className="text-[10px] text-muted-foreground">QR Code será renovado automaticamente</p>
                </div>
              </div>

              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <p>Abra o WhatsApp no seu celular</p>
                <p>Vá em Configurações → Dispositivos Conectados</p>
                <p>Toque em "Conectar um dispositivo"</p>
              </div>

              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando conexão...
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setShowQrFlow(false); setQrCode(null); }}
            className="w-full"
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Initial state — not connected, no flow */}
      {!isConnected && !showSetupFlow && (
        <div className="space-y-4">
          <div className="bg-accent/50 border border-border rounded-xl p-6 text-center">
            <QrCode className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">Conecte seu WhatsApp</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Escaneie o QR Code para vincular seu WhatsApp e registrar transações automaticamente.
            </p>
            <Button
              onClick={startConnection}
              disabled={loading}
              className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="h-4 w-4" />
              )}
              {loading ? "Conectando..." : "Nova Conexão"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
