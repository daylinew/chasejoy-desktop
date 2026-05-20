import { useEffect } from "react";

import { AppShell } from "./components/shell/AppShell";
import { useAppStore } from "./stores/appStore";

export function App() {
  const refreshAgents = useAppStore((s) => s.refreshAgents);
  const refreshProviders = useAppStore((s) => s.refreshProviders);
  const applyStreamEvent = useAppStore((s) => s.applyStreamEvent);
  const setApproval = useAppStore((s) => s.setApproval);

  useEffect(() => {
    const bridge = window.chasejoy;
    if (!bridge) {
      console.error(
        "[ChaseJoy] preload bridge missing — `window.chasejoy` is undefined. Did the preload fail to load?",
      );
      return;
    }

    void refreshProviders();
    void refreshAgents();

    const offStream = bridge.on.onStream((evt) => applyStreamEvent(evt));
    const offApproval = bridge.on.onApprovalRequest((req) => setApproval(req));
    return () => {
      offStream();
      offApproval();
    };
  }, [refreshAgents, refreshProviders, applyStreamEvent, setApproval]);

  if (!window.chasejoy) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="max-w-lg rounded-lg border border-cj-err/40 bg-cj-panel p-6 text-sm">
          <div className="mb-2 text-base font-semibold text-cj-err">Preload bridge missing</div>
          <div className="text-cj-dim">
            <code>window.chasejoy</code> is undefined. This usually means the preload script
            failed to load. Check the main process console for a <code>preload-error</code>
            entry, then verify <code>webPreferences.preload</code> points to{" "}
            <code>out/preload/index.cjs</code>. Restart <code>npm run dev</code> after fixing.
          </div>
        </div>
      </div>
    );
  }

  return <AppShell />;
}
