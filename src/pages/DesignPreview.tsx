import { useState } from "react";
import {
  LayoutDashboard, Wallet, Tag, CreditCard, ArrowLeftRight,
  Target, TrendingUp, Bell, Settings, Sparkles, ArrowUpRight,
  ArrowDownRight, ChevronRight, Plus, Home
} from "lucide-react";

/* ── Design tokens ── */
const t1 = {
  bg: "#08080C", bgCard: "#111118", bgCardHover: "#18181F", bgSidebar: "#0C0C12",
  bgInput: "#16161E", bgBottomNav: "#0E0E14", text: "#E8E8ED", textSecondary: "#8B8B9E",
  textMuted: "#5C5C72", accent: "#E8372D", accentSoft: "rgba(232,55,45,0.12)",
  accentGlow: "rgba(232,55,45,0.25)", border: "#1E1E2A", green: "#22C55E",
  greenSoft: "rgba(34,197,94,0.12)", red: "#EF4444", redSoft: "rgba(239,68,68,0.12)",
  radius: "12px", radiusSm: "8px",
};

const t2 = {
  bg: "#0B0B10", bgCard: "rgba(255,255,255,0.04)", bgCardBorder: "rgba(255,255,255,0.08)",
  bgCardHover: "rgba(255,255,255,0.07)", bgSidebar: "rgba(12,12,18,0.85)",
  bgInput: "rgba(255,255,255,0.05)", bgBottomNav: "rgba(14,14,20,0.75)",
  text: "#F0F0F5", textSecondary: "#9494AD", textMuted: "#5E5E78",
  accent: "#E8372D", accentSoft: "rgba(232,55,45,0.10)", accentGlow: "rgba(232,55,45,0.30)",
  border: "rgba(255,255,255,0.06)", green: "#34D399", greenSoft: "rgba(52,211,153,0.10)",
  red: "#F87171", redSoft: "rgba(248,113,113,0.10)", radius: "16px", radiusSm: "10px",
  blur: "blur(20px)", glowAccent: "0 0 40px rgba(232,55,45,0.08)",
  glowCard: "0 8px 32px rgba(0,0,0,0.4)",
};

/* ── Shared data ── */
const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Wallet, label: "Carteira" }, { icon: Tag, label: "Categorias" },
  { icon: CreditCard, label: "Cartões" }, { icon: ArrowLeftRight, label: "Transações" },
  { icon: Bell, label: "Lembretes" }, { icon: Target, label: "Metas" },
  { icon: TrendingUp, label: "Investimentos" }, { icon: Settings, label: "Configurações" },
];
const bottomNavItems = [
  { icon: Home, label: "Início", active: true },
  { icon: ArrowLeftRight, label: "Transações" },
  { icon: Sparkles, label: "Brave IA", isCta: true },
  { icon: Target, label: "Metas" },
  { icon: Settings, label: "Mais" },
];
const summaryCards = [
  { label: "Saldo total", value: "R$ 12.450", change: "+2,4%", positive: true, icon: Wallet },
  { label: "Receitas", value: "R$ 8.200", change: "+12%", positive: true, icon: ArrowUpRight },
  { label: "Despesas", value: "R$ 5.730", change: "+3,1%", positive: false, icon: ArrowDownRight },
  { label: "Economia", value: "R$ 2.470", change: "+18%", positive: true, icon: Target },
];
const transactions = [
  { desc: "Supermercado Extra", cat: "Alimentação", amount: -245.90, date: "Hoje" },
  { desc: "Salário", cat: "Receita", amount: 5200.00, date: "Ontem" },
  { desc: "Netflix", cat: "Assinaturas", amount: -55.90, date: "03 Mar" },
  { desc: "Uber", cat: "Transporte", amount: -32.50, date: "02 Mar" },
  { desc: "Freelance", cat: "Receita", amount: 1800.00, date: "01 Mar" },
];
const categories = [
  { name: "Alimentação", spent: 1250, budget: 2000, color: "#E8372D" },
  { name: "Transporte", spent: 480, budget: 600, color: "#3B82F6" },
  { name: "Assinaturas", spent: 320, budget: 400, color: "#8B5CF6" },
  { name: "Lazer", spent: 180, budget: 500, color: "#F59E0B" },
];

type Style = "minimal" | "glass";
type Device = "desktop" | "mobile";

