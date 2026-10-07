// src/services/api.real.js
import { toFrontRoles } from "../features/auth/roles";
import axiosInstance from './axios';
import { AuthUser, AttendanceRecord, Donation, Event, Question, PaginatedResponse, ServiceGroup, ServiceSelection, Answer } from '../types';
import { Resource } from '@/types/resource';
//import {Course, CourseSession, CourseAttendance, CourseWithDetails} from '@types/course'
export const BACKEND_PAGE_SIZE = 20;

/**
 * Safely extract the results array from a DRF paginated response.
 * If the response is already a plain array (e.g. from a custom @action),
 * it returns the data as-is. This makes the helper safe for both shapes.
 */
function unwrapResults<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if ('detail' in data && typeof data.detail === 'string') {
      throw new Error(data.detail);
    }
    if ('results' in data) return data.results;
  }
  return [];
}

// Helper to combine user and profile
const combineUserWithProfile = (userData: Record<string, any>, profileData: Record<string, any>, membershipData: Record<string, any> | null): AuthUser => {
  const full_name = `${userData.first_name || ''} ${userData.middle_name || ''} ${userData.last_name || ''}`.trim();

  const status: 'graduated' | 'active' = profileData?.status === 'GRADUATED' ? 'graduated' : 'active';

  // Derive role from backend roles array (e.g. ["Student"], ["ServiceAdmin"])
  // Super Admin gets the admin console (/dashboard/admin) and takes priority over every other role.
  const backendRoles: string[] = userData.roles || [];
  let role = 'student'; // default
  if (backendRoles.includes('SuperAdmin')) {
    role = 'Super_admin';
  } else if (backendRoles.includes('ServiceAdmin')) {
    role = 'service_admin';
  } else if (backendRoles.includes('FamilyAdmin')) {
    role = 'family_admin';
  } else if (backendRoles.includes('QACounselor')){
    role = 'QA_counselor';
  } else if (backendRoles.includes('Teacher')){
    role = 'teacher'
  } else if (backendRoles.includes('QAModerator')){
    role = 'QA_moderator'
  } else if (backendRoles.includes('EventManager')){
    role = 'Event_manager'
  } else if (backendRoles.includes('CourseCoordinator')){
    role = 'Course_coordinator'
  } 


  return {
    id: userData.id,
    full_name,
    email: userData.email,
    gender: userData.gender === 'M' ? 'Male' : (userData.gender === 'F' ? 'Female' : ''),
    role,
    roles: toFrontRoles(backendRoles),
    setup: userData.setup ?? null,
    profile: {
      baptismal_name: profileData?.baptismal_name || '',
      profile_image: profileData?.profile_image || null,
      batch: profileData?.batch_year ? `${profileData.batch_year} Year` : '',
      department: profileData?.department || '',
      telegram: profileData?.telegram_username || '',
      personal_phone: profileData?.personal_phone || '',
      sms_opt_in: Boolean(profileData?.sms_opt_in),
      emergency_name: profileData?.emergency_name || '',
      emergency_phone: profileData?.emergency_phone || '',
      emergency_relation: profileData?.emergency_relation || '',
      home_address: profileData?.home_address || '',
      previous_church: profileData?.previous_church || '',
      activity_serving: profileData?.activity_serving || '',
      dorm_block_room: profileData?.dorm_block && profileData?.dorm_room ? `Block ${profileData.dorm_block} - Room ${profileData.dorm_room}` : '',
      confession_father: profileData?.confession_father || '',
      status: status,
      assignedGroup: membershipData?.service_group_name || null, // populated from membership endpoint
    },
  };
};

