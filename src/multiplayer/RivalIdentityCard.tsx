import type { MultiplayerProfileSummary } from './dailyMultiplayer'

interface RivalIdentityCardProps {
  readonly label: string
  readonly profile?: MultiplayerProfileSummary
  readonly title?: string
}

export function RivalIdentityCard({ label, profile, title = 'Rival' }: RivalIdentityCardProps) {
  const displayLabel = profile?.label ?? label
  const initials = profile?.initials ?? displayLabel.charAt(0).toLocaleUpperCase('en-US')
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-slate-950/70 p-3">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-cyan-400/20 text-sm font-black uppercase text-cyan-50"
        data-accent={profile?.accentColor}
      >
        {profile?.avatarUrl ? <img alt="" className="h-full w-full object-cover" src={profile.avatarUrl} /> : initials}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{title}</p>
        <p className="truncate font-semibold text-cyan-50">{displayLabel}</p>
      </div>
    </div>
  )
}
