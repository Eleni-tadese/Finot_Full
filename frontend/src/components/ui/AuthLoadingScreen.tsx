import { useTranslation } from "react-i18next";

const AuthLoadingScreen = () => {
  const { t } = useTranslation();
  return (
  <div className="flex h-screen w-full items-center justify-center bg-background">
    <div className="text-center">
      <div className="h-12 w-12 mx-auto mb-4 animate-spin rounded-full border-3 border-muted border-t-primary"></div>
      <p className="text-muted-foreground text-sm">{t("ui_loading_profile")}</p>
    </div>
  </div>
  );
};

export default AuthLoadingScreen;