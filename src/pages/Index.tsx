import { useState, useRef } from "react";
import QuizFunnel from "@/components/QuizFunnel";
import { AuthModal } from "@/components/AuthModal";
import SocialProofToast from "@/components/SocialProofToast";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import heroImage from "@/assets/hero-woman.jpg";
import benefitsImage from "@/assets/hero-benefits.jpg";
import braveLogoImg from "@/assets/brave-logo-cropped.png";
import {
  MessageSquare, Mic, Camera, Brain, CreditCard, Target, Wallet,
  Users, FileText, Bell, TrendingUp, ChevronRight, Star, Shield,
  Menu, X, CheckCircle2, Phone, ArrowRight, BarChart3, AlertTriangle,
  Eye, CalendarDays, Heart, TrendingUp as TrendingUpIcon, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

function BraveLogo({ size = 36 }: { size?: number }) {
  return (
    <img
      src={braveLogoImg}
      alt="Brave Assessor Logo"
      style={{ width: size, height: size, borderRadius: 10, objectFit: "cover" }}
    />
  );
}

const WHATSAPP_LINK = "https://wa.me/5537999385148?text=Quero%20começar%20a%20usar%20o%20Brave%20Assessor";

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut as unknown as [number, number, number, number] } },
};

const fadeScale = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: easeOut as unknown as [number, number, number, number] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

function WhatsAppCTA({ children = "Começar no WhatsApp", className = "", size = "default" }: { children?: string; className?: string; size?: "default" | "sm" | "lg" | "icon" }) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => {
      window.open(WHATSAPP_LINK, "_blank");
      setClicked(false);
    }, 600);
  };

  return (
    <Button
      size={size}
      onClick={handleClick}
      className={`rounded-full bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 ${className}`}
    >
      {clicked ? (
        <span className="flex items-center gap-2">
          <Phone className="h-4 w-4 animate-pulse" /> Abrindo WhatsApp…
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> {children}
        </span>
      )}
    </Button>
  );
}

/* ─── HEADER ─── */
function Header({ onOpenAuth }: { onOpenAuth: () => void }) {
  const [open, setOpen] = useState(false);
  const links = [
    { label: "O que é", href: "#o-que-e" },
    { label: "Como funciona", href: "#como-funciona" },
    { label: "Funcionalidades", href: "#funcionalidades" },
    { label: "Planos", href: "#planos" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur-xl border-b border-white/[0.06]">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <a href="#" className="flex items-center gap-2.5 font-bold text-xl text-foreground">
          <BraveLogo size={38} />
          Brave Assessor
        </a>
        <nav className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <button onClick={onOpenAuth} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Entrar</button>
          <Button size="sm" className="rounded-full" asChild>
            <a href="#planos">Ver Planos <ArrowRight className="h-3.5 w-3.5 ml-1" /></a>
          </Button>
        </div>
        <button onClick={() => setOpen(!open)} className="md:hidden text-foreground" aria-label="Menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="md:hidden border-t border-white/[0.06] bg-background/80 backdrop-blur-xl px-4 pb-4">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
          <Button onClick={() => { setOpen(false); onOpenAuth(); }} variant="outline" className="w-full mt-2">
            Entrar
          </Button>
        </motion.div>
      )}
    </header>
  );
}

