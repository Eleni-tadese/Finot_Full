import { useEffect, useState, ReactNode } from "react";

interface Props {
  images: string[];
  /** Milliseconds between slides. */
  interval?: number;
  /** Show the small dots at the bottom. */
  dots?: boolean;
  /** Controlled mode: show this slide instead of auto-advancing. */
  index?: number;
  className?: string;
  /** Put a dark-blue gradient over the pictures so text on top stays readable. */
  overlay?: boolean;
  children?: ReactNode;
}

/** Cross-fading picture slideshow. Fills its parent (give the parent a height). */
const ImageSlideshow = ({ images, interval = 5000, dots = true, index, className = "", overlay = false, children }: Props) => {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const controlled = typeof index === "number";

  useEffect(() => {
    if (controlled || paused || images.length < 2) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % images.length), interval);
    return () => clearInterval(timer);
  }, [controlled, paused, images.length, interval]);

  const active = controlled ? (index as number) % images.length : current;

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover object-[50%_30%] transition-opacity duration-1000 ${i === active ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      {overlay && <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/60 to-primary/30" />}
      {children && <div className="relative z-10 h-full w-full">{children}</div>}
      {dots && !controlled && images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setCurrent(i)}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-accent" : "w-1.5 bg-white/60 hover:bg-white"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageSlideshow;
