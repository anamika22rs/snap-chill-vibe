import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { CallProvider } from "./CallProvider";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CallProvider>
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-lg pb-28">{children}</div>
        <BottomNav />
      </div>
    </CallProvider>
  );
}
