export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-16 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-9 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
