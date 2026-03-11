import { useState } from "react";
import { Bell, BellOff, BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useToast } from "@/hooks/use-toast";

export default function PushNotificationToggle() {
  const { supported, permission, requestPermission, sendLocalNotification } = usePushNotifications();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!supported) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BellOff className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Notificações Push</p>
            <p className="text-xs text-muted-foreground">Não suportado neste navegador</p>
          </div>
        </div>
        <Switch disabled checked={false} />
      </div>
    );
  }

  const isGranted = permission === "granted";
  const isDenied = permission === "denied";

  const handleToggle = async () => {
    if (isGranted) {
      toast({
        title: "Notificações ativas",
        description: "Para desativar, altere nas configurações do navegador.",
      });
      return;
    }

    if (isDenied) {
      toast({
        title: "Notificações bloqueadas",
        description: "Acesse as configurações do navegador para permitir notificações.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const granted = await requestPermission();
    setLoading(false);

    if (granted) {
      toast({ title: "Notificações ativadas! 🔔" });
      setTimeout(() => {
        sendLocalNotification("Brave Assessor 🔔", {
          body: "Notificações ativadas com sucesso! Você receberá lembretes de contas e alertas financeiros.",
          tag: "welcome-notification",
        });
      }, 1000);
    } else {
      toast({
        title: "Permissão negada",
        description: "Você pode ativar depois nas configurações do navegador.",
        variant: "destructive",
      });
    }
  };

  const handleTestNotification = () => {
    sendLocalNotification("🧪 Teste de Notificação", {
      body: "Se você está vendo isso, as notificações estão funcionando perfeitamente!",
      tag: "test-notification",
    });
    toast({ title: "Notificação de teste enviada!" });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isGranted ? (
            <BellRing className="h-4 w-4 text-primary" />
          ) : (
            <Bell className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">Notificações Push</p>
            <p className="text-xs text-muted-foreground">
              {isGranted
                ? "Ativadas — você receberá lembretes"
                : isDenied
                ? "Bloqueadas pelo navegador"
                : "Receba lembretes de contas e alertas"}
            </p>
          </div>
        </div>
        <Switch
          checked={isGranted}
          onCheckedChange={handleToggle}
          disabled={loading || isDenied}
        />
      </div>
      {isGranted && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-full text-xs gap-1.5 ml-7"
          onClick={handleTestNotification}
        >
          <Send className="h-3 w-3" />
          Testar notificação
        </Button>
      )}
    </div>
  );
}
