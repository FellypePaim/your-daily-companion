import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bell, Calendar, Clock, Repeat } from "lucide-react";
import { toast } from "sonner";

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

interface Props {
  reminder: Reminder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EditReminderDialog({ reminder, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const toLocalDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
  };
  const toLocalTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const [form, setForm] = useState({
    title: "",
    description: "",
    event_date: "",
    event_time: "",
    notify_minutes_before: "30",
    custom_notify_time: "",
    recurrence: "none",
  });

  useEffect(() => {
    if (reminder) {
      const isStandard = NOTIFY_OPTIONS.some(o => o.value === reminder.notify_minutes_before && o.value !== -1);
      const eventDate = new Date(reminder.event_at);
      let customTime = "";
      if (!isStandard) {
        const notifyAt = new Date(eventDate.getTime() - reminder.notify_minutes_before * 60000);
        customTime = `${String(notifyAt.getHours()).padStart(2, "0")}:${String(notifyAt.getMinutes()).padStart(2, "0")}`;
      }
      setForm({
        title: reminder.title,
        description: reminder.description || "",
        event_date: toLocalDate(reminder.event_at),
        event_time: toLocalTime(reminder.event_at),
        notify_minutes_before: isStandard ? String(reminder.notify_minutes_before) : "-1",
        custom_notify_time: customTime,
        recurrence: reminder.recurrence,
      });
    }
  }, [reminder]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!form.title || !form.event_date || !form.event_time) {
        throw new Error("Preencha todos os campos obrigatórios");
      }
      if (!reminder) throw new Error("Nenhum lembrete selecionado");

      const eventDate = new Date(`${form.event_date}T${form.event_time}`);
      let notifyMinutes = Number(form.notify_minutes_before);
      if (notifyMinutes === -1) {
        if (!form.custom_notify_time) throw new Error("Informe o horário da notificação");
        const notifyDate = new Date(`${form.event_date}T${form.custom_notify_time}`);
        notifyMinutes = Math.max(0, Math.round((eventDate.getTime() - notifyDate.getTime()) / 60000));
        if (notifyMinutes <= 0) throw new Error("O horário da notificação deve ser antes do evento");
      }
      const event_at = eventDate.toISOString();
      const { error } = await supabase.from("reminders").update({
        title: form.title,
        description: form.description || null,
        event_at,
        notify_minutes_before: notifyMinutes,
        recurrence: form.recurrence,
        is_sent: false,
      }).eq("id", reminder.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminders"] });
      onOpenChange(false);
      toast.success("Lembrete atualizado com sucesso!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Editar Lembrete
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
              <Bell className="h-3.5 w-3.5" /> Receber Aviso no WhatsApp *
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
