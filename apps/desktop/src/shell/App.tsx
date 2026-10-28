export function App() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#101014",
        color: "#e8e8f0",
      }}
    >
      <aside
        style={{ width: 220, borderRight: "1px solid #26262e", padding: 16 }}
      >
        Ombrique
      </aside>
      <main
        style={{ flex: 1, display: "grid", placeItems: "center", opacity: 0.7 }}
      >
        编辑器骨架 — 画布接入前
      </main>
      <aside
        style={{ width: 280, borderLeft: "1px solid #26262e", padding: 16 }}
      />
    </div>
  );
}
