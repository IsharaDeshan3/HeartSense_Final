import json
import tempfile
import unittest
from pathlib import Path

from benchmark.run_benchmark import run_benchmark


class TestBenchmarkRunner(unittest.TestCase):
    def test_benchmark_report_shape(self):
        cases_path = Path("benchmark/cases.json")
        with cases_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        report = run_benchmark(payload)

        self.assertIn("summary", report)
        self.assertIn("results", report)
        self.assertGreaterEqual(report["summary"]["total_cases"], 1)
        self.assertEqual(
            report["summary"]["total_cases"],
            len(report["results"]),
        )

    def test_report_can_be_serialized(self):
        cases_path = Path("benchmark/cases.json")
        with cases_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)

        report = run_benchmark(payload)

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = Path(tmp_dir) / "report.json"
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)

            self.assertTrue(out_path.exists())


if __name__ == "__main__":
    unittest.main()
