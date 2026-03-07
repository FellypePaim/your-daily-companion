import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bell, Plus, Trash2, Clock, Calendar, CheckCircle2, BellOff, Repeat, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EditReminderDialog } from "@/components/EditReminderDialog";

type FilterTab = "todos" | "pontuais" | "recorrentes";

interface Reminder {
  id: string;
  title: string;
  description: string | null;
  event_at: string;
  notify_minutes_before: number;
  is_sent: boolean;
  is_active: boolean;
  recurrence: "none" | "daily" | "weekly" | "monthly";
  created_at: string;
}

const NOTIFY_OPTIONS = [
  { label: "5 minutos antes", value: 5 },
  { label: "10 minutos antes", value: 10 },
  { label: "15 minutos antes", value: 15 },
  { label: "30 minutos antes", value: 30 },
  { label: "1 hora antes", value: 60 },
  { label: "2 horas antes", value: 120 },
  { label: "3 horas antes", value: 180 },
  { label: "6 horas antes", value: 360 },
  { label: "12 horas antes", value: 720 },
  { label: "1 dia antes", value: 1440 },
  { label: "Horário exato (personalizado)", value: -1 },
];

const RECURRENCE_OPTIONS = [
  { label: "Não repetir", value: "none" },
  { label: "Diário", value: "daily" },
  { label: "Semanal", value: "weekly" },
  { label: "Mensal", value: "monthly" },
];

