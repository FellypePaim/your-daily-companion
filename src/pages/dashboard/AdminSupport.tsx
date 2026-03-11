import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, MessageCircle, User, ImageIcon, X, CheckCircle2, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useUnreadSupport } from "@/hooks/useUnreadSupport";

interface Conversation {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

// ── Conversation List ──
function ConversationList({
  conversations, activeConv, setActiveConv, profiles, unreadConvs, statusFilter, setStatusFilter,
}: {
  conversations: Conversation[];
  activeConv: string | null;
  setActiveConv: (id: string) => void;
  profiles: Record<string, string>;
  unreadConvs: Set<string>;
  statusFilter: "open" | "closed";
  setStatusFilter: (v: "open" | "closed") => void;
}) {
  const filtered = conversations.filter((c) =>
    statusFilter === "open" ? c.status === "open" : c.status === "closed"
  );

  return (
    <Card className="w-80 shrink-0 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border space-y-2">
        <div>
          <h3 className="font-semibold text-sm text-foreground">Atendimentos</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} conversa(s)</p>
        </div>
        <div className="flex gap-1">
          <Button variant={statusFilter === "open" ? "default" : "outline"} size="sm" className="flex-1 h-7 text-xs" onClick={() => setStatusFilter("open")}>
            Abertas
          </Button>
          <Button variant={statusFilter === "closed" ? "default" : "outline"} size="sm" className="flex-1 h-7 text-xs" onClick={() => setStatusFilter("closed")}>
            Resolvidas
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveConv(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors relative ${activeConv === c.id ? "bg-accent" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground truncate">{profiles[c.user_id] || "Usuário"}</p>
                  <Badge variant={c.status === "open" ? "default" : "secondary"} className="text-[10px] shrink-0 ml-2">
                    {c.status === "open" ? "Aberto" : "Resolvido"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
              </div>
            </div>
            {unreadConvs.has(c.id) && <span className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center gap-2">
            <Filter className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">Nenhuma conversa {statusFilter === "open" ? "aberta" : "resolvida"}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Chat Area ──
function ChatArea({
  activeConv, convData, messages, user, profiles,
  onResolve, onReopen, onSend, loading,
}: {
  activeConv: string;
  convData: Conversation | undefined;
  messages: Message[];
  user: any;
  profiles: Record<string, string>;
  onResolve: () => void;
  onReopen: () => void;
  onSend: (content: string, imageFile: File | null) => Promise<void>;
  loading: boolean;
}) {
  const [input, setInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!input.trim() && !imageFile) return;
    await onSend(input.trim(), imageFile);
    setInput("");
    clearImage();
  };

  const getSenderName = (senderId: string) => senderId === user?.id ? "Suporte" : (profiles[senderId] || "Usuário");

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{profiles[convData?.user_id || ""] || "Usuário"}</h3>
            <p className="text-xs text-muted-foreground">{convData?.subject}</p>
          </div>
        </div>
        {convData?.status === "open" ? (
          <Button variant="outline" size="sm" onClick={onResolve} className="gap-1.5 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolvido
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onReopen} className="gap-1.5">Reabrir</Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((m) => {
          const isAdmin = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex flex-col ${isAdmin ? "items-end" : "items-start"}`}>
              <div className={`flex items-center gap-1.5 mb-1 ${isAdmin ? "flex-row-reverse" : ""}`}>
                <span className="text-xs font-medium text-foreground">{getSenderName(m.sender_id)}</span>
                <span className="text-[10px] text-muted-foreground">{format(new Date(m.created_at), "HH:mm", { locale: ptBR })}</span>
              </div>
              <div className={`max-w-[70%] px-4 py-2 rounded-2xl text-sm ${isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                {m.image_url && <img src={m.image_url} alt="Anexo" className="rounded-lg mb-2 max-h-48 w-auto cursor-pointer" onClick={() => window.open(m.image_url!, "_blank")} />}
                {m.content && m.content !== "📷 Imagem" && <p>{m.content}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {imagePreview && (
        <div className="px-3 pt-2 flex items-center gap-2">
          <div className="relative">
            <img src={imagePreview} alt="Preview" className="h-16 rounded-lg border border-border" />
            <button onClick={clearImage} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-border flex gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className="shrink-0">
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Responder..." onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()} />
        <Button onClick={handleSubmit} disabled={loading || (!input.trim() && !imageFile)} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

// ── Main Component ──
export default function AdminSupport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refresh: refreshUnread } = useUnreadSupport();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [unreadConvs, setUnreadConvs] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"open" | "closed">("open");

  const fetchConvs = async () => {
    const { data } = await supabase.from("support_conversations").select("*").order("updated_at", { ascending: false });
    if (data) {
      setConversations(data);
      const userIds = [...new Set(data.map((c) => c.user_id))];
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
        if (profs) {
          const map: Record<string, string> = {};
          profs.forEach((p) => { map[p.id] = p.display_name || "Usuário"; });
          setProfiles(map);
        }
      }
    }
  };

  useEffect(() => {
    fetchConvs();
    const channel = supabase.channel("admin-support-convs")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_conversations" }, () => {
        fetchConvs();
        toast({ title: "Novo atendimento", description: "Um usuário abriu uma nova conversa." });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("admin-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== user.id && msg.conversation_id !== activeConv) {
          setUnreadConvs((prev) => new Set(prev).add(msg.conversation_id));
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeConv]);

  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    setUnreadConvs((prev) => { const n = new Set(prev); n.delete(activeConv); return n; });
    refreshUnread();
    const fetchMessages = async () => {
      const { data } = await supabase.from("support_messages").select("*").eq("conversation_id", activeConv).order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();
    const channel = supabase.channel(`admin-msgs-${activeConv}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `conversation_id=eq.${activeConv}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConv]);

  const handleResolve = async () => {
    if (!activeConv) return;
    await supabase.from("support_conversations").update({ status: "closed" }).eq("id", activeConv);
    toast({ title: "Conversa resolvida" });
    setConversations((prev) => prev.map((c) => c.id === activeConv ? { ...c, status: "closed" } : c));
  };

  const handleReopen = async () => {
    if (!activeConv) return;
    await supabase.from("support_conversations").update({ status: "open" }).eq("id", activeConv);
    toast({ title: "Conversa reaberta" });
    setConversations((prev) => prev.map((c) => c.id === activeConv ? { ...c, status: "open" } : c));
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `admin/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) { toast({ title: "Erro ao enviar imagem", variant: "destructive" }); return null; }
    const { data } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSend = async (content: string, imageFile: File | null) => {
    if (!activeConv || !user) return;
    setLoading(true);
    let imageUrl: string | null = null;
    if (imageFile) imageUrl = await uploadImage(imageFile);
    await supabase.from("support_messages").insert({
      conversation_id: activeConv,
      sender_id: user.id,
      content: content || (imageUrl ? "📷 Imagem" : ""),
      image_url: imageUrl,
    });
    setLoading(false);
  };

  const activeConvData = conversations.find((c) => c.id === activeConv);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <ConversationList
        conversations={conversations}
        activeConv={activeConv}
        setActiveConv={setActiveConv}
        profiles={profiles}
        unreadConvs={unreadConvs}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
      {!activeConv ? (
        <Card className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
          <MessageCircle className="h-12 w-12 opacity-30" />
          <p className="text-sm">Selecione um atendimento</p>
        </Card>
      ) : (
        <ChatArea
          activeConv={activeConv}
          convData={activeConvData}
          messages={messages}
          user={user}
          profiles={profiles}
          onResolve={handleResolve}
          onReopen={handleReopen}
          onSend={handleSend}
          loading={loading}
        />
      )}
    </div>
  );
}
