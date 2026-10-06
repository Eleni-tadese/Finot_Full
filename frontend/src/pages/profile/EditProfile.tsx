import { ReactNode, useEffect, useState } from "react";
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
  profile_image: File | null;
  batch: string; department: string; telegram: string; personal_phone: string; sms_opt_in: boolean;
  emergency_name: string; emergency_phone: string; emergency_relation: string;
  home_address: string; previous_church: string; activity_serving: string;
  dorm_block: string; dorm_room: string; confession_father: string;
};

/** A titled group of fields, so the form says what each part is for. */
const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-border p-4 sm:p-5">
    <h2 className="text-base font-semibold text-foreground">{title}</h2>
    {hint && <p className="mb-4 mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${hint ? "" : "mt-4"}`}>{children}</div>
  </section>
);

const EditProfile = () => {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const genderLabel = user?.gender === "M" || user?.gender === "Male" ? t("gender_m") : user?.gender === "F" || user?.gender === "Female" ? t("gender_f") : "";
  const normalizedStatus = user?.profile?.status === "active" ? "IN_CAMPUS" : user?.profile?.status === "graduated" ? "GRADUATED" : "";
  const parsedBatch = user?.profile?.batch ? user.profile.batch.replace(/\s*Year\s*/i, "") : "";
  const parsedDormBlock = user?.profile?.dorm_block_room ? user.profile.dorm_block_room.match(/Block\s*(\d+)/i)?.[1] || "" : "";
  const parsedDormRoom = user?.profile?.dorm_block_room ? user.profile.dorm_block_room.match(/Room\s*(\d+)/i)?.[1] || "" : "";

  const [formData, setFormData] = useState<EditProfileFormData>({
    profile_image: null,
    batch: parsedBatch, department: user?.profile?.department || "",
    telegram: user?.profile?.telegram || "", personal_phone: user?.profile?.personal_phone || "", sms_opt_in: Boolean(user?.profile?.sms_opt_in),
    emergency_name: user?.profile?.emergency_name || "", emergency_phone: user?.profile?.emergency_phone || "",
    emergency_relation: user?.profile?.emergency_relation || "",
    home_address: user?.profile?.home_address || "", previous_church: user?.profile?.previous_church || "",
    activity_serving: user?.profile?.activity_serving || "",
    dorm_block: parsedDormBlock, dorm_room: parsedDormRoom,
    confession_father: user?.profile?.confession_father || "",
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
  const hintClass = "mt-1 text-xs text-muted-foreground";
  const optional = <span className="font-normal text-muted-foreground"> {t("prof_optional", "(optional)")}</span>;
  const fixedHint = t("prof_fixed_hint", "Set earlier. Ask the Super Admin to change it.");

  /** A plain text box with a label, an example in it, and an optional hint. */
  const text = (name: keyof EditProfileFormData, label: string, placeholder: string, opts: { optional?: boolean; hint?: string; type?: string } = {}) => (
    <div>
      <label className={labelClass} htmlFor={`f-${name}`}>{label}{opts.optional && optional}</label>
      <input id={`f-${name}`} type={opts.type || "text"} name={name} value={String(formData[name] ?? "")} onChange={handleChange} placeholder={placeholder} className="input" />
      {opts.hint && <p className={hintClass}>{opts.hint}</p>}
    </div>
  );

  /** A value that was set at sign-up and cannot be changed here. */
  const fixed = (label: string, value: string) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input type="text" readOnly disabled value={value} className="input" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition">
          <FiArrowLeft className="h-4 w-4" /> {t("back_to_profile")}
        </Link>
      </div>

      <div className="card">
        <h1 className="text-xl font-bold text-foreground mb-1">{t("edit_profile")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t("prof_intro", "Fill in what you can. Only your year, department and phone number really matter; the rest is optional.")}</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Photo */}
          <div className="flex items-center gap-5">
            <ProfilePicture src={imagePreview} name={user?.full_name || ""} className="h-20 w-20 rounded-2xl border-2 border-accent/30 text-3xl" />
            <div>
              <label className={labelClass}>{t("change_photo")}</label>
              <input type="file" accept="image/*" onChange={handleImageChange}
                className="text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-foreground hover:file:bg-accent-hover file:cursor-pointer" />
              <p className={hintClass}>{t("prof_photo_hint", "A clear photo of your face. Without one, your first initial is shown.")}</p>
            </div>
          </div>

          <Section title={t("prof_sec_about", "About you")} hint={t("prof_sec_about_hint", "Your name, email and gender were set when you registered. Your year and department are chosen once.")}>
            {fixed(t("full_name_label"), user?.full_name || "")}
            {fixed(t("email_address"), user?.email || "")}
            {fixed(t("gender_label"), genderLabel)}
            {fixed(t("status"), statuses.find((s) => s.value === normalizedStatus)?.label ?? "")}
            <div>
              <label className={labelClass} htmlFor="f-batch">{t("batch_year")}</label>
              <select id="f-batch" name="batch" value={formData.batch} onChange={handleChange} disabled={lockedBatch} className="input">
                <option value="">{t("prof_pick_year", "Choose your year of study")}</option>
                {batches
                  .filter((b) => {
                    const years = departments.find((d) => d.name === formData.department)?.years;
                    return !years || Number(b.value) <= years;
                  })
                  .map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <p className={hintClass}>{lockedBatch ? fixedHint : t("prof_year_hint", "Needed for your courses, your roles and your family. You can set it only once.")}</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="f-department">{t("department")}</label>
              {departments.length > 0 ? (
                <select id="f-department" name="department" value={formData.department} onChange={handleChange} disabled={lockedDepartment} className="input">
                  <option value="">{t("prof_pick_department", "Choose your department")}</option>
                  {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              ) : (
                <input id="f-department" type="text" name="department" value={formData.department} onChange={handleChange} disabled={lockedDepartment} placeholder={t("prof_department_ph", "e.g. Computer Science")} className="input" />
              )}
              <p className={hintClass}>{lockedDepartment ? fixedHint : t("prof_department_hint", "You can set it only once.")}</p>
            </div>
          </Section>

          <Section title={t("prof_sec_contact", "How we reach you")}>
            {text("personal_phone", t("prof_phone", "Your phone number"), t("prof_phone_ph", "e.g. 0911 223 344"), { hint: t("prof_phone_hint", "Used only if you tick the SMS box below.") })}
            {text("telegram", t("telegram"), t("telegram_placeholder", "@username"), { optional: true })}
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
          </Section>

          <Section title={t("prof_sec_campus", "Where you live on campus")} hint={t("prof_sec_campus_hint", "Used to place you in a mentorship family with students who live near you.")}>
            {text("dorm_block", t("dorm_block"), t("prof_dorm_block_ph", "Block number, e.g. 3"), { optional: true })}
            {text("dorm_room", t("dorm_room"), t("prof_dorm_room_ph", "Room number, e.g. 214"), { optional: true })}
          </Section>

          <Section title={t("prof_sec_emergency", "Emergency contact")} hint={t("prof_sec_emergency_hint", "Someone we can call if we cannot reach you, such as a parent or guardian.")}>
            {text("emergency_name", t("prof_em_name", "Contact name"), t("prof_em_name_ph", "Name of a parent or guardian"), { optional: true })}
            {text("emergency_phone", t("prof_em_phone", "Contact phone number"), t("prof_phone_ph", "e.g. 0911 223 344"), { optional: true })}
            {text("emergency_relation", t("relationship"), t("prof_em_rel_ph", "e.g. Mother, Father, Brother"), { optional: true })}
          </Section>

          <Section title={t("prof_sec_more", "More about you")} hint={t("prof_sec_more_hint", "All optional. It helps the fellowship know and serve you better.")}>
            {text("home_address", t("home_address"), t("prof_address_ph", "Town or sub-city"), { optional: true })}
            {text("previous_church", t("previous_church"), t("prof_church_ph", "The church you attended before"), { optional: true })}
            {text("activity_serving", t("activities_serving"), t("prof_activity_ph", "e.g. Choir, Sunday school"), { optional: true })}
            {text("confession_father", t("confession_father"), t("prof_confession_ph", "Your spiritual father's name"), { optional: true })}
          </Section>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? t("saving") : t("save_changes")}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