export const api = {
  getUser: async (): Promise<AuthUser> => {
    // The three requests are independent, so run them in parallel (the page
    // stays on the loading screen until all of them are done).
    const [userResponse, profileData, membershipData] = await Promise.all([
      axiosInstance.get('/auth/users/me/'),
      // Student profile: may not exist yet (user may need onboarding)
      axiosInstance.get('/api/student/profiles/me/').then((r) => r.data).catch(() => {
        console.warn('Student profile not found. User may need onboarding.');
        return {};
      }),
      // Service group membership: 404 just means "not assigned to a group"
      axiosInstance.get('/api/service/groups/my-membership/').then((r) => r.data).catch(() => null),
    ]);

    return combineUserWithProfile(userResponse.data, profileData, membershipData);
  },

  login: async (email: string, password: string): Promise<{ success: boolean; user: AuthUser }> => {
    // 1. Clear old state to ensure the interceptor doesn't send a stale token
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');

    // 2. Authenticate
    let response;
    try {
      response = await axiosInstance.post('/auth/jwt/create/', { username: email, password });
      console.log("LOGIN RAW RESPONSE:", response);
    } catch (error: any) {
      if (error.response && error.response.status === 401) {
        throw new Error("Incorrect Email or Password. Your account is given by the organization on a printed slip.");
      }
      throw error;
    }

    const { access, refresh } = response.data;

    // 3. Persist tokens
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);

    // 4. Fetch the full user object
    // Because getUser() uses axiosInstance, it will trigger the interceptor, 
    // which will find the NEW token in localStorage.
    try {
      const combinedUser = await api.getUser();
      return { success: true, user: combinedUser };
    } catch (error) {
      console.error("Critical: Auth succeeded but profile fetch failed.", error);
      throw new Error("Login successful, but failed to load user profile. Please try refreshing.");
    }
  },

  register: async (userData: Record<string, any>): Promise<{ success: boolean; user: AuthUser }> => {
    const payload = {
      username: userData.email,
      first_name: userData.first_name,
      middle_name: userData.middle_name,
      last_name: userData.last_name,
      email: userData.email,
      gender: userData.gender, // M or F
      password: userData.password,
      re_password: userData.password, // Required by Djoser default config
    };

    console.log('🚀 Sending registration payload:', payload);

    try {
      const response = await axiosInstance.post('/auth/users/', payload);
      return await api.login(userData.email, userData.password);
    } catch (error: any) {
      console.error(' Registration error response:', error.response?.data);
      throw error;
    }
  },
  requestPasswordReset: async (email: string) => {
    await axiosInstance.post('/auth/users/reset_password/', { email });
    return { success: true };
  },

  requestPasswordResetConfirm: async (
    uid: string,
    token: string,
    new_password: string,
    re_new_password: string
  ) => {
    await axiosInstance.post('/auth/users/reset_password_confirm/', {
      uid,
      token,
      new_password,
      re_new_password,
    });
    return { success: true };
  },

  // ========== USERS ==========
  getAllUsers: async () => {
    const response = await axiosInstance.get('/auth/users/');
    return unwrapResults(response.data);
  },

  // ========== SERVICE GROUPS ==========
  getServiceGroups: async (): Promise<ServiceGroup[]> => {
    const response = await axiosInstance.get('/api/service/groups/');
    return unwrapResults<ServiceGroup>(response.data);
  },

  getServiceGroupById: async (groupId: string | number) => {
    const response = await axiosInstance.get(`/api/service/groups/${groupId}/`);
    return response.data;
  },

  // ========== SELECTIONS ==========
  getSelectionWindow: async (): Promise<{ selection_open: boolean }> => {
    try {
      const response = await axiosInstance.get('/api/service/configuration/');
      return { selection_open: response.data?.selection_open !== false };
    } catch (error: any) {
      // If endpoint not yet available, allow selection by default
      if (error?.response?.status === 404) {
        return { selection_open: true };
      }
      console.warn('Selection window check failed; defaulting to open.', error);
      return { selection_open: true };
    }
  },

  getUserSelection: async (): Promise<ServiceSelection[]> => {
    // Backend returns current user's selections when called without params
    const response = await axiosInstance.get('/api/service/selections/');
    return unwrapResults<ServiceSelection>(response.data);
  },

  updateProfile: async (profileData: Record<string, any>) => {
    // Sending PATCH to /me/ endpoint since that's what we mapped in the backend
    const response = await axiosInstance.patch('/api/student/profiles/me/', profileData);
    return response.data;
  },

  // The server sends 20 at a time; follow the pages so the list is not cut short (at most 5 pages)
  getUserNotifications: async () => {
    const rows: any[] = [];
    let url: string | null = '/api/notifications/';
    for (let page = 0; url && page < 5; page++) {
      const response: any = await axiosInstance.get(url);
      if (Array.isArray(response.data)) return response.data;
      rows.push(...(response.data?.results || []));
      url = response.data?.next ? new URL(response.data.next).pathname + new URL(response.data.next).search : null;
    }
    return rows;
  },

  getUnreadNotificationCount: async (): Promise<number> => {
    const response = await axiosInstance.get('/api/notifications/unread-count/');
    return response.data?.count ?? 0;
  },

  markNotificationRead: async (notificationId: string | number) => {
    const response = await axiosInstance.post(`/api/notifications/${notificationId}/mark-read/`);
    return response.data;
  },

  markAllNotificationsRead: async () => {
    const response = await axiosInstance.post('/api/notifications/mark-all-read/');
    return response.data;
  },

  registerDeviceToken: async (token: string) => {
    const response = await axiosInstance.post('/api/notifications/device-token/', { device_token: token });
    return response.data;
  },

  submitSelection: async (selections: ServiceSelection[]) => {
    const payload = { selections };
    const response = await axiosInstance.post('/api/service/selections/', payload);
    return response.data;
  },

  deleteSelection: async (selectionId: string | number) => {
    await axiosInstance.delete(`/api/service/selections/${selectionId}/`);
    return { success: true };
  },

  // ========== FAMILIES ==========
  getFamilies: async () => {
    const response = await axiosInstance.get('/api/service/families/');
    return unwrapResults(response.data);
  },

  getMyFamily: async () => {
    const response = await axiosInstance.get('/api/service/families/my-family/');
    return response.data;
  },

  getAccountStatus: async () => (await axiosInstance.get('/api/account/status/')).data,
  requestEmailCode: async (email: string, currentPassword: string) =>
    (await axiosInstance.post('/api/account/email-code/', { email, current_password: currentPassword })).data,
  saveNames: async (names: { first_name: string; middle_name: string; last_name: string; gender: string }) =>
    (await axiosInstance.post('/api/account/names/', names)).data,
  confirmEmail: async (code: string) => (await axiosInstance.post('/api/account/confirm-email/', { code })).data,
  changePassword: async (currentPassword: string, newPassword: string) =>
    (await axiosInstance.post('/api/account/change-password/', { current_password: currentPassword, new_password: newPassword })).data,

  sendFamilyMessage: async (body: string, toStudentId?: number | null, email = false) => {
    const response = await axiosInstance.post('/api/service/families/my-family/messages/', { body, to_student_id: toStudentId ?? null, email });
    return response.data;
  },

  getFamilyMembers: async (familyId: string | number) => {
    const response = await axiosInstance.get(`/api/service/families/${familyId}/members/`);
    return response.data;
  },

  // ========== EVENTS ==========
  // The server sends 20 events at a time; follow every page so nothing is missing
  getEvents: async (): Promise<Event[]> => {
    const rows: Event[] = [];
    let url: string | null = '/api/service/events/';
    while (url) {
      const response: any = await axiosInstance.get(url);
      if (Array.isArray(response.data)) return response.data;
      rows.push(...(response.data?.results || []));
      url = response.data?.next ? new URL(response.data.next).pathname + new URL(response.data.next).search : null;
    }
    return rows;
  },

  getMyEvents: async (): Promise<Event[]> => {
    const rows: Event[] = [];
    let url: string | null = '/api/service/events/my-events/';
    while (url) {
      const response: any = await axiosInstance.get(url);
      if (Array.isArray(response.data)) return response.data;
      rows.push(...(response.data?.results || []));
      url = response.data?.next ? new URL(response.data.next).pathname + new URL(response.data.next).search : null;
    }
    return rows;
  },

  // ========== ATTENDANCE ==========
  getAttendance: async (): Promise<AttendanceRecord[]> => {
    const response = await axiosInstance.get('/api/service/attendance/');
    return unwrapResults<AttendanceRecord>(response.data);
  },

  // ========== DONATIONS ==========
  getDonations: async (userId: string | number | null = null): Promise<Donation[]> => {
    // If we wanted to filter by user on admin, we'd do it.
    // However the MyDonationHistoryViewSet handles its own filtering via the logged in token.
    const response = await axiosInstance.get('/api/donations/my-history/');
    return unwrapResults(response.data);
  },

  createDonation: async (donationData: Record<string, any>) => {
    const response = await axiosInstance.post('/api/donations/initiate/', donationData);
    return response.data;
  },

  verifyDonation: async (txRef: string) => {
    const response = await axiosInstance.get(`/api/donations/verify/${txRef}/`);
    return response.data;
  },

  // ========== QUESTIONS & ANSWERS ==========
  // Returns a flat array (first page) — used by components that don't need pagination controls
  getQuestions: async () => {
    const response = await axiosInstance.get('/api/qa/questions/');
    return unwrapResults(response.data);
  },

  // Returns the full paginated envelope — used by QuestionList for server-side pagination
  getQuestionsPaginated: async (page: number = 1, search?: string, category?: string): Promise<PaginatedResponse<Question>> => {
    const params: Record<string, string | number> = { page };
    if (search) params.search = search;
    if (category && category !== 'all') params.category = category;
    const response = await axiosInstance.get<PaginatedResponse<Question>>('/api/qa/questions/', { params });
    // Ensure we always return a valid envelope shape
    const data = response.data;
    if (Array.isArray(data)) {
      return { count: data.length, next: null, previous: null, results: data };
    }
    return data;
  },

  getQuestionById: async (questionId: string | number) => {
    const response = await axiosInstance.get(`/api/qa/questions/${questionId}/`);
    return response.data;
  },

  postQuestion: async (question: Partial<Question>) => {
    const response = await axiosInstance.post('/api/qa/questions/', question);
    return response.data;
  },

  postAnswer: async (answer: Record<string, any>) => {
    const response = await axiosInstance.post('/api/qa/answers/', answer);
    return response.data;
  },

  updateQuestion: async (questionId: string | number, updatedData: Partial<Question>) => {
    const response = await axiosInstance.patch(`/api/qa/questions/${questionId}/`, updatedData);
    return response.data;
  },

  deleteQuestion: async (questionId: string | number) => {
    await axiosInstance.delete(`/api/qa/questions/${questionId}/`);
    return { success: true };
  },

  updateAnswer: async (answerId: string | number, updatedData: Record<string, any>) => {
    const response = await axiosInstance.patch(`/api/qa/answers/${answerId}/`, updatedData);
    return response.data;
  },

  deleteAnswer: async (answerId: string | number) => {
    await axiosInstance.delete(`/api/qa/answers/${answerId}/`);
    return { success: true };
  },

  // ========== MODERATOR Q&A API ==========

  // Get moderation queue (unapproved PUBLIC questions only)
  getModerationQueue: async (): Promise<any[]> => {
    const response = await axiosInstance.get('/api/qa/questions/moderation-queue/');
    // Returns array of unapproved PUBLIC questions
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },
  
  // Approve a public question
  approveQuestion: async (questionId: string): Promise<void> => {
    await axiosInstance.post(`/api/qa/questions/${questionId}/approve/`);
  },
  
  // Approve a public answer
  approveAnswer: async (answerId: number): Promise<void> => {
    await axiosInstance.post(`/api/qa/answers/${answerId}/approve/`);
  },
  
  // Reject/Delete a question (moderator can delete inappropriate ones)
  rejectQuestion: async (questionId: string): Promise<void> => {
    await axiosInstance.delete(`/api/qa/questions/${questionId}/`);
  },
  
  // Reject/Delete an answer
  rejectAnswer: async (answerId: number): Promise<void> => {
    await axiosInstance.delete(`/api/qa/answers/${answerId}/`);
  },
  
  // Get pending answers for a specific question (if needed)
  // What waits for me: approvals (moderator), unanswered private questions (counselor), questions that need a counselor (admin)
  getMyQaWork: async (): Promise<{ moderation: { questions: number; answers: number; unanswered: number } | null; counselor: { unanswered: number } | null; admin: { needs_counselor: number } | null }> => {
    const response = await axiosInstance.get('/api/qa/questions/my-work/');
    return response.data;
  },

  // Approved public questions with no approved answer for more than a week (moderator)
  getUnansweredQuestions: async (): Promise<any[]> => {
    const response = await axiosInstance.get('/api/qa/questions/unanswered/');
    return Array.isArray(response.data) ? response.data : [];
  },

  // Every answer on a public question that still waits for approval (moderator)
  getPendingAnswersAll: async (): Promise<any[]> => {
    const response = await axiosInstance.get('/api/qa/answers/pending/');
    return Array.isArray(response.data) ? response.data : [];
  },

  getPendingAnswers: async (questionId: string): Promise<any[]> => {
    const response = await axiosInstance.get(`/api/qa/answers/?question=${questionId}&is_approved=false`);
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },


  // ========== ADMIN SPECIFIC ==========
  getGroupByAdminId: async (adminId: string | number) => {
    const response = await axiosInstance.get(`/api/service/groups/?admin=${adminId}`);
    const groups = unwrapResults(response.data);
    return groups[0] || null;
  },

  getMyManagedGroup: async () => {
    const response = await axiosInstance.get('/api/service/groups/my-group/');
    return response.data;
  },

  getMyMembership: async () => {
    const response = await axiosInstance.get('/api/service/groups/my-membership/');
    return response.data;
  },

  getAllSelections: async (): Promise<ServiceSelection[]> => {
    const response = await axiosInstance.get('/api/service/selections/');
    return unwrapResults<ServiceSelection>(response.data);
  },

  getUsersByGroup: async (groupId: string | number) => {
    const response = await axiosInstance.get(`/api/service/groups/${groupId}/members/`);
    return response.data;
  },

  assignGroupAdmin: async (groupId: string | number, adminId: string | number) => {
    const response = await axiosInstance.post(`/api/service/groups/${groupId}/assign-admin/`, { admin_id: adminId });
    return response.data;
  },

  deleteUser: async (userId: string | number) => {
    await axiosInstance.delete(`/auth/users/${userId}/`);
    return { success: true };
  },

  // ========== UPDATED Q&A API METHODS ==========

