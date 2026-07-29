export default function MiniPreview({ preview }) {
  if (!preview?.nodes?.length) return null;
  const xs = preview.nodes.map((n) => n.x), ys = preview.nodes.map((n) => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
  const P = (n) => ({ x: 8 + ((n.x - minX) / w) * 224, y: 8 + ((n.y - minY) / h) * 84 });
  const idx = {};
  preview.ids.forEach((id, i) => (idx[id] = preview.nodes[i]));
  const color = (t) => (preview.types.find((x) => x.id === t) || {}).color || "#00f0ff";
  return (
    <svg viewBox="0 0 240 100" className="w-full h-[100px]">
      {preview.edges.map(([s, t], i) => {
        if (!idx[s] || !idx[t]) return null;
        const a = P(idx[s]), b = P(idx[t]);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2c4753" strokeWidth="0.7" />;
      })}
      {preview.nodes.map((n, i) => {
        const p = P(n);
        return <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="rgba(4,8,12,.9)" stroke={color(n.t)} strokeWidth="1" style={{ filter: `drop-shadow(0 0 3px ${color(n.t)})` }} />;
      })}
    </svg>
  );
}
