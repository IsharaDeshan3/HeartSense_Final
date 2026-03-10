import neurokit2 as nk
import numpy as np


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
        
        # Calculate heart rate
        hr = nk.ecg_rate(peaks, sampling_rate=sampling_rate, desired_length=len(ecg_cleaned))
        avg_hr = np.mean(hr)
        
        # Full analysis (Intervals)
        # Note: This requires a full lead interpretation, but we'll extract basics
        # We need to find P, Q, S, T waves
        _, waves_peak = nk.ecg_delineate(ecg_cleaned, peaks, sampling_rate=sampling_rate, method="peak")
        
        # Calculate key intervals if waves are detected
        qrs_duration = 0
        pr_interval = 0
        qt_interval = 0
        
        # Simplified interval calculation for research demonstration
        if 'ECG_P_Peaks' in waves_peak and not np.isnan(waves_peak['ECG_P_Peaks']).all():
             # Logic to calculate intervals between peaks
             pass
             
        return {
            "heart_rate_avg": float(avg_hr),
            "peak_count": len(peaks),
            "hrv": float(np.std(np.diff(peaks['ECG_R_Peaks'])) / sampling_rate) if len(peaks) > 1 else 0,
            "status": "success"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
