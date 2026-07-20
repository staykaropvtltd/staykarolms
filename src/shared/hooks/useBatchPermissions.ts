import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getStudentPermissions } from "../lib/api";

// null  → no restrictions, show all items
// Set   → show only paths in the set
export function useBatchPermissions(): Set<string> | null {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (user?.role !== "student") return;
    getStudentPermissions()
      .then(({ data }) => {
        const paths = data?.allowed_paths;
        setAllowed(Array.isArray(paths) && paths.length > 0 ? new Set(paths) : null);
      })
      .catch(() => setAllowed(null));
  }, [user?.id]);

  return allowed;
}
