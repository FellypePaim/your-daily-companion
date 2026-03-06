import { useState } from "react";
import {
  LayoutDashboard, Wallet, CalendarCheck, Sparkles, MoreHorizontal,
  CreditCard, Tag, Target, TrendingUp, Brain, FileText,
  HeadphonesIcon, Settings, X, Users, Bell, ShieldCheck, ArrowLeftRight, Trophy,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const tabs = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Início", end: true },
  { to: "/dashboard/transactions", icon: ArrowLeftRight, label: "Transações" },
  { to: "/dashboard/bills", icon: CalendarCheck, label: "Contas" },
  { to: "/dashboard/brave-ia", icon: Sparkles, label: "Brave IA" },
];

const moreItems = [
  { to: "/dashboard/wallets", icon: Wallet, label: "Carteira" },
  { to: "/dashboard/cards", icon: CreditCard, label: "Cartões" },
  { to: "/dashboard/budgets", icon: Tag, label: "Categorias" },
  { to: "/dashboard/reminders", icon: Bell, label: "Lembretes", badge: true },
  { to: "/dashboard/goals", icon: Target, label: "Metas" },
  { to: "/dashboard/investments", icon: TrendingUp, label: "Investimentos" },
  { to: "/dashboard/family", icon: Users, label: "Família" },
  { to: "/dashboard/gamification", icon: Trophy, label: "Gamificação" },
  { to: "/dashboard/behavior", icon: Brain, label: "Comportamento" },
  { to: "/dashboard/reports", icon: FileText, label: "Relatórios" },
  { to: "/dashboard/chat", icon: HeadphonesIcon, label: "Suporte" },
  { to: "/dashboard/settings", icon: Settings, label: "Configurações" },
];

const adminItems = [
  { to: "/dashboard/admin/support", icon: HeadphonesIcon, label: "Atendimentos" },
  { to: "/dashboard/admin/users", icon: Users, label: "Usuários" },
];

export function MobileBottomNav() {
  const [showMore, setShowMore] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();

  const { data: reminderCount = 0 } = useQuery({
    queryKey: ["reminders-count", user?.id],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { count } = await supabase
        .from("reminders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .gte("event_at", now);
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  return (
    <>
      {/* More menu overlay */}
      <AnimatePresence>
        {showMore && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
              onClick={() => setShowMore(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
              className="md:hidden fixed bottom-0 left-0 right-0 z-[70] bg-background rounded-t-3xl border-t border-border p-4 pb-6"
            >
              <div className="flex items-center justify-between mb-4 px-1">
                <span className="font-semibold text-foreground text-base">Mais opções</span>
                <button
                  onClick={() => setShowMore(false)}
                  className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {moreItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setShowMore(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all relative",
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                      )
                    }
                  >
                    <div className="relative">
                      <item.icon className="h-5 w-5" />
                      {item.badge && reminderCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                          {reminderCount > 9 ? "9+" : reminderCount}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium leading-tight text-center">{item.label}</span>
                  </NavLink>
                ))}
              </div>

              {/* Admin section */}
              {isAdmin && (
                <>
                  <div className="flex items-center gap-2 mt-4 mb-2 px-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Admin</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {adminItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setShowMore(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all relative",
                            isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                          )
                        }
                      >
                        <item.icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium leading-tight text-center">{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg">
        <div className="flex items-center justify-around h-16 px-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[56px]",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    "flex items-center justify-center w-10 h-8 rounded-full transition-all",
                    isActive && "bg-primary/10 scale-110"
                  )}>
                    <tab.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
                  </div>
                  <span className={cn(
                    "text-[10px] leading-tight font-medium",
                    isActive && "font-semibold"
                  )}>
                    {tab.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[56px] text-muted-foreground"
            )}
          >
            <div className="flex items-center justify-center w-10 h-8 rounded-full relative">
              <MoreHorizontal className="h-5 w-5" />
              {reminderCount > 0 && (
                <span className="absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center leading-none">
                  {reminderCount > 9 ? "9+" : reminderCount}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight font-medium">Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
