import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { XMarkIcon } from "@heroicons/react/24/outline";

type Props = {
  src: string;
  alt: string;
  /** Size and shape of the frame, for example "h-48 w-full rounded-2xl". */
  className?: string;
  /** Click the picture to see it full size. */
  zoom?: boolean;
  /** Badges or captions drawn over the picture. */
  children?: ReactNode;
  onError?: () => void;
};

/**
 * Shows a picture WHOLE, whatever its shape: nothing is cut off. Any empty space around it is filled with a soft,
 * blurred copy of the same picture, so tall posters and wide photos both look right in the same frame.
 */
const PhotoFrame = ({ src, alt, className = "", zoom = false, children, onError }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open]);

  const picture = (
    <>
      <img src={src} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl" />
      <img src={src} alt={alt} loading="lazy" onError={onError} className="relative h-full w-full object-contain" />
    </>
  );

  return (
    <div className={`relative overflow-hidden bg-muted ${className}`}>
      {zoom ? (
        <button type="button" onClick={() => setOpen(true)} className="absolute inset-0 block h-full w-full cursor-zoom-in" aria-label={t("ui_zoom_image", "View the full picture")}>
          {picture}
        </button>
      ) : (
        picture
      )}
      {children}
      {open &&
        createPortal(
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(false)}>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("close", "Close")} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/25">
              <XMarkIcon className="h-6 w-6" />
            </button>
            <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] max-w-[95vw] rounded-lg object-contain shadow-2xl" />
          </div>,
          document.body
        )}
    </div>
  );
};

export default PhotoFrame;
