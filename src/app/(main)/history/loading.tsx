export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
    </div>
  );
}
