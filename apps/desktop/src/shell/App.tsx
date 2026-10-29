import { useEffect, useState } from "react";
import { Shell, type ShellView } from "@ombrique/editor-ui";
import { createShellState } from "./state";

const state = createShellState();

export function App() {
  const [view, setView] = useState<ShellView>(state.getView());

  useEffect(() => {
    setView({ ...state.getView() });
    return state.subscribe((next) => setView({ ...next }));
  }, []);

  return (
    <div className="app-root">
      <Shell view={view} actions={state.actions} />
    </div>
  );
}
