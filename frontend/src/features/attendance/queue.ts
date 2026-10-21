// Offline queue for badge scans. When the network is down the scanner page keeps each scan here
// (browser localStorage, one list per session) and sends the whole list with /sync/ when it is back.
// Sending the same list twice is harmless: the server answers "already" for duplicates.

export interface QueuedScan {
  badge: string;
  scanned_at: string; // ISO time on the phone
}

const key = (sessionId: number) => `finot.attendance.queue.${sessionId}`;

export function readQueue(sessionId: number): QueuedScan[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    return [];
  }
}

function write(sessionId: number, scans: QueuedScan[]) {
  try {
    if (scans.length === 0) localStorage.removeItem(key(sessionId));
    else localStorage.setItem(key(sessionId), JSON.stringify(scans));
  } catch {
    /* storage full or blocked: the scan is still shown on screen */
  }
}

/** Add a scan unless the same badge is already waiting. Returns the new queue. */
export function enqueue(sessionId: number, badge: string): QueuedScan[] {
  const scans = readQueue(sessionId);
  if (!scans.some((s) => s.badge === badge)) scans.push({ badge, scanned_at: new Date().toISOString() });
  write(sessionId, scans);
  return scans;
}

export function clearQueue(sessionId: number) {
  write(sessionId, []);
}

/** True when the request never reached the server (no response at all). */
export function isNetworkError(error: unknown): boolean {
  const e = error as { response?: unknown; code?: string } | null;
  return !!e && !e.response;
}
