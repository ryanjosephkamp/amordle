import { useId } from 'react';
import { Button } from '../../../components/Button';
import styles from './CombatPreview.module.css';
import type { CombatPreviewAction, CombatPreviewTone } from './combat-preview-types';

export interface CombatUnavailablePanelProps {
  readonly title: string;
  readonly description: string;
  readonly statusLabel: string;
  readonly statusTone?: CombatPreviewTone;
  readonly privacyNote: string;
  readonly actions?: readonly CombatPreviewAction[];
}

export function CombatUnavailablePanel({
  title,
  description,
  statusLabel,
  statusTone = 'ice',
  privacyNote,
  actions = [],
}: CombatUnavailablePanelProps) {
  const titleId = useId();
  return (
    <section
      className={`${styles.surface} ${styles.unavailable}`}
      role="alert"
      aria-labelledby={titleId}
    >
      <span className={styles.status} data-tone={statusTone}>
        {statusLabel}
      </span>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      <p className={styles.privacyNote}>{privacyNote}</p>
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
