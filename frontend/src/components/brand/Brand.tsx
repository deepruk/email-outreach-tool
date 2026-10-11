import { ArrowUpRight } from "lucide-react";
import "./replylane.css";

/** Presentation-only brand. API routes, storage keys, and provider names stay unchanged. */
export const PRODUCT_NAME = "Replylane";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="replylane-brand"><span className="replylane-brand-mark" aria-hidden="true"><ArrowUpRight size={19} strokeWidth={2.5} /></span>{!compact && <span>{PRODUCT_NAME}<span className="replylane-brand-dot">.</span></span>}</span>;
}
