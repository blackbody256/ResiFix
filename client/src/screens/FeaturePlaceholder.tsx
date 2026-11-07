import type { ReactNode } from 'react';
import { Card } from '../components/ui';

/** Shared "coming soon" shell so every feature screen shows its owner and backlog items. */
export function FeaturePlaceholder({
  title,
  owner,
  backlog,
  children,
}: {
  title: string;
  owner: string;
  backlog: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mb-4 text-sm text-slate-500">
        Owner: {owner} · Backlog: {backlog}
      </p>
      {children}
    </Card>
  );
}

export function Loading() {
  return <p className="text-sm text-slate-500">Loading…</p>;
}
