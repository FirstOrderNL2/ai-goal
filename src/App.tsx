import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import MatchDetail from "./pages/MatchDetail";
import Accuracy from "./pages/Accuracy";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import StatsBomb from "./pages/StatsBomb";
import Standings from "./pages/Standings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/match/:id" element={<MatchDetail />} />
          <Route path="/accuracy" element={<Accuracy />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/statsbomb" element={<StatsBomb />} />
          <Route path="/standings" element={<Standings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
