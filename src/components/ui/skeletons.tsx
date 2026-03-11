import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function CardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 shadow-md">
      <div className="p-5 pb-6" style={{ background: "hsl(var(--muted))" }}>
        <Skeleton className="h-8 w-24 mb-6" />
        <Skeleton className="h-4 w-48 mb-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
    </Card>
  );
}

export function GoalSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full mb-2 rounded-full" />
      <Skeleton className="h-3 w-48" />
    </Card>
  );
}

export function InvestmentSkeleton() {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-border">
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function CategorySkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 mb-3">
        <Skeleton className="h-12 w-12 rounded-2xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </Card>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
