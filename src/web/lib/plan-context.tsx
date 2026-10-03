import { createContext, useContext } from 'react';
import type { PlanDto } from '../../shared/schemas';

export type PlanState = {
  plans: PlanDto[];
  plan: PlanDto | null;
  referentials: { slug: string; label: string }[];
  labelOf: (slug: string) => string;
  reloadPlans: () => Promise<void>;
  selectPlan: (id: string) => void;
};

export const PlanContext = createContext<PlanState | null>(null);

export function usePlan(): PlanState {
  const context = useContext(PlanContext);
  if (!context) throw new Error('PlanContext is missing');
  return context;
}
