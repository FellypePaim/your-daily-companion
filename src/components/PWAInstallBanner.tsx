import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Download, X } from "lucide-react";

const STORAGE_KEY = "pwa-banner-dismissed";

function useIsPWA() {
  const [isPWA, setIsPWA] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsPWA(standalone);
  }, []);
  return isPWA;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export default function PWAInstallBanner() {
  const navigate = useNavigate();
  const isPWA = useIsPWA();
  const [dismissed, setDismissed] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") {
      setDismissed(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (isIOS()) {
      navigate("/install");
      return;
    }

    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      await deferredPromptRef.current.userChoice;
      deferredPromptRef.current = null;
    } else {
      // Fallback if prompt not available
      navigate("/install");
    }
  };

  if (isPWA || dismissed) return null;

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors group relative"
    >
      <Download className="h-3 w-3" />
      <span className="hidden sm:inline">Instalar App</span>
      <span className="sm:hidden">Instalar</span>
      <span
        onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        className="ml-0.5 text-muted-foreground hover:text-foreground"
        aria-label="Fechar"
      >
        <X className="h-3 w-3" />
      </span>
    </button>
  );
}
