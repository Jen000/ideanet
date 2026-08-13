import { useState } from "react";
import { api } from "../api";
import { Shell, Btn, panel, inputCls, inputStyle } from "../ui";

/* ================================================================= SETTINGS */
export default function Settings({ user, onUser, onBack, onSignedOut }) {
  return (
    <Shell>
      <div className="min-h-screen">
        <header className="flex items-center justify-between px-5 sm:px-8 py-4" style={{ borderBottom: "1px solid rgba(0,240,255,.1)" }}>
          <button onClick={onBack} className="text-sm tracking-[0.3em]" style={{ color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,.45)" }}>◇ IDEANET</button>
          <Btn onClick={onBack}>← back</Btn>
        </header>

        <div className="max-w-lg mx-auto px-5 py-10 flex flex-col gap-4">
          <h1 className="text-lg" style={{ color: "#eafeff" }}>Account settings</h1>

          <UsernameCard user={user} onUser={onUser} />
          <EmailCard user={user} onUser={onUser} />
          <DangerCard onSignedOut={onSignedOut} />
        </div>
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------------- username */
function UsernameCard({ user, onUser }) {
  const [name, setName] = useState(user.name || "");
  const [state, setState] = useState("idle"); // idle | saving | saved
  const [err, setErr] = useState("");

  const save = async () => {
    setErr(""); setState("saving");
    try {
      const r = await api.changeUsername(name);
      onUser({ ...user, name: r.name });
      setState("saved"); setTimeout(() => setState("idle"), 1800);
    } catch (e) { setErr(e.message); setState("idle"); }
  };

  const changed = name.trim() && name.trim() !== (user.name || "");
  return (
    <section className="p-5 rounded" style={panel}>
      <div className="text-xs mb-1" style={{ color: "#9ef0ff" }}>Username</div>
      <p className="text-[10px] mb-3" style={{ color: "#63899a" }}>The name shown on your networks and comments. Must be unique.</p>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
          placeholder="username" className={inputCls} style={{ ...inputStyle, flex: 1 }} />
        <Btn tone="primary" onClick={save} disabled={!changed || state === "saving"}>
          {state === "saving" ? "…" : state === "saved" ? "saved ✓" : "save"}
        </Btn>
      </div>
      {err && <div className="text-[10px] mt-2" style={{ color: "#ff90b0" }}>{err}</div>}
    </section>
  );
}

/* -------------------------------------------------------------------- email */
function EmailCard({ user, onUser }) {
  const [email, setEmail] = useState(user.email || "");
  const [phase, setPhase] = useState("edit"); // edit | verify
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      const r = await api.changeEmail(email);
      if (r.needsVerification) { setPhase("verify"); setMsg(`We emailed a code to ${r.email}. Enter it to confirm the change.`); }
      else { onUser({ ...user, email: r.email }); setMsg("Email updated."); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setErr(""); setBusy(true);
    try {
      await api.verifyEmail(code);
      onUser({ ...user, email: email.trim().toLowerCase() });
      setPhase("edit"); setCode(""); setMsg("Email verified and updated.");
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const changed = email.trim().toLowerCase() && email.trim().toLowerCase() !== (user.email || "");
  return (
    <section className="p-5 rounded" style={panel}>
      <div className="text-xs mb-1" style={{ color: "#9ef0ff" }}>Email</div>
      <p className="text-[10px] mb-3" style={{ color: "#63899a" }}>You sign in with this address. Changing it needs a code sent to the new email.</p>
      {phase === "edit" ? (
        <div className="flex gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
            placeholder="email" className={inputCls} style={{ ...inputStyle, flex: 1 }} />
          <Btn tone="primary" onClick={save} disabled={!changed || busy}>{busy ? "…" : "save"}</Btn>
        </div>
      ) : (
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
            placeholder="verification code" className={inputCls} style={{ ...inputStyle, flex: 1 }} />
          <Btn tone="primary" onClick={verify} disabled={busy}>{busy ? "…" : "verify"}</Btn>
          <Btn onClick={() => { setPhase("edit"); setCode(""); setErr(""); setMsg(""); }}>cancel</Btn>
        </div>
      )}
      {msg && <div className="text-[10px] mt-2" style={{ color: "#9fe9c0" }}>{msg}</div>}
      {err && <div className="text-[10px] mt-2" style={{ color: "#ff90b0" }}>{err}</div>}
    </section>
  );
}

/* ------------------------------------------------------------- delete account */
function DangerCard({ onSignedOut }) {
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const del = async () => {
    setErr(""); setBusy(true);
    try { await api.deleteAccount(); onSignedOut(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <section className="p-5 rounded" style={{ ...panel, border: "1px solid rgba(255,46,109,.3)" }}>
      <div className="text-xs mb-1" style={{ color: "#ff90b0" }}>Delete account</div>
      <p className="text-[10px] mb-3" style={{ color: "#a86a7c" }}>
        Permanently deletes your account and every network you own, along with their public copies and history. This can't be undone.
      </p>
      {!confirming ? (
        <Btn tone="danger" onClick={() => setConfirming(true)}>delete my account</Btn>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[10px]" style={{ color: "#a86a7c" }}>Type <b style={{ color: "#ff90b0" }}>DELETE</b> to confirm.</p>
          <div className="flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE"
              className={inputCls} style={{ ...inputStyle, flex: 1 }} />
            <Btn tone="danger" onClick={del} disabled={text !== "DELETE" || busy}>{busy ? "…" : "delete forever"}</Btn>
            <Btn onClick={() => { setConfirming(false); setText(""); }}>cancel</Btn>
          </div>
        </div>
      )}
      {err && <div className="text-[10px] mt-2" style={{ color: "#ff90b0" }}>{err}</div>}
    </section>
  );
}
