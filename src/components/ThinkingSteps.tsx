import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  duration: number; // ms before completing
}

const STEPS: Step[] = [
  { label: "Fetching match data", duration: 600 },
  { label: "Analyzing team performance", duration: 800 },
  { label: "Computing expected goals (Poisson)", duration: 700 },
  { label: "Calculating probabilities", duration: 500 },
  { label: "Running market analysis", duration: 600 },
  { label: "Generating AI insights", duration: 15000 },
  { label: "Finalizing prediction", duration: 1000 },
];

interface ThinkingStepsProps {
  isActive: boolean;
  onComplete?: () => void;
}

export function ThinkingSteps({ isActive, onComplete }: ThinkingStepsProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isActive) {
      setCurrentStep(0);
      setCompletedSteps(new Set());
      return;
    }

    let stepIndex = 0;
    let cancelled = false;

    const runStep = () => {
      if (cancelled || stepIndex >= STEPS.length) {
        if (!cancelled) onComplete?.();
        return;
      }
      setCurrentStep(stepIndex);
      const timeout = setTimeout(() => {
        setCompletedSteps(prev => new Set([...prev, stepIndex]));
        stepIndex++;
        runStep();
      }, STEPS[stepIndex].duration);
      return () => clearTimeout(timeout);
    };

    const cleanup = runStep();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isActive]);

  if (!isActive && completedSteps.size === 0) return null;

  return (
    <div className="space-y-2 py-2">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.has(i);
        const isCurrent = currentStep === i && isActive && !isCompleted;
        const isPending = i > currentStep && !isCompleted;

        return (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2.5 text-sm transition-all duration-300",
              isCompleted && "text-muted-foreground",
              isCurrent && "text-foreground font-medium",
              isPending && "text-muted-foreground/40"
            )}
          >
            <div className="w-5 h-5 flex items-center justify-center shrink-0">
              {isCompleted ? (
                <Check className="h-4 w-4 text-primary animate-in fade-in duration-300" />
              ) : isCurrent ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
              )}
            </div>
            <span>{step.label}{isCurrent ? "..." : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
