import { useState } from "react";
import {
  LayoutDashboard, Wallet, Tag, CreditCard, ArrowLeftRight,
  Target, TrendingUp, Bell, Settings, Sparkles, ArrowUpRight,
  ArrowDownRight, ChevronRight, Star, Moon, Sun, BarChart3,
  PieChart, Plus
} from "lucide-react";

/**
 * Isolated Dark Minimal design preview — self-contained with inline styles
 * so it does NOT affect the rest of the app.
 */

const tokens = {
  bg: "#08080C",
  bgCard: "#111118",
  bgCardHover: "#18181F",
  bgSidebar: "#0C0C12",
  bgInput: "#16161E",
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

const summaryCards = [
  { label: "Saldo total", value: "R$ 12.450,00", change: "+2,4%", positive: true, icon: Wallet },
  { label: "Receitas", value: "R$ 8.200,00", change: "+12%", positive: true, icon: ArrowUpRight },
  { label: "Despesas", value: "R$ 5.730,00", change: "+3,1%", positive: false, icon: ArrowDownRight },
  { label: "Economia", value: "R$ 2.470,00", change: "+18%", positive: true, icon: Target },
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
  const [tab, setTab] = useState<"light" | "dark">("dark");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: tokens.bg,
        color: tokens.text,
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "flex",
        overflow: "hidden",
      }}
    >
      {/* ─── Sidebar ─── */}
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
        className="hidden md:flex"
      >
        {/* Logo */}
        <div style={{ padding: "0 12px", marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: tokens.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
              color: "#fff",
            }}
          >
            B
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em" }}>Brave</div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>Assessor Financeiro</div>
          </div>
        </div>

        {/* Brave IA CTA */}
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: tokens.radiusSm,
            background: tokens.accentSoft,
            border: `1px solid rgba(232,55,45,0.15)`,
            color: tokens.accent,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            marginBottom: 16,
            transition: "all .2s",
          }}
        >
          <Sparkles size={16} />
          Brave IA
        </button>

        {/* Nav items */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {sidebarItems.map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                borderRadius: tokens.radiusSm,
                fontSize: 13,
                fontWeight: item.active ? 500 : 400,
                color: item.active ? tokens.text : tokens.textSecondary,
                background: item.active ? tokens.bgCard : "transparent",
                cursor: "pointer",
                transition: "all .15s",
                position: "relative",
              }}
            >
              {item.active && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 3,
                    height: 18,
                    borderRadius: 4,
                    background: tokens.accent,
                  }}
                />
              )}
              <item.icon size={16} strokeWidth={item.active ? 2 : 1.5} />
              {item.label}
            </div>
          ))}
        </nav>

        {/* User */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderTop: `1px solid ${tokens.border}`,
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: tokens.accentSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: tokens.accent,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            J
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>João Silva</div>
            <div style={{ fontSize: 11, color: tokens.textMuted }}>Nv. 5 · 1.240 XP</div>
          </div>
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <main style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: 0,
              }}
            >
              Dashboard
            </h1>
            <p style={{ fontSize: 13, color: tokens.textSecondary, margin: "4px 0 0" }}>
              Março 2026
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                padding: "8px 16px",
                borderRadius: tokens.radiusSm,
                background: tokens.bgCard,
                border: `1px solid ${tokens.border}`,
                color: tokens.textSecondary,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={14} />
              Nova transação
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
            marginBottom: 28,
          }}
        >
          {summaryCards.map((card) => (
            <div
              key={card.label}
              style={{
                background: tokens.bgCard,
                borderRadius: tokens.radius,
                padding: "18px 20px",
                border: `1px solid ${tokens.border}`,
                transition: "all .2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 12, color: tokens.textSecondary, fontWeight: 500 }}>
                  {card.label}
                </span>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: card.positive ? tokens.greenSoft : tokens.redSoft,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <card.icon size={14} color={card.positive ? tokens.green : tokens.red} />
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {card.value}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: card.positive ? tokens.green : tokens.red,
                  marginTop: 6,
                  fontWeight: 500,
                }}
              >
                {card.change} vs mês anterior
              </div>
            </div>
          ))}
        </div>

        {/* Two columns: Chart + Categories */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr",
            gap: 14,
            marginBottom: 28,
          }}
        >
          {/* Chart placeholder */}
          <div
            style={{
              background: tokens.bgCard,
              borderRadius: tokens.radius,
              padding: "20px 24px",
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Fluxo de caixa</span>
              <div style={{ display: "flex", gap: 4 }}>
                {["7d", "30d", "90d"].map((p) => (
                  <button
                    key={p}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 500,
                      background: p === "30d" ? tokens.accentSoft : "transparent",
                      color: p === "30d" ? tokens.accent : tokens.textMuted,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {/* Fake chart bars */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 140 }}>
              {[65, 45, 80, 55, 90, 40, 70, 85, 50, 75, 60, 95].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    borderRadius: "4px 4px 0 0",
                    background:
                      i === 11
                        ? tokens.accent
                        : `linear-gradient(to top, rgba(232,55,45,0.08), rgba(232,55,45,0.25))`,
                    transition: "all .3s",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 8,
                fontSize: 10,
                color: tokens.textMuted,
              }}
            >
              {["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map(
                (m) => (
                  <span key={m}>{m}</span>
                )
              )}
            </div>
          </div>

          {/* Categories */}
          <div
            style={{
              background: tokens.bgCard,
              borderRadius: tokens.radius,
              padding: "20px 24px",
              border: `1px solid ${tokens.border}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Orçamento</span>
              <ChevronRight size={14} color={tokens.textMuted} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {categories.map((cat) => {
                const pct = Math.round((cat.spent / cat.budget) * 100);
                return (
                  <div key={cat.name}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{cat.name}</span>
                      <span style={{ color: tokens.textSecondary }}>
                        R$ {cat.spent} / {cat.budget}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: tokens.bgInput,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          borderRadius: 3,
                          background: cat.color,
                          transition: "width .5s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Transactions list */}
        <div
          style={{
            background: tokens.bgCard,
            borderRadius: tokens.radius,
            padding: "20px 24px",
            border: `1px solid ${tokens.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Últimas transações</span>
            <button
              style={{
                fontSize: 12,
                color: tokens.accent,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Ver todas →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {transactions.map((tx, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: i > 0 ? `1px solid ${tokens.border}` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 8,
                      background: tx.amount > 0 ? tokens.greenSoft : tokens.redSoft,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {tx.amount > 0 ? (
                      <ArrowUpRight size={14} color={tokens.green} />
                    ) : (
                      <ArrowDownRight size={14} color={tokens.red} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{tx.desc}</div>
                    <div style={{ fontSize: 11, color: tokens.textMuted }}>{tx.cat}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: tx.amount > 0 ? tokens.green : tokens.text,
                    }}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                  <div style={{ fontSize: 11, color: tokens.textMuted }}>{tx.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div
          style={{
            textAlign: "center",
            marginTop: 40,
            padding: "20px 0",
            borderTop: `1px solid ${tokens.border}`,
            color: tokens.textMuted,
            fontSize: 12,
          }}
        >
          ✨ Preview do novo design Dark Minimal — dados fictícios
        </div>
      </main>
    </div>
  );
}
