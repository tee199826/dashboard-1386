import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

export const DataContext = createContext(null)

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be inside <DataProvider>')
  return ctx
}

export const FilterContext = createContext(null)

export function useFilter() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilter must be used inside <FilterProvider>')
  return ctx
}

export const CTX = createContext({ isPresentation: false, enter: () => {}, exit: () => {}, lastUpdateLabel: null })

export const usePresentation = () => useContext(CTX)
