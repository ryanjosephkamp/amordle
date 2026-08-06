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
            {/* ANNOT-12: WordDefinition names its own word, so no outer duplicate. */}
            {words.map((word) => (
              <WordDefinition key={word} word={word} />
            ))}
          </div>
        </dialog>
      )}
    </>
  );
}
