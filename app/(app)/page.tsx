import Link from "next/link";
import { requireActor } from "@/lib/authorization";
import { hasAccess, type AppPermission } from "@/lib/access";
import {
  BanknoteIcon,
  FileCheckIcon,
  CalculatorIcon,
  ListIcon,
  ClipboardCheckIcon,
  SearchIcon,
} from "@/components/icons";

// The Applications launcher — the portal front door. Matches Claude Design
// "Turn 6a": a card grid of every tool in the system, plus a disabled
// "เร็วๆ นี้" slot for future subsystems. No data fetch of its own, but it
// must stay dynamic like every other route in this group: the shared
// layout (app/(app)/layout.tsx) reads the session cookie for the top-bar
// avatar, and under force-static that cookie read returns empty, baking a
// "?" avatar into the prerendered page for every user.
export const dynamic = "force-dynamic";

type Tile = {
  href: string;
  title: string;
  desc: string;
  cta: string;
  icon: (p: { size?: number }) => React.ReactElement;
  tile: string;
  soon?: boolean;
  // Shown only to users with this app access (lib/access.ts).
  access: AppPermission;
};

const TILES: Tile[] = [
  {
    href: "/bill/entry/fa017",
    title: "Employee Expense Claim",
    desc: "F-FA-017 · เบิกค่าใช้จ่ายที่มีใบเสร็จ พร้อมคำนวณค่าเดินทางในตัว",
    cta: "เปิดฟอร์ม →",
    icon: BanknoteIcon,
    tile: "bg-peach text-black",
    access: "expense",
  },
  {
    href: "/bill/entry/fa018",
    title: "ใบรับรองแทนใบเสร็จ",
    desc: "F-FA-018 · สำหรับค่าใช้จ่ายที่ไม่มีบิล เช่น ค่ารถ ค่าที่จอดรถ",
    cta: "เปิดฟอร์ม →",
    icon: FileCheckIcon,
    tile: "bg-lavender text-black",
    access: "expense",
  },
  {
    href: "/travel",
    title: "คำนวณค่าเดินทาง",
    desc: "คิดระยะทาง เบี้ยเลี้ยง และค่าน้ำมันตามอัตราบริษัท",
    cta: "เปิดเครื่องมือ →",
    icon: CalculatorIcon,
    tile: "bg-chip text-ink",
    access: "expense",
  },
  {
    href: "/records",
    title: "รายการทั้งหมด",
    desc: "บิลที่บันทึกไว้ทั้งหมด ค้นหา แก้ไข ทำซ้ำ และพิมพ์",
    cta: "เปิดรายการ →",
    icon: ListIcon,
    tile: "bg-chip text-ink",
    access: "expense",
  },
  {
    href: "/project-card",
    title: "ค้นหาโครงการ",
    desc: "ค้นหาโครงการจากคลังไฟล์ PS ด้วยชื่อลูกค้า โปรเจกต์ หรือคำอธิบาย",
    cta: "เปิดเครื่องมือ →",
    icon: SearchIcon,
    tile: "bg-chip text-ink",
    access: "project-card",
  },
  {
    href: "/soc",
    title: "ตรวจสอบ SOC",
    desc: "ตรวจสอบเอกสารอ้างอิงและ Statement of Compliance",
    cta: "เปิดเครื่องมือ →",
    icon: ClipboardCheckIcon,
    tile: "bg-chip text-ink",
    access: "soc",
  },
];

export default async function AppsLauncherPage() {
  const actor = await requireActor();
  const tiles = TILES.filter((t) => hasAccess(actor, t.access));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-[28px] font-bold leading-tight">
          แอปพลิเคชัน
        </h1>
        <p className="text-sm text-muted">เลือกเครื่องมือที่ต้องการใช้งาน</p>
      </div>

      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        {tiles.length === 0 ? (
          <p className="text-sm text-muted">บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานระบบใด ติดต่อผู้ดูแลระบบ</p>
        ) : null}
        {tiles.map((t) => {
          const Icon = t.icon;
          const body = (
            <>
              <div
                className={`grid size-11 place-items-center rounded-chip ${t.tile}`}
              >
                <Icon size={20} />
              </div>
              <div className="font-display text-[15px] font-semibold">
                {t.title}
              </div>
              <div className="text-[13px] leading-relaxed text-muted">
                {t.desc}
              </div>
              <div
                className={`mt-auto text-[13px] font-medium ${t.soon ? "text-muted" : "text-ink"}`}
              >
                {t.cta}
              </div>
            </>
          );

          if (t.soon) {
            return (
              <div
                key={t.title}
                title="เร็วๆ นี้"
                className="relative flex cursor-not-allowed flex-col gap-3 rounded-card bg-surface p-[22px] opacity-45 shadow-card"
              >
                <span className="absolute right-4 top-4 rounded-full bg-chip px-2.5 py-1 text-[11px] font-semibold text-muted">
                  เร็วๆ นี้
                </span>
                {body}
              </div>
            );
          }

          return (
            <Link
              key={t.title}
              href={t.href}
              className="flex flex-col gap-3 rounded-card bg-surface p-[22px] text-ink no-underline shadow-card transition-colors hover:bg-hover"
            >
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
