import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";

/**
 * Hook that returns the count of support conversations with unread messages.
 * - For admins: conversations where the latest message is NOT from the admin.
 * - For users: conversations where the latest message is NOT from the user.
 */
export function useUnreadSupport() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [unreadCount, setUnreadCount] = useState(0);

  const checkUnread = useCallback(async () => {
    if (!user) return;

    // Fetch conversations
    const convQuery = supabase
      .from("support_conversations")
      .select("id, user_id")
      .eq("status", "open");

    // Users only see their own conversations
    if (!isAdmin) {
      convQuery.eq("user_id", user.id);
    }

    const { data: convs } = await convQuery;
    if (!convs || convs.length === 0) {
      setUnreadCount(0);
      return;
    }

    // For each conversation, get the latest message
    let count = 0;
    for (const conv of convs) {
      const { data: msgs } = await supabase
        .from("support_messages")
        .select("sender_id")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (msgs && msgs.length > 0) {
        const lastSender = msgs[0].sender_id;
        // Unread if last message is from the other party
        if (isAdmin && lastSender !== user.id) {
          count++;
        } else if (!isAdmin && lastSender !== user.id) {
          count++;
        }
      }
    }

    setUnreadCount(count);
  }, [user, isAdmin]);

  useEffect(() => {
    checkUnread();

    // Listen for new messages in real-time
    if (!user) return;
    const channel = supabase
      .channel("unread-support-global")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
      }, () => {
        // Re-check on any new message
        checkUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, checkUnread]);

  return { unreadCount, refresh: checkUnread };
}
