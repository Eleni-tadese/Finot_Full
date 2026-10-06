import { useEffect, useState } from "react";
import ProfilePicture from "../../components/ui/ProfilePicture";
import { firstApiError } from "../../features/resources/utils";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FiArrowLeft } from "react-icons/fi";
import Swal from "../../lib/popup";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import axiosInstance from "../../lib/axios";

type EditProfileFormData = {
  full_name: string; email: string; gender: string; profile_image: File | null;
  batch: string; department: string; telegram: string; personal_phone: string; sms_opt_in: boolean;
  emergency_name: string; emergency_phone: string; emergency_relation: string;
  home_address: string; previous_church: string; activity_serving: string;
  dorm_block: string; dorm_room: string; confession_father: string; status: string;
};

const EditProfile = () => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const normalizedGender = user?.gender === "Male" ? "M" : user?.gender === "Female" ? "F" : user?.gender || "";
  const normalizedStatus = user?.profile?.status === "active" ? "IN_CAMPUS" : user?.profile?.status === "graduated" ? "GRADUATED" : "";
  const parsedBatch = user?.profile?.batch ? user.profile.batch.replace(/\s*Year\s*/i, "") : "";
  const parsedDormBlock = user?.profile?.dorm_block_room ? user.profile.dorm_block_room.match(/Block\s*(\d+)/i)?.[1] || "" : "";
  const parsedDormRoom = user?.profile?.dorm_block_room ? user.profile.dorm_block_room.match(/Room\s*(\d+)/i)?.[1] || "" : "";

  const [formData, setFormData] = useState<EditProfileFormData>({
    full_name: user?.full_name || "", email: user?.email || "", gender: normalizedGender,
    profile_image: null,
    batch: parsedBatch, department: user?.profile?.department || "",
    telegram: user?.profile?.telegram || "", personal_phone: user?.profile?.personal_phone || "", sms_opt_in: Boolean(user?.profile?.sms_opt_in),
    emergency_name: user?.profile?.emergency_name || "", emergency_phone: user?.profile?.emergency_phone || "",
    emergency_relation: user?.profile?.emergency_relation || "",
    home_address: user?.profile?.home_address || "", previous_church: user?.profile?.previous_church || "",
    activity_serving: user?.profile?.activity_serving || "",
    dorm_block: parsedDormBlock, dorm_room: parsedDormRoom,
    confession_father: user?.profile?.confession_father || "", status: normalizedStatus,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departments, setDepartments] = useState<{ id: number; name: string; years: number }[]>([]);
  useEffect(() => {
    axiosInstance.get("/api/student/departments/").then((r) => setDepartments(r.data)).catch(() => setDepartments([]));
  }, []);
  // Year and department are set once; after that only the Super Admin changes them (the yearly rollover moves the year).
  const lockedBatch = Boolean(parsedBatch);
  const lockedDepartment = Boolean(user?.profile?.department);
  const [imagePreview, setImagePreview] = useState(user?.profile?.profile_image || "");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setFormData((prev) => ({ ...prev, profile_image: file })); setImagePreview(URL.createObjectURL(file)); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      if (formData.profile_image instanceof File) fd.append('profile_image', formData.profile_image);
      if (formData.batch) fd.append('batch_year', formData.batch);
      if (formData.department) fd.append('department', formData.department);
      if (formData.telegram) fd.append('telegram_username', formData.telegram);
      if (formData.personal_phone) fd.append('personal_phone', formData.personal_phone);
      fd.append('sms_opt_in', String(formData.sms_opt_in));
      if (formData.emergency_name) fd.append('emergency_name', formData.emergency_name);
      if (formData.emergency_phone) fd.append('emergency_phone', formData.emergency_phone);
      if (formData.emergency_relation) fd.append('emergency_relation', formData.emergency_relation);
      if (formData.home_address) fd.append('home_address', formData.home_address);
      if (formData.previous_church) fd.append('previous_church', formData.previous_church);
      if (formData.activity_serving) fd.append('activity_serving', formData.activity_serving);
      if (formData.dorm_block) fd.append('dorm_block', formData.dorm_block);
      if (formData.dorm_room) fd.append('dorm_room', formData.dorm_room);
      if (formData.confession_father) fd.append('confession_father', formData.confession_father);
      await api.updateProfile(fd);
      const refreshedUser = await api.getUser();
      setUser(refreshedUser);
      Swal.fire({ icon: "success", title: t("profile_updated"), text: t("profile_update_success"), confirmButtonColor: "hsl(var(--accent))" });
      navigate("/dashboard/profile");
    } catch (error: any) {
      Swal.fire({ icon: "error", title: t("update_failed"), text: firstApiError(error?.response?.data) || error?.message || t("something_went_wrong"), confirmButtonColor: "hsl(var(--accent))" });
    } finally { setIsSubmitting(false); }
  };

  const batches = [
    { label: t("freshman"), value: "1" }, { label: t("2nd_year"), value: "2" },
    { label: t("3rd_year"), value: "3" }, { label: t("4th_year"), value: "4" },
    { label: t("5th_gc"), value: "5" },
  ];
  const statuses = [{ label: t("in_campus"), value: "IN_CAMPUS" }, { label: t("graduated_status"), value: "GRADUATED" }];

  const labelClass = "block text-sm font-medium text-foreground mb-1.5";
  const inputClass = "input";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition">
          <FiArrowLeft className="h-4 w-4" /> {t("back_to_profile")}
        </Link>
      </div>

      <div className="card">
        <h1 className="text-xl font-bold text-foreground mb-6">{t("edit_profile")}</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo */}
          <div className="flex items-center gap-5">
            <ProfilePicture src={imagePreview} name={user?.full_name || ""} className="h-20 w-20 rounded-2xl border-2 border-accent/30 text-3xl" />
            <div>
              <label className={labelClass}>{t("change_photo")}</label>
              <input type="file" accept="image/*" onChange={handleImageChange}
                className="text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-accent-hover file:cursor-pointer" />
            </div>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: "full_name", label: t("full_name_label"), type: "text", required: true },
              { name: "email", label: t("email_address"), type: "email", required: true },
            ].map((f) => (
              <div key={f.name}>
                <label className={labelClass}>{f.label} {f.required && "*"}</label>
                <input type={f.type} name={f.name} value={(formData as any)[f.name]} onChange={handleChange} className={inputClass} />
              </div>
            ))}
            <div>
              <label className={labelClass}>{t("gender_label")} *</label>
              <select name="gender" value={formData.gender} onChange={handleChange} className={inputClass}>
                <option value="">{t("select_gender")}</option>
                <option value="M">{t("gender_m")}</option>
                <option value="F">{t("gender_f")}</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>{t("batch_year")}</label>
              <select name="batch" value={formData.batch} onChange={handleChange} disabled={lockedBatch} className={inputClass}>
                <option value="">{t("select_gender")}</option>
                {batches
                  .filter((b) => {
                    const years = departments.find((d) => d.name === formData.department)?.years;
                    return !years || Number(b.value) <= years;
                  })
                  .map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              {lockedBatch && <p className="mt-1 text-xs text-muted-foreground">{t("prof_locked_hint", "Set earlier. Ask the Super Admin to change it.")}</p>}
            </div>
            <div>
              <label className={labelClass}>{t("department")}</label>
              {departments.length > 0 ? (
                <select name="department" value={formData.department} onChange={handleChange} disabled={lockedDepartment} className={inputClass}>
                  <option value="">{t("select_gender")}</option>
                  {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              ) : (
                <input type="text" name="department" value={formData.department} onChange={handleChange} disabled={lockedDepartment} className={inputClass} />
              )}
              {lockedDepartment && <p className="mt-1 text-xs text-muted-foreground">{t("prof_locked_hint", "Set earlier. Ask the Super Admin to change it.")}</p>}
            </div>
            {[
              { name: "telegram", label: t("telegram"), placeholder: t("telegram_placeholder") },
              { name: "personal_phone", label: t("phone") },
              { name: "emergency_name", label: t("emergency_name") },
              { name: "emergency_phone", label: t("phone") },
              { name: "emergency_relation", label: t("relationship") },
              { name: "home_address", label: t("home_address") },
              { name: "previous_church", label: t("previous_church") },
              { name: "activity_serving", label: t("activities_serving") },
              { name: "dorm_block", label: t("dorm_block") },
              { name: "dorm_room", label: t("dorm_room") },
              { name: "confession_father", label: t("confession_father") },
            ].map((f) => (
              <div key={f.name}>
                <label className={labelClass}>{f.label}</label>
                <input type="text" name={f.name} value={(formData as any)[f.name]} onChange={handleChange} placeholder={(f as any).placeholder || ""} className={inputClass} />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.sms_opt_in}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sms_opt_in: e.target.checked }))}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{t("sms_opt_in_label")}</span>
                  <span className="block text-xs text-muted-foreground">{t("sms_opt_in_help")}</span>
                </span>
              </label>
            </div>
            <div>
              <label className={labelClass}>{t("status")}</label>
              <input type="text" readOnly disabled value={statuses.find((s) => s.value === formData.status)?.label ?? ""} className={inputClass} />
              <p className="mt-1 text-xs text-muted-foreground">{t("prof_locked_hint", "Set earlier. Ask the Super Admin to change it.")}</p>
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? t("saving") : t("save_changes")}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
