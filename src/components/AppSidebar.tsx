const braveLogoIcon = "/brave-icon.png";
import {
  LayoutDashboard, Wallet, Tag, CreditCard, CalendarCheck,
  Target, TrendingUp, Brain, FileText, HeadphonesIcon,
  Settings, LogOut, Sparkles, ShieldCheck, Users, Bell, ArrowLeftRight, Trophy,
  Flame
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";

import { useGamification } from "@/hooks/useGamification";

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário";
  const { xp, level, levelTitle, streak } = useGamification();

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

  const menuItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, badge: 0 },
    { title: "Carteira", url: "/dashboard/wallets", icon: Wallet, badge: 0 },
    { title: "Categorias", url: "/dashboard/budgets", icon: Tag, badge: 0 },
    { title: "Cartões", url: "/dashboard/cards", icon: CreditCard, badge: 0 },
    { title: "Transações", url: "/dashboard/transactions", icon: ArrowLeftRight, badge: 0 },
    { title: "Contas a Pagar", url: "/dashboard/bills", icon: CalendarCheck, badge: 0 },
    { title: "Lembretes", url: "/dashboard/reminders", icon: Bell, badge: reminderCount },
    { title: "Metas", url: "/dashboard/goals", icon: Target, badge: 0 },
    { title: "Investimentos", url: "/dashboard/investments", icon: TrendingUp, badge: 0 },
    { title: "Família", url: "/dashboard/family", icon: Users, badge: 0 },
    { title: "Gamificação", url: "/dashboard/gamification", icon: Trophy, badge: 0 },
    { title: "Comportamento", url: "/dashboard/behavior", icon: Brain, badge: 0 },
    { title: "Relatórios", url: "/dashboard/reports", icon: FileText, badge: 0 },
    { title: "Suporte", url: "/dashboard/chat", icon: HeadphonesIcon, badge: 0 },
    { title: "Configurações", url: "/dashboard/settings", icon: Settings, badge: 0 },
  ];

  const adminItems = [
    { title: "Atendimentos", url: "/dashboard/admin/support", icon: HeadphonesIcon },
    { title: "Usuários", url: "/dashboard/admin/users", icon: Users },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="glass-sidebar !border-r-0">
      <SidebarContent>
        {/* Logo */}
        <div className="px-4 pt-5 pb-2 group-data-[collapsible=icon]:px-2">
          <div className="flex items-center gap-3">
            <img
              src={braveLogoIcon}
              alt="Brave Assessor"
              className="h-14 w-14 rounded-xl object-contain shrink-0"
            />
            <div className="group-data-[collapsible=icon]:hidden">
              <span className="font-bold text-lg text-primary leading-none">Brave</span>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Assessor Financeiro</p>
            </div>
          </div>
        </div>

        {/* Brave IA Button */}
        <div className="px-3 py-2 group-data-[collapsible=icon]:px-1.5">
          <NavLink
            to="/dashboard/brave-ia"
            className="flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/15 px-4 py-3 text-primary hover:bg-primary/15 transition-all group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2 glow-primary-sm"
            activeClassName="bg-primary text-primary-foreground glow-primary"
          >
            <Sparkles className="h-5 w-5 shrink-0" />
            <div className="group-data-[collapsible=icon]:hidden">
              <span className="font-semibold text-sm leading-none">Brave IA</span>
              <p className="text-[11px] opacity-70 leading-tight">Seu assessor</p>
            </div>
          </NavLink>
        </div>

        {/* Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
                      className="flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                      activeClassName="text-primary font-medium bg-white/[0.06]"
                    >
                      <div className="relative shrink-0">
                        <item.icon className="h-4 w-4" />
                        {item.badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none glow-primary-sm">
                            {item.badge > 9 ? "9+" : item.badge}
                          </span>
                        )}
                      </div>
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Admin Menu */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs text-muted-foreground uppercase tracking-wider px-3">
              <ShieldCheck className="h-3.5 w-3.5 inline mr-1.5" />
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-3 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors"
                        activeClassName="text-primary font-medium bg-white/[0.06]"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-white/[0.06] p-2">
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          {/* Profile + Gamification row */}
          <button
            onClick={() => navigate("/dashboard/settings")}
            className="flex items-center gap-3 px-3 py-3 w-full text-left hover:bg-white/[0.04] transition-colors group-data-[collapsible=icon]:justify-center"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="group-data-[collapsible=icon]:hidden min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-primary font-semibold">Nv. {level || 1} · {levelTitle || "Iniciante"}</span>
                <span className="text-[10px] text-muted-foreground">{xp || 0} XP</span>
                <div className="flex items-center gap-0.5">
                  <Flame className="h-3 w-3 text-orange-500" />
                  <span className="text-[10px] font-semibold text-foreground">{streak || 0}</span>
                </div>
              </div>
            </div>
          </button>
          {/* Logout */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 w-full text-left text-muted-foreground hover:text-destructive hover:bg-white/[0.04] transition-colors border-t border-white/[0.04] group-data-[collapsible=icon]:justify-center"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="text-sm group-data-[collapsible=icon]:hidden">Sair</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
