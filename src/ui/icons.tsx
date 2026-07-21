import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleUserRound,
  Clock3,
  Eye,
  Info,
  LockKeyhole,
  Play,
  Search,
  Settings,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'

// eslint-disable-next-line react-refresh/only-export-components
export const AMORDLE_ICON_NAMES = [
  'play',
  'calendar',
  'users',
  'eye',
  'clock',
  'check-circle',
  'info',
  'alert',
  'lock',
  'settings',
  'help',
  'bell',
  'search',
  'chevron-down',
  'chevron-right',
  'close',
  'account',
] as const

export type AmordleIconName = (typeof AMORDLE_ICON_NAMES)[number]

type IconAccessibility =
  | {
      readonly decorative?: true
      readonly label?: never
    }
  | {
      readonly decorative: false
      readonly label: string
    }

export type AmordleIconProps = Omit<
  LucideProps,
  'aria-hidden' | 'aria-label' | 'focusable' | 'role'
> & IconAccessibility & {
  readonly name: AmordleIconName
}

const ICONS: Record<AmordleIconName, LucideIcon> = {
  account: CircleUserRound,
  alert: TriangleAlert,
  bell: Bell,
  calendar: CalendarDays,
  'check-circle': CircleCheck,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  clock: Clock3,
  close: X,
  eye: Eye,
  help: CircleHelp,
  info: Info,
  lock: LockKeyhole,
  play: Play,
  search: Search,
  settings: Settings,
  users: Users,
}

/**
 * Use the default decorative mode beside visible text. For a meaningful
 * icon without visible text, pass `decorative={false}` and a concise `label`.
 */
export function AmordleIcon({
  decorative = true,
  label,
  name,
  size = 20,
  strokeWidth = 1.75,
  ...iconProps
}: AmordleIconProps) {
  const Icon = ICONS[name]

  return (
    <Icon
      {...iconProps}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      focusable="false"
      role={decorative ? undefined : 'img'}
      size={size}
      strokeWidth={strokeWidth}
    />
  )
}
