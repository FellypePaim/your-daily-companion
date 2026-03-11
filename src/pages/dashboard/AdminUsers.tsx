import { useState, useEffect, useCallback } from "react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Search, Users, Pencil, Shield, Zap, Star, UserCircle2,
  Phone, Calendar, Crown, RefreshCw, ShieldCheck, ShieldOff, Eye, EyeOff, Mail, Lock, Trash2, RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  monthly_income: number | null;
  subscription_plan: string;
  subscription_expires_at: string | null;
  created_at: string;
  phone_number: string | null;   // from whatsapp_links
  role: string;                   // from user_roles
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:       { label: "Sem plano",    color: "bg-muted text-muted-foreground" },
  teste:      { label: "Teste 10min",  color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  mensal:     { label: "Mensal",       color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  anual:      { label: "Anual",        color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
};

const ROLE_LABELS: Record<string, { label: string; icon: typeof Shield }> = {
  admin: { label: "Admin", icon: ShieldCheck },
  user:  { label: "Usuário", icon: UserCircle2 },
};

const PAGE_SIZE = 15;

export default function AdminUsers() {
  const { toast } = useToast();
  const { isAdmin: currentUserIsAdmin } = useIsAdmin();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filtered, setFiltered] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [page, setPage] = useState(1);

  // Edit modal
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editIncome, setEditIncome] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserRow | null>(null);
  const [confirmResetUser, setConfirmResetUser] = useState<UserRow | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [renewingId, setRenewingId] = useState<string | null>(null);

  const renewUser = async (u: UserRow, plan: "mensal" | "anual") => {
    setRenewingId(u.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const days = plan === "anual" ? 365 : 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-update-user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ userId: u.id, subscription_plan: plan, subscription_expires_at: expiresAt }),
        }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const label = plan === "anual" ? "Anual (365 dias)" : "Mensal (30 dias)";
      toast({ title: "Plano renovado!", description: `${u.display_name || u.id} → ${label}` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao renovar", description: err.message, variant: "destructive" });
    } finally { setRenewingId(null); }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    // 1. profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, monthly_income, subscription_plan, created_at")
      .order("created_at", { ascending: false });

    if (!profiles) { setLoading(false); return; }

    // 2. whatsapp_links (verified phones)
    const { data: waLinks } = await supabase
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true);

    // 3. subscription_expires_at — fetch separately since types may not include it
    const { data: expiryData } = await supabase
      .from("profiles")
      .select("id, subscription_expires_at" as any);

    // 4. user_roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role");

    const waMap = new Map((waLinks || []).map(w => [w.user_id, w.phone_number]));
    const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
    const expiryMap = new Map(((expiryData as any[]) || []).map((e: any) => [e.id, e.subscription_expires_at]));

    const rows: UserRow[] = profiles.map(p => ({
      id: p.id,
      display_name: p.display_name,
      email: null, // loaded on demand via edge function
      monthly_income: p.monthly_income,
      subscription_plan: p.subscription_plan || "free",
      subscription_expires_at: expiryMap.get(p.id) ?? null,
      created_at: p.created_at,
      phone_number: waMap.get(p.id) ?? null,
      role: roleMap.get(p.id) ?? "user",
    }));

    setUsers(rows);
    setFiltered(rows);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Filter logic — reset page on filter change
  useEffect(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.display_name || "").toLowerCase().includes(q) ||
        (u.phone_number || "").includes(q) ||
        u.id.includes(q)
      );
    }
    if (filterPlan !== "all") list = list.filter(u => u.subscription_plan === filterPlan);
    if (filterRole !== "all") list = list.filter(u => u.role === filterRole);
    setFiltered(list);
    setPage(1);
  }, [search, filterPlan, filterRole, users]);

  const openEdit = async (u: UserRow) => {
    setEditUser(u);
    setEditName(u.display_name || "");
    setEditPlan(u.subscription_plan);
    setEditExpiry(u.subscription_expires_at ? u.subscription_expires_at.slice(0, 10) : "");
    setEditRole(u.role);
    setEditIncome(u.monthly_income?.toString() || "");
    setEditPassword("");
    setShowPassword(false);

    // Fetch email via edge function (admin API)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      try {
        const res = await fetch(
          `https://${projectId}.supabase.co/functions/v1/admin-update-user`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ userId: u.id, fetchOnly: true }),
          }
        );
        const json = await res.json();
        setEditEmail(json.user?.email || "");
      } catch {
        setEditEmail("");
      }
    }
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);

    // Determine expiry based on plan
    const planChanged = editPlan !== editUser.subscription_plan;
    let expiresAt: string | null = editExpiry ? new Date(editExpiry).toISOString() : null;
    if (editPlan === "teste") {
      expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    } else if (editPlan === "mensal" && (planChanged || !editExpiry)) {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (editPlan === "anual" && (planChanged || !editExpiry)) {
      expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    } else if (editPlan === "free") {
      expiresAt = null;
    }

    // All profile updates go through the edge function (service role bypasses RLS)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast({ title: "Erro", description: "Sessão inválida", variant: "destructive" });
      setSaving(false);
      return;
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const baseUrl = `https://${projectId}.supabase.co/functions/v1/admin-update-user`;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` };

    // 1. Update plan + expiry + display_name + income via edge function (bypasses RLS)
    const planRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        userId: editUser.id,
        subscription_plan: editPlan,
        subscription_expires_at: expiresAt,
        display_name: editName,
        monthly_income: parseFloat(editIncome) || 0,
      }),
    });
    const planJson = await planRes.json();
    if (planJson.error) {
      toast({ title: "Erro ao atualizar plano", description: planJson.error, variant: "destructive" });
      setSaving(false);
      return;
    }

    // 2. Update role if changed
    if (editRole !== editUser.role) {
      await supabase.from("user_roles").delete().eq("user_id", editUser.id);
      await supabase.from("user_roles").insert({ user_id: editUser.id, role: editRole as any });
    }

    // 3. Update email / password via edge function if changed
    const hasEmail = editEmail.trim() && editEmail !== editUser.email;
    const hasPassword = editPassword.trim().length >= 6;
    if (hasEmail || hasPassword) {
      const body: Record<string, string> = { userId: editUser.id };
      if (hasEmail) body.email = editEmail.trim();
      if (hasPassword) body.password = editPassword;

      const res = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        toast({ title: "Erro ao atualizar credenciais", description: json.error, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    const planLabel = editPlan === "teste" ? "Plano Teste (10 min)" : editPlan;
    toast({ title: "Usuário atualizado!", description: `${editName} — plano ${planLabel} ativado.` });
    setSaving(false);
    setEditUser(null);
    fetchUsers();
  };

  const planStyle = (plan: string) => PLAN_LABELS[plan] || PLAN_LABELS.free;
  const isExpired = (u: UserRow) =>
    u.subscription_expires_at && new Date(u.subscription_expires_at) < new Date();

  const deleteUser = async (u: UserRow) => {
    setDeletingId(u.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-update-user`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ userId: u.id, deleteUser: true }) }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast({ title: "Usuário excluído", description: `${u.display_name || u.id} foi removido.` });
      setConfirmDeleteUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally { setDeletingId(null); }
  };

  const resetUserData = async (u: UserRow) => {
    setResettingId(u.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-update-user`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ userId: u.id, resetUser: true }) }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast({ title: "Dados resetados!", description: `${u.display_name || u.id} teve os dados limpos. Plano e WhatsApp mantidos.` });
      setConfirmResetUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao resetar", description: err.message, variant: "destructive" });
    } finally { setResettingId(null); }
  };

  const resetAllUsers = async () => {
    setResettingAll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sem sessão");
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/admin-reset-all`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast({
        title: "Reset geral concluído!",
        description: `${json.reset} usuário(s) resetados, ${json.notified} notificado(s) via WhatsApp.`,
      });
      setConfirmResetAll(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro no reset geral", description: err.message, variant: "destructive" });
    } finally { setResettingAll(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {users.length} usuário(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmResetAll(true)}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Resetar Todos
          </Button>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome, telefone ou ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-full sm:w-44">
              <Crown className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Plano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os planos</SelectItem>
              <SelectItem value="free">Sem plano</SelectItem>
              <SelectItem value="teste">Teste</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-full sm:w-40">
              <Shield className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Cargo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os cargos</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">Usuário</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telefone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cargo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plano</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expiração</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cadastro</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum usuário encontrado.</td></tr>
              ) : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((u, i) => {
                const RoleIcon = ROLE_LABELS[u.role]?.icon ?? UserCircle2;
                const ps = planStyle(u.subscription_plan);
                const expired = isExpired(u);
                return (
                  <tr key={u.id} className={`border-b border-border transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">
                          {(u.display_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{u.display_name || <span className="text-muted-foreground italic">Sem nome</span>}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{u.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.phone_number ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <span className="font-mono text-xs">{u.phone_number}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <RoleIcon className={`h-3.5 w-3.5 shrink-0 ${u.role === "admin" ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-xs font-medium ${u.role === "admin" ? "text-primary" : "text-foreground"}`}>
                          {ROLE_LABELS[u.role]?.label ?? u.role}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs border ${ps.color}`}>
                        {u.subscription_plan === "anual" && <Star className="h-3 w-3 mr-1" />}
                        {u.subscription_plan === "mensal" && <Zap className="h-3 w-3 mr-1" />}
                        {ps.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {u.subscription_expires_at ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className={`h-3.5 w-3.5 shrink-0 ${expired ? "text-destructive" : "text-muted-foreground"}`} />
                          <span className={`text-xs ${expired ? "text-destructive font-semibold" : "text-foreground"}`}>
                            {format(new Date(u.subscription_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                            {expired && " ⚠️"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)} className="h-8 px-2">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {currentUserIsAdmin && (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                  disabled={renewingId === u.id}
                                  title="Renovar plano"
                                >
                                  <RotateCcw className={`h-3.5 w-3.5 ${renewingId === u.id ? "animate-spin" : ""}`} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => renewUser(u, "mensal")}>
                                  <Zap className="h-4 w-4 mr-2 text-blue-500" />
                                  Mensal (30 dias)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => renewUser(u, "anual")}>
                                  <Star className="h-4 w-4 mr-2 text-amber-500" />
                                  Anual (365 dias)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmResetUser(u)}
                              className="h-8 px-2 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                              disabled={resettingId === u.id}
                              title="Resetar dados"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${resettingId === u.id ? "animate-spin" : ""}`} />
                            </Button>
                            {u.role !== "admin" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteUser(u)}
                                className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deletingId === u.id}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} usuários
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8 px-3 text-xs">
                ← Anterior
              </Button>
              {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }, (_, i) => i + 1)
                .filter(n => n === 1 || n === Math.ceil(filtered.length / PAGE_SIZE) || Math.abs(n - page) <= 1)
                .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                  if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, idx) =>
                  n === "..." ? (
                    <span key={`el-${idx}`} className="text-xs px-1 text-muted-foreground">…</span>
                  ) : (
                    <Button key={n} variant={page === n ? "default" : "outline"} size="sm" onClick={() => setPage(n as number)} className="h-8 w-8 p-0 text-xs">
                      {n}
                    </Button>
                  )
                )}
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / PAGE_SIZE), p + 1))} disabled={page === Math.ceil(filtered.length / PAGE_SIZE)} className="h-8 px-3 text-xs">
                Próximo →
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar Usuário
            </DialogTitle>
          </DialogHeader>

          {editUser && (
            <div className="space-y-4 py-2">
              {/* User badge */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {(editUser.display_name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{editUser.display_name || "Sem nome"}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{editUser.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label className="text-xs">Nome completo</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" />
                </div>

                <div>
                  <Label className="text-xs">Renda mensal (R$)</Label>
                  <Input type="number" value={editIncome} onChange={e => setEditIncome(e.target.value)} className="mt-1" placeholder="0.00" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Plano</Label>
                    <Select value={editPlan} onValueChange={setEditPlan}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">Sem plano (bloqueado)</SelectItem>
                        <SelectItem value="teste">⏱ Teste — 10 minutos</SelectItem>
                        <SelectItem value="mensal">Mensal — 30 dias</SelectItem>
                        <SelectItem value="anual">Anual — 365 dias</SelectItem>
                      </SelectContent>
                    </Select>
                    {editPlan === "teste" && (
                      <p className="text-[10px] text-amber-600 mt-1">⚠️ Expira automaticamente em 10 minutos ao salvar.</p>
                    )}
                    {editPlan === "mensal" && !editExpiry && (
                      <p className="text-[10px] text-muted-foreground mt-1">Expiry padrão: 30 dias a partir de agora.</p>
                    )}
                    {editPlan === "anual" && !editExpiry && (
                      <p className="text-[10px] text-muted-foreground mt-1">Expiry padrão: 365 dias a partir de agora.</p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs">Cargo</Label>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">
                          <span className="flex items-center gap-2"><ShieldOff className="h-3.5 w-3.5" /> Usuário</span>
                        </SelectItem>
                        <SelectItem value="admin">
                          <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5" /> Admin</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Expiração do plano</Label>
                  <Input
                    type="date"
                    value={editExpiry}
                    onChange={e => setEditExpiry(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Deixe vazio para plano sem expiração.</p>
                </div>

                {/* Email & Password — auth fields */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Credenciais de acesso
                  </p>
                  <div>
                    <Label className="text-xs">E-mail</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="pl-9"
                        placeholder="email@exemplo.com"
                        maxLength={255}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Nova senha <span className="text-muted-foreground font-normal">(deixe vazio para não alterar)</span></Label>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        className="pl-9 pr-9"
                        placeholder="Mínimo 6 caracteres"
                        maxLength={128}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    {editPassword && editPassword.length < 6 && (
                      <p className="text-[10px] text-destructive mt-1">Mínimo de 6 caracteres</p>
                    )}
                  </div>
                </div>

                {/* WhatsApp info (read-only) */}
                {editUser.phone_number && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <Phone className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">WhatsApp vinculado</p>
                      <p className="text-xs font-mono text-muted-foreground">{editUser.phone_number}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDeleteUser} onOpenChange={open => !open && setConfirmDeleteUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" /> Excluir usuário
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-foreground">
              Tem certeza que deseja excluir permanentemente{" "}
              <span className="font-semibold">{confirmDeleteUser?.display_name || "este usuário"}</span>?
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Todos os dados do usuário serão removidos. Essa ação não pode ser desfeita.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteUser(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteUser && deleteUser(confirmDeleteUser)}
              disabled={!!deletingId}
            >
              {deletingId ? "Excluindo..." : "Excluir permanentemente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Reset Dialog */}
      <Dialog open={!!confirmResetUser} onOpenChange={open => !open && setConfirmResetUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <RefreshCw className="h-4 w-4" /> Resetar dados do usuário
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-foreground">
              Resetar todos os dados de{" "}
              <span className="font-semibold">{confirmResetUser?.display_name || "este usuário"}</span>?
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              🗑️ Serão apagados: transações, lembretes, cartões, carteiras, metas, categorias, recorrências e chat.
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              ✅ Serão mantidos: plano de assinatura e WhatsApp vinculado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetUser(null)}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => confirmResetUser && resetUserData(confirmResetUser)}
              disabled={!!resettingId}
            >
              {resettingId ? "Resetando..." : "Resetar dados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Reset All Dialog */}
      <Dialog open={confirmResetAll} onOpenChange={open => !open && setConfirmResetAll(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RefreshCw className="h-4 w-4" /> Resetar TODOS os usuários
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-foreground font-semibold">
              ⚠️ Atenção! Esta ação irá resetar os dados de TODOS os usuários (exceto admins).
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              🗑️ Serão apagados: transações, lembretes, cartões, carteiras, metas, categorias, recorrências e chat.
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              ✅ Serão mantidos: planos de assinatura e WhatsApp vinculado.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              📱 Todos os usuários com WhatsApp vinculado receberão um aviso automático.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetAll(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={resetAllUsers}
              disabled={resettingAll}
            >
              {resettingAll ? "Resetando todos..." : "Confirmar Reset Geral"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
