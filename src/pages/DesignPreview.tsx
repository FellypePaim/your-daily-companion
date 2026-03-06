import { useState } from "react";
import {
  LayoutDashboard, Wallet, Tag, CreditCard, ArrowLeftRight,
  Target, TrendingUp, Bell, Settings, Sparkles, ArrowUpRight,
  ArrowDownRight, ChevronRight, Star, Moon, Sun, BarChart3,
  PieChart, Plus, Home, Brain
} from "lucide-react";

const tokens = {
  bg: "#08080C",
  bgCard: "#111118",
  bgCardHover: "#18181F",
  bgSidebar: "#0C0C12",
  bgInput: "#16161E",
  bgBottomNav: "#0E0E14",
  text: "#E8E8ED",
  textSecondary: "#8B8B9E",
  textMuted: "#5C5C72",
  accent: "#E8372D",
  accentSoft: "rgba(232, 55, 45, 0.12)",
  accentGlow: "rgba(232, 55, 45, 0.25)",
  border: "#1E1E2A",
  green: "#22C55E",
  greenSoft: "rgba(34, 197, 94, 0.12)",
  red: "#EF4444",
  redSoft: "rgba(239, 68, 68, 0.12)",
  radius: "12px",
  radiusSm: "8px",
};

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Wallet, label: "Carteira" },
  { icon: Tag, label: "Categorias" },
  { icon: CreditCard, label: "Cartões" },
  { icon: ArrowLeftRight, label: "Transações" },
  { icon: Bell, label: "Lembretes" },
  { icon: Target, label: "Metas" },
  { icon: TrendingUp, label: "Investimentos" },
  { icon: Settings, label: "Configurações" },
];

const bottomNavItems = [
  { icon: Home, label: "Início", active: true },
  { icon: ArrowLeftRight, label: "Transações", active: false },
  { icon: Sparkles, label: "Brave IA", active: false, isCta: true },
  { icon: Target, label: "Metas", active: false },
  { icon: Settings, label: "Mais", active: false },
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
  { name: "Alimentação", spent: 1250, budget: 2000, color: tokens.accent },
  { name: "Transporte", spent: 480, budget: 600, color: "#3B82F6" },
  { name: "Assinaturas", spent: 320, budget: 400, color: "#8B5CF6" },
  { name: "Lazer", spent: 180, budget: 500, color: "#F59E0B" },
];

