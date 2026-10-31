import { HammerIcon } from '@phosphor-icons/react'
import { Card, PageHeader } from '../components/ui'

/** Placeholder for modules that are still being built on their feature branch. */
export function ComingSoon({ title, branch }: { title: string; branch: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="rounded-full bg-accent/10 p-3 text-accent-dark">
          <HammerIcon className="h-6 w-6" />
        </div>
        <h2 className="font-semibold text-ink">This module is under construction</h2>
        <p className="text-sm text-slate-500">
          Being built on <code className="rounded bg-slate-100 px-1.5 py-0.5">{branch}</code>
        </p>
      </Card>
    </>
  )
}