// Get user's private questions (for student inbox)
getPrivateInbox: async (): Promise<Question[]> => {
  const response = await axiosInstance.get('/api/qa/questions/private-inbox/');
  return response.data;
},

// Get user's contributions (questions + answers)
getMyContributions: async (): Promise<{ questions: Question[]; answers: Answer[] }> => {
  const response = await axiosInstance.get('/api/qa/questions/my-contributions/');
  return response.data;
},

// Counselor: Get queue of private questions
getCounselorQueue: async (): Promise<Question[]> => {
  const response = await axiosInstance.get('/api/qa/questions/counselor-queue/');
  return response.data;
},


// ========== RESOURCES API ==========

// Get all resources with filters
getResources: async (params?: {
  category?: string;
  batch?: number;
  group?: number;
  search?: string;
}): Promise<Resource[]> => {
  const queryParams = new URLSearchParams();
  if (params?.category) queryParams.append('category', params.category);
  if (params?.batch) queryParams.append('batch', params.batch.toString());
  if (params?.group) queryParams.append('group', params.group.toString());
  if (params?.search) queryParams.append('search', params.search);
  
  const url = `/api/resources/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  const response = await axiosInstance.get(url);
  return unwrapResults(response.data);
},

// Get single resource
getResourceById: async (id: number): Promise<Resource> => {
  const response = await axiosInstance.get(`/api/resources/${id}/`);
  return response.data;
},

// Upload new resource (admin only)
uploadResource: async (formData: FormData): Promise<Resource> => {
  const response = await axiosInstance.post('/api/resources/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
},

// Update resource (admin only)
updateResource: async (id: number, formData: FormData): Promise<Resource> => {
  const response = await axiosInstance.patch(`/api/resources/${id}/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
},

