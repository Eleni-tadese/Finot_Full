import { useEffect, useState } from "react";
import axiosInstance from "../../lib/axios";
import GetAccountPage from "./GetAccountPage";
import RegisterPage from "./RegisterPage";

/**
 * /register: by default accounts come from the organization (a printed slip), so people are told how to get one.
 * The sign-up form is shown only when the server says self registration is open (SELF_REGISTRATION_OPEN).
 */
const RegisterGate = () => {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    axiosInstance.get("/api/public/registration/").then((r) => setOpen(Boolean(r.data?.open))).catch(() => setOpen(false));
  }, []);
  if (open === null) return <div className="flex min-h-full items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-muted border-t-primary" /></div>;
  return open ? <RegisterPage /> : <GetAccountPage />;
};

export default RegisterGate;
