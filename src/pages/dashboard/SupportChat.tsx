import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Plus, MessageCircle, ImageIcon, X, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUnreadSupport } from "@/hooks/useUnreadSupport";

interface Conversation {
  id: string;
  subject: string;
  status: string;
  created_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

export default function SupportChat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { refresh: refreshUnread } = useUnreadSupport();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [unreadConvs, setUnreadConvs] = useState<Set<string>>(new Set());
  const [myProfile, setMyProfile] = useState<string>("Você");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showChatView = isMobile ? !!activeConv : true;
  const showListView = isMobile ? !activeConv : true;

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.display_name) setMyProfile(data.display_name); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchConvs = async () => {
      const { data } = await supabase
        .from("support_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (data) setConversations(data);
    };
    fetchConvs();
  }, [user]);

  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    setUnreadConvs((prev) => { const n = new Set(prev); n.delete(activeConv); return n; });
    // Refresh sidebar/nav unread badge
    refreshUnread();

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", activeConv)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel(`support-msgs-${activeConv}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `conversation_id=eq.${activeConv}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("support-notifications-user")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== user.id && msg.conversation_id !== activeConv) {
          setUnreadConvs((prev) => new Set(prev).add(msg.conversation_id));
          toast({ title: "Nova mensagem", description: "Você recebeu uma resposta do suporte!" });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, activeConv, toast]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) { toast({ title: "Erro ao enviar imagem", description: error.message, variant: "destructive" }); return null; }
    const { data } = supabase.storage.from("support-attachments").getPublicUrl(path);
    return data.publicUrl;
  };

  const createConversation = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("support_conversations")
      .insert({ user_id: user.id, subject: "Novo atendimento" })
      .select()
      .single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setConversations((prev) => [data, ...prev]);
    setActiveConv(data.id);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !imageFile) || !activeConv || !user) return;
    setLoading(true);
    let imageUrl: string | null = null;
    if (imageFile) { imageUrl = await uploadImage(imageFile); clearImage(); }
    const { error } = await supabase
      .from("support_messages")
      .insert({
        conversation_id: activeConv,
        sender_id: user.id,
        content: input.trim() || (imageUrl ? "📷 Imagem" : ""),
        image_url: imageUrl,
      });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else setInput("");
    setLoading(false);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] md:gap-4">
      {/* Conversations list */}
      {showListView && (
        <Card className="w-full md:w-72 md:shrink-0 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">Conversas</h3>
            <Button size="icon" variant="ghost" onClick={createConversation} className="h-8 w-8">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            {conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                <MessageCircle className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Nenhuma conversa ainda</p>
                <Button onClick={createConversation} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> Nova conversa
                </Button>
              </div>
            )}
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveConv(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors relative ${activeConv === c.id ? "bg-accent" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                  {c.status === "closed" && (
                    <Badge variant="secondary" className="text-[10px] shrink-0 ml-2">Resolvido</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                {unreadConvs.has(c.id) && (
                  <span className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Chat area */}
      {showChatView && (
        <Card className="flex-1 flex flex-col overflow-hidden">
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <MessageCircle className="h-12 w-12 opacity-30" />
              <p className="text-sm">Selecione ou crie uma conversa</p>
              <Button onClick={createConversation} size="sm">
                <Plus className="h-4 w-4 mr-2" /> Nova conversa
              </Button>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border flex items-center gap-2">
                {isMobile && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setActiveConv(null)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <h3 className="font-semibold text-sm text-foreground">Suporte Brave</h3>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {messages.map((m) => {
                  const isMe = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <div className={`flex items-center gap-1.5 mb-1 ${isMe ? "flex-row-reverse" : ""}`}>
                        <span className="text-xs font-medium text-foreground">{isMe ? myProfile : "Suporte"}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(m.created_at), "HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2 rounded-2xl text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        {m.image_url && (
                          <img src={m.image_url} alt="Anexo" className="rounded-lg mb-2 max-h-48 w-auto cursor-pointer" onClick={() => window.open(m.image_url!, "_blank")} />
                        )}
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
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Digite sua mensagem..."
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                />
                <Button onClick={sendMessage} disabled={loading || (!input.trim() && !imageFile)} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
