import { AxiosError } from 'axios'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

interface FieldIssue {
  path: string
  message: string
}

/**
 * Maps the API's validation details ({ path, message }[]) onto react-hook-form fields so errors show under the right input.
 * Returns true when at least one field error was applied.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, knownFields?: readonly string[]): boolean {
  if (!(error instanceof AxiosError)) return false
  const details = (error.response?.data as { details?: unknown } | undefined)?.details
  if (!Array.isArray(details)) return false
  let applied = false
  for (const issue of details as FieldIssue[]) {
    if (!issue?.path || (knownFields && !knownFields.includes(issue.path.split('.')[0]))) continue
    setError(issue.path as Path<T>, { type: 'server', message: issue.message })
    applied = true
  }
  return applied
}

/** Number inputs registered with valueAsNumber give NaN when empty; the API wants null for optional numbers. */
export const numOrNull = (value: number | null | undefined) => (value === null || value === undefined || Number.isNaN(value) ? null : value)

/** Select values: '' means "none". */
export const idOrNull = (value: unknown) => (value === '' || value === null || value === undefined ? null : Number(value))

export const PASSWORD_HINT = 'At least 9 characters with an uppercase letter, a lowercase letter and a special character.'

export function validatePassword(value: string) {
  if (value.length < 9 || !/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[^A-Za-z0-9]/.test(value)) return PASSWORD_HINT
  return true
}

export const EMAIL_PATTERN = { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' }
