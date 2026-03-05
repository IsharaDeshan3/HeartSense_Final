import neurokit2 as nk
import numpy as np

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
