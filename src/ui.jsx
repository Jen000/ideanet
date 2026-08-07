import { MONO } from "./constants";

/* ================================================================== CHROME */
export const Shell = ({ children }) => (
  <div className="min-h-screen w-full relative" style={{ fontFamily: MONO, background: "#000", color: "#cfe9f0" }}>
    <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 40%, #0a0f16 0%, #04070a 55%, #000 100%)" }} />
    <div className="fixed inset-0 pointer-events-none" style={{
      backgroundImage: "linear-gradient(rgba(0,240,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,.055) 1px, transparent 1px)",
      backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 50% 45%, #000 20%, transparent 78%)",
      WebkitMaskImage: "radial-gradient(ellipse at 50% 45%, #000 20%, transparent 78%)",
    }} />
    <div className="relative">{children}</div>
    <style>{`
      @keyframes np { 0%,100% { filter: brightness(1) } 50% { filter: brightness(1.4) } }
      @keyframes fadeUp { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform:none } }
      input, textarea, select { outline: none }
      input:focus, textarea:focus, select:focus { border-color: rgba(0,240,255,.6) !important; box-shadow: 0 0 0 1px rgba(0,240,255,.25) }
      ::selection { background: rgba(0,240,255,.28) }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important } }
    `}</style>
  </div>
);

export const panel = { background: "rgba(6,11,16,.82)", border: "1px solid rgba(0,240,255,.16)", backdropFilter: "blur(9px)" };
export const inputCls = "w-full px-2.5 py-1.5 rounded text-xs";
export const inputStyle = { fontFamily: MONO, background: "rgba(0,0,0,.5)", border: "1px solid rgba(0,240,255,.2)", color: "#dff6fb" };

export function Btn({ children, onClick, tone = "ghost", className = "", type }) {
  const tones = {
    primary: { background: "rgba(0,240,255,.12)", border: "1px solid rgba(0,240,255,.55)", color: "#9ef0ff" },
    ghost: { background: "rgba(255,255,255,.02)", border: "1px solid rgba(0,240,255,.18)", color: "#8fbecb" },
    danger: { background: "rgba(255,46,109,.08)", border: "1px solid rgba(255,46,109,.45)", color: "#ff90b0" },
  };
  return (
    <button type={type} onClick={onClick} className={`px-3 py-1.5 rounded text-xs transition-colors ${className}`} style={{ fontFamily: MONO, ...tones[tone] }}>
      {children}
    </button>
  );
}

export const Tag = ({ children, on, onClick }) => (
  <button onClick={onClick} className="px-2 py-0.5 rounded-full text-[10px]"
    style={{ fontFamily: MONO, border: `1px solid ${on ? "rgba(0,240,255,.6)" : "rgba(0,240,255,.18)"}`, background: on ? "rgba(0,240,255,.12)" : "transparent", color: on ? "#9ef0ff" : "#6d94a1" }}>
    {children}
  </button>
);

export const Spinner = ({ size = 26 }) => (
  <div className="animate-spin" style={{ width: size, height: size, borderRadius: "50%", border: "2.5px solid rgba(0,240,255,.22)", borderTopColor: "#00f0ff", boxShadow: "0 0 10px rgba(0,240,255,.35)" }} />
);
