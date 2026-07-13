import type { BrowserContext } from '@playwright/test'

export async function installFixedBrowserTime(context: BrowserContext, isoNow: string): Promise<void> {
  await context.addInitScript(({ fixedIso }) => {
    const fixedMs = new Date(fixedIso).getTime()
    const OriginalDate = Date
    class MockDate extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        if (args.length === 0) {
          super(fixedMs)
        } else {
          super(...args)
        }
      }

      static now() {
        return fixedMs
      }
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    window.Date = MockDate as DateConstructor
    Object.defineProperty(window.performance, 'now', {
      configurable: true,
      value: () => 1_000,
    })
  }, { fixedIso: isoNow })
}
