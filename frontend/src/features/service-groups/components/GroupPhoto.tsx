import { useState } from "react";
import PhotoFrame from "../../../components/ui/PhotoFrame";

type Props = { photo?: string | null; name: string; className?: string };

/** The group's own photo (shown whole, never cut off), or a neutral block with its initial when it has none. */
const GroupPhoto = ({ photo, name, className = "" }: Props) => {
  const [broken, setBroken] = useState(false);

  if (!photo || broken) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/20 ${className}`} aria-label={name} role="img">
        <span className="text-4xl font-bold text-primary/60">{(name.trim()[0] ?? "?").toUpperCase()}</span>
      </div>
    );
  }
  // a frame of automatic height simply takes the picture's own proportions
  if (/\bh-auto\b/.test(className)) {
    return <img src={photo} alt={name} className={`object-contain ${className}`} onError={() => setBroken(true)} loading="lazy" />;
  }
  return <PhotoFrame src={photo} alt={name} className={className} onError={() => setBroken(true)} />;
};

export default GroupPhoto;
