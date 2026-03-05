import numpy as np
from scipy import signal

def apply_filters(data, sampling_rate=500):
    """
    Apply standard clinical filters to raw ECG data.
    - 0.5Hz High-pass (Remove baseline wander)
    - 40Hz Low-pass (Remove muscle noise)
    - 50/60Hz Notch (Remove powerline interference)
    """
    # 1. High-pass filter
    sos_hp = signal.butter(4, 0.5, 'hp', fs=sampling_rate, output='sos')
    filtered = signal.sosfilt(sos_hp, data)
    
    # 2. Notch filter for 50Hz (Standard in most regions)
    b_notch, a_notch = signal.iirnotch(50, 30, fs=sampling_rate)
    filtered = signal.filtfilt(b_notch, a_notch, filtered)
    
    # 3. Low-pass filter
    sos_lp = signal.butter(4, 40, 'lp', fs=sampling_rate, output='sos')
    filtered = signal.sosfilt(sos_lp, filtered)
    
    return filtered

def normalize_signal(data):
    """Normalize signal to [0, 1] range."""
    return (data - np.min(data)) / (np.max(data) - np.min(data))
