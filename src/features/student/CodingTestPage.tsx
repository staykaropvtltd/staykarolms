import { useState, useEffect } from "react";
import { PageHeader } from "@/shared/components/PageHeader";
import { Button } from "@/shared/components/ui/button";
import { Clock, CheckCircle2, Play, AlertCircle, Loader2, Code2 } from "lucide-react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { getTests } from "@/shared/lib/api";

interface CodingTestPageProps {
  userType: string;
}

export function CodingTestPage({ userType: _userType }: CodingTestPageProps) {
  const [tests, setTests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data } = await getTests({ type: "coding" });
        setTests(data || []);
      } catch (err) {
        console.error("Failed to load coding tests", err);
      }
      setLoading(false);
    }
    init();
  }, []);

  return (
    <div className="p-8 space-y-6 h-full flex flex-col">
      <PageHeader
        title="Coding Tests"
        description="Solve programming challenges and write efficient algorithms in a timed environment."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading coding tests…</span>
        </div>
      ) : tests.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground bg-card border rounded-2xl">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No coding tests available at the moment.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tests.map((test) => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card border rounded-2xl p-6 hover:shadow-lg transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 mb-4">
                  <Code2 className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-foreground">{test.title}</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {test.duration_mins} mins
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    {test.test_questions?.[0]?.count ?? 0} Questions
                  </div>
                </div>
              </div>
              <Button onClick={() => navigate(`/student/take-test/${test.id}`)} className="w-full">
                <Play className="w-4 h-4 mr-2" /> Start Test
              </Button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