/* ─── HERO ─── */
function Hero({ onOpenAuth }: { onOpenAuth: () => void }) {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const mockY = useTransform(scrollYProgress, [0, 1], [0, -40]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.3]);

  return (
    <section ref={heroRef} className="pt-28 pb-12 md:pt-36 md:pb-20 relative overflow-hidden">
      {/* Ambient glass orbs */}
      <div className="absolute top-20 left-[10%] w-72 h-72 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-[10%] w-64 h-64 rounded-full bg-blue-500/8 blur-[80px] pointer-events-none" />

      <div className="container mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
        <motion.div initial="hidden" animate="visible" variants={stagger} style={{ y: heroY, opacity: heroOpacity }}>
          {/* Badge */}
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              📱 WhatsApp + IA + Finanças
            </span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="mt-6 text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] text-foreground">
            Seu assistente financeiro{" "}
            <span className="text-primary">no WhatsApp</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mt-5 text-lg text-muted-foreground max-w-lg leading-relaxed">
            Mande um zap com seu gasto. A IA registra, organiza e te mostra{" "}
            <strong className="text-foreground">exatamente para onde seu dinheiro está indo.</strong>
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8">
            <Button
              size="lg"
              onClick={onOpenAuth}
              className="rounded-full bg-primary text-primary-foreground hover:brightness-110 hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" /> Quero organizar minhas finanças →
              </span>
            </Button>
          </motion.div>

          {/* Checklist */}
          <motion.div variants={fadeUp} className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Sem planilhas</span>
            <span>•</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Sem apps complicados</span>
            <span>•</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Cancele quando quiser</span>
          </motion.div>

          {/* Social proof badges */}
          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm px-4 py-2 text-sm">
              <Users className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">+2.000 usuários</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm px-4 py-2 text-sm">
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
              <span className="font-semibold text-foreground">4.9</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm px-4 py-2 text-sm">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">100% seguro</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Hero image */}
        <motion.div
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.7, ease: "easeOut" }}
          style={{ y: mockY }}
          className="relative mx-auto w-full max-w-md"
        >
          <div className="rounded-3xl overflow-hidden shadow-2xl shadow-primary/10">
            <img
              src={heroImage}
              alt="Mulher usando o Brave Assessor no celular"
              className="w-full h-auto object-cover"
              loading="eager"
            />
          </div>
          {/* Decorative glow behind image */}
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-primary/5 blur-2xl" />
        </motion.div>
      </div>
    </section>
  );
}

/* ─── O QUE É ─── */
function WhatIs() {
  return (
    <section id="o-que-e" className="py-16 md:py-24 bg-white/[0.02]">
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="container mx-auto px-4 max-w-3xl text-center">
        <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-foreground">
          O que é o Brave Assessor?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-6 text-muted-foreground text-lg leading-relaxed">
          O Brave combina a praticidade do WhatsApp com inteligência artificial para transformar a maneira como você cuida do seu dinheiro. Sem planilhas complicadas, sem apps que você esquece de abrir.
        </motion.p>
        <motion.p variants={fadeUp} className="mt-4 text-muted-foreground text-lg leading-relaxed">
          É como conversar com um amigo que entende de finanças: você manda uma mensagem e ele organiza tudo pra você, sem julgamento e com dicas práticas.
        </motion.p>
      </motion.div>
    </section>
  );
}

/* ─── COMO FUNCIONA ─── */
const steps = [
  {
    icon: MessageSquare,
    title: "Mande um zap",
    desc: 'Digite "gastei 45 no mercado", mande um áudio ou foto do recibo. O Brave entende tudo.',
    chip: { text: '"Gastei 89 de uber hoje"', variant: "pink" as const },
  },
  {
    icon: Brain,
    title: "A IA faz o resto",
    desc: "Registra, categoriza e analisa seus padrões de gasto automaticamente.",
    chip: { text: "✓ Registrado em Transporte", variant: "outline" as const },
  },
  {
    icon: BarChart3,
    title: "Você vê tudo organizado",
    desc: "Acesse relatórios, gráficos e saiba exatamente para onde seu dinheiro está indo.",
    chip: { text: "Transporte: R$450 este mês", variant: "pink" as const },
  },
  {
    icon: Bell,
    title: "Receba alertas inteligentes",
    desc: "O Brave avisa quando você está gastando demais ou quando uma conta vai vencer.",
    chip: { text: "⚠ Você já gastou 80% do limite", variant: "warning" as const },
  },
];

