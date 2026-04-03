import unittest
from unittest.mock import patch

import numpy as np

from processing.features import extract_features


class TestExtractFeatures(unittest.TestCase):
    @patch("processing.features.nk.ecg_delineate")
    @patch("processing.features.nk.ecg_rate")
    @patch("processing.features.nk.ecg_peaks")
    @patch("processing.features.nk.ecg_clean")
    def test_extract_features_computes_intervals(
        self,
        mock_clean,
        mock_peaks,
        mock_rate,
        mock_delineate,
    ):
        sampling_rate = 500
        signal = np.sin(np.linspace(0, 2 * np.pi, 1000))

        mock_clean.return_value = signal
        mock_peaks.return_value = (
            {"ECG_R_Peaks": np.array([100, 350, 600])},
            {"ECG_R_Peaks": np.array([100, 350, 600])},
        )
        mock_rate.return_value = np.array([60.0, 62.0, 61.0])
        mock_delineate.return_value = (
            None,
            {
                "ECG_P_Peaks": np.array([80, 330, 580], dtype=float),
                "ECG_Q_Peaks": np.array([100, 350, 600], dtype=float),
                "ECG_S_Peaks": np.array([120, 370, 620], dtype=float),
                "ECG_T_Peaks": np.array([180, 430, 680], dtype=float),
            },
        )

        result = extract_features(signal, sampling_rate=sampling_rate)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["peak_count"], 3)
        self.assertAlmostEqual(result["heart_rate_avg"], 61.0, places=2)

        # At 500 Hz, 20 samples = 40 ms; 80 samples = 160 ms.
        self.assertAlmostEqual(result["intervals_ms"]["pr_interval"], 40.0, places=2)
        self.assertAlmostEqual(result["intervals_ms"]["qrs_duration"], 40.0, places=2)
        self.assertAlmostEqual(result["intervals_ms"]["qt_interval"], 160.0, places=2)

    @patch("processing.features.nk.ecg_delineate")
    @patch("processing.features.nk.ecg_rate")
    @patch("processing.features.nk.ecg_peaks")
    @patch("processing.features.nk.ecg_clean")
    def test_extract_features_handles_missing_wave_indices(
        self,
        mock_clean,
        mock_peaks,
        mock_rate,
        mock_delineate,
    ):
        sampling_rate = 500
        signal = np.sin(np.linspace(0, 2 * np.pi, 1000))

        mock_clean.return_value = signal
        mock_peaks.return_value = (
            {"ECG_R_Peaks": np.array([200, 500])},
            {"ECG_R_Peaks": np.array([200, 500])},
        )
        mock_rate.return_value = np.array([58.0, 59.0])
        mock_delineate.return_value = (
            None,
            {
                "ECG_P_Peaks": np.array([np.nan, np.nan]),
                "ECG_Q_Peaks": np.array([200, 500], dtype=float),
                "ECG_S_Peaks": np.array([np.nan, np.nan]),
                "ECG_T_Peaks": np.array([np.nan, np.nan]),
            },
        )

        result = extract_features(signal, sampling_rate=sampling_rate)

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["peak_count"], 2)
        self.assertEqual(result["intervals_ms"]["pr_interval"], 0.0)
        self.assertEqual(result["intervals_ms"]["qrs_duration"], 0.0)
        self.assertEqual(result["intervals_ms"]["qt_interval"], 0.0)


if __name__ == "__main__":
    unittest.main()
