import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Crown, Zap, Star, CheckCircle2, Lock, MessageSquare, Clock, LogOut, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const NOX_PHONE = "5537999385148";
const NOX_PHONE_DISPLAY = "(37) 9 9938-5148";

const PLANS = [
  {
    key: "teste",
    name: "Plano Teste",
    price: "Grátis",
    period: "10 minutos",
    description: "Acesso imediato e gratuito",
    icon: Clock,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    features: [
      "Acesso completo por 10 minutos",
      "Todas as funcionalidades do Mensal",
      "Ativação automática e instantânea",
    ],
  },
  {
    key: "mensal",
    name: "Brave Mensal",
    price: "R$ 19,90",
    period: "/mês",
    description: "Ideal para começar",
    icon: Zap,
    color: "text-secondary-foreground",
    bg: "bg-secondary",
    border: "border-secondary",
    features: [
      "WhatsApp conectado",
      "Cartões de crédito",
      "Orçamentos por categoria",
      "Relatórios detalhados",
      "Previsões com IA",
    ],
  },
  {
    key: "anual",
    name: "Brave Anual",
    price: "R$ 14,90",
    period: "/mês · 12x",
    description: "Melhor custo-benefício",
    icon: Star,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/40",
    badge: "Mais Popular",
    features: [
      "Tudo do plano Mensal",
      "Modo Família (5 pessoas)",
      "Análise comportamental",
      "Acesso prioritário a novidades",
    ],
  },
];

export default function PlanGate() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [planInfo, setPlanInfo] = useState<{ plan: string; name: string; alreadyUsedTest: boolean; cpfCnpj: string | null } | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchPlan = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_expires_at, display_name, cpf_cnpj")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        const expired =
          data.subscription_expires_at &&
          new Date(data.subscription_expires_at) < new Date();
        const alreadyUsedTest = data.subscription_plan === "teste" || (expired && data.subscription_plan !== "free");
        if (data.subscription_plan !== "free" && expired) {
          setPlanInfo({ plan: "expired", name: data.display_name || "usuário", alreadyUsedTest: true, cpfCnpj: (data as any).cpf_cnpj });
        } else {
          setPlanInfo({ plan: data.subscription_plan, name: data.display_name || "usuário", alreadyUsedTest, cpfCnpj: (data as any).cpf_cnpj });
        }
      }
    };
    fetchPlan();
  }, [user]);

  const handleActivateTest = async () => {
    if (!user) return;
    setLoadingPlan("teste");
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({ subscription_plan: "teste" as any, subscription_expires_at: expiresAt })
        .eq("id", user.id);
      if (error) throw error;
      toast({ title: "Plano Teste ativado!", description: "Você tem 10 minutos de acesso completo." });
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast({ title: "Erro ao ativar plano", description: err.message, variant: "destructive" });
      setLoadingPlan(null);
    }
  };

  const handleCheckout = async (plan: "mensal" | "anual") => {
    setLoadingPlan(plan);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { plan, cpfCnpj: planInfo?.cpfCnpj || undefined },
      });
      if (error || !data?.url) throw new Error(error?.message || "Erro ao criar sessão de pagamento");
      window.location.href = data.url;
    } catch (err: any) {
      toast({
        title: "Erro ao processar pagamento",
        description: err.message,
        variant: "destructive",
      });
      setLoadingPlan(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const isExpired = planInfo?.plan === "expired";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg text-foreground">Brave Assessor</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
              {isExpired ? (
                <Lock className="h-8 w-8 text-destructive" />
              ) : (
                <Crown className="h-8 w-8 text-primary" />
              )}
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mb-2">
              {isExpired ? "Seu plano expirou" : "Escolha seu plano"}
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              {isExpired
                ? `Olá${planInfo?.name ? `, ${planInfo.name}` : ""}! Seu plano chegou ao fim. Renove para continuar acessando o Brave Assessor.`
                : `Olá${planInfo?.name ? `, ${planInfo.name}` : ""}! Assine agora e tenha acesso completo ao Brave Assessor. Pagamento 100% seguro via PIX, boleto ou cartão.`}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
            {PLANS.map((p) => {
              const PlanIcon = p.icon;
              return (
                <div
                  key={p.key}
                  className={`relative rounded-2xl border-2 p-5 flex flex-col ${p.border} bg-card`}
                >
                  {p.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold bg-primary text-primary-foreground px-3 py-0.5 rounded-full whitespace-nowrap">
                      {p.badge}
                    </span>
                  )}
                  <div className={`h-10 w-10 rounded-xl ${p.bg} flex items-center justify-center mb-3`}>
                    <PlanIcon className={`h-5 w-5 ${p.color}`} />
                  </div>
                  <p className="font-bold text-foreground text-base">{p.name}</p>
                  <p className="text-xs text-muted-foreground mb-3">{p.description}</p>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-extrabold text-foreground">{p.price}</span>
                    <span className="text-xs text-muted-foreground">{p.period}</span>
                  </div>
                  <div className="space-y-2 mb-5 flex-1">
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${p.color}`} />
                        <span className="text-foreground">{f}</span>
                      </div>
                    ))}
                  </div>
                  {p.key === "teste" ? (
                    <Button
                      size="sm"
                      className="w-full rounded-xl"
                      disabled={loadingPlan === "teste" || planInfo?.alreadyUsedTest}
                      onClick={handleActivateTest}
                    >
                      {loadingPlan === "teste" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Ativando…
                        </>
                      ) : planInfo?.alreadyUsedTest ? (
                        "Teste já utilizado"
                      ) : (
                        <>
                          <Zap className="h-3.5 w-3.5 mr-1.5" />
                          Ativar agora
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full rounded-xl"
                      disabled={loadingPlan === p.key}
                      onClick={() => handleCheckout(p.key as "mensal" | "anual")}
                    >
                      {loadingPlan === p.key ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Aguarde…
                        </>
                      ) : (
                        "Assinar agora"
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Tem dúvidas? Fale diretamente com nossa equipe no WhatsApp.
            </p>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.open(`https://wa.me/${NOX_PHONE}`, "_blank")}
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp · {NOX_PHONE_DISPLAY}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
