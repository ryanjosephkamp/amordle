import styles from './CombatPreview.module.css';
import type {
  CombatPreviewParticipant,
  CombatPreviewSeat,
  CombatPreviewTone,
} from './combat-preview-types';

export interface CombatParticipantHeaderProps {
  readonly participants: readonly [CombatPreviewParticipant, CombatPreviewParticipant];
  readonly activeSeat: CombatPreviewSeat | null;
  readonly statusLabel: string;
  readonly statusTone?: CombatPreviewTone;
  readonly clock?: {
    readonly value: string;
    readonly label: string;
    readonly urgent?: boolean;
  };
}

export function CombatParticipantHeader({
  participants,
  activeSeat,
  statusLabel,
  statusTone = 'green',
  clock,
}: CombatParticipantHeaderProps) {
  return (
    <header className={`${styles.surface} ${styles.participantHeader}`} aria-label="Match status">
      {participants.map((participant, index) => {
        const side: CombatPreviewSeat = index === 0 ? 'left' : 'right';
        return (
          <div
            className={styles.participant}
            data-side={side}
            data-tone={participant.tone}
            data-active={activeSeat === side ? 'true' : undefined}
            key={participant.key}
          >
            <span className={styles.participantMark} aria-hidden="true">
              {participant.shortLabel}
            </span>
            <span className={styles.participantCopy}>
              <strong>{participant.displayName}</strong>
              <span>{activeSeat === side ? 'Active participant' : 'Waiting participant'}</span>
            </span>
          </div>
        );
      })}
      <div className={styles.authority}>
        <span className={styles.status} data-tone={statusTone} role="status">
          {statusLabel}
        </span>
        {clock ? (
          <>
            <time
              className={styles.clock}
              data-urgent={clock.urgent ? 'true' : undefined}
              aria-label={`${clock.label}: ${clock.value}`}
            >
              {clock.value}
            </time>
            <span className={styles.clockLabel}>{clock.label}</span>
          </>
        ) : null}
      </div>
    </header>
  );
}
