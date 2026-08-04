import { useState, useEffect } from "react";
import { api } from "./api";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";

/* ===================================================================== APP */
export default function App() {
  const [route, setRoute] = useState({ name: "landing" });
  const [user, setUser] = useState(null);
  const [publicNet, setPublicNet] = useState(null);
  const [liked, setLiked] = useState([]);

  useEffect(() => {
    api.currentUser().then(setUser);
    api.likedIds().then(setLiked);
    api.ensureSeed();
  }, []);

  const openPublic = async (id) => {
    const net = await api.openPublic(id);
    if (!net) return;
    setPublicNet(net);
    setRoute({ name: "viewer", id });
  };

  const like = async () => {
    const r = await api.toggleLike(publicNet.id);
    setLiked((l) => (r.liked ? [...l, publicNet.id] : l.filter((x) => x !== publicNet.id)));
    setPublicNet((n) => ({ ...n, likes: r.likes }));
  };

  if (route.name === "auth")
    return <Auth onBack={() => setRoute({ name: "landing" })} onDone={(u) => { setUser(u); setRoute({ name: "dashboard" }); }} />;

  if (route.name === "dashboard" && user)
    return <Dashboard user={user} onHome={() => setRoute({ name: "landing" })}
      onOpen={(id) => setRoute({ name: "editor", id })}
      onSignOut={async () => { await api.signOut(); setUser(null); setRoute({ name: "landing" }); }} />;

  if (route.name === "editor" && user)
    return <Editor netId={route.id} user={user} onExit={() => setRoute({ name: "dashboard" })} />;

  if (route.name === "viewer" && publicNet)
    return <Editor netId={publicNet.id} readOnly publicNet={publicNet}
      liked={liked.includes(publicNet.id)} onLike={like}
      onExit={() => { setPublicNet(null); setRoute({ name: "landing" }); }} />;

  return <Landing user={user} onSignIn={() => setRoute({ name: "auth" })}
    onDashboard={() => setRoute({ name: user ? "dashboard" : "auth" })} onOpen={openPublic} />;
}
