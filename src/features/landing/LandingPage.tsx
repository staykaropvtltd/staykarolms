import { useState, useRef, useEffect } from "react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "motion/react";
import { Link } from "react-router";
import {
  BookOpen, Code2, BarChart3, Award, Users, ArrowRight,
  TrendingUp, Brain, Terminal, Video, Mic,
  GraduationCap, Building2, CheckCircle,
  Flame, Play, Star, Trophy, Activity, Clock,
  ChevronRight, Globe, Moon, Sun, ClipboardList
} from "lucide-react";
import { useTheme } from "next-themes";

// ─── Utility ─────────────────────────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  className = "",
  direction = "up",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "left" | "right" | "none";
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const initial =
    direction === "up" ? { opacity: 0, y: 40 }
    : direction === "left" ? { opacity: 0, x: -40 }
    : direction === "right" ? { opacity: 0, x: 40 }
    : { opacity: 0 };
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={initial}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : initial}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

// ─── Hero Floating UI Cards ───────────────────────────────────────────────────

function HeroCourseCard() {
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-white/30 w-60">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
          <Code2 className="w-5 h-5 text-black" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-[#1c1917] leading-tight">Data Structures &amp; Algorithms</p>
          <p className="text-[11px] text-[#78716c] mt-0.5">Module 7 of 12</p>
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mb-1.5">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(to right, #C9A84C, #E8C96A)" }}
          initial={{ width: "0%" }}
          animate={{ width: "62%" }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.8 }}
        />
      </div>
      <div className="flex justify-between items-center">
        <p className="text-[11px] text-[#78716c]">62% complete</p>
        <span className="text-[11px] font-semibold" style={{ color: "#C9A84C" }}>In Progress</span>
      </div>
    </div>
  );
}

function HeroStatCard({ icon: Icon, value, label, color }: { icon: React.ElementType; value: string; label: string; color: string }) {
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl px-4 py-3 shadow-xl border border-white/30 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "#C9A84C1A", border: "1px solid #C9A84C44" }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-lg font-bold text-[#1c1917] tabular-nums leading-none">{value}</p>
        <p className="text-[11px] text-[#78716c] mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function HeroCertBadge() {
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl border border-white/30 w-52">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
          <Award className="w-4 h-4 text-black" />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#1c1917]">Certificate Earned</p>
          <p className="text-[10px] text-[#78716c]">Full-Stack Development</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="w-3 h-3 fill-current" style={{ color: "#C9A84C" }} />
        ))}
        <span className="text-[10px] text-[#78716c] ml-1">Distinction</span>
      </div>
    </div>
  );
}

