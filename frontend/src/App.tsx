import React from "react";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "./context/AuthContext";
import { ConfirmProvider } from "./components/ui/ConfirmProvider";
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <AuthProvider>
      <ConfirmProvider>
        <AppRoutes />
        {/* Every notification in the app (saved, errors, warnings) appears here, top right. */}
        <Toaster
          position="top-right"
          gutter={10}
          toastOptions={{
            duration: 4000,
            style: { borderRadius: "14px", padding: "12px 16px", fontSize: "14px", maxWidth: "26rem" },
          }}
        />
      </ConfirmProvider>
    </AuthProvider>
  );
}
export default App;
