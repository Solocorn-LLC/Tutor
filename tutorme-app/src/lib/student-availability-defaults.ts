/**
 * Default student availability: every day, 8am–9pm is marked free.
 *
 * Used to seed a student's availability the first time it's read, so the
 * calendar greys everything outside 8am–9pm and the My Availability tab shows
 * those hours pre-selected until the student customizes them.
 */

export const DEFAULT_FREE_START_HOUR = 8 // 8:00 am
export const DEFAULT_FREE_END_HOUR = 21 // 9:00 pm (the last free slot is 20:00–21:00)

const pad = (n: number) => String(n).padStart(2, '0')

export interface DefaultAvailabilitySlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export function defaultStudentAvailabilitySlots(): DefaultAvailabilitySlot[] {
  const slots: DefaultAvailabilitySlot[] = []
  for (let day = 0; day <= 6; day += 1) {
    for (let h = DEFAULT_FREE_START_HOUR; h < DEFAULT_FREE_END_HOUR; h += 1) {
      slots.push({ dayOfWeek: day, startTime: `${pad(h)}:00`, endTime: `${pad(h + 1)}:00` })
    }
  }
  return slots
}
