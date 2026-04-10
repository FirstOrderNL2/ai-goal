import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import MatchDetail from "./pages/MatchDetail";
import Accuracy from "./pages/Accuracy";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import StatsBomb from "./pages/StatsBomb";
import Standings from "./pages/Standings";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: 3000,
      refetchOnWindowFocus: false,
      networkMode: "online",
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background" />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/match/:id" element={<ProtectedRoute><MatchDetail /></ProtectedRoute>} />
            <Route path="/accuracy" element={<ProtectedRoute><Accuracy /></ProtectedRoute>} />
            <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
            <Route path="/teams/:id" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
            <Route path="/statsbomb" element={<ProtectedRoute><StatsBomb /></ProtectedRoute>} />
            <Route path="/standings" element={<ProtectedRoute><Standings /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
