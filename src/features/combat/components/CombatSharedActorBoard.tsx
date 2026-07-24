import { GameBoard, TileLegend, type Tile, type TileState } from '../../../components/GameBoard';
import { Keyboard, type KeyboardProps } from '../../../components/keyboard/Keyboard';
import styles from './CombatPreview.module.css';
import type { CombatPreviewParticipant } from './combat-preview-types';

export interface CombatActorRow {
  readonly participantKey: string | null;
  readonly shortLabel: string;
  readonly kind?: 'participant' | 'evidence';
}

export interface CombatSharedActorBoardProps {
  readonly length: number;
  readonly rows: readonly (readonly Tile[])[];
  readonly actorRows: readonly CombatActorRow[];
  readonly participants: readonly [CombatPreviewParticipant, CombatPreviewParticipant];
  readonly contextLabel: string;
  readonly message: string;
  readonly activeRow?: number;
  readonly compact?: boolean;
  readonly keyboard?: {
    readonly evidence?: Readonly<Record<string, TileState>>;
    readonly pressedKeys?: KeyboardProps['pressedKeys'];
    readonly disabled?: boolean;
    readonly onCommand: KeyboardProps['onCommand'];
  };
}

export function CombatSharedActorBoard({
  length,
  rows,
  actorRows,
  participants,
  contextLabel,
  message,
  activeRow,
  compact = false,
  keyboard,
}: CombatSharedActorBoardProps) {
  const actorLabels = rows.map((_, index) =>
    actorRows[index]?.kind === 'evidence' ? '' : (actorRows[index]?.shortLabel ?? ''),
  );
  const evidenceLabels = rows.map((_, index) =>
    actorRows[index]?.kind === 'evidence' ? actorRows[index]?.shortLabel : undefined,
  );

  return (
    <section className={`${styles.surface} ${styles.boardShell}`} aria-label="Shared COMBAT board">
      <p className={styles.boardContext}>{contextLabel}</p>
      <ul className={styles.mobileActors} aria-label="Match participants">
        {participants.map((participant) => (
          <li key={participant.key}>
            <span className={styles.actorToken} aria-hidden="true">
              {participant.shortLabel}
            </span>
            <strong>{participant.displayName}</strong>
          </li>
        ))}
      </ul>
      <GameBoard
        rows={rows.map((row) => [...row])}
        length={length}
        actors={actorLabels}
        rowLabels={evidenceLabels}
        compact={compact}
        {...(activeRow === undefined ? {} : { activeRow })}
      />
      <p className={styles.message} role="status" aria-live="polite">
        {message}
      </p>
      {keyboard ? (
        <div className={styles.keyboardFrame}>
          <Keyboard
            {...(keyboard.evidence ? { evidence: keyboard.evidence } : {})}
            {...(keyboard.pressedKeys ? { pressedKeys: keyboard.pressedKeys } : {})}
            {...(keyboard.disabled === undefined ? {} : { disabled: keyboard.disabled })}
            onCommand={keyboard.onCommand}
          />
        </div>
      ) : null}
      <TileLegend />
    </section>
  );
}
