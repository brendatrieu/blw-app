import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav.js";

export function AppLayout() {
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col pb-16">
      <main className="flex-1">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
