import { useState } from "react";

type Props = { photo?: string | null; name: string; className?: string };

/** The group's own photo, or a neutral block with its initial when it has none. */
const GroupPhoto = ({ photo, name, className = "" }: Props) => {
  const [broken, setBroken] = useState(false);

  if (!photo || broken) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/20 ${className}`} aria-label={name} role="img">
        <span className="text-4xl font-bold text-primary/60">{(name.trim()[0] ?? "?").toUpperCase()}</span>
      </div>
    );
  }
  return <img src={photo} alt={name} className={`object-cover ${className}`} onError={() => setBroken(true)} loading="lazy" />;
};

export default GroupPhoto;
