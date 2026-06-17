'use client'

import { createContext, useContext, ReactNode } from 'react'

type StudentNavContextValue = {
  desktopNavOpen: boolean
}

const StudentNavContext = createContext<StudentNavContextValue>({
  desktopNavOpen: true,
})

export function StudentNavProvider({
  desktopNavOpen,
  children,
}: {
  desktopNavOpen: boolean
  children: ReactNode
}) {
  return (
    <StudentNavContext.Provider value={{ desktopNavOpen }}>
      {children}
    </StudentNavContext.Provider>
  )
}

export function useStudentNav() {
  return useContext(StudentNavContext)
}
