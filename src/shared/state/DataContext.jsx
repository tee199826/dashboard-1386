import { DataContext } from './contexts.js'
import { useAsyncResource } from '../data/useAsyncResource.js'
import { useState, useMemo } from 'react'
import { loadAllData } from '../data/dataLoader.js'

const loadRecords = async () => (await loadAllData()).records

export function DataProvider({ children }) {
  const { data: records, loading: isLoading, error, reload } = useAsyncResource(loadRecords)
  const [filters, setFilters] = useState({
    year: 'all',
    month: 'all',
    group: 'all',
    district: 'all',
    channel: 'all',
  })

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (filters.year !== 'all' && r.date) {
        const y = parseInt(r.date.slice(0, 4)) + 543
        if (String(y) !== filters.year) return false
      }
      if (filters.month !== 'all' && r.date) {
        if (r.date.slice(5, 7) !== filters.month) return false
      }
      if (filters.group !== 'all' && String(r.group) !== filters.group) return false
      if (filters.district !== 'all' && r.district !== filters.district) return false
      if (filters.channel !== 'all' && r.channel !== filters.channel) return false
      return true
    })
  }, [records, filters])

  return (
    <DataContext.Provider value={{
      records,
      filteredRecords,
      isLoading,
      error,
      filters,
      setFilters,
      reload,
    }}>
      {children}
    </DataContext.Provider>
  )
}
