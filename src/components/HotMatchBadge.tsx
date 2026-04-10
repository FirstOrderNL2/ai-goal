import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function HotMatchBadge() {
  return (
    <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30 font-bold gap-1 animate-pulse">
      <Flame className="h-3 w-3" />
      HOT
    </Badge>
  );
}
