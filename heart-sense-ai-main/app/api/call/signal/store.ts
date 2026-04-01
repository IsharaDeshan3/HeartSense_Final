export interface CallSession {
  createdAt: number;
  doctorSignals: unknown[];
  patientSignals: unknown[];
}

// In-memory store for signaling data (development only)
// This persists across API calls within the same Next.js server process
export const callStore = new Map<string, CallSession>();

// Clean up old calls every 5 minutes (calls older than 30 mins)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    for (const [id, session] of callStore) {
      if (session.createdAt < thirtyMinutesAgo) {
        callStore.delete(id);
      }
    }
  }, 5 * 60 * 1000);
}
