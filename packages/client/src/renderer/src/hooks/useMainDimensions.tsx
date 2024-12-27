import { createContext, useContext } from 'react'

export const MainDimensionsContext = createContext<{
  width: number
  height: number
} | null>(null)

export default function useMainDimensions() {
  const size = useContext(MainDimensionsContext)

  return size
}
