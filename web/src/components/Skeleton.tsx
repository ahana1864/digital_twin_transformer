/** Loading placeholder block (FRONTEND_HANDOFF §10: skeletons, not page-wide spinners). */
export default function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}
