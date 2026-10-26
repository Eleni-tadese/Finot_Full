import type { MaterialIcons } from '@expo/vector-icons';

import type { User } from '@/lib/types';

// The role names EXACTLY as the server stores them (backend/core/models.py, class Role).
// One wrong letter here and the Manage tab would never show, so they are written once, here.
export const ROLES = {
  student: 'Student',
  familyAdmin: 'FamilyAdmin',
  serviceAdmin: 'ServiceAdmin',
  superAdmin: 'SuperAdmin',
  qaCounselor: 'QACounselor',
  qaModerator: 'QAModerator',
  courseCoordinator: 'CourseCoordinator',
  eventManager: 'EventManager',
} as const;

// The roles that get tools in the Manage tab. FamilyAdmin is not in the list on purpose:
// the plan (MOBILE_ROLES_PLAN.md) gives it no phone screen yet.
export const STAFF_ROLES: readonly string[] = [
  ROLES.superAdmin,
  ROLES.eventManager,
  ROLES.serviceAdmin,
  ROLES.courseCoordinator,
  ROLES.qaModerator,
  ROLES.qaCounselor,
];

export function hasRole(user: User | null, role: string): boolean {
  return !!user && user.roles.includes(role);
}

// True when the person holds at least one role that has tools in the Manage tab.
export function isStaff(user: User | null): boolean {
  return !!user && user.roles.some((role) => STAFF_ROLES.includes(role));
}

// The staff roles this person holds, in the order of STAFF_ROLES.
export function staffRoles(user: User | null): string[] {
  return STAFF_ROLES.filter((role) => hasRole(user, role));
}

// One block of the Manage home. `label` is a translation key.
export type ManageSection = {
  key: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  roles: readonly string[]; // who sees it
  step: string; // the plan step that builds it
  href?: string; // where the card opens; without it the card says "coming soon"
};

export const MANAGE_SECTIONS: ManageSection[] = [
  {
    key: 'event-attendance',
    label: 'mng_sec_event_attendance',
    icon: 'qr-code-scanner',
    roles: [ROLES.eventManager, ROLES.serviceAdmin, ROLES.superAdmin],
    step: 'R2',
    href: '/manage/events',
  },
  {
    key: 'class-attendance',
    label: 'mng_sec_class_attendance',
    icon: 'fact-check',
    roles: [ROLES.courseCoordinator, ROLES.superAdmin],
    step: 'R3',
    href: '/manage/courses',
  },
  {
    key: 'overview',
    label: 'mng_sec_overview',
    icon: 'dashboard',
    roles: [ROLES.superAdmin],
    step: 'R4',
    href: '/manage/overview',
  },
  {
    key: 'email-status',
    label: 'mng_sec_email',
    icon: 'mail',
    roles: [ROLES.superAdmin],
    step: 'R4',
    href: '/manage/email',
  },
  {
    key: 'questions',
    label: 'mng_sec_questions',
    icon: 'question-answer',
    roles: [ROLES.qaModerator, ROLES.qaCounselor],
    step: 'R5',
    href: '/manage/questions',
  },
];

// The sections this person may see: a section is shown when they hold ANY of its roles.
export function sectionsFor(user: User | null): ManageSection[] {
  return MANAGE_SECTIONS.filter((section) => section.roles.some((role) => hasRole(user, role)));
}
