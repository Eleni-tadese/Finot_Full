import { useState } from "react";
import { useTranslation } from "react-i18next";

type Props = { text: string; /** Lines shown before "Read more". */ lines?: number; className?: string };

/** Long text is cut after a few lines with a "Read more" toggle, instead of ending in "..." with no way to read the rest. */
const ExpandableText = ({ text, lines = 3, className = "" }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = text.length > lines * 55 || text.split("\n").length > lines;
  const clamp = long && !open;

  return (
    <div>
      <p
        className={`whitespace-pre-line break-words ${className}`}
        style={clamp ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
      >
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-primary hover:underline">
          {open ? t("ui_show_less", "Show less") : t("ui_read_more", "Read more")}
        </button>
      )}
    </div>
  );
};

export default ExpandableText;