export default function DesignPreview() {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#06060A",
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: tokens.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* View switcher */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "20px 0 16px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#06060A",
          width: "100%",
          justifyContent: "center",
          borderBottom: `1px solid ${tokens.border}`,
        }}
      >
        {(["desktop", "mobile"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: view === v ? tokens.accent : tokens.bgCard,
              color: view === v ? "#fff" : tokens.textSecondary,
              transition: "all .2s",
            }}
          >
            {v === "desktop" ? "🖥 Desktop" : "📱 Mobile"}
          </button>
        ))}
      </div>

      {/* ─── DESKTOP VIEW ─── */}
      {view === "desktop" && (
        <div
          style={{
            display: "flex",
            width: "100%",
            maxWidth: 1400,
            minHeight: "calc(100vh - 60px)",
            background: tokens.bg,
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              width: 260,
              background: tokens.bgSidebar,
              borderRight: `1px solid ${tokens.border}`,
              display: "flex",
              flexDirection: "column",
              padding: "24px 12px",
              gap: 4,
              flexShrink: 0,
            }}
          >
            <div style={{ padding: "0 12px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: tokens.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#fff" }}>B</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Brave</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Assessor Financeiro</div>
              </div>
            </div>
            <button style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: tokens.radiusSm, background: tokens.accentSoft, border: `1px solid rgba(232,55,45,0.15)`, color: tokens.accent, fontWeight: 600, fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
              <Sparkles size={16} /> Brave IA
            </button>
            <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              {sidebarItems.map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: tokens.radiusSm, fontSize: 13, fontWeight: item.active ? 500 : 400, color: item.active ? tokens.text : tokens.textSecondary, background: item.active ? tokens.bgCard : "transparent", cursor: "pointer", position: "relative" }}>
                  {item.active && <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 3, height: 18, borderRadius: 4, background: tokens.accent }} />}
                  <item.icon size={16} strokeWidth={item.active ? 2 : 1.5} />
                  {item.label}
                </div>
              ))}
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: `1px solid ${tokens.border}`, marginTop: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: tokens.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: tokens.accent, fontWeight: 700, fontSize: 13 }}>J</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>João Silva</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Nv. 5 · 1.240 XP</div>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
            <DesktopContent />
          </main>
        </div>
      )}

      {/* ─── MOBILE VIEW ─── */}
      {view === "mobile" && (
        <div
          style={{
            width: 390,
            minHeight: 844,
            background: tokens.bg,
            borderRadius: 24,
            border: `2px solid ${tokens.border}`,
            overflow: "hidden",
            margin: "24px 0",
            position: "relative",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 0 80px rgba(232,55,45,0.06)",
          }}
        >
          {/* Status bar */}
          <div
            style={{
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              fontSize: 12,
              fontWeight: 600,
              color: tokens.text,
            }}
          >
            <span>9:41</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ width: 16, height: 10, borderRadius: 2, border: `1px solid ${tokens.textMuted}`, position: "relative" }}>
                <div style={{ position: "absolute", inset: 2, borderRadius: 1, background: tokens.green }} />
              </div>
            </div>
          </div>

          {/* Mobile header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 16px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: tokens.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>B</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>Olá, João 👋</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>Março 2026</div>
              </div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: tokens.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: tokens.accent, fontWeight: 700, fontSize: 12 }}>J</div>
          </div>

          {/* Mobile scrollable content */}
          <div
            style={{
              flex: 1,
              overflow: "auto",
              padding: "0 14px 100px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Summary cards — 2 col grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: tokens.bgCard,
                    borderRadius: tokens.radius,
                    padding: "14px 14px",
                    border: `1px solid ${tokens.border}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: tokens.textSecondary, fontWeight: 500 }}>{card.label}</span>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: card.positive ? tokens.greenSoft : tokens.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <card.icon size={12} color={card.positive ? tokens.green : tokens.red} />
                    </div>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{card.value}</div>
                  <div style={{ fontSize: 10, color: card.positive ? tokens.green : tokens.red, marginTop: 4, fontWeight: 500 }}>{card.change}</div>
                </div>
              ))}
            </div>

            {/* Chart card */}
            <div style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "16px", border: `1px solid ${tokens.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Fluxo de caixa</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {["7d", "30d"].map((p) => (
                    <button key={p} style={{ padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500, background: p === "30d" ? tokens.accentSoft : "transparent", color: p === "30d" ? tokens.accent : tokens.textMuted, border: "none", cursor: "pointer" }}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
                {[65, 45, 80, 55, 90, 40, 70, 85, 50, 75, 60, 95].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "3px 3px 0 0", background: i === 11 ? tokens.accent : `linear-gradient(to top, rgba(232,55,45,0.08), rgba(232,55,45,0.25))` }} />
                ))}
              </div>
            </div>

            {/* Budget */}
            <div style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "16px", border: `1px solid ${tokens.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Orçamento</span>
                <ChevronRight size={14} color={tokens.textMuted} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {categories.map((cat) => {
                  const pct = Math.round((cat.spent / cat.budget) * 100);
                  return (
                    <div key={cat.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 5 }}>
                        <span style={{ fontWeight: 500 }}>{cat.name}</span>
                        <span style={{ color: tokens.textSecondary }}>R$ {cat.spent} / {cat.budget}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: tokens.bgInput, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: cat.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transactions */}
            <div style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "16px", border: `1px solid ${tokens.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Últimas transações</span>
                <button style={{ fontSize: 11, color: tokens.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Ver todas →</button>
              </div>
              {transactions.slice(0, 4).map((tx, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${tokens.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: tx.amount > 0 ? tokens.greenSoft : tokens.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {tx.amount > 0 ? <ArrowUpRight size={12} color={tokens.green} /> : <ArrowDownRight size={12} color={tokens.red} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{tx.desc}</div>
                      <div style={{ fontSize: 10, color: tokens.textMuted }}>{tx.cat}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: tx.amount > 0 ? tokens.green : tokens.text }}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </div>
                    <div style={{ fontSize: 10, color: tokens.textMuted }}>{tx.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── Bottom Navigation ─── */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 72,
              background: tokens.bgBottomNav,
              borderTop: `1px solid ${tokens.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              padding: "0 8px",
              backdropFilter: "blur(12px)",
            }}
          >
            {bottomNavItems.map((item) => (
              <button
                key={item.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  position: "relative",
                }}
              >
                {item.isCta ? (
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: tokens.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: -20,
                      boxShadow: `0 4px 20px ${tokens.accentGlow}`,
                    }}
                  >
                    <item.icon size={20} color="#fff" />
                  </div>
                ) : (
                  <item.icon
                    size={20}
                    color={item.active ? tokens.accent : tokens.textMuted}
                    strokeWidth={item.active ? 2 : 1.5}
                  />
                )}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: item.active ? 600 : 400,
                    color: item.active ? tokens.accent : tokens.textMuted,
                    marginTop: item.isCta ? 0 : 0,
                  }}
                >
                  {item.label}
                </span>
                {item.active && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 16,
                      height: 2,
                      borderRadius: 2,
                      background: tokens.accent,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "24px 0 32px", color: tokens.textMuted, fontSize: 12 }}>
        ✨ Preview Dark Minimal — dados fictícios · Alterne entre Desktop e Mobile acima
      </div>
    </div>
  );
}

/* Desktop content extracted for reuse */
function DesktopContent() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "4px 0 0" }}>Março 2026</p>
        </div>
        <button style={{ padding: "8px 16px", borderRadius: tokens.radiusSm, background: tokens.bgCard, border: `1px solid ${tokens.border}`, color: tokens.textSecondary, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> Nova transação
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {summaryCards.map((card) => (
          <div key={card.label} style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "18px 20px", border: `1px solid ${tokens.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: tokens.textSecondary, fontWeight: 500 }}>{card.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: card.positive ? tokens.greenSoft : tokens.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <card.icon size={14} color={card.positive ? tokens.green : tokens.red} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{card.value}</div>
            <div style={{ fontSize: 11, color: card.positive ? tokens.green : tokens.red, marginTop: 6, fontWeight: 500 }}>{card.change} vs mês anterior</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 28 }}>
        <div style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "20px 24px", border: `1px solid ${tokens.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Fluxo de caixa</span>
            <div style={{ display: "flex", gap: 4 }}>
              {["7d", "30d", "90d"].map((p) => (
                <button key={p} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: p === "30d" ? tokens.accentSoft : "transparent", color: p === "30d" ? tokens.accent : tokens.textMuted, border: "none", cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
            {[65, 45, 80, 55, 90, 40, 70, 85, 50, 75, 60, 95].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "4px 4px 0 0", background: i === 11 ? tokens.accent : `linear-gradient(to top, rgba(232,55,45,0.08), rgba(232,55,45,0.25))` }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: tokens.textMuted }}>
            {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m) => (<span key={m}>{m}</span>))}
          </div>
        </div>

        <div style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "20px 24px", border: `1px solid ${tokens.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Orçamento</span>
            <ChevronRight size={14} color={tokens.textMuted} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {categories.map((cat) => {
              const pct = Math.round((cat.spent / cat.budget) * 100);
              return (
                <div key={cat.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ fontWeight: 500 }}>{cat.name}</span>
                    <span style={{ color: tokens.textSecondary }}>R$ {cat.spent} / {cat.budget}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: tokens.bgInput, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, borderRadius: 3, background: cat.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ background: tokens.bgCard, borderRadius: tokens.radius, padding: "20px 24px", border: `1px solid ${tokens.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Últimas transações</span>
          <button style={{ fontSize: 12, color: tokens.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>Ver todas →</button>
        </div>
        {transactions.map((tx, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderTop: i > 0 ? `1px solid ${tokens.border}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: tx.amount > 0 ? tokens.greenSoft : tokens.redSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {tx.amount > 0 ? <ArrowUpRight size={14} color={tokens.green} /> : <ArrowDownRight size={14} color={tokens.red} />}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.desc}</div>
                <div style={{ fontSize: 11, color: tokens.textMuted }}>{tx.cat}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: tx.amount > 0 ? tokens.green : tokens.text }}>
                {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
              <div style={{ fontSize: 11, color: tokens.textMuted }}>{tx.date}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
