import type { ReactNode } from 'react';

/** Main column with a side column that drops below it on narrow screens. */
export function DetailLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_30rem] flex-col gap-6">{children}</div>
      <aside className="flex min-w-0 flex-[1_1_18.75rem] flex-col gap-3">{aside}</aside>
    </div>
  );
}
