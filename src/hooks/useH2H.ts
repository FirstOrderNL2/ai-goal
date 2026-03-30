import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface H2HMatch {
  fixture: { id: number; date: string };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number; away: number };
}

export function useHeadToHead(homeApiId: number | null | undefined, awayApiId: number | null | undefined) {
  return useQuery({
    queryKey: ["h2h", homeApiId, awayApiId],
    queryFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/get-football-data?endpoint=/fixtures/headtohead&h2h=${homeApiId}-${awayApiId}&last=10`;
      const res = await fetch(url, {
        headers: {
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!res.ok) throw new Error("Failed to fetch H2H");
      const data = await res.json();
      return (data.response ?? []) as H2HMatch[];
    },
    enabled: !!homeApiId && !!awayApiId,
  });
}
