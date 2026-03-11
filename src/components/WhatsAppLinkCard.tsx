import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Phone, CheckCircle2, Copy, Loader2, Unlink, RefreshCw,
} from "lucide-react";

interface WhatsAppLinkCardProps {
  userId?: string;
}

const NOX_PHONE = "5537999385148";
const NOX_PHONE_DISPLAY = "(37) 9 9938-5148";

export default function WhatsAppLinkCard({ userId }: WhatsAppLinkCardProps) {
  const { toast } = useToast();
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Fetch existing link
  useEffect(() => {
    if (!userId) return;
    const fetchLink = async () => {
      const { data } = await supabase
        .from("whatsapp_links")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        setLinkedPhone(data.phone_number);
        setIsVerified(data.verified ?? false);
        setVerificationCode(data.verification_code);
      }
    };
    fetchLink();
  }, [userId]);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "BRAVE-";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const getCleanPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return digits.startsWith("55") ? digits : `55${digits}`;
  };

  const handleStartLink = async () => {
    if (!userId) return;
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 10) {
      toast({ title: "Número inválido", description: "Digite um número com DDD.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const code = generateCode();
    const fullPhone = getCleanPhone(phoneNumber);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    // Upsert link
    const { error } = await supabase
      .from("whatsapp_links")
      .upsert({
        user_id: userId,
        phone_number: fullPhone,
        verification_code: code,
        verified: false,
        expires_at: expiresAt,
      }, { onConflict: "user_id" });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setVerificationCode(code);
      setLinkedPhone(fullPhone);
      setIsVerified(false);
      toast({ title: "Código gerado!", description: `Envie "${code}" para o nosso WhatsApp.` });
    }
    setLoading(false);
  };

  const handleCheckVerification = async () => {
    if (!userId) return;
    setChecking(true);
    const { data } = await supabase
      .from("whatsapp_links")
      .select("verified")
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.verified) {
      setIsVerified(true);
      toast({ title: "WhatsApp vinculado!", description: "Seu número foi verificado com sucesso." });
    } else {
      toast({ title: "Ainda não verificado", description: "Envie o código para nosso WhatsApp e tente novamente.", variant: "destructive" });
    }
    setChecking(false);
  };

  const handleUnlink = async () => {
    if (!userId) return;
    setUnlinking(true);
    await supabase.from("whatsapp_links").delete().eq("user_id", userId);
    setLinkedPhone(null);
    setVerificationCode(null);
    setIsVerified(false);
    setPhoneNumber("");
    toast({ title: "WhatsApp desvinculado" });
    setUnlinking(false);
  };

  const copyCode = () => {
    if (verificationCode) {
      navigator.clipboard.writeText(verificationCode);
      toast({ title: "Código copiado!" });
    }
  };

  const openWhatsApp = () => {
    const msg = encodeURIComponent(verificationCode || "");
    window.open(`https://wa.me/${NOX_PHONE}?text=${msg}`, "_blank");
  };

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
            <p className="text-xs text-muted-foreground">Vincule seu número ao Brave Assessor</p>
          </div>
        </div>
        {isVerified && (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Vinculado
          </Badge>
        )}
      </div>

      {/* Verified / linked state */}
      {isVerified && linkedPhone && (
        <div className="space-y-4">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center">
                <Phone className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-sm">Número vinculado</p>
                <p className="text-xs text-muted-foreground font-mono">
                  📞 {linkedPhone.replace(/(\d{2})(\d{2})(\d{4,5})(\d{4})/, "+$1 ($2) $3-$4")}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Envie mensagens para <strong>{NOX_PHONE_DISPLAY}</strong> para registrar transações pelo WhatsApp.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnlink}
            disabled={unlinking}
            className="w-full gap-1.5 text-destructive hover:text-destructive"
          >
            <Unlink className="h-3.5 w-3.5" />
            {unlinking ? "Desvinculando..." : "Desvincular número"}
          </Button>
        </div>
      )}

      {/* Pending verification — code generated */}
      {!isVerified && verificationCode && linkedPhone && (
        <div className="space-y-4">
          <div className="bg-accent/50 border border-border rounded-xl p-5 text-center space-y-3">
            <p className="text-sm font-medium text-foreground">Seu código de verificação:</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-bold tracking-widest text-primary font-mono">
                {verificationCode}
              </span>
              <Button variant="ghost" size="sm" onClick={copyCode} className="h-8 w-8 p-0">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Envie este código para o número abaixo no WhatsApp:
            </p>
            <Button
              onClick={openWhatsApp}
              className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
            >
              <MessageSquare className="h-4 w-4" />
              Enviar para {NOX_PHONE_DISPLAY}
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={handleCheckVerification}
            disabled={checking}
            className="w-full gap-2"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {checking ? "Verificando..." : "Já enviei o código"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setVerificationCode(null); setLinkedPhone(null); }}
            className="w-full text-muted-foreground"
          >
            Cancelar
          </Button>
        </div>
      )}

      {/* Initial state — enter phone */}
      {!isVerified && !verificationCode && (
        <div className="space-y-4">
          <div className="bg-accent/50 border border-border rounded-xl p-5 text-center">
            <Phone className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-semibold text-foreground text-sm">Vincule seu WhatsApp</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Registre transações enviando mensagens de texto para o nosso assistente.
            </p>

            <div className="space-y-3 text-left">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Seu número com DDD</label>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(formatPhoneInput(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="mt-1"
                  maxLength={16}
                />
              </div>
              <Button
                onClick={handleStartLink}
                disabled={loading || phoneNumber.replace(/\D/g, "").length < 10}
                className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                {loading ? "Gerando código..." : "Gerar código de verificação"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
