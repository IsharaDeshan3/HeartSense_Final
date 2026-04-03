import neurokit2 as nk
import numpy as np


def _as_clean_indices(values):
    """Normalize candidate index arrays by dropping NaNs and casting to int."""
    if values is None:
        return []
    arr = np.array(values, dtype=float)
    if arr.size == 0:
        return []
    return [int(v) for v in arr if not np.isnan(v)]


def _nearest_non_negative_delta(anchor_idx, candidate_indices):
    """Return nearest non-negative sample delta from anchor to candidate indices."""
    deltas = [idx - anchor_idx for idx in candidate_indices if idx >= anchor_idx]
    if not deltas:
        return None
    return min(deltas)


def _mean_interval_ms(anchor_indices, candidate_indices, sampling_rate):
    """Estimate mean interval duration (ms) between paired wave peaks."""
    if not anchor_indices or not candidate_indices or sampling_rate <= 0:
        return 0.0

    durations = []
    for anchor in anchor_indices:
        delta = _nearest_non_negative_delta(anchor, candidate_indices)
        if delta is not None:
            durations.append(delta / sampling_rate * 1000.0)

    if not durations:
        return 0.0
    return float(np.mean(durations))


def extract_signal_data(signal_data, sampling_rate=500):
    """
    Extract full cleaned signal arrays and annotated peak indices for frontend visualization.
    This is a standalone helper that complements extract_features() without modifying it.
    Returns the raw signal values, R/P/Q/S/T peak positions, and RR intervals.
    """
    try:
        ecg_cleaned = nk.ecg_clean(signal_data, sampling_rate=sampling_rate)
        peaks_df, info = nk.ecg_peaks(ecg_cleaned, sampling_rate=sampling_rate)

        # info['ECG_R_Peaks'] contains actual integer sample indices of R-peaks
        r_peak_indices = [int(v) for v in info['ECG_R_Peaks']]

        rr_intervals = []
        if len(r_peak_indices) > 1:
            rr_intervals = [
                round(
                    (r_peak_indices[i + 1] - r_peak_indices[i]) / sampling_rate * 1000, 1
                )
                for i in range(len(r_peak_indices) - 1)
            ]

        # Delineate P, Q, S, T waves (optional – gracefully skipped on failure)
        p_peaks, q_peaks, s_peaks, t_peaks = [], [], [], []
        try:
            _, waves = nk.ecg_delineate(
                ecg_cleaned, peaks_df, sampling_rate=sampling_rate, method="peak"
            )

            def _clean_idx(key):
                col = waves.get(key)
                if col is None:
                    return []
                arr = np.array(col, dtype=float)
                return [int(v) for v in arr if not np.isnan(v)]

            p_peaks = _clean_idx("ECG_P_Peaks")
            q_peaks = _clean_idx("ECG_Q_Peaks")
            s_peaks = _clean_idx("ECG_S_Peaks")
            t_peaks = _clean_idx("ECG_T_Peaks")
        except Exception:
            pass  # delineation is optional; R-peaks are still returned

        return {
            "signal": [round(float(v), 4) for v in ecg_cleaned],
            "r_peaks": r_peak_indices,
            "rr_intervals": rr_intervals,
            "p_peaks": p_peaks,
            "q_peaks": q_peaks,
            "s_peaks": s_peaks,
            "t_peaks": t_peaks,
            "sampling_rate": sampling_rate,
            "status": "success",
        }
    except Exception as e:
        # Return signal array so the frontend can still render the waveform
        # even when NeuroKit2 peak detection fails
        return {
            "signal": [round(float(v), 4) for v in signal_data],
            "r_peaks": [],
            "rr_intervals": [],
            "p_peaks": [],
            "q_peaks": [],
            "s_peaks": [],
            "t_peaks": [],
            "sampling_rate": sampling_rate,
            "status": "partial",
            "message": str(e),
        }


def extract_features(signal_data, sampling_rate=500):
    """
    Extract clinical features from filtered ECG signal using NeuroKit2.
    """
    try:
        # Clean the signal again with NeuroKit's specific filters
        ecg_cleaned = nk.ecg_clean(signal_data, sampling_rate=sampling_rate)

        # Find R-peaks
        peaks, info = nk.ecg_peaks(ecg_cleaned, sampling_rate=sampling_rate)

        r_peak_indices = [int(v) for v in info.get("ECG_R_Peaks", [])]

        # Calculate heart rate
        hr = nk.ecg_rate(peaks, sampling_rate=sampling_rate, desired_length=len(ecg_cleaned))
        avg_hr = float(np.mean(hr)) if len(hr) else 0.0

        # Delineate waves to estimate interval metrics.
        _, waves_peak = nk.ecg_delineate(ecg_cleaned, peaks, sampling_rate=sampling_rate, method="peak")

        p_peaks = _as_clean_indices(waves_peak.get("ECG_P_Peaks"))
        q_peaks = _as_clean_indices(waves_peak.get("ECG_Q_Peaks"))
        s_peaks = _as_clean_indices(waves_peak.get("ECG_S_Peaks"))
        t_peaks = _as_clean_indices(waves_peak.get("ECG_T_Peaks"))

        # Approximate intervals in milliseconds using nearest valid pairings.
        pr_interval = _mean_interval_ms(p_peaks, q_peaks, sampling_rate)
        qrs_duration = _mean_interval_ms(q_peaks, s_peaks, sampling_rate)
        qt_interval = _mean_interval_ms(q_peaks, t_peaks, sampling_rate)

        rr_samples = np.diff(r_peak_indices) if len(r_peak_indices) > 1 else np.array([])
        hrv_seconds = float(np.std(rr_samples / sampling_rate)) if rr_samples.size else 0.0

        return {
            "heart_rate_avg": avg_hr,
            "peak_count": len(r_peak_indices),
            "hrv": hrv_seconds,
            "intervals_ms": {
                "pr_interval": round(pr_interval, 2),
                "qrs_duration": round(qrs_duration, 2),
                "qt_interval": round(qt_interval, 2),
            },
            "status": "success",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
        }