export default function DesignPreview() {
  const [style, setStyle] = useState<Style>("glass");
  const [device, setDevice] = useState<Device>("desktop");
  const tk = style === "glass" ? t2 : t1;

  return (
    <div style={{ minHeight: "100vh", background: "#060609", fontFamily: "'Inter', -apple-system, sans-serif", color: tk.text, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* Switcher bar */}
      <div style={{ display: "flex", gap: 24, padding: "20px 0 16px", position: "sticky", top: 0, zIndex: 50, background: "#060609", width: "100%", justifyContent: "center", borderBottom: `1px solid rgba(255,255,255,0.06)`, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["minimal", "glass"] as const).map((s) => (
            <button key={s} onClick={() => setStyle(s)} style={{ padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: style === s ? tk.accent : "rgba(255,255,255,0.06)", color: style === s ? "#fff" : "#9494AD", transition: "all .2s" }}>
              {s === "minimal" ? "◼ Dark Minimal" : "◻ Glassmorphism"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["desktop", "mobile"] as const).map((d) => (
            <button key={d} onClick={() => setDevice(d)} style={{ padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: device === d ? "rgba(255,255,255,0.1)" : "transparent", color: device === d ? "#fff" : "#9494AD", transition: "all .2s" }}>
              {d === "desktop" ? "🖥 Desktop" : "📱 Mobile"}
            </button>
          ))}
        </div>
      </div>

      {/* Background orbs for glass style */}
      {style === "glass" && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "10%", left: "15%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,55,45,0.08) 0%, transparent 70%)", filter: "blur(60px)" }} />
          <div style={{ position: "absolute", bottom: "20%", right: "10%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)", filter: "blur(60px)" }} />
          <div style={{ position: "absolute", top: "50%", left: "60%", width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)", filter: "blur(60px)" }} />
        </div>
      )}

      {/* DESKTOP */}
      {device === "desktop" && (
        <div style={{ display: "flex", width: "100%", maxWidth: 1400, minHeight: "calc(100vh - 60px)", position: "relative", zIndex: 1 }}>
          <DesktopSidebar tk={tk} glass={style === "glass"} />
          <main style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
            <DashboardContent tk={tk} glass={style === "glass"} />
          </main>
        </div>
      )}

      {/* MOBILE */}
      {device === "mobile" && (
        <div style={{ width: 390, minHeight: 844, background: tk.bg, borderRadius: 24, border: `2px solid ${tk.border}`, overflow: "hidden", margin: "24px 0", position: "relative", display: "flex", flexDirection: "column", boxShadow: style === "glass" ? t2.glowAccent : "none", zIndex: 1 }}>
          {/* Status bar */}
          <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", fontSize: 12, fontWeight: 600 }}>
            <span>9:41</span>
            <div style={{ width: 16, height: 10, borderRadius: 2, border: `1px solid ${tk.textMuted}`, position: "relative" }}>
              <div style={{ position: "absolute", inset: 2, borderRadius: 1, background: tk.green }} />
            </div>
          </div>

          {/* Mobile header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: style === "glass" ? 10 : 8, background: tk.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff", ...(style === "glass" ? { boxShadow: `0 0 16px ${t2.accentGlow}` } : {}) }}>B</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>Olá, João 👋</div>
                <div style={{ fontSize: 11, color: tk.textMuted }}>Março 2026</div>
              </div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: tk.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: tk.accent, fontWeight: 700, fontSize: 12, ...(style === "glass" ? { backdropFilter: t2.blur, border: `1px solid ${t2.bgCardBorder}` } : {}) }}>J</div>
          </div>

          {/* Scrollable */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 14px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
            <MobileSummary tk={tk} glass={style === "glass"} />
            <MobileChart tk={tk} glass={style === "glass"} />
            <MobileBudget tk={tk} glass={style === "glass"} />
            <MobileTransactions tk={tk} glass={style === "glass"} />
          </div>

          {/* Bottom nav */}
          <MobileBottomNav tk={tk} glass={style === "glass"} />
        </div>
      )}

      <div style={{ textAlign: "center", padding: "24px 0 32px", color: tk.textMuted, fontSize: 12, position: "relative", zIndex: 1 }}>
        ✨ Preview — dados fictícios · Alterne estilos e dispositivos acima
      </div>
    </div>
  );
}

/* ── Helpers ── */
const cardStyle = (tk: typeof t2, glass: boolean): React.CSSProperties => ({
  background: tk.bgCard,
  borderRadius: tk.radius,
  border: `1px solid ${glass ? (tk as typeof t2).bgCardBorder || tk.border : tk.border}`,
  ...(glass ? { backdropFilter: t2.blur, boxShadow: t2.glowCard } : {}),
});

/* ── Desktop Sidebar ── */
function DesktopSidebar({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <aside style={{ width: 260, background: glass ? t2.bgSidebar : tk.bgSidebar, borderRight: `1px solid ${tk.border}`, display: "flex", flexDirection: "column", padding: "24px 12px", gap: 4, flexShrink: 0, ...(glass ? { backdropFilter: t2.blur } : {}) }}>
      <div style={{ padding: "0 12px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: glass ? 12 : 10, background: tk.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff", ...(glass ? { boxShadow: `0 0 20px ${t2.accentGlow}` } : {}) }}>B</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Brave</div>
          <div style={{ fontSize: 11, color: tk.textMuted }}>Assessor Financeiro</div>
        </div>
      </div>
      <button style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: tk.radiusSm, background: tk.accentSoft, border: `1px solid rgba(232,55,45,${glass ? "0.12" : "0.15"})`, color: tk.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 16, ...(glass ? { backdropFilter: t2.blur, boxShadow: `0 0 24px ${t2.accentGlow}` } : {}) }}>
        <Sparkles size={16} /> Brave IA
      </button>
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {sidebarItems.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: tk.radiusSm, fontSize: 13, fontWeight: item.active ? 500 : 400, color: item.active ? tk.text : tk.textSecondary, background: item.active ? (glass ? "rgba(255,255,255,0.06)" : (tk as typeof t1).bgCard) : "transparent", cursor: "pointer", position: "relative" }}>
            {item.active && <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 18, borderRadius: 4, background: tk.accent, ...(glass ? { boxShadow: `0 0 8px ${t2.accentGlow}` } : {}) }} />}
            <item.icon size={16} strokeWidth={item.active ? 2 : 1.5} />
            {item.label}
          </div>
        ))}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${tk.border}`, marginTop: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: tk.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: tk.accent, fontWeight: 700, fontSize: 13 }}>J</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>João Silva</div>
          <div style={{ fontSize: 11, color: tk.textMuted }}>Nv. 5 · 1.240 XP</div>
        </div>
      </div>
    </aside>
  );
}

/* ── Dashboard Content (Desktop) ── */
function DashboardContent({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: tk.textSecondary, margin: "4px 0 0" }}>Março 2026</p>
        </div>
        <button style={{ padding: "8px 16px", borderRadius: tk.radiusSm, ...cardStyle(tk as typeof t2, glass), color: tk.textSecondary, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> Nova transação
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {summaryCards.map((card) => (
          <div key={card.label} style={{ ...cardStyle(tk as typeof t2, glass), padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: tk.textSecondary, fontWeight: 500 }}>{card.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: card.positive ? tk.greenSoft : tk.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <card.icon size={14} color={card.positive ? tk.green : tk.red} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{card.value}</div>
            <div style={{ fontSize: 11, color: card.positive ? tk.green : tk.red, marginTop: 6, fontWeight: 500 }}>{card.change} vs mês anterior</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 28 }}>
        <div style={{ ...cardStyle(tk as typeof t2, glass), padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Fluxo de caixa</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["7d", "30d", "90d"].map((p) => (
                <button key={p} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: p === "30d" ? tk.accentSoft : "transparent", color: p === "30d" ? tk.accent : tk.textMuted, border: "none", cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {[65, 45, 80, 55, 90, 40, 70, 85, 50, 75, 60, 95].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: glass ? "6px 6px 0 0" : "4px 4px 0 0", background: i === 11 ? tk.accent : glass ? `linear-gradient(to top, rgba(232,55,45,0.05), rgba(232,55,45,0.20))` : `linear-gradient(to top, rgba(232,55,45,0.08), rgba(232,55,45,0.25))`, ...(i === 11 && glass ? { boxShadow: `0 0 12px ${t2.accentGlow}` } : {}) }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: tk.textMuted }}>
            {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m) => <span key={m}>{m}</span>)}
          </div>
        </div>

        <div style={{ ...cardStyle(tk as typeof t2, glass), padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Orçamento</span>
            <ChevronRight size={14} color={tk.textMuted} />
          </div>
          {categories.map((cat) => {
            const pct = Math.round((cat.spent / cat.budget) * 100);
            return (
              <div key={cat.name} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500 }}>{cat.name}</span>
                  <span style={{ color: tk.textSecondary }}>R$ {cat.spent} / {cat.budget}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: tk.bgInput, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: cat.color, ...(glass ? { boxShadow: `0 0 8px ${cat.color}40` } : {}) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...cardStyle(tk as typeof t2, glass), padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Últimas transações</span>
          <button style={{ fontSize: 12, color: tk.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Ver todas →</button>
        </div>
        {transactions.map((tx, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: i > 0 ? `1px solid ${tk.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: tx.amount > 0 ? tk.greenSoft : tk.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {tx.amount > 0 ? <ArrowUpRight size={14} color={tk.green} /> : <ArrowDownRight size={14} color={tk.red} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.desc}</div>
                <div style={{ fontSize: 11, color: tk.textMuted }}>{tx.cat}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: tx.amount > 0 ? tk.green : tk.text }}>
                {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
              <div style={{ fontSize: 11, color: tk.textMuted }}>{tx.date}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Mobile sub-components ── */
function MobileSummary({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {summaryCards.map((card) => (
        <div key={card.label} style={{ ...cardStyle(tk as typeof t2, glass), padding: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: tk.textSecondary, fontWeight: 500 }}>{card.label}</span>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: card.positive ? tk.greenSoft : tk.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <card.icon size={12} color={card.positive ? tk.green : tk.red} />
            </div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{card.value}</div>
          <div style={{ fontSize: 10, color: card.positive ? tk.green : tk.red, marginTop: 4, fontWeight: 500 }}>{card.change}</div>
        </div>
      ))}
    </div>
  );
}

function MobileChart({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <div style={{ ...cardStyle(tk as typeof t2, glass), padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Fluxo de caixa</span>
        <div style={{ display: "flex", gap: 4 }}>
          {["7d", "30d"].map((p) => (
            <button key={p} style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500, background: p === "30d" ? tk.accentSoft : "transparent", color: p === "30d" ? tk.accent : tk.textMuted, border: "none", cursor: "pointer" }}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
        {[65, 45, 80, 55, 90, 40, 70, 85, 50, 75, 60, 95].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: glass ? "4px 4px 0 0" : "3px 3px 0 0", background: i === 11 ? tk.accent : `linear-gradient(to top, rgba(232,55,45,0.05), rgba(232,55,45,0.20))`, ...(i === 11 && glass ? { boxShadow: `0 0 10px ${t2.accentGlow}` } : {}) }} />
        ))}
      </div>
    </div>
  );
}

