import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../api";
import { Shell, Btn, Tag, panel, inputStyle, Spinner } from "../ui";
import MiniPreview from "../MiniPreview";

/* ================================================================= LANDING */
function AmbientField() {
  const ref = useRef(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const el = ref.current;
    if (!el) return;
    const N = 30;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * 1000, y: Math.random() * 520,
      vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
      c: ["#00f0ff", "#b967ff", "#ff2e6d", "#39ff88"][Math.floor(Math.random() * 4)],
      r: 2 + Math.random() * 3.5,
    }));
    let raf, tick = 0;
    const draw = () => {
      if (!reduce && tick++ % 2) { raf = requestAnimationFrame(draw); return; }
      let lines = "";
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d < 165) lines += `<line x1="${pts[i].x.toFixed(1)}" y1="${pts[i].y.toFixed(1)}" x2="${pts[j].x.toFixed(1)}" y2="${pts[j].y.toFixed(1)}" stroke="#00f0ff" stroke-width="0.6" opacity="${(0.22 * (1 - d / 165)).toFixed(3)}"/>`;
        }
      }
      const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r}" fill="rgba(4,8,12,.85)" stroke="${p.c}" stroke-width="1.1" opacity=".72" style="filter:drop-shadow(0 0 5px ${p.c})"/>`).join("");
      el.innerHTML = `<svg viewBox="0 0 1000 520" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%">${lines}${dots}</svg>`;
      if (reduce) return;
      pts.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1000) p.vx *= -1;
        if (p.y < 0 || p.y > 520) p.vy *= -1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="absolute inset-0 pointer-events-none" style={{ opacity: 0.5, maskImage: "linear-gradient(180deg,#000 25%,transparent 100%)", WebkitMaskImage: "linear-gradient(180deg,#000 25%,transparent 100%)" }} />;
}

