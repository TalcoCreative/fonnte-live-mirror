import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "super_admin" | "admin" | "agent" | "first_response";

export type RoleState = {
  role: AppRole | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAgent: boolean;
  isFirstResponse: boolean;
  /** Agent or higher — can reply, assign, edit leads. */
  canHandleChats: boolean;
  /** Super admin only — can access settings, workflow, API. */
  canManageSystem: boolean;
};

/** Reads the current user's app role and exposes capability flags. */
export function useRole(): RoleState {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setRole(null); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      const roles = (data || []).map((r: any) => r.role as AppRole);
      // Priority: super_admin > admin > agent > first_response
      const priority: AppRole[] = ["super_admin", "admin", "agent", "first_response"];
      const top = priority.find((p) => roles.includes(p)) || null;
      setRole(top);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, authLoading]);

  const isSuperAdmin = role === "super_admin" || role === "admin";
  const isFirstResponse = role === "first_response";
  const isAgent = role === "agent" || isSuperAdmin;
  return {
    role, loading,
    isSuperAdmin, isAgent, isFirstResponse,
    canHandleChats: isAgent || isFirstResponse,
    canManageSystem: isSuperAdmin,
  };
}
