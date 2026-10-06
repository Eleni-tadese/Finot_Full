import type { TFunction } from "i18next";

/** What to call a donation in a list. New donations are plain "Support"; older ones keep the fund they were given. */
export const donationLabel = (category: string | undefined, t: TFunction): string => {
  if (!category || category.toLowerCase() === "support") return String(t("support_gibigubae", "Support our Gibi Gubae"));
  return String(t(category.toLowerCase().replace(/ /g, "_"), category));
};
