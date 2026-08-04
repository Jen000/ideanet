import { useState } from "react";
import { api } from "../api";
import { Shell, Btn, panel, inputCls, inputStyle } from "../ui";

/* ==================================================================== AUTH */
export default function Auth({ onDone, onBack }) {
  const [mode, setMode] = useState("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    try {
      const u = mode === "in" ? await api.signIn(email, pw) : await api.signUp(name, email, pw);
      onDone(u);
    } catch (e) { setErr(e.message); }
  };

  return (
    <Shell>
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="w-full max-w-sm p-6 rounded" style={{ ...panel, animation: "fadeUp .5s ease both" }}>
          <div className="text-sm tracking-[0.3em] mb-1" style={{ color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,.45)" }}>◇ IDEANET</div>
          <p className="text-[11px] mb-6" style={{ color: "#6a8f9c" }}>
            {mode === "in" ? "Sign in to open your networks." : "Create an account to save networks and publish them."}
          </p>

          {mode === "up" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="display name"
              className={`${inputCls} mb-2`} style={inputStyle} />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email"
            className={`${inputCls} mb-2`} style={inputStyle} />
          <input value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="password" type="password" className={`${inputCls} mb-3`} style={inputStyle} />

          {err && <div className="text-[10px] mb-3 px-2 py-1.5 rounded" style={{ color: "#ff90b0", border: "1px solid rgba(255,46,109,.35)", background: "rgba(255,46,109,.07)" }}>{err}</div>}

          <div className="flex gap-2">
            <Btn tone="primary" onClick={submit}>{mode === "in" ? "sign in" : "create account"}</Btn>
            <Btn onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }}>{mode === "in" ? "create account" : "i have an account"}</Btn>
          </div>

          <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(0,240,255,.1)" }}>
            <button onClick={onBack} className="text-[10px]" style={{ color: "#4f7280" }}>← back to home</button>
          </div>
          <p className="mt-3 text-[9px] leading-relaxed" style={{ color: "#3f5f6c" }}>
            Demo accounts are stored on this device only. Real sign-in arrives when this is wired to Cognito.
          </p>
        </div>
      </div>
    </Shell>
  );
}
