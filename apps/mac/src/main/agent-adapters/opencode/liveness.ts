import { NO_LIVENESS, type ProviderLiveness } from '../liveness.js'
import { readOpencodeSession } from './store.js'
export function probeLiveness(): ProviderLiveness {

  return { ...NO_LIVENESS, finished: id => readOpencodeSession(id)?.idleMs != null }
}
