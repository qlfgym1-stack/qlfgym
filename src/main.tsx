import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { ThemeProvider } from '@/stores/theme'
import { I18nProvider } from '@/i18n'
import { OfflineQueueProvider } from '@/stores/offline-queue'
import { VersionProvider } from '@/stores/version'

import { Toaster } from '@/components/ui/toast'
import { PWAUpdateSystem } from '@/components/ui/update-notification'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 120,
      gcTime: 1000 * 60 * 60,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
})

const SKIP_PERSIST = new Set([
  'members',
  'member-insights',
  'member-subscriptions-map',
  'member-profile',
  'member-history',
  'payments',
  'pos-history',
  'attendance-history',
  'subscriptions-list',
])

const persistFilter = (query: { queryKey: unknown[] }): boolean => {
  const key = query.queryKey?.[0]
  return typeof key === 'string' ? !SKIP_PERSIST.has(key) : true
}

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: `FITMANAGER_QUERY_CACHE_${__VERSION_INFO__?.version ?? 'v0'}_${__VERSION_INFO__?.build ?? 0}`,
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60, filter: persistFilter }}
      >
        <ThemeProvider>
          <I18nProvider>
            <VersionProvider>
              <OfflineQueueProvider>
                <App />
                <PWAUpdateSystem />
                <Toaster />
              </OfflineQueueProvider>
            </VersionProvider>
          </I18nProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
