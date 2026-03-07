import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Share, PlusSquare, MoreVertical, Download,
  Smartphone, CheckCircle2, ArrowRight, Chrome, Globe,
} from "lucide-react";
import { Link } from "react-router-dom";

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const stagger = { visible: { transition: { staggerChildren: 0.08 } } };

const iphoneSteps = [
  { icon: <Globe className="w-5 h-5 text-primary" />, title: "Abra no Safari", desc: "Este site precisa estar aberto no Safari." },
  { icon: <Share className="w-5 h-5 text-primary" />, title: "Toque em Compartilhar", desc: "Ícone ⬆ na barra inferior do Safari.", highlight: "⬆" },
  { icon: <PlusSquare className="w-5 h-5 text-primary" />, title: "Adicionar à Tela de Início", desc: "Role as opções e toque nessa opção." },
  { icon: <CheckCircle2 className="w-5 h-5 text-primary" />, title: "Confirme", desc: 'Toque em "Adicionar". Pronto!' },
];

const androidSteps = [
  { icon: <Chrome className="w-5 h-5 text-primary" />, title: "Abra no Chrome", desc: "Acesse este site pelo Google Chrome." },
  { icon: <MoreVertical className="w-5 h-5 text-primary" />, title: "Menu ⋮", desc: "Toque nos 3 pontinhos no canto superior direito.", highlight: "⋮" },
  { icon: <Download className="w-5 h-5 text-primary" />, title: "Instalar aplicativo", desc: 'Toque em "Instalar aplicativo" ou "Adicionar à tela inicial".' },
  { icon: <CheckCircle2 className="w-5 h-5 text-primary" />, title: "Confirme", desc: "Toque em Instalar. Pronto!" },
];

export default function Install() {
  const [activeTab, setActiveTab] = useState<"iphone" | "android">(isIOS() ? "iphone" : "android");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const steps = activeTab === "iphone" ? iphoneSteps : androidSteps;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[30%] w-[500px] h-[500px] rounded-full bg-primary/8 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/60 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">B</span>
            </div>
            <span className="font-bold text-foreground">Brave</span>
          </Link>
          <Link to="/login">
            <Button variant="ghost" size="sm" className="text-xs">Entrar</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Hero */}
        <motion.div className="text-center mb-8" initial="hidden" animate="visible" variants={stagger}>
          <motion.div variants={fadeUp} className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-primary" />
            </div>
          </motion.div>
          <motion.h1 variants={fadeUp} className="text-2xl md:text-3xl font-bold mb-2">
            Instale o Brave
          </motion.h1>
          <motion.p variants={fadeUp} className="text-muted-foreground text-sm max-w-md mx-auto">
            Use como um app nativo, sem App Store ou Google Play.
          </motion.p>

          {/* Direct install button for Android */}
          {deferredPrompt && (
            <motion.div variants={fadeUp} className="mt-5">
              <Button size="lg" onClick={handleInstallClick} className="gap-2 rounded-xl">
                <Download className="w-5 h-5" />
                Instalar agora
              </Button>
            </motion.div>
          )}
        </motion.div>

        {/* Tab selector */}
        <div className="flex gap-1 mb-6 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
          {(["iphone", "android"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "iphone" ? "iPhone" : "Android"}
            </button>
          ))}
        </div>

        {/* Steps */}
        <motion.div key={activeTab} initial="hidden" animate="visible" variants={stagger} className="space-y-3 mb-10">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-primary/20 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {step.icon}
                  <span className="font-semibold text-sm text-foreground">{step.title}</span>
                  {step.highlight && (
                    <span className="ml-auto text-lg text-muted-foreground font-mono">{step.highlight}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-muted-foreground text-sm mb-3">Já tem conta?</p>
          <Link to="/login">
            <Button className="gap-2 rounded-xl">
              Entrar <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
