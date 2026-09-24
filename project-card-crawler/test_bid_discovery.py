from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from bid_discovery import BidProject, discover_bid_projects, filter_new_projects


def _make_files(root: Path, files: list[str]) -> None:
    """files: relative paths (from `root`) to create as empty files, making
    parent directories as needed — mirrors test_discovery.py's `_make_tree`
    helper but for files, since bid_discovery matches on filenames."""
    for rel_path in files:
        path = root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()


def _bid_root(root: Path) -> Path:
    bid = root / "_BID"
    (bid / "00 Contract").mkdir(parents=True, exist_ok=True)
    (bid / "01 หนังสือรับรองผลงาน ICN").mkdir(parents=True, exist_ok=True)
    return bid


class DiscoverBidProjectsTest(unittest.TestCase):
    def test_finds_a_contract_only_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/NT/NT004 สัญญา.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            project = result.projects[0]
            self.assertEqual(project.project_code, "NT004")
            self.assertEqual(project.client, "NT")
            self.assertEqual(len(project.contract_candidates), 1)
            self.assertEqual(project.certificate_candidates, [])

    def test_merges_contract_and_certificate_under_the_same_project_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "00 Contract/PEA/PEA012 สัญญา.pdf",
                "01 หนังสือรับรองผลงาน ICN/PEA/PEA012 หนังสือรับรองผลงาน.pdf",
            ])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            project = result.projects[0]
            self.assertEqual(project.project_code, "PEA012")
            self.assertEqual(len(project.contract_candidates), 1)
            self.assertEqual(len(project.certificate_candidates), 1)

    def test_multiple_certificate_versions_are_all_kept_as_candidates(self):
        # Superseding-version selection needs to read document content (see
        # CONTEXT.md's Superseding Version entry) — this pure-filesystem
        # pass can't decide that, so it must report every candidate rather
        # than guessing.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "01 หนังสือรับรองผลงาน ICN/PEA/PEA012 หนังสือรับรองผลงาน.pdf",
                "01 หนังสือรับรองผลงาน ICN/PEA/PEA012 หนังสือรับรองผลงาน R1.pdf",
                "01 หนังสือรับรองผลงาน ICN/PEA/PEA012 หนังสือรับรองผลงาน DC Part.pdf",
            ])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(len(result.projects[0].certificate_candidates), 3)

    def test_drops_attachment_appendix_po_and_rar_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "00 Contract/NT/NT004 สัญญา.pdf",
                "00 Contract/NT/NT004 เอกสารแนบ.pdf",
                "00 Contract/NT/NT004 ภาคผนวก ก.pdf",
                "00 Contract/NT/NT004 PO.pdf",
                "00 Contract/NT/NT004 สแกน.rar",
            ])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(len(result.projects[0].contract_candidates), 1)

    def test_project_subfolder_name_wins_over_a_reference_number_in_the_filename(self):
        # Real case: `SVOA/SVOA009 MA .../SGP251009015(...).pdf` — the
        # filename's "SGP251" is a contract reference number matching the
        # code shape by coincidence, but the real Project Code (SVOA009)
        # lives in the project's own subfolder name.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/SVOA/SVOA009 MA เน็ทประชารัฐ/SGP251009015(บริษัท).pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(result.projects[0].project_code, "SVOA009")

    def test_po_prefixed_filename_does_not_produce_a_fake_project_code(self):
        # Real case: `PO-202510001.pdf`/`PO2401015 ...pdf` both matched the
        # code pattern on "PO" + 3 digits, merging two unrelated projects
        # (SM-001, EEC002) under one fake "PO202"/"PO240" code. The file
        # falls back to its ancestor folder name instead once "PO" itself
        # is excluded as a candidate prefix.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/SM/SM-001 ซ่อมไฟฟ้าส่องสว่าง BMA/PO-202510001.pdf"])
            result = discover_bid_projects(bid)
            self.assertNotIn("PO202", result.excluded_only_files)
            self.assertIn("SM001", result.excluded_only_files)

    def test_drops_po_file_even_when_underscore_adjacent(self):
        # Real case: `00 Contract/ITNS/ITNS 002_PO from ITNS.pdf` — "PO" sits
        # right against an underscore, which a naive \bpo\b regex misses
        # since `_` counts as a word character.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "00 Contract/ITNS/ITNS 002_PO from ITNS.pdf",
                "00 Contract/ITNS/ITNS 002 สัญญา.pdf",
            ])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(len(result.projects[0].contract_candidates), 1)

    def test_drops_non_pdf_files_like_db_or_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "00 Contract/CAT/CAT001 สัญญา.pdf",
                "00 Contract/CAT/CAT001 index.db",
                "00 Contract/CAT/CAT001 archive.zip",
            ])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(len(result.projects[0].contract_candidates), 1)

    def test_multiple_clients_and_projects(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "00 Contract/NT/NT004 สัญญา.pdf",
                "00 Contract/NT/NT002 สัญญา.pdf",
                "00 Contract/CAT/CAT001 สัญญา.pdf",
            ])
            result = discover_bid_projects(bid)
            codes = {p.project_code for p in result.projects}
            self.assertEqual(codes, {"NT004", "NT002", "CAT001"})

    def test_project_code_is_normalized_to_uppercase(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/nt/nt004 contract.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(result.projects[0].project_code, "NT004")

    def test_falls_back_to_parent_folder_name_when_filename_has_no_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/TKC/TKC002 NBTC USO Thaicom/สัญญาจ้าง.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(result.projects[0].project_code, "TKC002")

    def test_falls_back_through_multiple_ancestor_folders(self):
        # Real case found by running discovery against the real share:
        # `01 .../MEA/MEA006 DMS6/Old/สัญญาโครงการ DMS6 ....pdf` — the
        # immediate parent is `Old`, not the project folder, so a single-
        # level fallback missed it.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["01 หนังสือรับรองผลงาน ICN/MEA/MEA006 DMS6/Old/สัญญาโครงการ DMS6.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(result.projects[0].project_code, "MEA006")

    def test_code_with_a_space_between_prefix_and_number(self):
        # Real case: `00 Contract/EEC/EEC 001 OFC_....pdf`.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/EEC/EEC 001 OFC_สกอ.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(result.projects[0].project_code, "EEC001")

    def test_code_with_a_hyphen_between_prefix_and_number(self):
        # Real case: `00 Contract/PEA/PEA-008 SDH 119 Nodes.pdf`.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/PEA/PEA-008 SDH 119 Nodes.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(result.projects[0].project_code, "PEA008")

    def test_project_whose_only_file_is_excluded_is_reported_not_silently_dropped(self):
        # Real case: `00 Contract/ITNS/ITNS 002_PO from ITNS.pdf` was
        # ITNS002's only file — after the PO filter drops it, the project
        # must still show up somewhere, not vanish from every result list.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/ITNS/ITNS002_PO from ITNS.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(result.projects, [])
            self.assertEqual(result.unmatched_files, [])
            self.assertIn("ITNS002", result.excluded_only_files)
            self.assertEqual(len(result.excluded_only_files["ITNS002"]), 1)

    def test_project_with_a_surviving_candidate_is_not_reported_as_excluded_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, [
                "00 Contract/ITNS/ITNS002_PO from ITNS.pdf",
                "00 Contract/ITNS/ITNS002 สัญญา.pdf",
            ])
            result = discover_bid_projects(bid)
            self.assertEqual(len(result.projects), 1)
            self.assertEqual(result.excluded_only_files, {})

    def test_file_with_no_recognisable_project_code_is_reported_not_dropped(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            bid = _bid_root(root)
            _make_files(bid, ["00 Contract/OBEC/random notes.pdf"])
            result = discover_bid_projects(bid)
            self.assertEqual(result.projects, [])
            self.assertEqual(len(result.unmatched_files), 1)
            self.assertEqual(result.unmatched_files[0].name, "random notes.pdf")


class FilterNewProjectsTest(unittest.TestCase):
    def test_drops_projects_whose_code_is_already_known(self):
        projects = [
            BidProject(project_code="NT004", client="NT"),
            BidProject(project_code="PEA012", client="PEA"),
        ]
        result = filter_new_projects(projects, known_codes={"NT004"})
        self.assertEqual([p.project_code for p in result], ["PEA012"])

    def test_keeps_everything_when_nothing_is_known_yet(self):
        projects = [BidProject(project_code="NT004", client="NT")]
        result = filter_new_projects(projects, known_codes=set())
        self.assertEqual(result, projects)


if __name__ == "__main__":
    unittest.main()
