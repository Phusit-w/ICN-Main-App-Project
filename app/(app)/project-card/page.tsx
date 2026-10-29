import { prisma } from "@/lib/prisma";
import { requirePageAccess } from "@/lib/authorization";
import { hasAccess } from "@/lib/access";
import Field from "@/components/ui/Field";
import Button from "@/components/ui/Button";
import { SearchIcon } from "@/components/icons";
import ProjectCardList, { ProjectCardResultBar } from "@/components/ProjectCardList";
import SocGuidedTour from "@/components/SocGuidedTour";
import { PROJECT_CARD_TOUR } from "@/lib/project-card-tours";
import { CommaNumberField } from "@/components/CommaNumberInput";
import Link from "next/link";
import { loadTaxonomy } from "@/lib/project-card-terms";
import { CERTIFICATE_AGE_OPTIONS } from "@/lib/project-card-certificate-date";
import { findProjectCards, parseProjectCardSearch, type ProjectCardSearchParams } from "@/lib/project-card-search";
import { questionSearchModel } from "@/lib/question-search-model";
import { askProjectCardQuestion } from "@/actions/projectCardQuestion";

export const dynamic = "force-dynamic";

// No cap on the query, deliberately — matches this app's other main list
// (actions/records.ts's listRecords, also uncapped) rather than inventing
// this app's first pagination UI for a few hundred rows. Revisit only if
// the catalog grows enough for that to become a real cost.

// Flat access (docs/adr/0006-project-card-flat-access-control.md): any
// signed-in user, no extra role check — same as every other screen in this
// app.

