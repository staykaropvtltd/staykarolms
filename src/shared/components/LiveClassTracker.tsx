import { useState, useEffect, useRef } from "react";
import { getActiveLiveClasses, markLiveAttendance } from "../lib/api";
import supabase from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Video, CheckCircle, X } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";

export function LiveClassTracker() {
  const { user } = useAuth();
  const [activeClass, setActiveClass] = useState<any>(null);
  const [markedClasses, setMarkedClasses] = useState<Set<string>>(new Set());
  const markedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (user?.role !== "student") return;

    // Load marked classes from local storage
    const stored = localStorage.getItem(`attendance_${user.id}`);
    if (stored) {
      const parsed = new Set<string>(JSON.parse(stored));
      setMarkedClasses(parsed);
      markedRef.current = parsed;
    }

    const checkActiveClasses = async () => {
      try {
        const { data } = await getActiveLiveClasses();
        if (data && data.length > 0) {
          const unmarkedClass = data.find((c: any) => !markedRef.current.has(c.id));
          if (unmarkedClass) {
            setActiveClass(unmarkedClass);
          } else {
            setActiveClass(null);
          }
        } else {
          setActiveClass(null);
        }
      } catch (err) {
        console.error("Failed to fetch active live classes", err);
      }
    };

    // Initial check
    checkActiveClasses();

    // Subscribe to realtime updates on live_classes table
    const channel = supabase
      .channel("public:live_classes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_classes" },
        (payload) => {
          if (payload.new.status === "live") {
            // Re-run the active classes check to ensure it meets batch/course filters
            checkActiveClasses();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]); // Removed markedClasses from dependency array to prevent infinite loops

  const handleMarkAttendance = async (status: string) => {
    if (!activeClass) return;
    try {
      await markLiveAttendance(activeClass.id, status);
      toast.success(`Attendance marked as ${status}!`);
      
      const newMarked = new Set(markedRef.current).add(activeClass.id);
      setMarkedClasses(newMarked);
      markedRef.current = newMarked;
      localStorage.setItem(`attendance_${user?.id}`, JSON.stringify(Array.from(newMarked)));
      setActiveClass(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to mark attendance");
    }
  };

  return (
    <AnimatePresence>
      {activeClass && (
        <div className="fixed bottom-6 right-6 z-50 flex items-end justify-end p-4 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-card border border-border rounded-xl w-full max-w-[320px] shadow-2xl p-5 relative pointer-events-auto"
          >
            <button 
              onClick={() => setActiveClass(null)} 
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-start text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <Video className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h2 className="text-sm font-bold leading-tight">Live Class Started</h2>
                  <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Attendance Open</span>
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1 line-clamp-1">
                {activeClass.title}
              </p>
              <p className="text-xs text-muted-foreground mb-4 line-clamp-2">
                Your instructor has started taking attendance. Please select your status below.
              </p>
              <div className="flex gap-2 w-full">
                <Button 
                  size="sm"
                  className="flex-1 gap-1.5" 
                  style={{ background: "var(--gold)", color: "#1A1A1A" }}
                  onClick={() => handleMarkAttendance("present")}
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Present
                </Button>
                <Button 
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-600" 
                  onClick={() => handleMarkAttendance("absent")}
                >
                  <X className="w-3.5 h-3.5" /> Absent
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
