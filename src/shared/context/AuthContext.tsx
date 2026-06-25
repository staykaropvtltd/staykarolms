import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { UserType } from "../userTypes";
import { supabase } from "../lib/supabase";
import { getMe, setCachedToken } from "../lib/api";

export interface AuthUser {
  id: string;
  role: UserType;
  name: string;
  email: string;
  avatar_url?: string;
  phone?: string;
  institution_id?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function buildFallbackUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const metadata = (session.user.user_metadata ?? {}) as Record<string, unknown>;

  return {
    id: session.user.id,
    role: (metadata.role as UserType) ?? "student",
    name: (metadata.name as string) ?? session.user.email ?? "",
    email: session.user.email ?? "",
    avatar_url: (metadata.avatar_url as string) ?? "",
    institution_id: (metadata.institution_id as string) ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPromiseRef = useRef<Promise<AuthUser | null> | null>(null);

  const fetchProfile = useCallback(async (fallbackUser?: AuthUser): Promise<AuthUser | null> => {
    if (fetchPromiseRef.current) {
      return fetchPromiseRef.current;
    }

    const runFetch = async () => {
      try {
        const { data, error, status } = await getMe();

        if (!error && data) {
          const u: AuthUser = {
            id: data.id,
            role: data.role as UserType,
            name: data.name,
            email: data.email,
            avatar_url: data.avatar_url || "",
            phone: data.phone || undefined,
            institution_id: data.institution_id,
          };
          setUser(u);
          return u;
        }

        const shouldSignOut =
          status === 401 ||
          error?.includes("Invalid or expired token") ||
          error?.includes("Missing or invalid Authorization header");

        if (shouldSignOut) {
          setUser(null);
          // Defer signOut to avoid re-entrancy deadlock inside onAuthStateChange callback.
          // Supabase is mid-way through _notifyAllSubscribers when we reach here;
          // calling signOut() synchronously causes a deadlock.
          setTimeout(() => {
            supabase.auth.signOut({ scope: "local" });
          }, 0);
          return null;
        }

        if (fallbackUser) {
          setUser(fallbackUser);
          return fallbackUser;
        }

        setUser(null);
        return null;
      } catch {
        if (fallbackUser) {
          setUser(fallbackUser);
          return fallbackUser;
        }
        setUser(null);
        setTimeout(() => {
          supabase.auth.signOut({ scope: "local" });
        }, 0);
        return null;
      } finally {
        fetchPromiseRef.current = null;
      }
    };

    const promise = runFetch();
    fetchPromiseRef.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    let mounted = true;

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Update the cached token synchronously — prevents apiFetch from calling
      // getSession() which can hang on token refresh.
      // Only CLEAR the token on explicit SIGNED_OUT — never on null-session events
      // that can occur mid-refresh (e.g. TOKEN_REFRESHED cycle), to avoid evicting
      // a still-valid token and causing 401s on in-flight requests.
      if (session?.access_token) {
        setCachedToken(session.access_token);
      } else if (event === "SIGNED_OUT") {
        setCachedToken(null);
      }

      if (session) {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          setIsLoading(true);
          await fetchProfile(buildFallbackUser(session));
          if (mounted) setIsLoading(false);
        }
      } else {
        // Only reset user state on explicit sign-out, not on transient null sessions
        if (event === "SIGNED_OUT") {
          setUser(null);
        }
        if (mounted) setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = async (email: string, password: string): Promise<AuthUser | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const fallbackUser = buildFallbackUser(data.session ?? null) ?? null;
    const profile = await fetchProfile(fallbackUser || undefined);
    return profile;
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    await fetchProfile();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, isAuthenticated: !!user, isLoading }}>
      {isLoading ? (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: "var(--gold)" }}></div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