function HeroStreakWidget() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const active = [true, true, true, true, true, false, false];
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl p-3.5 shadow-xl border border-white/30">
      <div className="flex items-center gap-1.5 mb-2">
        <Flame className="w-4 h-4 text-orange-400" />
        <span className="text-[11px] font-semibold text-[#1c1917]">12-Day Streak</span>
      </div>
      <div className="flex gap-1">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold"
              style={active[i]
                ? { background: "linear-gradient(135deg, #C9A84C, #E8C96A)", color: "#1A1A1A" }
                : { background: "#F5F0E8", color: "#78716c" }}>
              {d}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroLiveClass() {
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl px-3.5 py-3 shadow-xl border border-white/30 flex items-center gap-3">
      <div className="relative">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50">
          <Video className="w-4 h-4 text-red-500" />
        </div>
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[#1c1917]">React Advanced — Live Now</p>
        <p className="text-[10px] text-[#78716c]">247 students watching</p>
      </div>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(17, 15, 11, 0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(201,168,76,0.15)" : "none",
      }}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
            <span className="text-black font-bold text-sm">◈</span>
          </div>
          <span className="font-bold text-white text-base">StayKaro</span>
        </Link>

        {/* Nav links — desktop */}
        <div className="hidden md:flex items-center gap-8">
          {["Platform", "Features", "Roles", "Pricing"].map((item) => (
            <a key={item} href={`#${item.toLowerCase()}`}
              className="text-sm text-white/70 hover:text-white transition-colors duration-200">
              {item}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          {mounted && (
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
          <Link to="/login"
            className="text-sm text-white/80 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 transition-colors">
            Sign In
          </Link>
          <Link to="/login"
            className="text-sm font-semibold px-5 py-2 rounded-xl transition-all hover:opacity-90 hover:scale-105"
            style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)", color: "#1A1A1A" }}>
            Get Started →
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-white/80 hover:text-white p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <div className="space-y-1.5">
            <span className={`block h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "w-6 rotate-45 translate-y-2" : "w-6"}`} />
            <span className={`block h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "opacity-0 w-4" : "w-4"}`} />
            <span className={`block h-0.5 bg-current transition-all duration-300 ${mobileOpen ? "w-6 -rotate-45 -translate-y-2" : "w-6"}`} />
          </div>
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="md:hidden overflow-hidden"
            style={{ background: "rgba(17, 15, 11, 0.98)", borderTop: "1px solid rgba(201,168,76,0.15)" }}
          >
            <div className="px-6 py-4 flex flex-col gap-4">
              {["Platform", "Features", "Roles", "Pricing"].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-white/70 hover:text-white transition-colors py-1">
                  {item}
                </a>
              ))}
              <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                <Link to="/login" className="text-sm text-center text-white/80 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 transition-colors">
                  Sign In
                </Link>
                <Link to="/login"
                  className="text-sm font-semibold text-center py-2.5 rounded-xl"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)", color: "#1A1A1A" }}>
                  Get Started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const floatAnim = (duration: number, y1: number, y2: number) => ({
    animate: { y: [y1, y2, y1] },
    transition: { duration, repeat: Infinity, ease: "easeInOut" as const },
  });

  return (
    <section ref={ref} className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: "linear-gradient(160deg, #110f0b 0%, #1a1714 60%, #0f0e0a 100%)" }}>
      {/* Background grain texture */}
      <div className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px",
        }}
      />

      {/* Ambient gold glows */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #C9A84C18 0%, transparent 70%)" }} />
      <div className="absolute bottom-1/4 left-1/4 w-80 h-80 rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #C9A84C0C 0%, transparent 70%)" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(circle, #C9A84C06 0%, transparent 60%)" }} />

      <motion.div style={{ y, opacity }} className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-24 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <div>
            {/* Badge */}
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border"
              style={{ borderColor: "#C9A84C33", background: "#C9A84C0F" }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#C9A84C" }} />
              <span className="text-xs font-medium" style={{ color: "#C9A84C" }}>
                Trusted by 200+ institutions · 50K+ learners
              </span>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight text-white mb-6">
                Learning,
                <br />
                <span className="relative inline-block">
                  <span style={{
                    background: "linear-gradient(135deg, #C9A84C, #E8C96A, #C9A84C)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}>
                    built differently.
                  </span>
                  <motion.span
                    className="absolute -bottom-2 left-0 h-0.5 rounded-full"
                    style={{ background: "linear-gradient(to right, #C9A84C, #E8C96A)" }}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.8, delay: 0.9, ease: "easeOut" }}
                  />
                </span>
              </h1>
            </motion.div>

            <motion.p
              className="text-lg text-white/60 leading-relaxed mb-10 max-w-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              StayKaro brings learning, assessments, coding, progress, and career
              development together in one connected platform built for serious education.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-col sm:flex-row gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Link to="/login"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 hover:scale-[1.02] shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
                  color: "#1A1A1A",
                  boxShadow: "0 8px 32px rgba(201,168,76,0.35)",
                }}>
                Explore StayKaro
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#features"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-sm border transition-all hover:bg-white/10"
                style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}>
                <Play className="w-4 h-4" />
                See how it works
              </a>
            </motion.div>

            {/* Social proof */}
            <motion.div
              className="flex items-center gap-4 mt-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              <div className="flex -space-x-2">
                {["#C9A84C", "#8B6914", "#E8C96A", "#A0892E", "#D4A853"].map((c, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-[#1a1714] flex items-center justify-center text-xs font-bold text-[#1A1A1A]"
                    style={{ background: c }}>
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" style={{ color: "#C9A84C" }} />
                  ))}
                </div>
                <p className="text-xs text-white/50 mt-0.5">4.9/5 from 2,400+ reviews</p>
              </div>
            </motion.div>
          </div>

          {/* Right — floating UI elements */}
          <div className="relative h-[500px] lg:h-[580px] hidden md:block">
            {/* Course card — top right */}
            <motion.div
              className="absolute top-8 right-0"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              {...floatAnim(5, 0, -12)}
            >
              <HeroCourseCard />
            </motion.div>

            {/* Live class — top left */}
            <motion.div
              className="absolute top-16 left-4"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.65 }}
              {...floatAnim(6, 0, -8)}
            >
              <HeroLiveClass />
            </motion.div>

            {/* Stats — center left */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 left-0"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.8 }}
              {...floatAnim(7, 0, 10)}
            >
              <div className="flex flex-col gap-2.5">
                <HeroStatCard icon={Users} value="1,240" label="Active Students" color="#C9A84C" />
                <HeroStatCard icon={TrendingUp} value="94%" label="Pass Rate" color="#10b981" />
              </div>
            </motion.div>

            {/* Central glow orb */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-3xl"
              style={{ background: "radial-gradient(circle, #C9A84C22 0%, transparent 70%)" }} />

            {/* Streak widget — center right */}
            <motion.div
              className="absolute top-1/2 right-0 -translate-y-1/2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.95 }}
              {...floatAnim(5.5, 0, -9)}
            >
              <HeroStreakWidget />
            </motion.div>

            {/* Certificate badge — bottom right */}
            <motion.div
              className="absolute bottom-12 right-8"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.1 }}
              {...floatAnim(6.5, 0, 10)}
            >
              <HeroCertBadge />
            </motion.div>

            {/* Code snippet — bottom left */}
            <motion.div
              className="absolute bottom-8 left-4"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.2 }}
              {...floatAnim(8, 0, -7)}
            >
              <div className="bg-[#1a1714]/95 backdrop-blur-md rounded-xl p-3.5 border border-[#C9A84C22] shadow-2xl w-52 font-mono text-[11px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                  <span className="text-white/30 ml-1 text-[10px]">solution.py</span>
                </div>
                <div className="space-y-0.5">
                  <p className="text-purple-400">def <span className="text-yellow-300">merge_sort</span><span className="text-white">(arr):</span></p>
                  <p className="text-white/50 pl-2">{"  "}if len(arr) &lt;= 1:</p>
                  <p className="text-green-400 pl-4">{"    "}return arr</p>
                  <p className="text-blue-300 pl-2">{"  "}mid = len(arr) // 2</p>
                  <p className="text-white/40 pl-2">{"  "}...</p>
                </div>
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5">
                  <CheckCircle className="w-3 h-3 text-green-400" />
                  <span className="text-green-400 text-[10px]">All 12 tests passed</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <span className="text-xs text-white/30 tracking-widest uppercase">Scroll</span>
        <motion.div
          className="w-px h-12 rounded-full"
          style={{ background: "linear-gradient(to bottom, #C9A84C44, transparent)" }}
          animate={{ scaleY: [0.3, 1, 0.3], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const stats = [
    { value: "50K+", label: "Active Learners" },
    { value: "200+", label: "Institutions" },
    { value: "98%", label: "Placement Rate" },
    { value: "12K+", label: "Certificates Issued" },
    { value: "4.9★", label: "Average Rating" },
  ];
  return (
    <div className="border-y" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 divide-x" style={{ color: "var(--foreground)" }}>
          {stats.map(({ value, label }, i) => (
            <FadeIn key={label} delay={i * 0.07} className="flex flex-col items-center text-center px-4">
              <span className="text-2xl font-bold tabular-nums" style={{ color: "var(--gold)" }}>{value}</span>
              <span className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{label}</span>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Problem Section ──────────────────────────────────────────────────────────

const fragmentedTools = [
  { icon: BookOpen, name: "Courses", platform: "Platform A", color: "#6366f1" },
  { icon: ClipboardList, name: "Assessments", platform: "Platform B", color: "#f59e0b" },
  { icon: Code2, name: "Coding Practice", platform: "Platform C", color: "#10b981" },
  { icon: Award, name: "Certificates", platform: "Platform D", color: "#8b5cf6" },
  { icon: Brain, name: "Mock Interviews", platform: "Platform E", color: "#ef4444" },
  { icon: BarChart3, name: "Analytics", platform: "Platform F", color: "#0ea5e9" },
];

function ProblemSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" ref={ref} className="py-28" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--gold)" }}>
              The Problem
            </span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold mb-5 tracking-tight" style={{ color: "var(--foreground)" }}>
            Learning is<br />
            <span style={{
              background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              scattered everywhere.
            </span>
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--muted-foreground)" }}>
            Students switch between 6+ different tools to complete their education.
            Each switch breaks focus. Each switch loses context.
          </p>
        </FadeIn>

        {/* Fragmented tools grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-16">
          {fragmentedTools.map(({ icon: Icon, name, platform, color }, i) => (
            <FadeIn key={name} delay={i * 0.08}>
              <motion.div
                className="relative rounded-2xl p-4 border text-center group"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
                whileHover={{ y: -4, boxShadow: `0 16px 40px ${color}20` }}
                transition={{ duration: 0.3 }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: `${color}15`, border: `1px solid ${color}33` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{name}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>{platform}</p>
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: "#ef4444", borderColor: "var(--background)" }}>
                  ✕
                </div>
              </motion.div>
            </FadeIn>
          ))}
        </div>

        {/* Arrow transition */}
        <FadeIn className="text-center mb-16">
          <motion.div
            className="inline-flex flex-col items-center gap-3"
            animate={inView ? { y: [0, 8, 0] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="w-px h-12 rounded-full" style={{ background: "linear-gradient(to bottom, var(--gold), transparent)" }} />
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl border-2"
              style={{ background: "var(--gold)", borderColor: "var(--gold)", color: "#1A1A1A" }}>
              ↓
            </div>
            <h3 className="text-2xl font-bold mt-2" style={{ color: "var(--foreground)" }}>
              What if everything worked{" "}
              <span style={{
                background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                together?
              </span>
            </h3>
          </motion.div>
        </FadeIn>

        {/* Unified platform card */}
        <FadeIn>
          <motion.div
            className="relative rounded-3xl p-8 border overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--gold)44" }}
            whileHover={{ boxShadow: "0 24px 60px rgba(201,168,76,0.15)" }}
          >
            <div className="absolute inset-0 opacity-5 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at center, #C9A84C 0%, transparent 70%)" }} />
            <div className="relative flex flex-col sm:flex-row items-center gap-6 sm:gap-12">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shrink-0"
                style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
                <span className="text-black font-bold text-2xl">◈</span>
              </div>
              <div className="text-center sm:text-left">
                <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--gold)" }}>Introducing</p>
                <h3 className="text-3xl font-bold mb-2" style={{ color: "var(--foreground)" }}>StayKaro — One Platform.</h3>
                <p style={{ color: "var(--muted-foreground)" }}>
                  Every tool your learning journey needs, unified, connected, and intelligent.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-3 shrink-0 ml-auto">
                {fragmentedTools.slice(0, 4).map(({ icon: Icon, color }, i) => (
                  <div key={i} className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}15`, border: `1px solid ${color}44` }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                ))}
                <span className="text-sm font-semibold" style={{ color: "var(--muted-foreground)" }}>+more</span>
              </div>
            </div>
          </motion.div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Ecosystem Section ────────────────────────────────────────────────────────

const pillars = [
  {
    id: "learn",
    label: "LEARN",
    color: "#6366f1",
    icon: BookOpen,
    headline: "Deep, structured learning.",
    desc: "Courses, modules, videos, and curated resources organized by your curriculum.",
    items: ["Structured Courses", "Video Lectures", "Reading Materials", "Live Sessions"],
  },
  {
    id: "practice",
    label: "PRACTICE",
    color: "#10b981",
    icon: Code2,
    headline: "Learn by doing.",
    desc: "Coding environments, assignments, and problem sets that reinforce every concept.",
    items: ["Coding Editor", "Assignments", "Problem Sets", "Test Environment"],
  },
  {
    id: "measure",
    label: "MEASURE",
    color: "#C9A84C",
    icon: BarChart3,
    headline: "Know exactly where you stand.",
    desc: "Assessments, analytics, and detailed performance reporting — in real time.",
    items: ["Aptitude Tests", "Assessment Reports", "Performance Graphs", "AI Feedback"],
  },
  {
    id: "build",
    label: "BUILD",
    color: "#f59e0b",
    icon: Award,
    headline: "Turn skill into career.",
    desc: "AI interviews, certificates, and career-readiness tools that employers recognize.",
    items: ["AI Mock Interviews", "Auto Certificates", "Skill Tracking", "Career Insights"],
  },
];

function EcosystemSection() {
  const [active, setActive] = useState("learn");
  const activePillar = pillars.find((p) => p.id === active)!;

  return (
    <section id="platform" className="py-28" style={{ background: "var(--secondary)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--gold)" }}>
              The Platform
            </span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight" style={{ color: "var(--foreground)" }}>
            The StayKaro Ecosystem
          </h2>
          <p className="text-lg max-w-lg mx-auto" style={{ color: "var(--muted-foreground)" }}>
            Four interconnected pillars. One seamless learning experience.
          </p>
        </FadeIn>

        {/* Pillar tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {pillars.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className="relative px-6 py-3 rounded-2xl text-sm font-bold transition-all duration-300 border"
              style={active === p.id
                ? { background: p.color, color: "#fff", borderColor: p.color, boxShadow: `0 8px 24px ${p.color}44` }
                : { background: "var(--card)", color: "var(--muted-foreground)", borderColor: "var(--border)" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Active pillar panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl p-8 border"
            style={{
              background: "var(--card)",
              borderColor: `${activePillar.color}44`,
              boxShadow: `0 0 80px ${activePillar.color}0F`,
            }}
          >
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: `${activePillar.color}15`, border: `1px solid ${activePillar.color}44` }}>
                    <activePillar.icon className="w-7 h-7" style={{ color: activePillar.color }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: activePillar.color }}>
                      {activePillar.label}
                    </p>
                    <h3 className="text-2xl font-bold mt-0.5" style={{ color: "var(--foreground)" }}>
                      {activePillar.headline}
                    </h3>
                  </div>
                </div>
                <p className="text-base mb-6" style={{ color: "var(--muted-foreground)" }}>{activePillar.desc}</p>
                <ul className="space-y-3">
                  {activePillar.items.map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${activePillar.color}20` }}>
                        <CheckCircle className="w-3.5 h-3.5" style={{ color: activePillar.color }} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right: abstract illustration of the pillar */}
              <div className="relative h-56 md:h-64 flex items-center justify-center">
                <div className="absolute inset-0 rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at center, ${activePillar.color}10 0%, transparent 70%)` }} />
                <div className="relative grid grid-cols-2 gap-3 w-full max-w-xs">
                  {activePillar.items.map((item, i) => (
                    <motion.div
                      key={item}
                      className="rounded-xl p-3 border text-center"
                      style={{ background: "var(--background)", borderColor: `${activePillar.color}33` }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.08 }}
                    >
                      <activePillar.icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: activePillar.color }} />
                      <p className="text-[11px] font-semibold" style={{ color: "var(--foreground)" }}>{item}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Connecting grid */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {pillars.map((p, i) => (
            <FadeIn key={p.id} delay={i * 0.1}>
              <motion.button
                onClick={() => setActive(p.id)}
                className="w-full rounded-2xl p-5 border text-left transition-all hover:scale-[1.02] cursor-pointer"
                style={active === p.id
                  ? { background: `${p.color}10`, borderColor: `${p.color}66`, boxShadow: `0 4px 24px ${p.color}20` }
                  : { background: "var(--card)", borderColor: "var(--border)" }
                }
                whileHover={{ y: -3 }}
              >
                <p.icon className="w-6 h-6 mb-3" style={{ color: p.color }} />
                <p className="font-bold text-sm mb-1" style={{ color: "var(--foreground)" }}>{p.label}</p>
                <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{p.items.length} capabilities</p>
              </motion.button>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Journey Section ──────────────────────────────────────────────────────────

const journeyStages = [
  {
    step: "01", label: "Discover", color: "#6366f1",
    headline: "Find your path.",
    desc: "Browse a curated course catalog tailored to your batch, skill level, and career goals.",
    icon: GraduationCap,
    tags: ["Course Catalog", "Skill Assessment", "Recommendations"],
  },
  {
    step: "02", label: "Learn", color: "#C9A84C",
    headline: "Go deep, not wide.",
    desc: "Structured modules with video lectures, readings, and live sessions — all in one place.",
    icon: BookOpen,
    tags: ["Video Lectures", "Live Classes", "Module Progress"],
  },
  {
    step: "03", label: "Practice", color: "#10b981",
    headline: "Write code. Solve problems.",
    desc: "A full coding environment with real test cases, instant feedback, and multiple language support.",
    icon: Code2,
    tags: ["Code Editor", "Test Cases", "Assignments"],
  },
  {
    step: "04", label: "Assess", color: "#f59e0b",
    headline: "Test what you know.",
    desc: "Timed aptitude tests, mock interviews powered by AI, and comprehensive performance analytics.",
    icon: Brain,
    tags: ["Aptitude Tests", "AI Interviews", "Analytics"],
  },
  {
    step: "05", label: "Improve", color: "#ef4444",
    headline: "Grow with every result.",
    desc: "Detailed feedback, personalized recommendations, and progress tracking that keeps you moving forward.",
    icon: TrendingUp,
    tags: ["Feedback", "Performance Trends", "Leaderboards"],
  },
  {
    step: "06", label: "Achieve", color: "#8b5cf6",
    headline: "Prove what you've built.",
    desc: "Auto-generated certificates, verifiable achievements, and an AI interview coach to land your role.",
    icon: Trophy,
    tags: ["Certificates", "AI Coach", "Career Ready"],
  },
];

function JourneySection() {
  const [active, setActive] = useState(0);

  return (
    <section className="py-28" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border"
            style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--gold)" }}>Student Journey</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ color: "var(--foreground)" }}>
            From curiosity
            <br />
            <span style={{
              background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              to capability.
            </span>
          </h2>
          <p className="text-lg max-w-lg mx-auto" style={{ color: "var(--muted-foreground)" }}>
            Six interconnected stages that turn a curious learner into a career-ready professional.
          </p>
        </FadeIn>

        {/* Journey timeline */}
        <div className="grid lg:grid-cols-3 gap-4 mb-12">
          {journeyStages.map((stage, i) => (
            <FadeIn key={stage.step} delay={i * 0.08}>
              <motion.button
                onClick={() => setActive(i)}
                className="w-full text-left rounded-2xl p-5 border transition-all"
                style={active === i
                  ? { background: `${stage.color}0F`, borderColor: `${stage.color}55`, boxShadow: `0 4px 24px ${stage.color}15` }
                  : { background: "var(--card)", borderColor: "var(--border)" }
                }
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex items-start gap-4">
                  <div>
                    <span className="text-xs font-black tracking-widest" style={{ color: active === i ? stage.color : "var(--muted-foreground)" }}>
                      {stage.step}
                    </span>
                    <h4 className="font-bold text-base mt-0.5" style={{ color: "var(--foreground)" }}>{stage.label}</h4>
                    {active === i && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="text-xs mt-1.5"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {stage.headline}
                      </motion.p>
                    )}
                  </div>
                  <div className={`ml-auto w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5`}
                    style={active === i
                      ? { background: stage.color, boxShadow: `0 4px 12px ${stage.color}44` }
                      : { background: "var(--muted)" }
                    }>
                    <stage.icon className="w-4 h-4" style={{ color: active === i ? "#fff" : "var(--muted-foreground)" }} />
                  </div>
                </div>
              </motion.button>
            </FadeIn>
          ))}
        </div>

        {/* Detail panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="rounded-3xl p-8 border"
            style={{
              background: "var(--card)",
              borderColor: `${journeyStages[active].color}44`,
            }}
          >
            <div className="flex flex-col sm:flex-row gap-8 items-start">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${journeyStages[active].color}15`, border: `2px solid ${journeyStages[active].color}44` }}>
                {(() => {
                  const S = journeyStages[active];
                  return <S.icon className="w-8 h-8" style={{ color: S.color }} />;
                })()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-black tracking-widest" style={{ color: journeyStages[active].color }}>
                    STAGE {journeyStages[active].step}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: `${journeyStages[active].color}15`, color: journeyStages[active].color }}>
                    {journeyStages[active].label}
                  </span>
                </div>
                <h3 className="text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
                  {journeyStages[active].headline}
                </h3>
                <p className="text-base mb-5" style={{ color: "var(--muted-foreground)" }}>
                  {journeyStages[active].desc}
                </p>
                <div className="flex flex-wrap gap-2">
                  {journeyStages[active].tags.map((tag) => (
                    <span key={tag} className="text-xs font-semibold px-3 py-1 rounded-full"
                      style={{ background: `${journeyStages[active].color}12`, color: journeyStages[active].color, border: `1px solid ${journeyStages[active].color}33` }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => setActive(Math.max(0, active - 1))}
                  disabled={active === 0}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-30"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--muted)" }}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setActive(Math.min(journeyStages.length - 1, active + 1))}
                  disabled={active === journeyStages.length - 1}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)", color: "#1A1A1A" }}
                >
                  Next →
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ─── Coding Section ───────────────────────────────────────────────────────────

const CODE_LINES = [
  { tokens: [{ t: "def ", c: "#c792ea" }, { t: "solve", c: "#82aaff" }, { t: "(nums, target):", c: "#d6deeb" }] },
  { tokens: [{ t: "    seen = {}", c: "#d6deeb" }] },
  { tokens: [{ t: "    for ", c: "#c792ea" }, { t: "i, num ", c: "#d6deeb" }, { t: "in ", c: "#c792ea" }, { t: "enumerate(nums):", c: "#d6deeb" }] },
  { tokens: [{ t: "        complement = target - num", c: "#d6deeb" }] },
  { tokens: [{ t: "        if ", c: "#c792ea" }, { t: "complement ", c: "#d6deeb" }, { t: "in ", c: "#c792ea" }, { t: "seen:", c: "#d6deeb" }] },
  { tokens: [{ t: "            return ", c: "#c792ea" }, { t: "[seen[complement], i]", c: "#d6deeb" }] },
  { tokens: [{ t: "        seen[num] = i", c: "#d6deeb" }] },
  { tokens: [{ t: "    return ", c: "#c792ea" }, { t: "[]", c: "#d6deeb" }] },
];

const TEST_CASES = [
  { input: "[2,7,11,15], 9", expected: "[0,1]", status: "pass" },
  { input: "[3,2,4], 6", expected: "[1,2]", status: "pass" },
  { input: "[3,3], 6", expected: "[0,1]", status: "pass" },
];

function CodingSection() {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  function runCode() {
    setRunning(true);
    setDone(false);
    setTimeout(() => {
      setRunning(false);
      setDone(true);
    }, 1800);
  }

  return (
    <section ref={ref} className="py-28" style={{ background: "linear-gradient(160deg, #0f0e0a 0%, #1a1714 100%)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div>
            <FadeIn direction="left">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border"
                style={{ borderColor: "#C9A84C33", background: "#C9A84C0F" }}>
                <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "#C9A84C" }}>Coding Environment</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-5 tracking-tight leading-tight">
                Learn it.{" "}
                <span style={{
                  background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  Write it.
                </span>
                {" "}Run it.
              </h2>
              <p className="text-lg text-white/60 mb-8 leading-relaxed">
                A full browser-based coding environment. Write, debug, and test your solutions
                with real test cases, instant feedback, and multi-language support.
              </p>
              <ul className="space-y-4 mb-10">
                {[
                  { icon: Code2, text: "15+ languages supported", color: "#C9A84C" },
                  { icon: CheckCircle, text: "Automated test case validation", color: "#10b981" },
                  { icon: Activity, text: "Real-time execution feedback", color: "#6366f1" },
                  { icon: Clock, text: "Timed competitive mode", color: "#f59e0b" },
                ].map(({ icon: Icon, text, color }) => (
                  <li key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${color}20`, border: `1px solid ${color}33` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <span className="text-sm text-white/80">{text}</span>
                  </li>
                ))}
              </ul>
              <Link to="/login"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm transition-all hover:opacity-90 hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)", color: "#1A1A1A", boxShadow: "0 8px 24px rgba(201,168,76,0.3)" }}>
                Try the Editor <ArrowRight className="w-4 h-4" />
              </Link>
            </FadeIn>
          </div>

          {/* Right: Code editor mockup */}
          <FadeIn direction="right" delay={0.2}>
            <div className="rounded-2xl overflow-hidden border shadow-2xl"
              style={{ borderColor: "#C9A84C22", boxShadow: "0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.1)" }}>
              {/* Title bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b"
                style={{ background: "#1e1b16", borderColor: "#C9A84C15" }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-white/40">two_sum.py</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">Python</span>
                </div>
                <motion.button
                  onClick={runCode}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: running ? "#374151" : "linear-gradient(135deg, #C9A84C, #E8C96A)", color: running ? "#9ca3af" : "#1A1A1A" }}
                  whileTap={{ scale: 0.95 }}
                  disabled={running}
                >
                  {running ? (
                    <><div className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" /> Running...</>
                  ) : (
                    <><Play className="w-3 h-3" /> Run Code</>
                  )}
                </motion.button>
              </div>

              {/* Editor area */}
              <div className="flex" style={{ background: "#151210" }}>
                {/* Line numbers */}
                <div className="py-4 px-3 text-right select-none border-r"
                  style={{ background: "#1a1714", borderColor: "#C9A84C10" }}>
                  {CODE_LINES.map((_, i) => (
                    <p key={i} className="text-[12px] leading-6 font-mono" style={{ color: "#4a4540" }}>{i + 1}</p>
                  ))}
                </div>

                {/* Code */}
                <div className="py-4 px-4 flex-1 overflow-x-auto">
                  {CODE_LINES.map((line, li) => (
                    <motion.p
                      key={li}
                      className="text-[12px] leading-6 font-mono whitespace-pre"
                      initial={inView ? { opacity: 0, x: -8 } : {}}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: li * 0.08 + 0.3 }}
                    >
                      {line.tokens.map((tok, ti) => (
                        <span key={ti} style={{ color: tok.c }}>{tok.t}</span>
                      ))}
                    </motion.p>
                  ))}
                </div>
              </div>

              {/* Test results */}
              <div className="border-t" style={{ borderColor: "#C9A84C15", background: "#1a1714" }}>
                <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "#C9A84C10" }}>
                  <Terminal className="w-3.5 h-3.5" style={{ color: "#C9A84C" }} />
                  <span className="text-[11px] font-semibold" style={{ color: "#C9A84C" }}>Test Results</span>
                  {done && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="ml-auto text-[11px] font-bold text-green-400 flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> All 3 passed
                    </motion.span>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  {TEST_CASES.map((tc, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center justify-between rounded-lg px-3 py-2"
                      style={{ background: done ? "#10b98115" : "#ffffff08" }}
                      animate={done ? { borderColor: "#10b98133" } : {}}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40 font-mono">Input:</span>
                        <span className="text-[11px] font-mono" style={{ color: "#d6deeb" }}>{tc.input}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40 font-mono">→</span>
                        <span className="text-[11px] font-mono text-green-400">{tc.expected}</span>
                        {done && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

// ─── Roles Section ────────────────────────────────────────────────────────────

const roles = [
  {
    id: "student",
    label: "Student",
    icon: GraduationCap,
    color: "#6366f1",
    headline: "Your personal learning command centre.",
    desc: "Access courses, track progress, submit assignments, take tests, practice coding, and earn certificates — all in one dashboard.",
    features: ["Course catalog & my courses", "Live attendance tracking", "Code editor & practice", "AI mock interviews", "Certificates & achievements"],
    stat: { value: "94%", label: "Average satisfaction score" },
  },
  {
    id: "faculty",
    label: "Faculty",
    icon: Users,
    color: "#10b981",
    headline: "Teach smarter. See everything.",
    desc: "Manage your courses, review assignments, track student performance, and run live classes with full analytics.",
    features: ["Course content management", "Student performance analytics", "Assignment review & grading", "Live class management", "Attendance tracking"],
    stat: { value: "3×", label: "Faster grading with AI assist" },
  },
  {
    id: "admin",
    label: "Admin",
    icon: Building2,
    color: "#C9A84C",
    headline: "Run your institution with clarity.",
    desc: "Manage students, faculty, batches, and billing across your institution. Full audit trail, compliance, and analytics built in.",
    features: ["Student & faculty management", "Batch & course configuration", "Billing & subscriptions", "Audit logs & compliance", "Institute-wide analytics"],
    stat: { value: "200+", label: "Institutions using StayKaro" },
  },
  {
    id: "superadmin",
    label: "Super Admin",
    icon: Globe,
    color: "#8b5cf6",
    headline: "Oversee every institution at scale.",
    desc: "Full visibility across all tenants — revenue, health, compliance, and global user management from a single dashboard.",
    features: ["Multi-tenant management", "Revenue analytics", "Server health monitoring", "Global user control", "Subscription management"],
    stat: { value: "99.9%", label: "Platform uptime SLA" },
  },
];

function RolesSection() {
  const [active, setActive] = useState(0);
  const role = roles[active];

  return (
    <section id="roles" className="py-28" style={{ background: "var(--secondary)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 border"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--gold)" }}>Every Role</span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ color: "var(--foreground)" }}>
            One platform.
            <br />
            <span style={{
              background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Every role.
            </span>
          </h2>
          <p className="text-lg max-w-lg mx-auto" style={{ color: "var(--muted-foreground)" }}>
            Purpose-built experiences for students, faculty, admins, and super-admins.
          </p>
        </FadeIn>

        {/* Role tabs */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {roles.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setActive(i)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold border transition-all"
              style={active === i
                ? { background: r.color, color: "#fff", borderColor: r.color, boxShadow: `0 8px 24px ${r.color}44` }
                : { background: "var(--card)", color: "var(--muted-foreground)", borderColor: "var(--border)" }
              }
            >
              <r.icon className="w-4 h-4" />
              {r.label}
            </button>
          ))}
        </div>

        {/* Role panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-3xl border overflow-hidden"
            style={{ background: "var(--card)", borderColor: `${role.color}44` }}
          >
            <div className="grid md:grid-cols-2">
              {/* Left */}
              <div className="p-8 border-r" style={{ borderColor: `${role.color}22` }}>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: `${role.color}15`, border: `2px solid ${role.color}44` }}>
                    <role.icon className="w-7 h-7" style={{ color: role.color }} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: role.color }}>
                      {role.label} Dashboard
                    </p>
                    <h3 className="text-xl font-bold mt-0.5" style={{ color: "var(--foreground)" }}>
                      {role.headline}
                    </h3>
                  </div>
                </div>
                <p className="text-base mb-6" style={{ color: "var(--muted-foreground)" }}>{role.desc}</p>
                <ul className="space-y-3 mb-8">
                  {role.features.map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <CheckCircle className="w-4 h-4 shrink-0" style={{ color: role.color }} />
                      <span className="text-sm" style={{ color: "var(--foreground)" }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-4 p-4 rounded-2xl"
                  style={{ background: `${role.color}0C`, border: `1px solid ${role.color}22` }}>
                  <span className="text-3xl font-black tabular-nums" style={{ color: role.color }}>{role.stat.value}</span>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{role.stat.label}</span>
                </div>
              </div>

              {/* Right: Dashboard mockup */}
              <div className="p-8 flex flex-col gap-4">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  Dashboard Preview
                </p>
                {/* Mini stat cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: role.id === "student" ? "Courses" : role.id === "faculty" ? "My Courses" : role.id === "admin" ? "Students" : "Tenants", value: role.id === "student" ? "8" : role.id === "faculty" ? "4" : role.id === "admin" ? "1,240" : "47" },
                    { label: role.id === "student" ? "XP Points" : role.id === "faculty" ? "Assignments" : role.id === "admin" ? "Faculty" : "Active Users" , value: role.id === "student" ? "4,280" : role.id === "faculty" ? "32" : role.id === "admin" ? "38" : "12K+" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3.5 border"
                      style={{ background: "var(--background)", borderColor: "var(--border)" }}>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{s.label}</p>
                      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: role.color }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bars */}
                <div className="rounded-xl p-4 border" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
                  <p className="text-xs font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                    {role.id === "student" ? "Course Progress" : role.id === "faculty" ? "Grading Progress" : role.id === "admin" ? "Batch Completion" : "Revenue Growth"}
                  </p>
                  {[
                    { label: role.id === "student" ? "DSA" : role.id === "faculty" ? "Web Dev Assignments" : role.id === "admin" ? "Batch A" : "Q3 Revenue", pct: 78 },
                    { label: role.id === "student" ? "Web Dev" : role.id === "faculty" ? "Python Projects" : role.id === "admin" ? "Batch B" : "Q4 Forecast", pct: 55 },
                  ].map((item) => (
                    <div key={item.label} className="mb-3 last:mb-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{item.label}</span>
                        <span className="text-[11px] font-semibold" style={{ color: role.color }}>{item.pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: "var(--border)" }}>
                        <motion.div className="h-full rounded-full" style={{ background: role.color }}
                          initial={{ width: "0%" }}
                          animate={{ width: `${item.pct}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <Link to="/login"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
                  style={{ background: `${role.color}10`, borderColor: `${role.color}33`, color: role.color }}>
                  View {role.label} Dashboard <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
  {
    quote: "StayKaro completely changed how we run our training program. Everything is in one place — courses, attendance, assessments, certificates. Our faculty saves hours every week.",
    name: "Ravi Shankar",
    role: "Program Director",
    org: "TechPath Institute",
    avatar: "R",
    color: "#6366f1",
  },
  {
    quote: "I used to switch between 5 different apps just to complete one week of learning. With StayKaro, I code, take tests, and track my progress without leaving the platform.",
    name: "Priya Nair",
    role: "Student",
    org: "Data Science Batch '24",
    avatar: "P",
    color: "#C9A84C",
  },
  {
    quote: "The AI mock interviews are extraordinary. My students go into real interviews with actual confidence because they've already been challenged at that level.",
    name: "Dr. Amitav Sen",
    role: "Senior Instructor",
    org: "CodeCraft Academy",
    avatar: "A",
    color: "#10b981",
  },
];

function TestimonialsSection() {
  return (
    <section className="py-28" style={{ background: "var(--background)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <FadeIn className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4" style={{ color: "var(--foreground)" }}>
            Loved by learners &amp;
            <br />
            <span style={{
              background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              institutions alike.
            </span>
          </h2>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map(({ quote, name, role, org, avatar, color }, i) => (
            <FadeIn key={name} delay={i * 0.1}>
              <motion.div
                className="rounded-2xl p-6 border h-full flex flex-col"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
                whileHover={{ y: -6, boxShadow: `0 16px 40px ${color}15`, borderColor: `${color}44` }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-current" style={{ color: "#C9A84C" }} />
                  ))}
                </div>
                <p className="text-sm leading-relaxed flex-1 mb-6" style={{ color: "var(--foreground)" }}>
                  &ldquo;{quote}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: color }}>
                    {avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{name}</p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{role} · {org}</p>
                  </div>
                </div>
              </motion.div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="py-28" style={{ background: "var(--secondary)" }}>
      <div className="max-w-4xl mx-auto px-6 text-center">
        <FadeIn>
          <div className="relative rounded-3xl p-12 sm:p-16 overflow-hidden border"
            style={{
              background: "linear-gradient(160deg, #1a1714 0%, #110f0b 100%)",
              borderColor: "#C9A84C33",
              boxShadow: "0 32px 80px rgba(0,0,0,0.3), inset 0 1px 0 rgba(201,168,76,0.2)",
            }}>
            {/* Background glow */}
            <div className="absolute inset-0 opacity-20"
              style={{ background: "radial-gradient(ellipse at 50% 0%, #C9A84C 0%, transparent 60%)" }} />

            <div className="relative">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg"
                style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
                <span className="text-black font-bold text-2xl">◈</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
                Ready to learn
                <br />
                <span style={{
                  background: "linear-gradient(135deg, #C9A84C, #E8C96A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  differently?
                </span>
              </h2>
              <p className="text-lg text-white/60 mb-10 max-w-lg mx-auto">
                Join thousands of learners and institutions already transforming education with StayKaro.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold transition-all hover:opacity-90 hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)", color: "#1A1A1A", boxShadow: "0 8px 32px rgba(201,168,76,0.4)" }}>
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white border transition-all hover:bg-white/10"
                  style={{ borderColor: "rgba(255,255,255,0.2)" }}>
                  <Mic className="w-4 h-4" />
                  Request a Demo
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-white/40 text-sm">
                {["No credit card required", "200+ institutions trust us", "Set up in minutes"].map((t) => (
                  <span key={t} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400/70" />
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  const links = {
    Product: ["Courses", "Assessments", "Coding Editor", "Analytics", "Certificates", "AI Interviewer"],
    Roles: ["Students", "Faculty", "Administrators", "Super Admin"],
    Company: ["About StayKaro", "Blog", "Careers", "Contact Us"],
    Legal: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
  };

  return (
    <footer style={{ background: "#0f0e0a", borderTop: "1px solid rgba(201,168,76,0.15)" }}>
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}>
                <span className="text-black font-bold text-sm">◈</span>
              </div>
              <span className="font-bold text-white">StayKaro</span>
            </div>
            <p className="text-sm text-white/40 leading-relaxed">
              The connected learning platform for modern education.
            </p>
          </div>

          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#C9A84C" }}>{group}</p>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-white/40 hover:text-white transition-colors">{item}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <p className="text-sm text-white/30">© 2026 StayKaro. All rights reserved.</p>
          <p className="text-sm text-white/20">
            Built for serious education. Designed with{" "}
            <span style={{ color: "#C9A84C" }}>◈</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="font-sans" style={{ background: "var(--background)" }}>
      <Navbar />
      <HeroSection />
      <StatsBar />
      <ProblemSection />
      <EcosystemSection />
      <JourneySection />
      <CodingSection />
      <RolesSection />
      <TestimonialsSection />
      <CTASection />
      <Footer />
    </div>
  );
}