function MobileBudget({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <div style={{ ...cardStyle(tk as typeof t2, glass), padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Orçamento</span>
        <ChevronRight size={14} color={tk.textMuted} />
      </div>
      {categories.map((cat) => {
        const pct = Math.round((cat.spent / cat.budget) * 100);
        return (
          <div key={cat.name} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
              <span style={{ fontWeight: 500 }}>{cat.name}</span>
              <span style={{ color: tk.textSecondary }}>R$ {cat.spent} / {cat.budget}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: tk.bgInput, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: cat.color, ...(glass ? { boxShadow: `0 0 6px ${cat.color}30` } : {}) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileTransactions({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <div style={{ ...cardStyle(tk as typeof t2, glass), padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Últimas transações</span>
        <button style={{ fontSize: 11, color: tk.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Ver todas →</button>
      </div>
      {transactions.slice(0, 4).map((tx, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${tk.border}` : "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: tx.amount > 0 ? tk.greenSoft : tk.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {tx.amount > 0 ? <ArrowUpRight size={12} color={tk.green} /> : <ArrowDownRight size={12} color={tk.red} />}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{tx.desc}</div>
              <div style={{ fontSize: 10, color: tk.textMuted }}>{tx.cat}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: tx.amount > 0 ? tk.green : tk.text }}>
              {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
            <div style={{ fontSize: 10, color: tk.textMuted }}>{tx.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileBottomNav({ tk, glass }: { tk: typeof t1; glass: boolean }) {
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 72, background: glass ? t2.bgBottomNav : (tk as typeof t1).bgBottomNav || tk.bg, borderTop: `1px solid ${tk.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 8px", ...(glass ? { backdropFilter: t2.blur } : {}) }}>
      {bottomNavItems.map((item) => (
        <button key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "6px 12px", position: "relative" }}>
          {item.isCta ? (
            <div style={{ width: 44, height: 44, borderRadius: 14, background: tk.accent, display: "flex", alignItems: "center", justifyContent: "center", marginTop: -20, boxShadow: glass ? `0 4px 24px ${t2.accentGlow}` : `0 4px 20px ${tk.accentGlow}` }}>
              <item.icon size={20} color="#fff" />
            </div>
          ) : (
            <item.icon size={20} color={item.active ? tk.accent : tk.textMuted} strokeWidth={item.active ? 2 : 1.5} />
          )}
          <span style={{ fontSize: 10, fontWeight: item.active ? 600 : 400, color: item.active ? tk.accent : tk.textMuted }}>{item.label}</span>
          {item.active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 16, height: 2, borderRadius: 2, background: tk.accent, ...(glass ? { boxShadow: `0 0 6px ${t2.accentGlow}` } : {}) }} />}
        </button>
      ))}
    </div>
  );
}
