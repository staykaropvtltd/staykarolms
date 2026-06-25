import { RouterProvider } from "react-router";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { AuthProvider } from "@/shared/context/AuthContext";
import { router } from "@/router/routes";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}
