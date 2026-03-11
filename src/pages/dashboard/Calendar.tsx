import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, CalendarDays, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths,
  eachDayOfInterval, getDay, isSameDay, isSameMonth, isToday, parseISO, isBefore,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function FinancialCalendar() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startStr = format(monthStart, "yyyy-MM-dd");
  const endStr = format(monthEnd, "yyyy-MM-dd");

  const { data: transactions = [] } = useQuery({
    queryKey: ["calendar-transactions", user?.id, startStr, endStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("*, categories(name)")
        .or(`date.gte.${startStr},due_date.gte.${startStr}`)
        .or(`date.lte.${endStr},due_date.lte.${endStr}`)
        .order("date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: reminders = [] } = useQuery({
    queryKey: ["calendar-reminders", user?.id, startStr, endStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .gte("event_at", startStr)
        .lte("event_at", endStr + "T23:59:59")
        .eq("is_active", true)
        .order("event_at");
      return data || [];
    },
    enabled: !!user,
  });

  // Build daily map
  const dailyData = useMemo(() => {
    const map: Record<string, { income: number; expense: number; unpaid: number; items: any[] }> = {};

    const getOrCreate = (dateStr: string) => {
      if (!map[dateStr]) map[dateStr] = { income: 0, expense: 0, unpaid: 0, items: [] };
      return map[dateStr];
    };

    transactions.forEach(t => {
      // Use due_date if available, otherwise date
      const dateStr = t.due_date || t.date;
      if (!dateStr) return;
      const day = getOrCreate(dateStr);
      const amount = Number(t.amount);
      if (t.type === "income") day.income += amount;
      else day.expense += amount;
      if (!t.is_paid) day.unpaid += amount;
      day.items.push({ ...t, _type: "transaction" });
    });

    reminders.forEach(r => {
      const dateStr = r.event_at.slice(0, 10);
      const day = getOrCreate(dateStr);
      day.items.push({ ...r, _type: "reminder" });
    });

    return map;
  }, [transactions, reminders]);

  // Calendar grid
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Monday = 0, Sunday = 6
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7;
  const paddingDays = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const selectedDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayData = selectedDateStr ? dailyData[selectedDateStr] : null;

  // Monthly totals
  const monthTotals = useMemo(() => {
    let income = 0, expense = 0, unpaid = 0;
    Object.values(dailyData).forEach(d => {
      income += d.income;
      expense += d.expense;
      unpaid += d.unpaid;
    });
    return { income, expense, unpaid };
  }, [dailyData]);

  return (
    <div className="space-y-3 md:space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 md:h-6 md:w-6 text-primary" />
          <h1 className="text-lg md:text-2xl font-bold text-foreground">Calendário Financeiro</h1>
        </div>
        <p className="text-muted-foreground text-xs md:text-sm">Visualize suas finanças no calendário</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="p-2.5 md:p-4 flex items-center gap-2 md:gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] md:text-xs text-muted-foreground">Receitas</p>
            <p className="font-bold text-xs md:text-sm text-emerald-600 truncate">{fmt(monthTotals.income)}</p>
          </div>
        </Card>
        <Card className="p-2.5 md:p-4 flex items-center gap-2 md:gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
            <TrendingDown className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] md:text-xs text-muted-foreground">Despesas</p>
            <p className="font-bold text-xs md:text-sm text-destructive truncate">{fmt(monthTotals.expense)}</p>
          </div>
        </Card>
        <Card className="p-2.5 md:p-4 flex items-center gap-2 md:gap-3">
          <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] md:text-xs text-muted-foreground">Pendente</p>
            <p className="font-bold text-xs md:text-sm text-amber-600 truncate">{fmt(monthTotals.unpaid)}</p>
          </div>
        </Card>
      </div>

      {/* Calendar */}
      <Card className="p-3 md:p-5">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setCurrentMonth(d => subMonths(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-bold text-foreground text-sm md:text-lg">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR }).replace(/^./, c => c.toUpperCase())}
          </h2>
          <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" onClick={() => setCurrentMonth(d => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map(w => (
            <div key={w} className="text-center text-[10px] md:text-xs font-medium text-muted-foreground py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {paddingDays.map(i => <div key={`pad-${i}`} />)}
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const data = dailyData[dateStr];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);
            const hasExpense = data && data.expense > 0;
            const hasIncome = data && data.income > 0;
            const hasUnpaid = data && data.unpaid > 0;
            const isPast = isBefore(day, today) && !isTodayDate;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs md:text-sm transition-all ${
                  isSelected
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background"
                    : isTodayDate
                    ? "bg-primary/10 text-primary font-bold"
                    : isPast
                    ? "text-muted-foreground/60 hover:bg-muted/50"
                    : "text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="text-[11px] md:text-sm">{format(day, "d")}</span>
                {data && (
                  <div className="flex gap-0.5 mt-0.5">
                    {hasIncome && <div className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-emerald-500" />}
                    {hasExpense && <div className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-destructive" />}
                    {hasUnpaid && !hasExpense && <div className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-amber-500" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500" /> Receita
          </div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-destructive" /> Despesa
          </div>
          <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-amber-500" /> Pendente
          </div>
        </div>
      </Card>

      {/* Selected Day Details */}
      {selectedDate && (
        <Card className="p-4 md:p-5">
          <h3 className="font-bold text-foreground text-sm mb-3">
            {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
          </h3>
          {!selectedDayData || selectedDayData.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação neste dia</p>
          ) : (
            <div className="space-y-2">
              {selectedDayData.items.map((item: any, idx: number) => {
                if (item._type === "reminder") {
                  return (
                    <div key={`r-${idx}`} className="flex items-center gap-2.5 py-2 border-b border-border last:border-0">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs md:text-sm font-medium text-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">Lembrete</p>
                      </div>
                    </div>
                  );
                }
                const isIncome = item.type === "income";
                const isPaid = item.is_paid;
                const isOverdue = !isPaid && item.due_date && isBefore(parseISO(item.due_date), today);
                return (
                  <div key={`t-${idx}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        isPaid ? "bg-emerald-100 dark:bg-emerald-900/30" :
                        isOverdue ? "bg-destructive/10" :
                        isIncome ? "bg-emerald-500/10" : "bg-muted"
                      }`}>
                        {isPaid ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> :
                         isOverdue ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> :
                         isIncome ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> :
                         <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs md:text-sm font-medium text-foreground truncate">{item.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.categories?.name || "Sem categoria"}
                          {isPaid ? " · Pago" : isOverdue ? " · Vencida" : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs md:text-sm font-bold shrink-0 ${
                      isIncome ? "text-emerald-500" : isPaid ? "text-foreground" : "text-destructive"
                    }`}>
                      {isIncome ? "+" : "-"}{fmt(Number(item.amount))}
                    </span>
                  </div>
                );
              })}

              {/* Day totals */}
              <div className="flex items-center justify-between pt-2 mt-1">
                {selectedDayData.income > 0 && (
                  <span className="text-xs text-emerald-500 font-semibold">+{fmt(selectedDayData.income)}</span>
                )}
                {selectedDayData.expense > 0 && (
                  <span className="text-xs text-destructive font-semibold">-{fmt(selectedDayData.expense)}</span>
                )}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
