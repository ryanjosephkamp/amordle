'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AccentPreset } from '@/adapters/supabase/public';
import { accentCssVariableMap, accentHexSchema, normalizeAccentHex } from '@/domain/profile';

export interface AccentPresetDraft {
  presetId: string | null;
  name: string;
  accentHex: string;
  select: boolean;
}

export function AccentPresetDialog({
  preset,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  preset: AccentPreset | null | undefined;
  busy: boolean;
  error: string;
  onClose(): void;
  onSave(draft: AccentPresetDraft): Promise<boolean>;
  onDelete(preset: AccentPreset): Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(preset?.name ?? '');
  const [accentHex, setAccentHex] = useState(preset?.accent_hex ?? '#32BFA2');
  const [validationError, setValidationError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (preset === undefined) {
      if (dialogRef.current?.open) dialogRef.current.close();
      return;
    }
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, [preset]);

  const parsedHex = accentHexSchema.safeParse(accentHex);
  const previewVariables = accentCssVariableMap(parsedHex.success ? parsedHex.data : '#32BFA2');

  async function save(select: boolean) {
    const parsed = accentHexSchema.safeParse(accentHex);
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Enter a valid six-digit hex color.');
      return;
    }
    setValidationError('');
    const saved = await onSave({
      presetId: preset?.preset_id ?? null,
      name: name.trim(),
      accentHex: parsed.data,
      select,
    });
    if (saved) dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      className="accent-preset-dialog"
      aria-labelledby="accent-preset-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
    >
      <form
        method="dialog"
        className="accent-preset-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save(true);
        }}
      >
        <div className="section-heading">
          <h2 id="accent-preset-title">{preset ? 'Edit custom accent' : 'Create custom accent'}</h2>
          <button
            type="button"
            className="dialog-close"
            aria-label="Close custom accent editor"
            disabled={busy}
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>

        <div className="accent-preset-fields">
          <label className="accent-color-picker">
            Color
            <input
              type="color"
              value={normalizeAccentHex(accentHex) ?? '#32BFA2'}
              disabled={busy}
              onChange={(event) => {
                setAccentHex(event.target.value.toUpperCase());
                setValidationError('');
              }}
            />
          </label>
          <label>
            Hex
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={7}
              value={accentHex}
              aria-invalid={Boolean(validationError)}
              aria-describedby="accent-hex-error"
              disabled={busy}
              onChange={(event) => {
                setAccentHex(event.target.value.toUpperCase());
                setValidationError('');
              }}
            />
          </label>
          <label>
            Name <span className="field-optional">optional</span>
            <input
              type="text"
              maxLength={32}
              value={name}
              placeholder={parsedHex.success ? parsedHex.data : '#32BFA2'}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
        <p id="accent-hex-error" className="field-error" aria-live="polite">
          {validationError || error}
        </p>

        <div
          className="accent-preset-preview"
          data-accent="custom"
          style={previewVariables as CSSProperties}
          aria-label="Live custom accent preview"
        >
          <div className="accent-preview-row">
            <span>ALERTS</span>
            <span className="attention-badge">3</span>
          </div>
          <div className="accent-preview-keys" aria-hidden="true">
            <span className="accent-preview-key accent-preview-key--unknown">A</span>
            <span className="accent-preview-key accent-preview-key--focus">B</span>
            <span className="accent-preview-key accent-preview-key--correct">✓</span>
            <span className="accent-preview-key accent-preview-key--present">~</span>
            <span className="accent-preview-key accent-preview-key--absent">×</span>
            <span className="accent-preview-key accent-preview-key--removed">−</span>
          </div>
          <small>accent · focus · correct · present · absent · removed</small>
        </div>

        <div className="accent-preset-actions">
          <button className="primary" disabled={busy || !parsedHex.success}>
            {busy ? 'SAVING…' : 'SAVE AND USE'}
          </button>
          <button
            type="button"
            disabled={busy || !parsedHex.success}
            onClick={() => void save(false)}
          >
            SAVE WITHOUT SELECTING
          </button>
          {preset && (
            <button
              type="button"
              className="danger-action"
              disabled={busy}
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                void onDelete(preset).then((deleted) => {
                  if (deleted) dialogRef.current?.close();
                });
              }}
            >
              {confirmDelete ? 'CONFIRM DELETE' : 'DELETE PRESET'}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => dialogRef.current?.close()}>
            CANCEL
          </button>
        </div>
      </form>
    </dialog>
  );
}
