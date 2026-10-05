"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { logout } from "@/actions/auth";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";
import { hasAccess } from "@/lib/access";
import {
  disarmAllNavGuards,
  getNavGuardServerSnapshot,
  getNavGuardSnapshot,
  subscribeNavGuard,
} from "@/lib/navGuard";
import { LogOutIcon } from "@/components/icons";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConfirmLogoutModal from "@/components/ConfirmLogoutModal";

// The floating black navigation rail from the Claude Design mockup + the
// "Fix Floating Hover Sidebar" spec doc: fixed 24px inset, 24px radius,
// collapsed 80px, expands to 230px ON HOVER as an OVERLAY (z-index above the
// content, a dim scrim behind it) — the page shell reserves only the 80px
// collapsed width (see app/(app)/layout.tsx's 128px = 24+80+24 gutter), so
// expanding never reflows the page.
export default function AppSidebar({ role, appAccess }: { role: string; appAccess: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, startLogout] = useTransition();

  // "There are unsaved edits in the form on screen" — set by BillEditor and
  // the entry forms (lib/navGuard.ts). While true, leaving via a sidebar
  // link, the logout button or the browser Back button asks first.
  const { dirty } = useSyncExternalStore(
    subscribeNavGuard,
    getNavGuardSnapshot,
    getNavGuardServerSnapshot,
  );

  // A navigation held back pending confirmation.
  const [blocked, setBlocked] = useState<
    | { kind: "link"; href: string }
    | { kind: "logout" }
    | { kind: "back" }
    | null
  >(null);

  // Browser Back / Forward while the form has unsaved edits.
  //
  // The App Router owns the History API (it patches pushState and consumes
  // the popstate of any real route change before other listeners see it),
  // so a listener can't observe — let alone cancel — a plain Back that
  // leaves the form. The workaround: while dirty, keep one throwaway
  // history entry on top whose URL is the *same* as the form's. The first
  // Back pops that instead of navigating anywhere; the router sees no URL
  // change and stays out of it, so this popstate does reach us. We re-push
  // it and open the confirm.
  //
  // The sentinel is deliberately NOT popped on cleanup: doing so races the
  // real navigation that usually causes the cleanup (a save's router.push,
  // a confirmed leave) and can cancel it. It's a harmless leftover — its
  // URL is the form's, so at worst a later Back lands on the form once and,
  // if its draft autosave is still around, re-arms this guard.
  useEffect(() => {
    if (!dirty) return;

    const pushSentinel = () => {
      window.history.pushState(
        { ...window.history.state, __navGuardSentinel: true },
        "",
      );
    };
    pushSentinel();

    const onPopState = () => {
      if (!getNavGuardSnapshot().dirty) return;
      // Our sentinel was just consumed — re-arm so a second Back is caught
      // too, then ask.
      pushSentinel();
      setBlocked({ kind: "back" });
    };
    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, [dirty]);

  function handleConfirmLogout() {
    setConfirmingLogout(false);
    startLogout(async () => {
      await logout();
      router.push("/login");
      router.refresh();
    });
  }

  // "ออกโดยไม่บันทึก" — the user accepts losing the in-progress form.
  function proceedBlocked() {
    const b = blocked;
    setBlocked(null);
    if (!b) return;
    disarmAllNavGuards();

    if (b.kind === "back") {
      // We're on the re-pushed sentinel (URL = form). Step back past it and
      // the form's own entry to where Back was headed. dirty is already
      // false, so onPopState no-ops on the way through.
      window.history.go(-2);
    } else if (b.kind === "link") {
      // Sentinel is still on top; replace it so the abandoned-form
      // excursion doesn't linger in history behind the destination.
      router.replace(b.href);
    } else {
      startLogout(async () => {
        await logout();
        router.push("/login");
        router.refresh();
      });
    }
  }

  // "อยู่หน้านี้ต่อ" / "กลับไปที่ฟอร์ม" — stay with the form. The sentinel
  // was already re-pushed in onPopState (back case) or never left (link /
  // logout case), so there's nothing to undo.
  function cancelBlocked() {
    setBlocked(null);
  }

  const labelStyle: React.CSSProperties = {
    opacity: expanded ? 1 : 0,
    transform: expanded ? "translateX(0)" : "translateX(-4px)",
    transition: "opacity 180ms ease, transform 180ms ease, color 150ms ease",
  };

  return (
    <>
      {/* Scrim over the page content while the rail is open. Hovering it
          counts as leaving the rail, so the rail collapses. */}
      <div
        aria-hidden
        onMouseEnter={() => setExpanded(false)}
        className="no-print fixed inset-0 z-[900] bg-black/35 transition-opacity duration-200"
        style={{
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? "auto" : "none",
        }}
      />

      <nav
        aria-label="เมนูหลัก"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocusCapture={() => setExpanded(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setExpanded(false);
          }
        }}
        style={{
          width: expanded ? 230 : 80,
          transition: "width 220ms cubic-bezier(0.4,0,0.2,1)",
        }}
        className="no-print fixed inset-y-6 left-6 z-[1000] flex flex-col gap-5
          overflow-hidden rounded-shell bg-rail py-6 shadow-rail"
      >
        <div className="flex items-center justify-center px-4">
          <Image
            src="/icn-logo-white.png"
            alt="ICN"
            width={80}
            height={80}
            priority
            className="h-10 w-10 shrink-0 object-contain"
          />
        </div>

        <ul className="flex flex-col gap-2">
          {NAV_ITEMS.filter(
            (item) =>
              !item.disabled &&
              (!item.adminOnly || role === "ADMIN") &&
              (!item.access || hasAccess({ role, appAccess }, item.access)) &&
              (!item.hiddenUnlessActive || isNavItemActive(item, pathname)),
          ).map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  onNavigate={(e) => {
                    if (dirty && !active) {
                      e.preventDefault();
                      setBlocked({ kind: "link", href: item.href });
                    }
                  }}
                  onClick={() => setExpanded(false)}
                  className="group flex min-w-0 items-center gap-3 px-4"
                >
                  <span
                    className={`grid size-12 shrink-0 place-items-center rounded-chip transition-colors
                      ${active ? "bg-white text-black" : "bg-transparent text-[#8b8b8b] group-hover:bg-white group-hover:text-black"}`}
                  >
                    <Icon size={22} />
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-medium ${active ? "text-white" : "text-[#c9c9c9] group-hover:text-white"}`}
                    style={labelStyle}
                    title={item.label}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() =>
            dirty ? setBlocked({ kind: "logout" }) : setConfirmingLogout(true)
          }
          disabled={loggingOut}
          title="ออกจากระบบ"
          className="ui-btn group mt-auto flex items-center gap-3 bg-transparent px-4 disabled:opacity-60"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-chip text-[#8b8b8b] transition-colors group-hover:bg-[#B3261E] group-hover:text-white">
            <LogOutIcon size={22} />
          </span>
          <span
            className="whitespace-nowrap text-sm font-medium text-[#c9c9c9] group-hover:text-[#B3261E]"
            style={labelStyle}
          >
            ออกจากระบบ
          </span>
        </button>
      </nav>

      <ConfirmLogoutModal
        open={confirmingLogout}
        loggingOut={loggingOut}
        onConfirm={handleConfirmLogout}
        onCancel={() => setConfirmingLogout(false)}
      />

      <ConfirmDialog
        open={blocked !== null}
        title={blocked?.kind === "logout" ? "ออกจากระบบ?" : "ออกจากฟอร์มนี้?"}
        message={
          blocked?.kind === "logout"
            ? "ข้อมูลในฟอร์มที่ยังไม่ได้บันทึกจะหายไป ต้องการออกจากระบบใช่หรือไม่?"
            : "ข้อมูลในฟอร์มที่ยังไม่ได้บันทึกจะหายไป ต้องการออกจากหน้านี้ใช่หรือไม่?"
        }
        confirmLabel={blocked?.kind === "logout" ? "ออกจากระบบ" : "ออกโดยไม่บันทึก"}
        cancelLabel={blocked?.kind === "back" ? "กลับไปที่ฟอร์ม" : "อยู่หน้านี้ต่อ"}
        danger
        onConfirm={proceedBlocked}
        onCancel={cancelBlocked}
      />
    </>
  );
}