// Delete resource (admin only)
deleteResource: async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/resources/${id}/`);
},

// Get resource categories
getResourceCategories: async (): Promise<{ id: string; name: string; icon: string }[]> => {
  // For now, return static categories
  return Promise.resolve([
    { id: "BIBLE_STUDY", name: "Bible Study", icon: "BookOpenIcon" },
    { id: "SERMON", name: "Sermon", icon: "MusicalNoteIcon" },
    { id: "DOCUMENT", name: "Document", icon: "DocumentIcon" },
    { id: "VIDEO", name: "Video", icon: "VideoCameraIcon" },
    { id: "AUDIO", name: "Audio", icon: "SpeakerWaveIcon" },
    { id: "LINK", name: "Link", icon: "LinkIcon" },
    { id: "OTHER", name: "Other", icon: "FolderIcon" },
  ]);
},

  // ========== COURSE ATTENDANCE API ==========

  // Get semester courses (auto-filtered by role)
  getSemesterCourses: async (batchYear?: number): Promise<any[]> => {
    let url = '/api/course/semester-courses/';
    if (batchYear) {
      url += `?batch_year=${batchYear}`;
    }
    const response = await axiosInstance.get(url);
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  // My courses: only the courses I study (never the ones I just coordinate), of my batch
  getMyEnrolledCourses: async (): Promise<any[]> => {
    const response = await axiosInstance.get('/api/course/semester-courses/?enrolled=1');
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  // The coordinator (or Super Admin) starts, completes or reopens a course
  setSemesterCourseStatus: async (semesterCourseId: string, status: "PLANNED" | "OPEN" | "COMPLETED"): Promise<any> => {
    const response = await axiosInstance.post(`/api/course/semester-courses/${semesterCourseId}/set-status/`, { status });
    return response.data;
  },

  // Should be: GET /api/course/sessions/<session_uuid>/roster/
  getSessionRoster: async (sessionId: string): Promise<any> => {
    const response = await axiosInstance.get(`/api/course/sessions/${sessionId}/roster/`);
    return response.data;
  },

  // Get enrollments for a specific semester course (coordinator only)
  getCourseEnrollments: async (semesterCourseId: string): Promise<any[]> => {
    const response = await axiosInstance.get(`/api/course/enrollments/?semester_course=${semesterCourseId}`);
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  // Get sessions for a semester course
  getCourseSessions: async (semesterCourseId: string): Promise<any[]> => {
    // The server sends 20 at a time; a semester with two classes a week has more, so follow every page.
    const rows: any[] = [];
    let url: string | null = `/api/course/sessions/?semester_course=${semesterCourseId}`;
    while (url) {
      const response: any = await axiosInstance.get(url);
      if (Array.isArray(response.data)) return response.data;
      rows.push(...(response.data?.results || []));
      url = response.data?.next ? new URL(response.data.next).pathname + new URL(response.data.next).search : null;
    }
    return rows;
  },

  // Create several class days at once (days that already exist are skipped by the server)
  bulkCreateSessions: async (semesterCourseId: string, dates: string[], teacherName?: string): Promise<{ created: number; skipped: string[] }> => {
    const response = await axiosInstance.post('/api/course/sessions/bulk/', {
      semester_course: semesterCourseId, dates, teacher_name: teacherName,
    });
    return response.data;
  },

  updateCourseSession: async (sessionId: string, data: { date?: string; topic?: string | null; teacher_name?: string | null }): Promise<any> => {
    const response = await axiosInstance.patch(`/api/course/sessions/${sessionId}/`, data);
    return response.data;
  },

  deleteCourseSession: async (sessionId: string): Promise<void> => {
    await axiosInstance.delete(`/api/course/sessions/${sessionId}/`);
  },

  // Create a new session with optional teacher_name
  createCourseSession: async (data: {
    semester_course: string;
    date: string;  // ← CHANGED: must be "date" not "session_date"
    topic?: string;
    teacher_name?: string;
  }): Promise<any> => {
    const response = await axiosInstance.post('/api/course/sessions/', {
      semester_course: data.semester_course,
      date: data.date,  // ← CHANGED: must be "date"
      topic: data.topic,
      teacher_name: data.teacher_name,
    });
    return response.data;
  },

  // Get my attendance records (student only)
  getMyCourseAttendance: async (): Promise<any[]> => {
    // 20 records per page: follow every page so a long semester is complete
    const rows: any[] = [];
    let url: string | null = '/api/course/attendance/?mine=1';
    while (url) {
      const response: any = await axiosInstance.get(url);
      if (Array.isArray(response.data)) return response.data;
      rows.push(...(response.data?.results || []));
      url = response.data?.next ? new URL(response.data.next).pathname + new URL(response.data.next).search : null;
    }
    return rows;
  },

  // Server-computed attendance percentage per enrolled course (Present / sessions held)
  getMyCourseAttendanceSummary: async (): Promise<any[]> => {
    const response = await axiosInstance.get('/api/course/semester-courses/my-attendance-summary/');
    return response.data;
  },

  // Should be: POST /api/course/attendance/bulk-mark/<session_uuid>/
  bulkMarkAttendance: async (sessionId: string, records: any[]): Promise<any> => {
    const response = await axiosInstance.post(`/api/course/attendance/bulk-mark/${sessionId}/`, { records });
    return response.data;
  },

  // ========== UNIFIED MATERIALS API (NEW) ==========

  // Get all materials (auto-filtered by role)
  getMaterials: async (params?: { type?: "COURSE" | "SERVICE" | "GENERAL"; course?: string; service_group?: number }): Promise<any[]> => {
    let url = '/api/resources/materials/';
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.course) queryParams.append('course', params.course);
    if (params?.service_group) queryParams.append('service_group', params.service_group.toString());
    if (queryParams.toString()) url += `?${queryParams.toString()}`;
    const response = await axiosInstance.get(url);
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  // Upload a new material (course, service, or general)
  uploadMaterial: async (data: FormData): Promise<any> => {
    const response = await axiosInstance.post('/api/resources/materials/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Delete a material
  deleteMaterial: async (materialId: number): Promise<void> => {
    await axiosInstance.delete(`/api/resources/materials/${materialId}/`);
  },

  // Update a material
  updateMaterial: async (materialId: number, data: FormData): Promise<any> => {
    const response = await axiosInstance.patch(`/api/resources/materials/${materialId}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  
};