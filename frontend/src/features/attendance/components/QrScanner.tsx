// Camera QR reader built on html5-qrcode. It calls onDecoded(text) for every code it reads
// (the parent decides what to do and debounces repeats). If the camera cannot start (no permission,
// no camera, http page), onError gets a reason and the parent shows its typed fallback.
import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onDecoded: (text: string) => void;
  onError?: (reason: string) => void;
  paused?: boolean;
  className?: string;
}

let counter = 0;

export default function QrScanner({ onDecoded, onError, paused = false, className = "" }: Props) {
  const idRef = useRef(`finot-qr-${++counter}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const decodedRef = useRef(onDecoded);
  const errorRef = useRef(onError);
  decodedRef.current = onDecoded;
  errorRef.current = onError;

  useEffect(() => {
    if (paused) return;
    const scanner = new Html5Qrcode(idRef.current, { verbose: false });
    scannerRef.current = scanner;
    let stopped = false;
    let started = false;
    const starting = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => ({ width: Math.min(w, h) * 0.7, height: Math.min(w, h) * 0.7 }) },
        (text) => decodedRef.current(text),
        () => undefined, // no QR in this frame: normal, ignore
      )
      .then(() => {
        started = true;
      })
      .catch((err: unknown) => {
        if (!stopped) errorRef.current?.(String((err as { message?: string })?.message ?? err));
      });
    return () => {
      // React (in development) mounts twice: the first cleanup can run before the camera has started.
      // stop() throws synchronously when nothing is running, so wait for the start and swallow errors.
      stopped = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      starting.finally(() => {
        try {
          if (started) {
            s.stop().then(() => s.clear()).catch(() => undefined);
          } else {
            s.clear();
          }
        } catch {
          /* already stopped */
        }
      });
    };
  }, [paused]);

  return <div id={idRef.current} className={`overflow-hidden rounded-xl bg-black ${className}`} />;
}
