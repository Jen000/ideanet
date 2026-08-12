import { useState, useEffect } from "react";
import { api } from "./api";
import { Shell } from "./ui";
import { useRoute, parseRoute } from "./router";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";

const Loading = () => (
  <Shell><div className="min-h-screen flex items-center justify-center text-xs" style={{ color: "#5f8492" }}>Loading…</div></Shell>
);

/* ===================================================================== APP */
export default function App() {
  const { path, navigate } = useRoute();
  const route = parseRoute(path);

  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [publicNet, setPublicNet] = useState(null);
  const [liked, setLiked] = useState([]);
  const [starred, setStarred] = useState([]);

  useEffect(() => {
    api.currentUser().then((u) => { setUser(u); setUserLoaded(true); if (u) api.syncProfile?.().catch(() => {}); });
    api.likedIds().then(setLiked);
    api.starredIds().then(setStarred);
    api.ensureSeed();
  }, []);

  // Load the public network for the viewer route straight from its id, so a
  // deep link or a refresh on /view/:id works with no prior state.
  useEffect(() => {
    if (route.name !== "viewer" || !route.id) return;
    if (publicNet?.id === route.id) return;
    let alive = true;
    api.openPublic(route.id).then((n) => {
      if (!alive) return;
      if (n) setPublicNet(n);
      else navigate("/", { replace: true });
    });
    return () => { alive = false; };
  }, [route.name, route.id, publicNet?.id, navigate]);

  // Signed-out users can't reach protected routes.
  useEffect(() => {
    if (userLoaded && !user && (route.name === "dashboard" || route.name === "editor")) {
      navigate("/signin", { replace: true });
    }
  }, [userLoaded, user, route.name, navigate]);

  const like = async () => {
    const r = await api.toggleLike(publicNet.id);
    setLiked((l) => (r.liked ? [...l, publicNet.id] : l.filter((x) => x !== publicNet.id)));
    setPublicNet((n) => ({ ...n, likes: r.likes }));
  };
  const star = async () => {
    const r = await api.toggleStar(publicNet.id);
    setStarred((s) => (r.starred ? [...s, publicNet.id] : s.filter((x) => x !== publicNet.id)));
  };

  if (route.name === "auth")
    return <Auth onBack={() => navigate("/")} onDone={(u) => { setUser(u); navigate("/dashboard"); }} />;

  if (route.name === "dashboard") {
    if (!userLoaded || !user) return <Loading />;
    return <Dashboard user={user} onHome={() => navigate("/")}
      onOpen={(id) => navigate(`/net/${id}`)}
      onOpenPublic={(id) => navigate(`/view/${id}`)}
      onSignOut={async () => { await api.signOut(); setUser(null); navigate("/"); }} />;
  }

  if (route.name === "editor") {
    if (!userLoaded || !user) return <Loading />;
    return <Editor netId={route.id} user={user} onExit={() => navigate("/dashboard")} />;
  }

  if (route.name === "viewer") {
    if (!publicNet || publicNet.id !== route.id) return <Loading />;
    return <Editor netId={publicNet.id} readOnly publicNet={publicNet} user={user}
      liked={liked.includes(publicNet.id)} onLike={like}
      starred={starred.includes(publicNet.id)} onStar={user ? star : null}
      onExit={() => navigate("/")} />;
  }

  return <Landing user={user} onSignIn={() => navigate("/signin")}
    onDashboard={() => navigate(user ? "/dashboard" : "/signin")} onOpen={(id) => navigate(`/view/${id}`)} />;
}
