import { Keyboard } from '../../src/components/keyboard/Keyboard';
import {
  defineKeyboardLayout,
  qwertyLayout,
  type KeyboardCommand,
} from '../../src/components/keyboard/keyboard-model';
import { useKeyboardInput } from '../../src/components/keyboard/useKeyboardInput';

const reorderedLabLayout = defineKeyboardLayout({
  ...qwertyLayout,
  id: 'reordered-lab-v1',
  label: 'Reordered lab layout',
  rows: qwertyLayout.rows.map((row) => ({ ...row, keys: [...row.keys].reverse() })),
});

const labPressedKeys: ReadonlySet<KeyboardCommand> = new Set(['E']);

export function KeyboardLab() {
  return (
    <div data-testid="keyboard-lab">
      <section aria-label="Keyboard state sheet">
        <Keyboard
          evidence={{ A: 'correct', B: 'present', C: 'absent', D: 'removed' }}
          pressedKeys={labPressedKeys}
          cues={[{ id: 'lab-glint', effect: 'press-glint', targets: ['letter-f'] }]}
          onCommand={() => true}
        />
      </section>
      <section aria-label="Disabled keyboard state">
        <Keyboard disabled onCommand={() => false} />
      </section>
      <section aria-label="Alternate keyboard layout">
        <Keyboard layout={reorderedLabLayout} onCommand={() => true} />
      </section>
    </div>
  );
}

export function KeyboardInputLab({
  disabled = false,
  onCommand,
}: {
  disabled?: boolean;
  onCommand: (command: KeyboardCommand) => boolean;
}) {
  const pressedKeys = useKeyboardInput({ disabled, onCommand });
  return <Keyboard disabled={disabled} pressedKeys={pressedKeys} onCommand={onCommand} />;
}
