import { useEffect, useState } from "react";

type Props = {
  src?: string | null;
  /** Full name; the first letter of the first name is shown when there is no photo. */
  name: string;
  /** Size and shape, e.g. "h-8 w-8 rounded-lg". */
  className?: string;
};

/** A person's photo, or a coloured square with the first letter of their first name when there is none (or it cannot load). */
const ProfilePicture = ({ src, name, className = "h-8 w-8 rounded-lg" }: Props) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  if (src && !broken) {
    return <img src={src} alt={name} className={`${className} border border-slate-200 object-cover`} onError={() => setBroken(true)} />;
  }
  const initial = (name || "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      role="img"
      aria-label={name}
      className={`${className} inline-flex shrink-0 select-none items-center justify-center bg-primary font-semibold text-primary-foreground`}
    >
      {initial}
    </span>
  );
};

export default ProfilePicture;
