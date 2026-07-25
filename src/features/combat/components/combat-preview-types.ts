import type { ReactNode } from 'react';

export type CombatPreviewSeat = 'left' | 'right';
export type CombatPreviewTone = 'ember' | 'ice' | 'green' | 'amber' | 'muted';

export interface CombatPreviewParticipant {
  readonly key: string;
  readonly displayName: string;
  readonly shortLabel: string;
  readonly tone: 'ember' | 'ice';
}

export interface CombatPreviewAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly tone?: 'primary' | 'secondary' | 'danger' | 'quiet';
}

export interface CombatPreviewMetric {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: 'green' | 'amber' | 'red' | 'ice';
}

export interface CombatPreviewSetting {
  readonly label: string;
  readonly value: ReactNode;
}
