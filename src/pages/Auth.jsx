import { useState } from "react";
import { api } from "../api";
import { Shell, Btn, panel, inputCls, inputStyle } from "../ui";

/* ==================================================================== AUTH */
export default function Auth({ onDone, onBack }) {
  const [mode, setMode] = useState("in"); // in | up | confirm
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "confirm") {
        const u = await api.confirmSignUp(email, code, pw);
        onDone(u);
        return;
      }
      if (mode === "in") {
        onDone(await api.signIn(email, pw));
        return;
      }
      // create account
      const r = await api.signUp(name, email, pw);
      if (r && r.needsConfirmation) {
        setCode(""); setInfo(`We emailed a code to ${email}. Enter it to finish.`);
        setMode("confirm");
      } else {
        onDone(r);
      }
    } catch (e) {
      // A sign-in on an unconfirmed account routes to the code step.
      if (e?.needsConfirmation) { setInfo("This account isn't confirmed yet — enter the code we emailed you."); setMode("confirm"); }
      else setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setErr(""); setInfo("");
    try { await api.resendCode(email); setInfo("A new code is on its way."); }
    catch (e) { setErr(e.message); }
  };

  const blurb = mode === "in" ? "Sign in to open your networks."
    : mode === "up" ? "Create an account to save networks and publish them."
    : "Check your email for a verification code.";

  return (
    <Shell>
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="w-full max-w-sm p-6 rounded" style={{ ...panel, animation: "fadeUp .5s ease both" }}>
          <div className="text-sm tracking-[0.3em] mb-1" style={{ color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,.45)" }}>◇ IDEANET</div>
          <p className="text-[11px] mb-6" style={{ color: "#6a8f9c" }}>{blurb}</p>

          {mode === "confirm" ? (
            <>
              <p className="text-[10px] mb-2" style={{ color: "#7fd4e2" }}>{email}</p>
              <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="verification code" inputMode="numeric" autoComplete="one-time-code"
                className={`${inputCls} mb-3`} style={inputStyle} />
            </>
          ) : (
            <>
              {mode === "up" && (
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="display name"
                  className={`${inputCls} mb-2`} style={inputStyle} />
              )}
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email"
                className={`${inputCls} mb-2`} style={inputStyle} />
              <input value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="password" type="password" className={`${inputCls} mb-3`} style={inputStyle} />
            </>
          )}

          {err && <div className="text-[10px] mb-3 px-2 py-1.5 rounded" style={{ color: "#ff90b0", border: "1px solid rgba(255,46,109,.35)", background: "rgba(255,46,109,.07)" }}>{err}</div>}
          {info && <div className="text-[10px] mb-3 px-2 py-1.5 rounded" style={{ color: "#9fe9c0", border: "1px solid rgba(57,255,136,.3)", background: "rgba(57,255,136,.06)" }}>{info}</div>}

          {mode === "confirm" ? (
            <div className="flex gap-2">
              <Btn tone="primary" onClick={submit}>{busy ? "…" : "confirm"}</Btn>
              <Btn onClick={resend}>resend code</Btn>
            </div>
          ) : (
            <div className="flex gap-2">
              <Btn tone="primary" onClick={submit}>{busy ? "…" : mode === "in" ? "sign in" : "create account"}</Btn>
              <Btn onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); setInfo(""); }}>{mode === "in" ? "create account" : "i have an account"}</Btn>
            </div>
          )}

          <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid rgba(0,240,255,.1)" }}>
            {mode === "confirm"
              ? <button onClick={() => { setMode("in"); setErr(""); setInfo(""); }} className="text-[10px]" style={{ color: "#4f7280" }}>← use a different email</button>
              : <button onClick={onBack} className="text-[10px]" style={{ color: "#4f7280" }}>← back to home</button>}
          </div>
          <p className="mt-3 text-[9px] leading-relaxed" style={{ color: "#3f5f6c" }}>
            {mode === "confirm"
              ? "Codes can take a minute to arrive; check your spam folder. The code expires after a while — resend if it stops working."
              : "Your account and networks are stored securely in the cloud. Use an email and a password of at least 8 characters."}
          </p>
        </div>
      </div>
    </Shell>
  );
}
