export type Role = 'captain' | 'manager' | 'deckhand' | 'engineer'

export type ThemeMode = 'light' | 'dark' | 'auto'
export type NotifyMode = 'all' | 'low' | 'off'

export interface Boat {
  id: string
  name: string
  slug: string
  logo_url: string | null
  accent_color: string | null
  theme_mode: ThemeMode | null
  notify_mode: NotifyMode | null
  currency: string | null
  show_financials: boolean | null
  created_at: string
}

export interface Profile {
  id: string
  boat_id: string
  email: string
  full_name: string
  role: Role
  onboarded: boolean
  created_at: string
}

export interface Unit {
  id: string
  boat_id: string
  name: string
  abbreviation: string
}

export interface Category {
  id: string
  boat_id: string
  name: string
}

export interface Item {
  id: string
  boat_id: string
  name: string
  category_id: string | null
  unit_id: string | null
  price_per_unit: number
  par_level: number
  current_quantity: number
  location: string | null
  purchase_location: string | null
  shopping_dismissed: boolean
  photo_url: string | null
  created_at: string
  // joined (optional) — populated by select with foreign tables
  unit?: Unit | null
  category?: Category | null
}

export type MovementType = 'add' | 'deduct' | 'adjust' | 'stocktake'

export interface StockMovement {
  id: string
  boat_id: string
  item_id: string
  user_id: string | null
  change_qty: number
  type: MovementType
  note: string | null
  created_at: string
}

export type TaskStatus = 'open' | 'in_progress' | 'done'
export type TaskShift = 'day' | 'night'
export type RecurrenceType = 'daily' | 'weekly' | 'monthly'

export interface Task {
  id: string
  boat_id: string
  title: string
  description: string | null
  assigned_to: string | null
  status: TaskStatus
  due_date: string | null
  shift: TaskShift
  is_recurring: boolean
  recurrence_type: RecurrenceType | null
  recurrence_start_date: string | null
  created_by: string | null
  created_at: string
}

export interface TaskCompletion {
  id: string
  boat_id: string
  task_id: string
  occurrence_date: string
  done: boolean
  skipped: boolean
  created_at: string
}

/** A task as rendered on a specific day — may be a recurring occurrence or a carry-over. */
export interface DisplayTask extends Task {
  _carriedOver?: boolean
  _occurrence?: string      // recurring: the date this occurrence is for
  _completionId?: string    // recurring: existing task_completions row id
  _occurrenceDone?: boolean // recurring: done state for this occurrence
}

export interface SleepLog {
  id: string
  boat_id: string
  user_id: string
  log_date: string
  sleep_start: string | null
  sleep_end: string | null
  hours: number
  note: string | null
  created_at: string
}

export interface MyContext {
  profile: Profile
  boat: Boat
}
