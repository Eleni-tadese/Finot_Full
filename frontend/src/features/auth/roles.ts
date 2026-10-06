// A person can hold several backend roles (for example EventManager + QACounselor).
// The front end keeps its own role names; this file is the single place that maps and checks them.

export const BACKEND_TO_FRONT: Record<string, string> = {
  SuperAdmin: "Super_admin",
  ServiceAdmin: "service_admin",
  FamilyAdmin: "family_admin",
  QACounselor: "QA_counselor",
  QAModerator: "QA_moderator",
  EventManager: "Event_manager",
  CourseCoordinator: "Course_coordinator",
  Teacher: "teacher",
};

/** All front-end role names for a list of backend roles. Everybody is at least a student. */
export function toFrontRoles(backendRoles: string[]): string[] {
  const mapped = backendRoles.map((r) => BACKEND_TO_FRONT[r]).filter(Boolean);
  return mapped.length > 0 ? mapped : ["student"];
}

type MaybeUser = { role?: string; roles?: string[] } | null | undefined;

/** True when the user holds ANY of the given front-end roles (looks at every role, not just the main one). */
export function hasRole(user: MaybeUser, ...names: string[]): boolean {
  if (!user) return false;
  const held = user.roles && user.roles.length > 0 ? user.roles : user.role ? [user.role] : [];
  return names.some((n) => held.includes(n));
}
