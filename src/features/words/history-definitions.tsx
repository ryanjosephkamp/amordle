'use client';

import { useRef, useState } from 'react';
import { dismissOnBackdrop, useModalScrollLock } from '@/application/modal-dialog';
import { WordDefinition } from './word-definition';

export function HistoryDefinitions({ words }: { words: string[] }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useModalScrollLock(open);
  if (!words.length) return null;
  return (
    <>
      <button
        type="button"
        className="text-action"
        onClick={() => {
          setOpen(true);
          queueMicrotask(() => dialog.current?.showModal());
        }}
      >
        {words.length === 1 ? 'Definition' : `${words.length} definitions`}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="app-modal word-detail-dialog history-definition-dialog"
          aria-label="Completed game definitions"
          onClose={() => setOpen(false)}
          onClick={(event) => dismissOnBackdrop(event)}
        >
          <div className="word-detail-dialog-content">
            <header>
              <div>
                <span>COMPLETED GAME</span>
                <h2>Definitions</h2>
              </div>
              <button
                type="button"
                aria-label="Close definitions"
                onClick={() => dialog.current?.close()}
              >
                ×
              </button>
            </header>
            {words.map((word) => (
              <div key={word}>
                <h3 className="mono">{word.toUpperCase()}</h3>
                <WordDefinition word={word} />
              </div>
            ))}
          </div>
        </dialog>
      )}
    </>
  );
}
