// Types describe the SHAPE of the data the server sends. They exist only while we write code:
// TypeScript uses them to warn us when we misspell a field or forget one.
// They are copied by hand from the backend (core/serializers.py), so keep them in step with it.

// GET /health/
export type HealthResponse = {
  status: string; // "ok"
};

// POST /auth/jwt/create/  (step 5)
export type TokenPair = {
  access: string; // short-lived key, sent with every request
  refresh: string; // long-lived key, used to get a new access key
};

// The account set-up block of the signed-in user (login slips, step 7)
export type SetupStatus = Record<string, unknown>;

// GET /auth/users/me/  (step 5)
export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: 'M' | 'F' | null;
  roles: string[]; // for example ["Student", "EventManager"]
  setup: SetupStatus | null;
};

// GET /api/student/profiles/me/  (step 7)
export type StudentProfile = {
  id: string;
  user_email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string | null;
  profile_image: string | null; // a full web address, or null
  batch_year: number | null; // year of study, 1 to 5
  department: string | null;
  telegram_username: string | null;
  personal_phone: string | null;
  home_address: string | null;
  dorm_block: number | null;
  dorm_room: number | null;
  status: 'IN_CAMPUS' | 'GRADUATED' | string;
};
