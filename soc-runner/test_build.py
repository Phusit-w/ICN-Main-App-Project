"""installer/build.py's deploy step: update.ps1 rebuilds the installer only when its sources changed.

Run: python -m unittest discover -s soc-runner -p "test_*.py"
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "installer"))

import build


class DeployTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="soc-runner-build-"))
        self.target = self.dir / "runner" / "SOCRunnerSetup.exe"
        self.builds = 0

        def fake_build() -> Path:
            self.builds += 1
            built = self.dir / "dist" / "SOCRunnerSetup.exe"
            built.parent.mkdir(exist_ok=True)
            built.write_bytes(b"installer %d" % self.builds)
            return built

        self.fake_build = fake_build

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def deploy(self, digest: str) -> bool:
        return build.deploy(self.target, digest, self.fake_build)

    def test_first_deploy_builds_and_places_the_installer(self):
        self.assertTrue(self.deploy("a"))
        self.assertEqual(self.target.read_bytes(), b"installer 1")

    def test_unchanged_sources_skip_the_build(self):
        self.deploy("a")
        self.assertFalse(self.deploy("a"))
        self.assertEqual(self.builds, 1)

    def test_changed_sources_rebuild(self):
        self.deploy("a")
        self.assertTrue(self.deploy("b"))
        self.assertEqual(self.target.read_bytes(), b"installer 2")

    def test_a_missing_installer_is_rebuilt_even_with_the_same_sources(self):
        self.deploy("a")
        self.target.unlink()
        self.assertTrue(self.deploy("a"))

    def test_the_digest_covers_every_file_that_goes_into_the_installer(self):
        before = build.sources_digest()
        names = [p.name for p in build.source_files()]
        for name in ["runner.py", "claude_cli.py", "server_client.py", "install.py",
                     "SocRunnerSetup.cs", "build.py", "requirements.txt", "app.manifest"]:
            self.assertIn(name, names)
        self.assertEqual(build.sources_digest(), before)


if __name__ == "__main__":
    unittest.main()
