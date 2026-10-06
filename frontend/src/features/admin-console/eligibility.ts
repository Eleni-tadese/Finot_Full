// Mirrors the server rule (core/role_rules.py): a role may need a minimum year of study; graduates always qualify.
export type YearFacts = { batch_year: number | null; student_status: "IN_CAMPUS" | "GRADUATED" | null };

export function eligibilityProblem(person: YearFacts, minYear?: number | null): "no_year" | "too_young" | null {
  if (!minYear) return null;
  if (person.student_status === "GRADUATED") return null;
  if (person.batch_year == null) return "no_year";
  return person.batch_year < minYear ? "too_young" : null;
}
