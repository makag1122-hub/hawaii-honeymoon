/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite/client" />
import { registerSW } from 'virtual:pwa-register'

export interface PwaState {
  offlineReady: boolean
  needRefresh: boolean
  error?: string
}

type Listener = (state: PwaState) => void
const listeners = new Set<Listener>()
let state: PwaState = { offlineReady: false, needRefresh: false }
let started = false
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined

function publish(update: Partial<PwaState>) {
  state = { ...state, ...update }
  listeners.forEach((listener) => listener({ ...state }))
}

// A successful install is atomic in Workbox. Also inspect its actual cache on
// later visits: an old localStorage flag would incorrectly survive cache loss.
async function inspectOfflineCache() {
  if (!('caches' in window) || !navigator.serviceWorker.controller) return
  try {
    const baseUrl = new URL(import.meta.env.BASE_URL, location.origin)
    const cacheNames = (await caches.keys()).filter((name) => name.includes('aloha-diary') && name.includes('precache'))
    const stores = await Promise.all(cacheNames.map((name) => caches.open(name)))
    const cached = async (path: string) => {
      const url = new URL(path, baseUrl).href
      for (const store of stores) {
        const response = await store.match(url, { ignoreSearch: true })
        if (response?.ok) return response
      }
      return undefined
    }
    const manifestResponse = await cached('offline-assets.json')
    if (!manifestResponse) {
      publish({ offlineReady: false })
      return
    }
    const manifest: unknown = await manifestResponse.json()
    if (!manifest || typeof manifest !== 'object' || !('assets' in manifest) || !Array.isArray(manifest.assets)) throw new Error('invalid cache manifest')
    const assets = manifest.assets
    if (!assets.length || !assets.every((path) => typeof path === 'string' && !path.includes('..') && !path.startsWith('/') && !path.includes('://'))) throw new Error('invalid cache paths')
    const present = await Promise.all(assets.map((path) => cached(path)))
    const ready = present.every(Boolean)
    publish({ offlineReady: ready, error: ready ? undefined : '오프라인 파일이 일부 비어 있어요. 인터넷에 연결한 뒤 앱을 다시 열어 주세요.' })
  } catch {
    publish({ offlineReady: false, error: '오프라인 저장 공간을 확인하지 못했어요. 일반 브라우저 창에서 다시 열어 주세요.' })
  }
}

function startPwa() {
  if (started) return
  started = true
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    publish({ error: '이 브라우저에서는 오프라인 설치를 사용할 수 없어요.' })
    return
  }
  if (import.meta.env.DEV) return
  navigator.serviceWorker.addEventListener('controllerchange', () => { void inspectOfflineCache() })
  window.addEventListener('pageshow', () => { void inspectOfflineCache() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void inspectOfflineCache()
  })
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() { publish({ needRefresh: true }) },
    onOfflineReady() {
      // Workbox fires this only after every precache request has succeeded.
      // Wait for the active controller before checking the cache ourselves.
      void navigator.serviceWorker.ready.then(() => inspectOfflineCache())
    },
    onRegisteredSW(_url, registration) {
      void inspectOfflineCache()
      if (registration) {
        const checkUpdate = () => {
          if (navigator.onLine && !registration.installing) void registration.update().catch(() => {})
        }
        window.addEventListener('online', checkUpdate)
      }
    },
    onRegisterError() {
      publish({ error: '오프라인 준비를 마치지 못했어요. 인터넷 연결과 저장 공간을 확인해 주세요.' })
    },
  })
}

export function subscribePwa(callback: Listener): () => void {
  listeners.add(callback)
  callback({ ...state })
  startPwa()
  return () => { listeners.delete(callback) }
}

export async function updateApp(): Promise<void> {
  if (updateServiceWorker) await updateServiceWorker(true)
}
