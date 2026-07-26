import { useId } from 'react';
import { Link } from 'react-router';
import { Button } from '../../../components/Button';
import styles from './CombatPreview.module.css';
import type {
  CombatPreviewAction,
  CombatPreviewParticipant,
  CombatPreviewTone,
} from './combat-preview-types';

export interface CombatTerminalParticipant extends CombatPreviewParticipant {
  readonly score: string | number;
  readonly ratingChange?: string;
  readonly outcome?: 'winner' | 'loser' | 'draw' | 'neutral';
}

export interface CombatTerminalResultPanelProps {
  readonly title: string;
  readonly summary: string;
  readonly statusLabel: string;
  readonly statusTone?: CombatPreviewTone;
  readonly participants: readonly [CombatTerminalParticipant, CombatTerminalParticipant];
  readonly evidence?: {
    readonly label: string;
    readonly value: string;
  };
  readonly actions?: readonly CombatPreviewAction[];
}

export function CombatTerminalResultPanel({
  title,
  summary,
  statusLabel,
  statusTone = 'green',
  participants,
  evidence,
  actions = [],
}: CombatTerminalResultPanelProps) {
  const titleId = useId();
  const renderParticipant = (participant: CombatTerminalParticipant) => (
    <div className={styles.scorePlayer} key={participant.key}>
      {participant.publicProfileId ? (
        <Link
          className={styles.playerLink}
          to={`/players/${encodeURIComponent(participant.publicProfileId)}`}
        >
          {participant.avatarUrl ? (
            <img className={styles.resultAvatar} alt="" src={participant.avatarUrl} />
          ) : (
            <span className={styles.resultAvatarFallback} aria-hidden="true">
              {participant.shortLabel}
            </span>
          )}
          <strong>{participant.displayName}</strong>
        </Link>
      ) : (
        <span className={styles.playerLink}>
          <span className={styles.resultAvatarFallback} aria-hidden="true">
            {participant.shortLabel}
          </span>
          <strong>{participant.displayName}</strong>
        </span>
      )}
      <span className={styles.scoreValue} data-outcome={participant.outcome ?? 'neutral'}>
        {participant.score}
      </span>
      {participant.ratingChange ? (
        <span className={styles.rating}>{participant.ratingChange}</span>
      ) : null}
    </div>
  );
  return (
    <section className={`${styles.surface} ${styles.terminal}`} aria-labelledby={titleId}>
      <span className={styles.status} data-tone={statusTone} role="status">
        {statusLabel}
      </span>
      <h2 id={titleId}>{title}</h2>
      <p className={styles.terminalSummary}>{summary}</p>
      <div className={styles.score} aria-label="Terminal score">
        {renderParticipant(participants[0])}
        <span className={styles.scoreDivider} aria-hidden="true">
          —
        </span>
        {renderParticipant(participants[1])}
      </div>
      {evidence ? (
        <dl className={styles.evidence}>
          <dt>{evidence.label}</dt>
          <dd>{evidence.value}</dd>
        </dl>
      ) : null}
      {actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action) => (
            <Button
              key={action.label}
              {...(action.tone ? { tone: action.tone } : {})}
              {...(action.disabled === undefined ? {} : { disabled: action.disabled })}
              onClick={action.onPress}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
