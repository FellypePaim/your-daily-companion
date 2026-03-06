import braveLogoImg from "@/assets/brave-logo-cropped.png";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { AnimatedOutlet } from "@/components/AnimatedOutlet";
import { Moon, Sun } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import PlanExpiredModal from "@/components/PlanExpiredModal";
import WhatsAppBanner from "@/components/WhatsAppBanner";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import TestPlanBanner from "@/components/TestPlanBanner";
import { useGamification } from "@/hooks/useGamification";
import { AchievementPopup, LevelUpPopup } from "@/components/AchievementPopup";

export default function DashboardLayout() {
  const {
    pendingAchievement, clearPendingAchievement,
    pendingLevelUp, clearPendingLevelUp,
  } = useGamification();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar - hidden on mobile */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-background shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="hidden md:flex" />
              <img src={braveLogoImg} alt="Brave Assessor" className="md:hidden h-9 w-auto object-contain" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDark(!dark)}
              className="text-muted-foreground hover:text-foreground"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </header>
          <TestPlanBanner />
          <WhatsAppBanner />
          <PWAInstallBanner />
          <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">
            <AnimatedOutlet />
          </main>
        </div>

        {/* Mobile bottom nav */}
        <MobileBottomNav />

        {/* Plan expired modal — shown globally over all dashboard pages */}
        <PlanExpiredModal />
        <AchievementPopup achievement={pendingAchievement} onClose={clearPendingAchievement} />
        <LevelUpPopup level={pendingLevelUp?.level || null} title={pendingLevelUp?.title || ""} onClose={clearPendingLevelUp} />
      </div>
    </SidebarProvider>
  );
}

