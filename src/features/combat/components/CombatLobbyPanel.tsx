import { useId } from 'react';
import { Button } from '../../../components/Button';
import styles from './CombatPreview.module.css';
import type {
  CombatPreviewAction,
  CombatPreviewParticipant,
  CombatPreviewSetting,
  CombatPreviewTone,
} from './combat-preview-types';

export interface CombatLobbyPanelProps {
  readonly title: string;
  readonly description: string;
  readonly statusLabel: string;
  readonly statusTone?: CombatPreviewTone;
  readonly host: CombatPreviewParticipant;
  readonly waitingLabel: string;
  readonly waitingDescription: string;
  readonly settings: readonly CombatPreviewSetting[];
  readonly actions?: readonly CombatPreviewAction[];
}

export function CombatLobbyPanel({
  title,
  description,
  statusLabel,
  statusTone = 'green',
  host,
  waitingLabel,
  waitingDescription,
  settings,
  actions = [],
}: CombatLobbyPanelProps) {
  const titleId = useId();
  return (
    <section className={`${styles.surface} ${styles.lobby}`} aria-labelledby={titleId}>
      <div className={styles.lobbyHeader}>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={styles.status} data-tone={statusTone} role="status">
          {statusLabel}
        </span>
      </div>
      <dl className={styles.settingGrid} aria-label="Match settings">
        {settings.map((setting) => (
          <div key={setting.label}>
            <dt>{setting.label}</dt>
            <dd>{setting.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.waitingSeat}>
        <span className={styles.pulse} aria-hidden="true" />
        <div>
          <strong>
            {host.displayName} · {waitingLabel}
          </strong>
          <p>{waitingDescription}</p>
        </div>
      </div>
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
