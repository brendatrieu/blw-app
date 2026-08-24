import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ageInMonths } from "@blw/shared";
import { useActiveBaby } from "../features/babies/useActiveBaby.js";
import { useSession } from "../lib/auth.js";
import { createSignOutDeps, performSignOut } from "../lib/signout.js";
import { BottomNav } from "./BottomNav.js";
import { CelebrationProvider } from "./ui/Celebration.js";

function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function BabySwitcher() {
  const { babies, activeBaby, setActiveBabyId } = useActiveBaby();

  if (babies.length === 0) {
    return (
      <Link
        to="/settings"
        className="text-sm font-semibold underline underline-offset-2"
        style={{ color: "var(--color-primary)" }}
      >
        Add a baby
      </Link>
    );
  }

  const months = activeBaby ? ageInMonths(activeBaby.birthDate) : null;
  const ageLabel = months === null ? null : months === 1 ? "1 month" : `${months} months`;

  // A single baby needs no picker — just show whose data is on screen,
  // with a friendly greeting above it.
  if (babies.length === 1) {
    return (
      <div className="flex flex-col">
        <span className="font-caption text-[var(--color-text-muted)]">{timeOfDayGreeting()}</span>
        <span className="font-display text-[var(--color-text)]">
          {activeBaby?.name}
          {ageLabel ? <span className="ml-1.5 text-sm font-medium text-[var(--color-text-muted)]">{ageLabel}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-caption text-[var(--color-text-muted)]">{timeOfDayGreeting()}</span>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Active baby</span>
        <select
          className="font-display appearance-none border-0 bg-transparent p-0 text-[var(--color-text)] outline-none"
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
        {ageLabel ? <span className="text-sm font-medium text-[var(--color-text-muted)]">{ageLabel}</span> : null}
      </label>
    </div>
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
        className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-pill)] border text-sm font-semibold transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-primary)]"
        style={{ borderColor: "var(--color-border)", color: "var(--color-text)", backgroundColor: "var(--color-bg-inset)" }}
        title={label}
      >
        <span aria-hidden="true" className="text-base leading-none">
          {(label || "?").trim().slice(0, 1).toUpperCase()}
        </span>
        <span className="sr-only">{label}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 flex w-48 flex-col rounded-[var(--radius-md)] border p-1"
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
            className="flex min-h-11 items-center rounded-[var(--radius-md)] px-2 py-1.5 text-sm transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)]"
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
            className="flex min-h-11 items-center rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-bg-inset)] disabled:opacity-60"
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
    <CelebrationProvider>
      <div
        className="mx-auto flex min-h-full max-w-lg flex-col"
        style={{ paddingBottom: "calc(var(--nav-height) + env(safe-area-inset-bottom))" }}
      >
        <header
          className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-2.5"
          style={{
            backgroundColor: "var(--color-bg-elevated)",
            borderColor: "var(--color-border)",
            paddingTop: "calc(0.625rem + env(safe-area-inset-top))",
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
    </CelebrationProvider>
  );
}
