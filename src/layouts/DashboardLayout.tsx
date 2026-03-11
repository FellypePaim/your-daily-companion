import braveLogoImg from "@/assets/brave-logo-cropped.png";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { AnimatedOutlet } from "@/components/AnimatedOutlet";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlanExpiredModal from "@/components/PlanExpiredModal";
import WhatsAppBanner from "@/components/WhatsAppBanner";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import TestPlanBanner from "@/components/TestPlanBanner";
import { useGamification } from "@/hooks/useGamification";
import { AchievementPopup, LevelUpPopup } from "@/components/AchievementPopup";
import { GlassBackground } from "@/components/GlassBackground";
import { useTheme } from "next-themes";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";

export default function DashboardLayout() {
  const {
    pendingAchievement, clearPendingAchievement,
    pendingLevelUp, clearPendingLevelUp,
  } = useGamification();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  // Offline sync & realtime notifications
  useOfflineSync();
  useRealtimeNotifications();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background relative">
        {/* Ambient glass orbs */}
        <GlassBackground />

        {/* Sidebar - hidden on mobile */}
        <div className="hidden md:block relative z-10">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <header className="h-14 flex items-center justify-between px-4 bg-transparent shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground" />
              <img src={braveLogoImg} alt="Brave Assessor" className="md:hidden h-9 w-auto object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallBanner />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="text-muted-foreground hover:text-foreground"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </header>
          <TestPlanBanner />
          <WhatsAppBanner />
          <main className="flex-1 p-3 md:p-6 overflow-auto pb-20 md:pb-6">
            <AnimatedOutlet />
          </main>
        </div>

        {/* Mobile bottom nav */}
        <MobileBottomNav />

        {/* Plan expired modal */}
        <PlanExpiredModal />
        <AchievementPopup achievement={pendingAchievement} onClose={clearPendingAchievement} />
        <LevelUpPopup level={pendingLevelUp?.level || null} title={pendingLevelUp?.title || ""} onClose={clearPendingLevelUp} />
      </div>
    </SidebarProvider>
  );
}
