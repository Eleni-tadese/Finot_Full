import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

const languages = [
  { code: "en", name: "English" },
  { code: "am", name: "አማርኛ" },
  { code: "om", name: "Oromoo" },
];

interface LanguageSelectorProps {
  variant?: "hero" | "nav" | "inline";
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ variant = "nav" }) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const close = () => setIsOpen(false);
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  // The list is drawn on top of the page (not inside the header) and placed from the button's real position,
  // so it never runs off the edge of a phone or tablet screen.
  const MENU_WIDTH = 192;
  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isOpen) {
      const r = event.currentTarget.getBoundingClientRect();
      const left = Math.min(Math.max(r.right - MENU_WIDTH, 8), window.innerWidth - MENU_WIDTH - 8);
      setPos({ top: r.bottom + 8, left });
    }
    setIsOpen(!isOpen);
  };

  // Inside a menu panel that clips (the phone menu) a drop-down would be cut off: show the choices side by side.
  if (variant === "inline") {
    return (
      <div className="flex gap-2" role="group" aria-label="Language" data-language-selector="inline">
        {languages.map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => changeLanguage(lang.code)}
            aria-pressed={i18n.language === lang.code}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              i18n.language === lang.code ? "bg-primary text-white" : "bg-muted/60 text-foreground hover:bg-muted"
            }`}
          >
            {lang.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={toggle}
        data-language-selector="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 ${
          variant === "hero"
            ? "bg-white/10 text-white border border-white/20 hover:bg-white/20"
            : "bg-muted/50 text-foreground hover:bg-muted border border-transparent"
        }`}
      >
        <span className="text-sm font-medium hidden sm:inline">{currentLanguage.name}</span>
        <span className="text-xs font-bold sm:hidden">{currentLanguage.code.toUpperCase()}</span>
        <ChevronDownIcon
          className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </motion.button>

      {createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="z-[100] rounded-2xl bg-card border border-border shadow-elevated overflow-hidden"
          >
            <div className="p-1.5">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    i18n.language === lang.code
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{lang.name}</span>
                  {i18n.language === lang.code && (
                    <motion.div
                      layoutId="active-marker"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"
                    />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body)}
    </div>
  );
};

export default LanguageSelector;
