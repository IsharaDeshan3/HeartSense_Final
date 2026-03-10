/**
 * Shared types for the ECG signal-data API response.
 * Consumed by EcgVisualizationHub and its child components.
 */

export interface SignalSegment {
  segment_id: number;
  leads: string[];
  signal: number[];
  sampling_rate: number;
  r_peaks: number[];
  rr_intervals: number[];
  p_peaks: number[];
  q_peaks: number[];
  s_peaks: number[];
  t_peaks: number[];
  status: "success" | "partial" | "error";
  message?: string;
}

export interface SignalData {
  segments: SignalSegment[];
}