export default function Landing({ user, onSignIn, onDashboard, onOpen }) {
  const [gallery, setGallery] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState(null);

  useEffect(() => {
    api.ensureSeed()
      .then(() => api.gallery())
      .then((g) => setGallery(g || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const tags = useMemo(() => {
    const c = {};
    gallery.forEach((g) => (g.tags || []).forEach((t) => (c[t] = (c[t] || 0) + 1)));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [gallery]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return gallery.filter((g) => {
      if (tag && !(g.tags || []).includes(tag)) return false;
      if (!term) return true;
      return `${g.title} ${g.description} ${g.author} ${(g.tags || []).join(" ")}`.toLowerCase().includes(term);
    });
  }, [gallery, q, tag]);

  return (
    <Shell>
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-4">
        <div className="text-sm tracking-[0.3em]" style={{ color: "#00f0ff", textShadow: "0 0 12px rgba(0,240,255,.5)" }}>◇ IDEANET</div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-[10px] hidden sm:inline" style={{ color: "#5c7f8c" }}>{user.email}</span>
              <Btn tone="primary" onClick={onDashboard}>my networks</Btn>
            </>
          ) : (
            <Btn tone="primary" onClick={onSignIn}>sign in</Btn>
          )}
        </div>
      </header>

      <section className="relative px-5 sm:px-8 pt-10 pb-16 sm:pt-20 sm:pb-24 overflow-hidden">
        <AmbientField />
        <div className="relative z-10 max-w-3xl" style={{ animation: "fadeUp .7s ease both" }}>
          <p className="text-[10px] tracking-[0.35em] mb-5" style={{ color: "#4f7a88" }}>THINK IN NODES, NOT LISTS</p>
          <h1 className="text-4xl sm:text-6xl leading-[1.05] mb-6" style={{ color: "#eafeff", textShadow: "0 0 26px rgba(0,240,255,.28)" }}>
            Map the problem.<br />
            <span style={{ color: "#00f0ff" }}>Then map the way out.</span>
          </h1>
          <p className="text-sm leading-relaxed max-w-xl mb-8" style={{ color: "#8fb4c0" }}>
            Put an idea on the canvas, pull a line to the next one, and keep going. Colour and size are yours to define,
            so the same tool works for a client diagnostic, a semester of notes, or a novel that stalled in act two.
            Keep a network private, or publish it for anyone to explore.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Btn tone="primary" onClick={user ? onDashboard : onSignIn}>{user ? "open my networks" : "start a network"}</Btn>
            <Btn onClick={() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })}>browse public networks</Btn>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-5 sm:px-8 pb-10 grid gap-4 sm:grid-cols-3 max-w-5xl">
        {[
          ["Drag to connect", "Pull a line from one node to another. No dialogs, no forms — the graph grows as fast as you think."],
          ["Types you invent", "Name your own node types and give each a colour and a size. Nothing is hard-coded to issues and solutions."],
          ["Focus without losing place", "Select a node and its connections stay lit while the rest recedes — still there, just quieter."],
        ].map(([h, b]) => (
          <div key={h} className="p-4 rounded" style={panel}>
            <div className="text-xs mb-2" style={{ color: "#9ef0ff" }}>{h}</div>
            <div className="text-[11px] leading-relaxed" style={{ color: "#7d9fab" }}>{b}</div>
          </div>
        ))}
      </section>

      <section id="gallery" className="relative z-10 px-5 sm:px-8 py-14 max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg mb-1" style={{ color: "#eafeff" }}>Public networks</h2>
            <p className="text-[11px]" style={{ color: "#63899a" }}>Ranked by likes and views. Anyone can open these — no account needed.</p>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search title, author, tag"
            className="px-3 py-2 rounded text-xs w-64 max-w-full" style={inputStyle} />
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            <Tag on={!tag} onClick={() => setTag(null)}>all</Tag>
            {tags.map((t) => <Tag key={t} on={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</Tag>)}
          </div>
        )}

        {!loaded ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <Spinner />
            <div className="text-[10px] tracking-widest" style={{ color: "#5f8492" }}>LOADING NETWORKS</div>
          </div>
        ) : shown.length === 0 ? (
          <div className="p-8 rounded text-center text-xs" style={{ ...panel, color: "#5f8492" }}>
            Nothing matches that yet. Try a different word, or clear the tag filter.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((g) => (
              <button key={g.id} onClick={() => onOpen(g.id)} className="text-left rounded overflow-hidden transition-transform hover:-translate-y-0.5"
                style={panel}>
                <div style={{ borderBottom: "1px solid rgba(0,240,255,.1)", background: "rgba(0,0,0,.35)" }}>
                  <MiniPreview preview={g.preview} />
                </div>
                <div className="p-4">
                  <div className="flex items-start gap-2 mb-1.5">
                    <div className="text-xs flex-1 min-w-0" style={{ color: "#dff6fb" }}>{g.title}</div>
                    {g.visibility === "open" ? (
                      <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap" style={{ color: "#39ff88", border: "1px solid rgba(57,255,136,.4)", background: "rgba(57,255,136,.08)" }} title="Anyone signed in can edit this network">OPEN · EDITABLE</span>
                    ) : (
                      <span className="text-[8px] px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap" style={{ color: "#7fd4e2", border: "1px solid rgba(0,240,255,.25)" }} title="Anyone can read this network">PUBLIC</span>
                    )}
                  </div>
                  <div className="text-[10px] leading-relaxed mb-3" style={{ color: "#6f94a1", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{g.description}</div>
                  <div className="flex flex-wrap gap-1 mb-3">{(g.tags || []).slice(0, 3).map((t) => <Tag key={t}>{t}</Tag>)}</div>
                  <div className="flex items-center justify-between text-[10px]" style={{ color: "#4f7280" }}>
                    <span>{g.author}</span>
                    <span>♥ {g.likes} · ◉ {g.views} · 💬 {g.comments || 0} · {g.nodeCount} nodes</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="relative z-10 px-5 sm:px-8 py-8 text-[10px]" style={{ color: "#3c5865", borderTop: "1px solid rgba(0,240,255,.08)" }}>
        IDEANET — build networks of ideas.
      </footer>
    </Shell>
  );
}
