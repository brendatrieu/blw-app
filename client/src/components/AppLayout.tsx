import { useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { signOut, useSession } from "../lib/auth.js";
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
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const label = session?.user.name || session?.user.email || "Account";

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
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
        className="rounded-lg border px-2 py-1 text-sm"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
      >
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 flex w-48 flex-col rounded-lg border p-1 shadow-lg"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            borderColor: "var(--color-border)",
          }}
        >
          <span
            className="truncate px-2 py-1 text-xs"
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
            className="rounded px-2 py-1 text-sm"
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
            className="rounded px-2 py-1 text-left text-sm disabled:opacity-60"
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
  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col pb-16">
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-2"
        style={{
          backgroundColor: "var(--color-bg-elevated)",
          borderColor: "var(--color-border)",
        }}
      >
        <BabySwitcher />
        <UserMenu />
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
