import { useState, useEffect } from "react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Clock, CheckCircle2, Play, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router";
import { getTests } from "@/shared/lib/api";

export function AptitudeTestPage({ userType: _userType }: { userType: string }) {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data } = await getTests({ type: "aptitude" });
      setTests(data || []);
      setLoading(false);
    }
    init();
  }, []);

  return (
    <div className="p-8 space-y-6 h-full flex flex-col">
      <PageHeader
        title="Aptitude Tests"
        description="Logical reasoning and quantitative aptitude assessments."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading tests…</span>
        </div>
      ) : tests.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No aptitude tests available at the moment.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tests.map((test) => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border rounded-2xl p-6 hover:shadow-lg transition-all flex flex-col"
            >
              <h3 className="text-xl font-bold mb-2">{test.title}</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-1">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {test.duration_mins} mins
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {test.test_questions?.[0]?.count ?? 0} Questions
                </div>
              </div>
              <Button onClick={() => navigate(`/student/take-test/${test.id}`)} className="w-full mt-4">
                <Play className="w-4 h-4 mr-2" /> Start Test
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
