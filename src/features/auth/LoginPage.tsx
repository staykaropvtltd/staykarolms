import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Navigate } from "react-router";
import { useAuth } from "@/shared/context/AuthContext";
import { motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

type LocationState = { from?: { pathname: string } };

function friendlyLoginError(msg: string): string {
  if (!msg) return "Something went wrong. Please try again.";
  if (/invalid login credentials/i.test(msg)) return "Incorrect email or password. Please try again.";
  if (/email not confirmed/i.test(msg)) return "Please verify your email address before signing in.";
  if (/too many requests/i.test(msg)) return "Too many login attempts. Please wait a moment and try again.";
  if (/user not found/i.test(msg)) return "No account found with this email address.";
  if (/network/i.test(msg) || /fetch/i.test(msg)) return "Connection error. Please check your internet and try again.";
  return msg;
}

// ── Theme-specific color tokens ────────────────────────────────────────────────
const LIGHT = {
  leftBg:       "linear-gradient(160deg, #FFFBEB 0%, #FFF3CD 50%, #FFE9A0 100%)",
  leftText:     "#1A1A1A",
  leftSubtext:  "#6B6560",
  rightBg:      "#FFFFFF",
  cardBg:       "#1A1A1A14",
  cardBorder:   "#1A1A1A18",
  cardTitle:    "#1A1A1A",
  cardDesc:     "#6B6560",
  statVal:      "#1A1A1A",
  statLabel:    "#6B6560",
  roleActive:   { bg: "#1A1A1A", text: "#FFFFFF", border: "#1A1A1A" },
  roleInactive: { bg: "#F5F0E8", text: "#6B6560", hover: "#EDE8DF" },
  inputBg:      "#F7F5F2",
  inputBorder:  "#E0D9CE",
  inputText:    "#1A1A1A",
  hintBg:       "#F7F5F2",
  dividerBg:    "#FFFFFF",
  dividerLine:  "#E0D9CE",
  googleBg:     "#FFFFFF",
  googleBorder: "#E0D9CE",
  googleText:   "#1A1A1A",
  toggleBg:     "#FFFFFF",
  toggleBorder: "#E0D9CE",
  labelText:    "#1A1A1A",
  subtitleText: "#6B6560",
  footerText:   "#6B6560",
  footerLink:   "#1A1A1A",
};

const DARK = {
  leftBg:       "#1A1A1A",
  leftText:     "#FFFFFF",
  leftSubtext:  "#9A9590",
  rightBg:      "#E8E3DA",
  cardBg:       "#ffffff10",
  cardBorder:   "#ffffff14",
  cardTitle:    "#FFFFFF",
  cardDesc:     "#9A9590",
  statVal:      "#FFFFFF",
  statLabel:    "#9A9590",
  roleActive:   { bg: "#1A1A1A", text: "#FFFFFF", border: "#1A1A1A" },
  roleInactive: { bg: "#D4CFC6", text: "#4A4540", hover: "#C8C3BA" },
  inputBg:      "#D8D3CA",
  inputBorder:  "#C4BFB6",
  inputText:    "#1A1A1A",
  hintBg:       "#D8D3CA",
  dividerBg:    "#E8E3DA",
  dividerLine:  "#C4BFB6",
  googleBg:     "#D8D3CA",
  googleBorder: "#C4BFB6",
  googleText:   "#1A1A1A",
  toggleBg:     "#D8D3CA",
  toggleBorder: "#C4BFB6",
  labelText:    "#2A2520",
  subtitleText: "#4A4540",
  footerText:   "#4A4540",
  footerLink:   "#2A2520",
};

export function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Already logged in → redirect to their dashboard
  if (isAuthenticated && user) {
    return <Navigate to={`/${user.role}/dashboard`} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg("Please enter your email and password.");
      return;
    }
    setIsLoggingIn(true);
    try {
      const profile = await login(trimmedEmail, password);
      const state = location.state as LocationState | null;
      const destination = state?.from?.pathname ?? (profile ? `/${profile.role}/dashboard` : "/");
      navigate(destination, { replace: true });
    } catch (err: any) {
      setErrorMsg(friendlyLoginError(err.message));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const isDark = mounted && theme === "dark";
  const C = isDark ? DARK : LIGHT;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── Left panel — hidden on mobile ── */}
      <motion.div
        className="hidden md:flex md:w-[45%] lg:w-1/2 flex-col justify-center gap-6 relative overflow-hidden p-5 lg:p-8"
        style={{ background: C.leftBg, color: C.leftText }}
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Ambient glows */}
        <div className="absolute -bottom-28 left-8 h-80 w-80 rounded-full blur-3xl" style={{ background: "#C9A84C18" }} />
        <div className="absolute -top-24 right-10 h-72 w-72 rounded-full blur-3xl"  style={{ background: "#C9A84C08" }} />
        <div className="absolute top-1/2 -left-20 h-64 w-64 rounded-full blur-3xl"  style={{ background: "#C9A84C0A" }} />

        {/* ── TOP: Logo + subtitle ── */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #C9A84C, #E8C96A)" }}
            >
              <span className="text-black font-bold text-sm">◈</span>
            </div>
            <div>
              <p className="font-bold text-base leading-tight" style={{ color: C.leftText }}>StayKaro</p>
              <p className="text-[10px] tracking-widest uppercase" style={{ color: "#C9A84C" }}>Learning Management</p>
            </div>
          </div>
        </div>

        {/* ── MIDDLE: Marketing content ── */}
        <div className="relative z-10 flex flex-col gap-3">

          {/* Trust badge */}
          <div
            className="flex items-center gap-2 w-fit px-3 py-1 rounded-full border"
            style={{ borderColor: "#C9A84C44", background: "#C9A84C14" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#C9A84C" }} />
            <span className="text-xs font-medium" style={{ color: "#C9A84C" }}>Trusted by 200+ institutions worldwide</span>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight" style={{ color: C.leftText }}>
              Empower Every
            </h1>
            <h1 className="text-3xl lg:text-4xl font-bold leading-tight" style={{ color: "#C9A84C" }}>
              Learning Journey
            </h1>
          </div>

          {/* Feature cards — staggered entrance */}
          <motion.div className="grid grid-cols-2 gap-2">
            {[
              { icon: "👥", title: "Multi-Role Access",   desc: "Students, faculty & admins" },
              { icon: "🎤", title: "AI Interviews",        desc: "Claude-powered mock rounds" },
              { icon: "📊", title: "Real-Time Analytics",  desc: "Live dashboards & insights" },
              { icon: "🏆", title: "Auto Certificates",    desc: "Issued on course completion" },
            ].map(({ icon, title, desc }, index) => (
              <motion.div
                key={title}
                className="rounded-xl p-2.5 border transition-colors"
                style={{ background: C.cardBg, borderColor: C.cardBorder }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 + 0.3, duration: 0.4 }}
              >
                <span className="text-base mb-1 block">{icon}</span>
                <p className="text-xs font-semibold leading-tight" style={{ color: C.cardTitle }}>{title}</p>
                <p className="text-[11px] mt-0.5 leading-tight"    style={{ color: C.cardDesc }}>{desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* ── BOTTOM: Stats ── */}
        <div className="relative z-10 flex gap-6">
          {[
            { val: "50K+", label: "Active Learners" },
            { val: "200+", label: "Institutions" },
            { val: "98%",  label: "Placement Rate" },
          ].map(({ val, label }) => (
            <div key={label}>
              <p className="text-xl font-bold"  style={{ color: C.statVal }}>{val}</p>
              <p className="text-xs mt-0.5"     style={{ color: C.statLabel }}>{label}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Right panel ── */}
      <motion.div
        className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-hidden relative transition-colors duration-300"
        style={{ background: C.rightBg }}
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
      >
        {/* Theme toggle — top right corner */}
        {mounted && (
          <motion.button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="absolute top-4 right-4 p-2.5 rounded-xl border transition-colors"
            style={{ background: C.toggleBg, borderColor: C.toggleBorder }}
            aria-label="Toggle theme"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            {isDark ? (
              <Sun  className="w-4 h-4" style={{ color: "#C9A84C" }} />
            ) : (
              <Moon className="w-4 h-4" style={{ color: "#6B6560" }} />
            )}
          </motion.button>
        )}

        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-5 md:hidden">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#C9A84C" }}>
              <span className="text-black font-bold text-xs">◈</span>
            </div>
            <span className="font-semibold" style={{ color: C.leftText }}>
              Staykaro <span style={{ color: "#C9A84C" }}>LMS</span>
            </span>
          </div>

          <div className="mb-4">
            <h2 className="text-xl sm:text-2xl font-semibold mb-1" style={{ color: C.labelText }}>
              Welcome back
            </h2>
            <p className="text-sm" style={{ color: C.subtitleText }}>
              New here?{" "}
              <a href="#" className="font-semibold hover:underline" style={{ color: "#C9A84C" }}>
                Create an account
              </a>
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.labelText }}>
                Email address
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
                placeholder="you@institution.edu"
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C9A84C] text-sm transition-colors"
                style={{
                  background:  C.inputBg,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: C.inputBorder,
                  color:       C.inputText,
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: C.labelText }}>
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C9A84C] text-sm transition-colors"
                style={{
                  background:  C.inputBg,
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: C.inputBorder,
                  color:       C.inputText,
                }}
              />
            </div>

            <div className="flex justify-end">
              <a href="#" className="text-xs font-semibold hover:underline" style={{ color: "#C9A84C" }}>
                Forgot password?
              </a>
            </div>

            <motion.button
              type="submit"
              disabled={isLoggingIn}
              className={`w-full text-[#1A1A1A] py-2 rounded-xl font-bold transition-opacity flex items-center justify-center gap-2 text-sm ${isLoggingIn ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"}`}
              style={{ background: "linear-gradient(to right, #C9A84C, #E8C96A)" }}
              whileHover={isLoggingIn ? {} : { scale: 1.02 }}
              whileTap={isLoggingIn ? {} : { scale: 0.97 }}
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>→ Sign in</span>
              )}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: C.dividerLine }} />
            </div>
            <div className="relative flex justify-center text-xs">
              <span
                className="px-2"
                style={{ background: C.dividerBg, color: C.subtitleText }}
              >
                or continue with
              </span>
            </div>
          </div>

          <button
            className="w-full flex items-center justify-center gap-3 py-2 rounded-lg border transition-colors text-sm"
            style={{
              background:  C.googleBg,
              borderColor: C.googleBorder,
              color:       C.googleText,
            }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="font-medium" style={{ color: C.googleText }}>Sign in with Google</span>
          </button>

          <p className="mt-3 text-center text-xs" style={{ color: C.footerText }}>
            By signing in you agree to our{" "}
            <a href="#" className="hover:underline font-medium" style={{ color: C.footerLink }}>Terms</a>{" "}and{" "}
            <a href="#" className="hover:underline font-medium" style={{ color: C.footerLink }}>Privacy Policy</a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