const RECURRENCE_LABELS: Record<string, string> = {
  none: "",
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

function formatNotify(minutes: number) {
  if (minutes < 60) return `${minutes} min antes`;
  if (minutes < 1440) return `${minutes / 60}h antes`;
  return `${minutes / 1440} dia antes`;
}

export default function Reminders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editReminder, setEditReminder] = useState<Reminder | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("todos");

  const [form, setForm] = useState({
    title: "",
    description: "",
    event_date: "",
    event_time: "",
    notify_minutes_before: "30",
    custom_notify_time: "",
    recurrence: "none",
  });

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["reminders", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", user!.id)
        .order("event_at", { ascending: true });
      if (error) throw error;
      return data as Reminder[];
    },
    enabled: !!user,
  });

  const { data: whatsappLinked } = useQuery({
    queryKey: ["whatsapp-linked", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_links")
        .select("phone_number, verified")
        .eq("user_id", user!.id)
        .eq("verified", true)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.title || !form.event_date || !form.event_time) {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      const eventDate = new Date(`${form.event_date}T${form.event_time}`);
      let notifyMinutes = Number(form.notify_minutes_before);
      if (notifyMinutes === -1) {
        if (!form.custom_notify_time) throw new Error("Informe o horário da notificação");
        const notifyDate = new Date(`${form.event_date}T${form.custom_notify_time}`);
        notifyMinutes = Math.max(0, Math.round((eventDate.getTime() - notifyDate.getTime()) / 60000));
        if (notifyMinutes <= 0) throw new Error("O horário da notificação deve ser antes do evento");
      }
      const event_at = eventDate.toISOString();
      const { error } = await supabase.from("reminders").insert({
        user_id: user!.id,
        title: form.title,
        description: form.description || null,
        event_at,
        notify_minutes_before: notifyMinutes,
        recurrence: form.recurrence,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      setOpen(false);
      setForm({ title: "", description: "", event_date: "", event_time: "", notify_minutes_before: "30", custom_notify_time: "", recurrence: "none" });
      toast.success("Lembrete criado! Você receberá uma notificação no WhatsApp.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reminders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Lembrete removido.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("reminders").update({ is_active, is_sent: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const recurring = reminders.filter(r => r.recurrence !== "none");
  const oneTime = reminders.filter(r => r.recurrence === "none");

  const filteredReminders = (() => {
    let base = reminders;
    if (activeTab === "recorrentes") base = recurring;
    if (activeTab === "pontuais") base = oneTime;
    return base;
  })();

  const upcoming = filteredReminders.filter(r => (r.recurrence !== "none" || !isPast(new Date(r.event_at))) && r.is_active);
  const past = filteredReminders.filter(r => r.recurrence === "none" && (isPast(new Date(r.event_at)) || !r.is_active));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lembretes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Receba notificações no WhatsApp antes dos seus compromissos
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Lembrete
        </Button>
      </div>

      {/* Filter tabs */}
      {reminders.length > 0 && (
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          {([
            { key: "todos", label: "Todos", count: reminders.length },
            { key: "recorrentes", label: "Recorrentes", count: recurring.length, icon: <Repeat className="h-3.5 w-3.5" /> },
            { key: "pontuais", label: "Pontuais", count: oneTime.length },
          ] as { key: FilterTab; label: string; count: number; icon?: React.ReactNode }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={[
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  activeTab === tab.key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                ].join(" ")}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* WhatsApp status banner */}
      {!whatsappLinked && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-muted text-muted-foreground">
          <Bell className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">WhatsApp não vinculado.</span> Vincule seu WhatsApp nas{" "}
            <a href="/dashboard/settings" className="underline font-medium">Configurações</a> para receber notificações dos lembretes.
          </div>
        </div>
      )}

      {/* WhatsApp tip */}
      {whatsappLinked && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/50">
          <Bell className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p className="text-xs text-muted-foreground">
            💡 <span className="font-medium">Dica:</span> Você também pode criar lembretes pelo WhatsApp! Envie uma mensagem como{" "}
            <span className="font-mono bg-background px-1 rounded text-foreground">lembrete: reunião amanhã 15h</span>
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : reminders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Nenhum lembrete ainda</p>
            <p className="text-muted-foreground text-sm">Crie seu primeiro lembrete e receba no WhatsApp</p>
          </div>
          <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" /> Criar Lembrete
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Próximos ({upcoming.length})
              </h2>
              {upcoming.map(r => (
                <ReminderCard
                  key={r.id}
                  reminder={r}
                  onDelete={() => setDeleteId(r.id)}
                  onToggle={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}
                  onEdit={() => setEditReminder(r)}
                />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Passados / Inativos ({past.length})
              </h2>
              {past.map(r => (
                <ReminderCard
                  key={r.id}
                  reminder={r}
                  past
                  onDelete={() => setDeleteId(r.id)}
                  onToggle={() => toggleMutation.mutate({ id: r.id, is_active: !r.is_active })}
                  onEdit={() => setEditReminder(r)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Novo Lembrete
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome do Lembrete *</Label>
              <Input
                placeholder="Ex: Reunião Escolar, Consulta Médica..."
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Detalhes sobre o evento..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Data do Evento *
                </Label>
                <Input
                  type="date"
                  value={form.event_date}
                  onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Horário *
                </Label>
                <Input
                  type="time"
                  value={form.event_time}
                  onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" /> Receber Lembrete no WhatsApp *
              </Label>
              <Select
                value={form.notify_minutes_before}
                onValueChange={v => setForm(f => ({ ...f, notify_minutes_before: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTIFY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.notify_minutes_before === "-1" && (
                <div className="space-y-1.5 mt-2">
                  <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> Horário exato da notificação
                  </Label>
                  <Input
                    type="time"
                    value={form.custom_notify_time}
                    onChange={e => setForm(f => ({ ...f, custom_notify_time: e.target.value }))}
                    placeholder="Ex: 14:00"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Será enviado neste horário no mesmo dia do evento
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Repeat className="h-3.5 w-3.5" /> Repetição
              </Label>
              <Select
                value={form.recurrence}
                onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Criar Lembrete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lembrete?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteMutation.mutate(deleteId!); setDeleteId(null); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      <EditReminderDialog
        reminder={editReminder}
        open={!!editReminder}
        onOpenChange={o => !o && setEditReminder(null)}
      />
    </div>
  );
}

function ReminderCard({
  reminder, past, onDelete, onToggle, onEdit
}: {
  reminder: Reminder;
  past?: boolean;
  onDelete: () => void;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const eventDate = new Date(reminder.event_at);
  const notifyLabel = formatNotify(reminder.notify_minutes_before);
  const recurrenceLabel = RECURRENCE_LABELS[reminder.recurrence];

  return (
    <Card className={past ? "opacity-60" : ""}>
      <CardContent className="p-4 flex items-start gap-4">
        <div className={[
          "mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
          past ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        ].join(" ")}>
          {reminder.is_sent && reminder.recurrence === "none"
            ? <CheckCircle2 className="h-5 w-5" />
            : reminder.recurrence !== "none"
            ? <Repeat className="h-5 w-5" />
            : <Bell className="h-5 w-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">{reminder.title}</span>
            {reminder.is_sent && reminder.recurrence === "none" && (
              <Badge variant="secondary" className="text-[10px]">Enviado ✓</Badge>
            )}
            {recurrenceLabel && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <Repeat className="h-2.5 w-2.5" />{recurrenceLabel}
              </Badge>
            )}
            {!reminder.is_active && (
              <Badge variant="outline" className="text-muted-foreground text-[10px]">Inativo</Badge>
            )}
          </div>
          {reminder.description && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{reminder.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(eventDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            <span className="flex items-center gap-1">
              <Bell className="h-3 w-3" />
              {notifyLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={onEdit}
            title="Editar"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            title={reminder.is_active ? "Desativar" : "Ativar"}
          >
            {reminder.is_active ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