// Datalist options for the client filter. "PEA (BBTEC)" is split so the card
// counts toward both PEA and BBTEC, matching how the filter above finds it.
function clientOptions(rows: { client: string; _count: number }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const { client, _count } of rows) {
    const match = /^(.+?) \((.+)\)$/.exec(client);
    for (const name of match ? [match[1], match[2]] : [client]) {
      counts.set(name, (counts.get(name) ?? 0) + _count);
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

export default async function ProjectCardPage({
  searchParams,
}: {
  // `ask`: the question Question Search turned into these filters.
  searchParams: Promise<ProjectCardSearchParams & { ask?: string }>;
}) {
  const actor = await requirePageAccess("project-card");
  const taxonomy = await loadTaxonomy();
  const params = await searchParams;
  const search = parseProjectCardSearch(params, taxonomy);
  // ถามด้วยประโยค: admins only during the trial, and only once the model is
  // set up on this server. The ordinary search never waits on it.
  const canAsk = actor.role === "ADMIN" && questionSearchModel() !== null;
  const asked = canAsk ? params.ask?.trim() ?? "" : "";
  const {
    query, client, categoryDisplay, workTypeDisplay, yearFrom, yearTo, budgetMin, budgetMax,
    wantsContract, wantsCertificate, certWithin, chips, currentParams,
  } = search;

  const [cards, availableYears, availableClients, categoryCounts, workTypeCounts] = await Promise.all([
    findProjectCards(search),
    prisma.projectCard.findMany({
      where: { year: { not: null } },
      distinct: ["year"],
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    prisma.projectCard.groupBy({
      by: ["client"],
      _count: true,
      orderBy: { client: "asc" },
    }),
    // Counted the way the filter finds cards: main Category or secondary (Tag).
    Promise.all(
      taxonomy.categories.map((c) =>
        prisma.projectCard.count({ where: { OR: [{ category: c.value }, { tags: { has: c.value } }] } }),
      ),
    ),
    // workTypes is an array column, which groupBy can't split — one count per
    // Work Type instead (the list holds only a handful).
    Promise.all(taxonomy.workTypes.map((w) => prisma.projectCard.count({ where: { workTypes: { has: w.value } } }))),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold">ค้นหาโครงการ</h1>
          <p className="mt-1 text-sm text-muted">
            ค้นหาจากลูกค้า ชื่อโครงการ หรือคำอธิบาย พร้อมกรองตามลูกค้า หมวดหมู่ ลักษณะงาน ปี งบประมาณ และเอกสาร — ข้อมูลจากสัญญาและหนังสือรับรองผลงานในโฟลเดอร์{" "}
            <code className="text-xs">_BID</code>
          </p>
        </div>
        <SocGuidedTour tourId="project-card" steps={PROJECT_CARD_TOUR} />
      </div>

      {/* The boxes only read defaultValue when first made, and ล้างทั้งหมด / a chip's ×
          change the URL without a page load. Keyed on the filters in use, the
          form is made afresh whenever they change, so a dropped filter's text
          doesn't linger in its box (and come back on the next ค้นหา). */}
      <form key={currentParams.toString()} method="get" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div data-tour="search" className="min-w-[240px] flex-1">
            <Field
              label="ค้นหา"
              name="q"
              defaultValue={query}
              leftIcon={<SearchIcon size={18} />}
              placeholder="เช่น Solarcell, RFID, MEA"
            />
          </div>
          <Button type="submit" variant="dark" className="h-[52px]" data-tour="search-button">
            ค้นหา
          </Button>
        </div>
        {/* Every filter but the search box, folded so the page opens on one row.
            A plain <details>: no script, and its fields still submit with the form. */}
        <details className="group rounded-card bg-surface shadow-card">
          <summary data-tour="filters" className="ui-btn flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-label hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90">▸</span>
            ตัวกรอง
            {chips.length ? (
              <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-surface">{chips.length}</span>
            ) : null}
            <span className="text-xs font-normal text-muted">ลูกค้า หมวดหมู่ ลักษณะงาน ปี งบประมาณ เอกสาร</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[150px]">
                <label className="mb-1.5 block text-[13px] font-medium text-label">ลูกค้า</label>
                <input
                  name="client"
                  list="project-card-clients"
                  defaultValue={client}
                  placeholder="ทุกลูกค้า"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-clients">
                  {clientOptions(availableClients).map(([c, count]) => (
                    <option key={c} value={c} label={`${count.toLocaleString("th-TH")} โครงการ`} />
                  ))}
                </datalist>
              </div>
              <div className="w-[280px]">
                <label htmlFor="project-card-category" className="mb-1.5 block text-[13px] font-medium text-label">
                  หมวดหมู่
                </label>
                <input
                  id="project-card-category"
                  name="category"
                  list="project-card-categories"
                  defaultValue={categoryDisplay}
                  placeholder="ทุกหมวด — พิมพ์หรือเลือก"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-categories">
                  {taxonomy.categories.map((c, i) => (
                    <option
                      key={c.value}
                      value={c.en}
                      label={`${c.th} · ${categoryCounts[i].toLocaleString("th-TH")} โครงการ`}
                    />
                  ))}
                </datalist>
              </div>
              <div className="w-[240px]">
                <label htmlFor="project-card-work-type" className="mb-1.5 block text-[13px] font-medium text-label">
                  ลักษณะงาน
                </label>
                <input
                  id="project-card-work-type"
                  name="workType"
                  list="project-card-work-types"
                  defaultValue={workTypeDisplay}
                  placeholder="ทุกลักษณะงาน — พิมพ์หรือเลือก"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-work-types">
                  {taxonomy.workTypes.map((w, i) => (
                    <option
                      key={w.value}
                      value={w.en}
                      label={`${w.th} · ${workTypeCounts[i].toLocaleString("th-TH")} โครงการ`}
                    />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div className="w-[120px]">
                <label htmlFor="project-card-year-from" className="mb-1.5 block text-[13px] font-medium text-label">
                  ตั้งแต่ปี
                </label>
                <input
                  id="project-card-year-from"
                  name="yearFrom"
                  list="project-card-years"
                  inputMode="numeric"
                  defaultValue={yearFrom !== undefined ? String(yearFrom) : ""}
                  placeholder="เช่น 2020"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
              </div>
              <div className="w-[120px]">
                <label htmlFor="project-card-year-to" className="mb-1.5 block text-[13px] font-medium text-label">
                  ถึงปี
                </label>
                <input
                  id="project-card-year-to"
                  name="yearTo"
                  list="project-card-years"
                  inputMode="numeric"
                  defaultValue={yearTo !== undefined ? String(yearTo) : ""}
                  placeholder="เช่น 2024"
                  autoComplete="off"
                  className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                />
                <datalist id="project-card-years">
                  {availableYears.map(({ year: y }) => (
                    <option key={y} value={y ?? ""} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <CommaNumberField
                  label="งบมากกว่า (ล้านบาท)"
                  name="budgetMin"
                  maxDecimals={6}
                  defaultValue={budgetMin !== undefined ? String(budgetMin) : ""}
                  placeholder="เช่น 10"
                  containerClassName="w-[180px]"
                />
                <CommaNumberField
                  label="งบน้อยกว่า (ล้านบาท)"
                  name="budgetMax"
                  maxDecimals={6}
                  defaultValue={budgetMax !== undefined ? String(budgetMax) : ""}
                  placeholder="เช่น 100"
                  containerClassName="w-[180px]"
                />
              </div>
            </div>
              <div className="flex flex-wrap items-end gap-4">
                <fieldset>
                  <legend className="mb-1.5 block text-[13px] font-medium text-label">เอกสารที่มี</legend>
                  <div className="flex h-[52px] items-center gap-4 text-sm text-ink">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="doc" value="contract" defaultChecked={wantsContract} className="size-4" />
                      สัญญา
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="doc" value="certificate" defaultChecked={wantsCertificate} className="size-4" />
                      หนังสือรับรอง
                    </label>
                  </div>
                </fieldset>
                <div className="w-[200px]">
                  <label htmlFor="project-card-cert-within" className="mb-1.5 block text-[13px] font-medium text-label">
                    หนังสือรับรองออกภายใน
                  </label>
                  <select
                    id="project-card-cert-within"
                    name="certWithin"
                    defaultValue={certWithin !== undefined ? String(certWithin) : ""}
                    className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm"
                  >
                    <option value="">ไม่กำหนด</option>
                    {CERTIFICATE_AGE_OPTIONS.map((years) => (
                      <option key={years} value={years}>
                        {years} ปี
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            <div className="flex gap-2">
              <Button type="submit" variant="dark" size="sm">
                ใช้ตัวกรอง
              </Button>
            </div>
          </div>
        </details>
      </form>

      {/* Its own form: the question goes to the action, which redirects back
          here with the filters it understood (replacing the ones above) and
          the question, shown here to edit and ask again. */}
      {canAsk ? (
        <details open={Boolean(asked)} className="group -mt-3 rounded-card bg-surface shadow-card">
          <summary className="ui-btn flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-medium text-label hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="transition-transform group-open:rotate-90">▸</span>
            ถามด้วยประโยค
            <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-normal text-muted">ทดลอง · ผู้ดูแลระบบ</span>
          </summary>
          <form action={askProjectCardQuestion} className="flex flex-wrap items-end gap-3 px-5 pb-4">
            <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-sm text-label">
              {asked ? "คำถาม:" : "พิมพ์คำถาม"}
              <input
                name="question"
                defaultValue={asked}
                required
                maxLength={500}
                placeholder="เช่น งานติดตั้งที่งบมากกว่า 350 ล้าน เมื่อ 5 ปีที่แล้ว"
                className="h-[52px] w-full rounded-field border border-line bg-surface px-4 text-sm text-ink outline-none focus:border-ink"
              />
            </label>
            <Button type="submit" variant="dark" className="h-[52px]">
              {asked ? "ถามอีกครั้ง" : "ถาม"}
            </Button>
            <p className="w-full text-xs text-muted">
              AI ในเครื่องของบริษัทแปลงคำถามเป็นตัวกรองด้านล่าง แล้วค้นหาตามปกติ ตัวกรองเดิมจะถูกแทนที่
            </p>
          </form>
        </details>
      ) : null}

      {chips.length || query ? (
        <div data-tour="active-filters" className="-mt-3 flex flex-wrap items-center gap-2 text-sm">
          {chips.length ? <span className="text-muted">ใช้อยู่:</span> : null}
          {chips.map((chip) => (
            <span key={chip.label} className="inline-flex items-center gap-1 rounded-full bg-chip py-1 pl-3 pr-1 text-label">
              {chip.label}
              <Link
                href={chip.href}
                aria-label={`ลบตัวกรอง ${chip.label}`}
                className="ui-btn inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
              >
                ×
              </Link>
            </span>
          ))}
          {/* A plain link back to the unfiltered page: clears every filter and the search at once.
              Shown for a search with no filters too, so a typed query always has a way out. */}
          <Link href="/project-card" className="ui-btn text-muted underline-offset-2 hover:text-ink hover:underline">
            ล้างทั้งหมด
          </Link>
        </div>
      ) : null}

      {/* With cards, the list draws the count, ส่งออก Excel and the results box
          itself, since the export follows the sort picked there. */}
      {cards.length ? (
        <ProjectCardList
          taxonomy={taxonomy}
          canEdit={hasAccess(actor, "project-card-edit")}
          exportQuery={currentParams.toString()}
          cards={cards}
        />
      ) : (
        <>
          <ProjectCardResultBar count={0} exportQuery={null} />
          <div data-tour="results" className="overflow-hidden rounded-card bg-surface shadow-card">
            <div className="p-12 text-center">
              <div className="font-display text-lg font-semibold">
                {search.filtered ? "ไม่พบโครงการที่ค้นหา" : "ยังไม่มีข้อมูลโครงการ"}
              </div>
              <p className="mt-2 text-sm text-muted">
                {search.filtered ? "ลองปรับคำค้นหรือตัวกรอง" : "รันสคริปต์ crawler เพื่อดึงข้อมูลจาก share ก่อน"}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