function HowItWorks() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], [-30, 30]);

  return (
    <section id="como-funciona" className="py-16 md:py-24 relative overflow-hidden bg-gradient-to-b from-primary/[0.03] to-transparent" ref={ref}>
      <motion.div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent pointer-events-none" style={{ y: bgY }} />
      <div className="container mx-auto px-4 relative">
        {/* Badge */}
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-center">
          <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            Como funciona
          </span>
        </motion.div>

        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="mt-4 text-3xl md:text-4xl font-bold text-center text-foreground">
          Simples como <span className="text-primary">1, 2, 3</span>
        </motion.h2>
        <motion.p initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="mt-3 text-center text-muted-foreground">
          Comece a controlar suas finanças em minutos
        </motion.p>

        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={stagger} className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div key={i} variants={fadeScale} className="relative">
              {/* Step number badge */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <span className="inline-flex items-center justify-center h-7 min-w-[2rem] rounded-full bg-primary text-primary-foreground text-xs font-bold px-2">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <Card className="h-full border-white/[0.08] bg-white/[0.03] backdrop-blur-sm hover:bg-white/[0.06] hover:-translate-y-1 transition-all duration-300 pt-4">
                <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                  <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  {/* Chip */}
                  <span className={`inline-block text-xs font-medium rounded-full px-3 py-1.5 mt-auto ${
                    s.chip.variant === "pink"
                      ? "bg-primary/10 text-primary"
                      : s.chip.variant === "warning"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                        : "border border-border text-muted-foreground"
                  }`}>
                    {s.chip.text}
                  </span>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── FUNCIONALIDADES ─── */
const features = [
  { icon: MessageSquare, label: "Registro via WhatsApp (texto, áudio, foto)" },
  { icon: Brain, label: "IA comportamental com insights" },
  { icon: CreditCard, label: "Controle de cartões" },
  { icon: Target, label: "Metas financeiras" },
  { icon: Wallet, label: "Orçamentos por categoria" },
  { icon: Bell, label: "Contas a pagar" },
  { icon: Users, label: "Modo família (até 5 membros)" },
  { icon: FileText, label: "Relatórios (PDF e Excel)" },
  { icon: Bell, label: "Alertas proativos" },
  { icon: TrendingUp, label: "Análise de padrões de gasto" },
];

function Features() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const sectionY = useTransform(scrollYProgress, [0, 1], [40, -40]);

  return (
    <section id="funcionalidades" className="py-16 md:py-24 bg-white/[0.02] relative overflow-hidden" ref={ref}>
      <div className="container mx-auto px-4">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Funcionalidades do App de Finanças com IA
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={stagger} style={{ y: sectionY }} className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div key={i} variants={fadeScale} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-accent flex items-center justify-center text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-foreground">{f.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ─── SOCIAL PROOF ─── */
function SocialProof() {
  const stats = [
    { icon: Users, value: "+2.000", label: "usuários ativos" },
    { icon: Star, value: "4.9", label: "estrelas" },
    { icon: Shield, value: "100%", label: "seguro com criptografia" },
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={stagger} className="flex flex-wrap justify-center gap-6">
          {stats.map((s, i) => (
            <motion.div key={i} variants={fadeScale} className="flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-sm px-6 py-3 hover:bg-white/[0.07] hover:-translate-y-0.5 transition-all duration-200">
              <s.icon className="h-5 w-5 text-primary" />
              <span className="font-bold text-foreground">{s.value}</span>
              <span className="text-sm text-muted-foreground">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.6 }} className="mt-12 max-w-lg mx-auto">
          <Card className="border-border hover:shadow-lg transition-shadow duration-300">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground italic leading-relaxed">
                "Eu nunca consegui manter uma planilha. Com o Brave, eu só mando um zap e pronto. Já economizei mais de R$ 800 em 3 meses."
              </p>
              <p className="mt-4 text-sm font-semibold text-foreground">— Marina S., São Paulo</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── PLANOS ─── */
const plans = [
  {
    name: "Mensal",
    price: "19,90",
    period: "/mês",
    features: ["Todas as funcionalidades", "Suporte via WhatsApp", "Relatórios ilimitados"],
    highlight: false,
    badge: null,
  },
  {
    name: "Anual",
    price: "14,90",
    period: "/mês",
    sub: "12x de R$ 14,90",
    features: ["Tudo do Mensal", "Modo família (5 pessoas)", "Economia de 25%"],
    highlight: true,
    badge: "Melhor custo-benefício",
  },
];

function Pricing() {
  return (
    <section id="planos" className="py-16 md:py-24 bg-white/[0.02]">
      <div className="container mx-auto px-4">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Planos e Preços do Brave Assessor
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mt-12 grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((p, i) => (
            <motion.div key={i} variants={fadeUp} className="relative">
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    {p.badge}
                  </span>
                </div>
              )}
              <Card className={`h-full ${p.highlight ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary" : "border-border"}`}>
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">R$</span>
                    <span className="text-4xl font-extrabold text-foreground">{p.price}</span>
                    <span className="text-muted-foreground">{p.period}</span>
                  </div>
                  {p.sub && <p className="text-xs text-muted-foreground mt-1">{p.sub}</p>}
                  <ul className="mt-6 space-y-3 text-left w-full">
                    {p.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 w-full">
                    <WhatsAppCTA className="w-full" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
        <p className="text-center text-sm text-muted-foreground mt-8">Cancele quando quiser, sem burocracia.</p>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
const faqs = [
  { q: "O Brave é complicado de usar?", a: "Não! Se você sabe mandar um WhatsApp, já sabe usar o Brave. Sem instalação, sem configuração complicada." },
  { q: "Preciso entender de finanças?", a: "De jeito nenhum. O Brave traduz tudo em linguagem simples e te dá dicas práticas, sem jargão financeiro." },
  { q: "Meus dados estão seguros?", a: "Sim. Usamos criptografia de ponta a ponta e seguimos todas as normas da LGPD. Seus dados são só seus." },
  { q: "Posso registrar gastos por voz?", a: "Pode sim! Basta mandar um áudio no WhatsApp e a IA transcreve e registra automaticamente." },
  { q: "Posso usar com minha família?", a: "Claro! No plano Anual, você pode adicionar até 5 membros da família para controlar as finanças juntos." },
];

function FAQ() {
  return (
    <section id="faq" className="py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-2xl">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-center text-foreground">
          Perguntas Frequentes
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mt-10">
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border border-white/[0.08] rounded-xl px-4 bg-white/[0.03] backdrop-blur-sm">
                <AccordionTrigger className="text-left text-foreground hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── WHY BRAVE ─── */
function WhyNox() {
  return (
    <section className="py-16 md:py-24 bg-white/[0.02]">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <motion.h2 initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-3xl md:text-4xl font-bold text-foreground">
          Por que escolher o Brave?
        </motion.h2>
        <motion.ul initial="hidden" whileInView="visible" viewport={{ once: true }} variants={stagger} className="mt-8 space-y-4 text-left max-w-md mx-auto">
          {[
            "Suporte humanizado via WhatsApp",
            "Desenvolvido no Brasil, em Minas Gerais 🇧🇷",
            "+2.000 usuários já organizam suas finanças",
            "4.9 estrelas de avaliação",
          ].map((t, i) => (
            <motion.li key={i} variants={fadeUp} className="flex items-center gap-3 text-muted-foreground">
              <ArrowRight className="h-4 w-4 text-primary flex-shrink-0" />
              {t}
            </motion.li>
          ))}
        </motion.ul>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mt-10">
          <WhatsAppCTA size="lg" />
        </motion.div>
      </div>
    </section>
  );
}

/* ─── FOOTER ─── */
function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="container mx-auto px-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Hubflows Tecnologia Ltda — CNPJ: 49.084.621/0001-90</p>
        <p className="text-sm text-muted-foreground">© 2026 Brave Assessor. Todos os direitos reservados.</p>
        <div className="flex justify-center gap-4 text-sm">
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Termos de Uso</a>
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacidade</a>
          <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Exclusão de Dados</a>
        </div>
      </div>
    </footer>
  );
}

/* ─── MARQUEE CAROUSEL ─── */
const marqueeRow1 = [
  { label: "Registros pelo WhatsApp", color: "bg-primary" },
  { label: "IA que entende você", color: "bg-blue-500" },
  { label: "Veja para onde vai seu dinheiro", color: "bg-amber-500" },
  { label: "Receba alertas automáticos", color: "bg-rose-500" },
  { label: "Defina e alcance metas", color: "bg-violet-500" },
  { label: "Mande foto do recibo", color: "bg-emerald-500" },
  { label: "Fale seus gastos por áudio", color: "bg-orange-500" },
  { label: "Controle seus cartões", color: "bg-cyan-500" },
];

const marqueeRow2 = [
  { label: "Relatórios automáticos", color: "bg-rose-500" },
  { label: "Monte orçamentos inteligentes", color: "bg-amber-500" },
  { label: "Acompanhe investimentos", color: "bg-blue-500" },
  { label: "Compartilhe com a família", color: "bg-violet-500" },
  { label: "Controle seus cartões", color: "bg-emerald-500" },
  { label: "Fale seus gastos por áudio", color: "bg-orange-500" },
  { label: "Mande foto do recibo", color: "bg-cyan-500" },
];

function MarqueeChip({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm px-4 py-2.5 shadow-sm whitespace-nowrap flex-shrink-0">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

function MarqueeCarousel() {
  return (
    <section className="py-8 md:py-12 overflow-hidden">
      <div className="space-y-4">
        {/* Row 1 - scroll left */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <motion.div
            className="flex gap-4"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 30, ease: "linear", repeat: Infinity }}
          >
            {[...marqueeRow1, ...marqueeRow1].map((item, i) => (
              <MarqueeChip key={i} label={item.label} color={item.color} />
            ))}
          </motion.div>
        </div>
        {/* Row 2 - scroll right */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
          <motion.div
            className="flex gap-4"
            animate={{ x: ["-50%", "0%"] }}
            transition={{ duration: 35, ease: "linear", repeat: Infinity }}
          >
            {[...marqueeRow2, ...marqueeRow2].map((item, i) => (
              <MarqueeChip key={i} label={item.label} color={item.color} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── BENEFITS ─── */
const benefits = [
  { icon: Eye, text: "Saiba exatamente para onde seu dinheiro está indo" },
  { icon: CalendarDays, text: "Pare de ser surpreendido no final do mês" },
  { icon: Brain, text: "Tome decisões financeiras mais inteligentes" },
  { icon: TrendingUpIcon, text: "Crie consciência financeira sem esforço" },
  { icon: Heart, text: "Tenha clareza, não ansiedade" },
];

function Benefits() {
  return (
    <section className="py-16 md:py-24 bg-white/[0.02]">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Image with overlay */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 relative">
              <img
                src={benefitsImage}
                alt="Mulher usando o Brave no celular"
                className="w-full h-auto object-cover"
                loading="lazy"
              />
              {/* "Gaste com consciência" badge */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/80 backdrop-blur-sm text-background text-xs font-medium px-4 py-2">
                  ✨ Gaste com consciência
                </span>
              </div>
              {/* Budget overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-foreground/90 to-foreground/60 backdrop-blur-sm p-4 rounded-b-3xl">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-background/80">Orçamento do mês</span>
                  <span className="text-primary font-medium">Disponível</span>
                </div>
                <div className="flex justify-between text-lg font-bold mb-2">
                  <span className="text-background">R$ 1.250,00</span>
                  <span className="text-primary">R$ 420,00</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-background/20">
                  <div className="h-full rounded-full bg-primary" style={{ width: "66%" }} />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right side - title + benefit rows */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-foreground">
              Mais controle, <span className="text-primary">menos esforço</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-3 text-muted-foreground">
              O que você ganha usando o Brave todos os dias
            </motion.p>

            <div className="mt-8 space-y-3">
              {benefits.map((b, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-4 hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <b.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{b.text}</span>
                </motion.div>
              ))}
            </div>

            <motion.div variants={fadeUp} className="mt-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-5 py-2.5 text-sm font-medium text-primary">
                <Check className="h-4 w-4" /> E muito mais…
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── COMPARISON TABLE ─── */
import { Clock, TrendingUp as TrendingIcon, Bell as BellIcon, MessageSquare as MsgIcon, LineChart } from "lucide-react";

const comparisonRows = [
  { icon: Clock, label: "Tempo de setup", planilha: "45min+", apps: "30min", nylo: "2min", nyloHighlight: false },
  { icon: Clock, label: "Esforço diário", planilha: "10min", apps: "5min", nylo: "30seg", nyloHighlight: false },
  { icon: TrendingIcon, label: "Análise automática", planilha: "Manual", planilhaWarn: true, apps: "Básica", appsWarn: true, nylo: "IA Avançada", nyloHighlight: true },
  { icon: BellIcon, label: "Alertas proativos", planilha: "✕", planilhaX: true, apps: "Limitados", appsWarn: true, nylo: "Inteligentes", nyloHighlight: true },
  { icon: MsgIcon, label: "WhatsApp integrado", planilha: "✕", planilhaX: true, apps: "✕", appsX: true, nylo: "✓", nyloCheck: true },
  { icon: LineChart, label: "Previsões de gastos", planilha: "✕", planilhaX: true, apps: "✕", appsX: true, nylo: "✓", nyloCheck: true },
] as const;
function Comparison() {
  return (
    <section className="py-16 md:py-24 bg-white/[0.02]">
      <div className="container mx-auto px-4">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center">
          <motion.span variants={fadeUp} className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground">
            Comparação Honesta
          </motion.span>
          <motion.h2 variants={fadeUp} className="mt-4 text-3xl md:text-4xl font-bold text-foreground">
            Por que não usar <span className="text-primary">planilha</span>?
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Comparamos o Brave com as alternativas mais comuns para você decidir com clareza
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="mt-12 max-w-4xl mx-auto"
        >
          <Card className="border-border overflow-hidden">
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 md:p-4 text-muted-foreground font-normal whitespace-nowrap">Recurso</th>
                    <th className="p-3 md:p-4 text-center">
                      <div className="font-semibold text-foreground text-xs md:text-sm">Planilha</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Excel/Sheets</div>
                    </th>
                    <th className="p-3 md:p-4 text-center">
                      <div className="font-semibold text-foreground text-xs md:text-sm">Apps Tradicionais</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">Mobills, Guiabolso</div>
                    </th>
                    <th className="p-3 md:p-4 text-center">
                      <div className="font-semibold text-primary text-xs md:text-sm">Brave</div>
                      <div className="text-[10px] md:text-xs text-muted-foreground">IA + WhatsApp</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-3 md:p-4 whitespace-nowrap">
                        <span className="flex items-center gap-2 text-foreground text-xs md:text-sm">
                          <row.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          {row.label}
                        </span>
                      </td>
                      <td className={`p-3 md:p-4 text-center text-xs md:text-sm ${(row as any).planilhaX ? "text-destructive" : (row as any).planilhaWarn ? "text-destructive" : "text-muted-foreground"}`}>
                        {row.planilha}
                      </td>
                      <td className={`p-3 md:p-4 text-center text-xs md:text-sm ${(row as any).appsX ? "text-destructive" : (row as any).appsWarn ? "text-destructive" : "text-muted-foreground"}`}>
                        {row.apps}
                      </td>
                      <td className={`p-3 md:p-4 text-center font-medium text-xs md:text-sm ${(row as any).nyloHighlight || (row as any).nyloCheck ? "text-primary" : "text-foreground"}`}>
                        {row.nylo}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}

/* ─── PAGE ─── */
const Index = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [showQuiz, setShowQuiz] = useState(true);

  if (showQuiz) {
    return (
      <>
        <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
        <QuizFunnel onOpenAuth={() => setAuthOpen(true)} />
        <SocialProofToast />
      </>
    );
  }

  return (
    <main className="overflow-x-hidden bg-background relative">
      {/* Global ambient orbs for landing */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[20%] left-[5%] w-96 h-96 rounded-full bg-primary/[0.06] blur-[120px]" />
        <div className="absolute top-[60%] right-[5%] w-80 h-80 rounded-full bg-blue-500/[0.05] blur-[100px]" />
        <div className="absolute bottom-[10%] left-[40%] w-72 h-72 rounded-full bg-violet-500/[0.04] blur-[100px]" />
      </div>
      <Header onOpenAuth={() => setAuthOpen(true)} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      <Hero onOpenAuth={() => setAuthOpen(true)} />
      <MarqueeCarousel />
      <WhatIs />
      <HowItWorks />
      <Benefits />
      <Comparison />
      <Features />
      <SocialProof />
      <Pricing />
      <FAQ />
      <WhyNox />
      <Footer />
      <SocialProofToast />
    </main>
  );
};

export default Index;
