import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { loadAllData } from '../utils/dataLoader'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    year: 'all',
    month: 'all',
    group: 'all',
    district: 'all',
    channel: 'all',
  })

  const reload = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await loadAllData()
      setRecords(result.records)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

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

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be inside <DataProvider>')
  return ctx
}
