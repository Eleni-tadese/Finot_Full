import { useEffect, useState } from "react";
import axiosInstance from "../../../lib/axios";
import type { CourseAttendanceReport } from "../types";

export function useAttendanceReport(semesterCourseId?: string) {
  const [report, setReport] = useState<CourseAttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!semesterCourseId) return;
    setLoading(true);
    setError(false);
    axiosInstance
      .get(`/api/course/semester-courses/${semesterCourseId}/attendance-report/`)
      .then((res) => setReport(res.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [semesterCourseId]);

  return { report, loading, error };
}
