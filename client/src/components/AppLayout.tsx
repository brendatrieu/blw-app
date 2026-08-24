import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useSession } from "../lib/auth.js";
import { createSignOutDeps, performSignOut } from "../lib/signout.js";
import { BottomNav } from "./BottomNav.js";

function BabySwitcher() {
  const { babies, activeBaby, setActiveBabyId } = useActiveBaby();

  if (babies.length === 0) {
    return (
      <Link to="/settings" className="text-sm underline" style={{ color: "var(--color-primary)" }}>
        Add a baby
      </Link>
    );
  }

  // A single baby needs no picker — just show whose data is on screen.
  if (babies.length === 1) {
    return (
      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {activeBaby?.name}
      </span>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active baby</span>
      <select
        className="rounded-lg border px-2 py-1 text-sm"
        style={{
          backgroundColor: "var(--color-bg)",
          borderColor: "var(--color-border)",
          color: "var(--color-text)",
        }}
        value={activeBaby?.id ?? ""}
        onChange={(event) => {
          setActiveBabyId(event.target.value || null);
        }}
      >
        {babies.map((baby) => (
          <option key={baby.id} value={baby.id}>
            {baby.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserMenu() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const label = session?.user.name || session?.user.email || "Account";

  async function handleSignOut() {
    setSigningOut(true);
    await performSignOut(createSignOutDeps(queryClient));
    setOpen(false);
    setSigningOut(false);
    void navigate("/login", { replace: true });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="min-h-11 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--color-primary)]"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
      >
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-xl border p-1"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            borderColor: "var(--color-border)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <span
            className="truncate px-2 py-1.5 text-xs"
            style={{ color: "var(--color-text-muted)" }}
            title={session?.user.email}
          >
            {session?.user.email}
          </span>
          <Link
            to="/settings"
            role="menuitem"
            onClick={() => {
              setOpen(false);
            }}
            className="flex min-h-11 items-center rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-inset)]"
            style={{ color: "var(--color-text)" }}
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              void handleSignOut();
            }}
            className="flex min-h-11 items-center rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--color-bg-inset)] disabled:opacity-60"
            style={{ color: "var(--color-danger)" }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();

  return (
    <div
      className="mx-auto flex min-h-full max-w-lg flex-col"
      style={{ paddingBottom: "calc(var(--nav-height) + env(safe-area-inset-bottom))" }}
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-2"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          borderColor: "var(--color-border)",
          paddingTop: "calc(0.5rem + env(safe-area-inset-top))",
        }}
      >
        <BabySwitcher />
        <UserMenu />
      </header>

      <main className="scroll-momentum flex-1">
        <div key={location.pathname} className="page-transition">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
