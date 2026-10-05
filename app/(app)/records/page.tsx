import { requirePageAccess } from "@/lib/authorization";
import Link from "next/link";
import { getProfile, listSavedEmployees } from "@/actions/profile";
import { listRecords } from "@/actions/records";
import PageShell from "@/components/PageShell";
import ProfileCard from "@/components/ProfileCard";
import RecordsTable from "@/components/RecordsTable";
import { fmt } from "@/lib/format";
import { THAI_MONTHS } from "@/lib/constants";

// Records change whenever anyone saves/deletes a bill, so this page must
// never be served from a static build-time snapshot.
export const dynamic = "force-dynamic";

function relativeDay(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(then)) / 86_400_000);
  if (days <= 0) return "วันนี้";
  if (days === 1) return "เมื่อวาน";
  return then.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
  });
}

// The history view. Server Component: fetches profile + records straight
// from the DB.
export default async function HistoryPage() {
  await requirePageAccess("expense");
  // Sequential, not Promise.all: verified against this project's Postgres
  // setup that concurrent queries sharing one Prisma client can corrupt the
  // wire protocol (mixed-up bind/prepared-statement state).
  const profile = await getProfile();
  const savedEmployees = await listSavedEmployees();
  const records = await listRecords();

  const now = new Date();
  const monthNum = String(now.getMonth() + 1);
  const beYear = now.getFullYear() + 543;
  const thisMonth = records.filter(
    (r) => r.monthName === monthNum && r.monthYear === beYear,
  );
  const monthTotal = thisMonth.reduce((s, r) => s + parseFloat(r.total), 0);
  const fa018Count = records.filter((r) => r.type === "FA018").length;
  const lastEdited = records[0]; // listRecords orders by updatedAt desc

  const stats: {
    label: string;
    value: string;
    tone: "plain" | "peach" | "lavender";
  }[] = [
    {
      label: "ยอดรวมเดือนนี้",
      value: monthTotal ? fmt(monthTotal) : "-",
      tone: "plain",
    },
    {
      label: `ฟอร์มเดือน${THAI_MONTHS[now.getMonth()]}`,
      value: `${thisMonth.length} ฉบับ`,
      tone: "peach",
    },
    {
      label: "ใบรับรองแทนใบเสร็จ",
      value: `${fa018Count} ฉบับ`,
      tone: "lavender",
    },
    {
      label: "แก้ไขล่าสุด",
      value: lastEdited
        ? `${relativeDay(lastEdited.updatedAt)} · ${lastEdited.updatedByName || "-"}`
        : "—",
      tone: "plain",
    },
  ];

  const toneClass = {
    plain: "bg-surface shadow-card text-ink",
    peach: "bg-peach text-[#7a5a2e]",
    lavender: "bg-lavender text-[#3b3f75]",
  } as const;

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[28px] font-bold leading-tight">
              รายการทั้งหมด
            </h1>
            <p className="text-sm text-muted">
              ระบบบิลค่าใช้จ่ายรายเดือน · {records.length} รายการที่บันทึกไว้
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2.5">
            <Link
              href="/travel"
              className="rounded-field border border-line bg-surface px-5 py-3 text-[13.5px] font-medium text-ink no-underline transition-colors hover:bg-hover"
            >
              คำนวณค่าเดินทาง
            </Link>
            <Link
              href="/bill/entry/fa018"
              className="rounded-field border-[1.5px] border-ink px-5 py-3 text-[13.5px] font-medium text-ink no-underline transition-colors hover:bg-hover"
            >
              + ใบรับรองแทนใบเสร็จ
            </Link>
            <Link
              href="/bill/entry/fa017"
              className="rounded-field bg-accent px-5 py-3 font-display text-[13.5px] font-bold text-black no-underline transition-colors hover:bg-[#f08d10]"
            >
              + Expense Claim
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`flex flex-col gap-1.5 rounded-card p-5 ${toneClass[s.tone]}`}
            >
              <div
                className={`text-[13px] ${s.tone === "plain" ? "text-muted" : "opacity-80"}`}
              >
                {s.label}
              </div>
              <div className="font-display text-[26px] font-bold leading-tight">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <ProfileCard
          initialProfile={profile}
          savedEmployees={savedEmployees}
        />
        <RecordsTable records={records} />
      </div>
    </PageShell>
  );
}
