import { ThemeProvider, jaStrings } from '@design-system/react'
import { useEffect, useMemo } from 'react'
import { NavStack } from './components/NavStack.js'
import type { Tab } from './components/TabBar.js'
import { TabBar } from './components/TabBar.js'
import { UpdateBar } from './components/UpdateBar.js'
import { isJapanese, t } from './model/i18n/index.js'
import { inScope } from './model/scope.js'
import type { Screen } from './state/store.js'
import { useStore } from './state/store.js'
import { buildTheme } from './ui/theme.js'
import { ComposeView } from './views/ComposeView.js'
import { ListView } from './views/ListView.js'
import { SettingsView } from './views/SettingsView.js'
import { TaskView } from './views/TaskView.js'

/**
 * Screen switching. **Only ever one at a time.**
 *
 * Folding the Mac's four panes onto a phone produces a shape that is inconvenient for
 * both. What is shared is "the same state appears in the same color with the same
 * words" (the wire protocol) and **the dimensional step** (`density: 'comfortable'`),
 * not the arrangement.
 *
 * There are two ways to move. **Tabs are instant; what you press into animates.**
 * On iOS the only instant swap is movement between things placed side by side; make
 * anything else instant and it just looks like "different content appeared in the
 * same place".
 */

type TabId = 'list' | 'compose' | 'settings'

/**
 * How often to re-read while in the foreground.
 *
 * Slightly shorter than the interval at which the Mac looks for intents (15 seconds).
 * We are the side waiting for an answer, so we shorten the longer half of the round
 * trip.
 */
const POLL_MS = 10_000

export function App(): JSX.Element {
  return (
    // A surface touched by finger. Dimensions are decided in exactly one place
    <ThemeProvider colorScheme="system" density="comfortable" buildTheme={buildTheme} strings={isJapanese ? jaStrings : undefined}>
      <Shell />
    </ThemeProvider>
  )
}

function Shell(): JSX.Element {
  const start = useStore((s) => s.start)
  const refresh = useStore((s) => s.refresh)
  const ready = useStore((s) => s.ready)
  const screen = useStore((s) => s.screen)
  const open = useStore((s) => s.open)
  const tasks = useStore((s) => s.view.tasks)
  const update = useStore((s) => s.update)

  useEffect(() => {
    void start()
  }, [start])

  /*
   * Tells the shell the screen came up.
   *
   * Screens are delivered over iCloud (so they can be fixed without attaching a
   * device). **If the next launch arrives without this, the shell discards that
   * delivery and falls back to the baked-in build.** It keeps a screen that fails to
   * appear from trapping the app until someone connects a cable.
   *
   * It is sent only once `ready` — the shell has answered and one screen has been
   * drawn. Send it right after loading and a screen that crashes later still counted
   * as "came up".
   */
  const bridge = useStore((s) => s.bridge)
  useEffect(() => {
    if (!ready || !bridge) return
    void bridge.appReady()
  }, [ready, bridge])

  /*
   * While in the foreground, go look for ourselves.
   *
   * Do not rely on iCloud's change notification (`NSMetadataQuery`) alone. **For a
   * folder outside our own ubiquity container, the notification sometimes never
   * arrives.** Built to re-read only on returning to the foreground, the screen sits
   * frozen while someone waits with a detail open (that actually happened).
   *
   * The Mac looks at the same folder for the same reason (`IMPORT_POLL_MS`).
   * Stop while backgrounded — no radio for a screen nobody is looking at.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const stop = (): void => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const sync = (): void => {
      stop()
      if (document.visibilityState !== 'visible') return
      void refresh()
      timer = setInterval(() => void refresh(), POLL_MS)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [refresh])

  const awaiting = useMemo(
    () => tasks.filter((t) => inScope({ kind: 'review' }, t.status)).length,
    [tasks]
  )
  const tabs: ReadonlyArray<Tab<TabId>> = useMemo(
    () => [
      // Badge only what is awaiting an answer. A total count gives nobody a reason to press
      { id: 'list', label: t('tabs.list'), icon: 'inbox', badge: awaiting },
      { id: 'compose', label: t('tabs.compose'), icon: 'compose' },
      { id: 'settings', label: t('tabs.settings'), icon: 'settings' }
    ],
    [awaiting]
  )

  if (!ready) return <></>

  /*
   * A thin bar directly above the tabs. **Never move where it appears per screen** —
   * the bar on top changes shape (large title, or back), but the tabs do not
   */
  const bar = (
    <>
      {update.active && <UpdateBar ratio={update.ratio} />}
      <TabBar tabs={tabs} active={tabOf(screen)} onChange={(id) => open({ kind: id })} />
    </>
  )

  return (
    <NavStack
      screenKey={keyOf(screen)}
      /*
       * Whether a back destination is passed is itself the signal for "is this a
       * pushed screen". Tabs sit side by side, so none is passed (nothing animates)
       */
      onBack={screen.kind === 'task' ? () => open({ kind: 'list' }) : undefined}
    >
      {screen.kind === 'task' ? (
        <TaskView taskId={screen.taskId} />
      ) : screen.kind === 'compose' ? (
        <ComposeView footer={bar} />
      ) : screen.kind === 'settings' ? (
        <SettingsView footer={bar} />
      ) : (
        <ListView footer={bar} />
      )}
    </NavStack>
  )
}

/** The key that decides animation. Content changing within the same screen does not animate. */
function keyOf(screen: Screen): string {
  return screen.kind === 'task' ? `task:${screen.taskId}` : screen.kind
}

/** A task's detail lives under the task list (back returns to the list). */
function tabOf(screen: Screen): TabId {
  switch (screen.kind) {
    case 'compose':
      return 'compose'
    case 'settings':
      return 'settings'
    default:
      return 'list'
  }
}
