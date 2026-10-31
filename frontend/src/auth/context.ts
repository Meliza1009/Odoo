import { createContext } from 'react'
import type { Role, User } from '../types'

export interface RegisterInput {
  fullName: string
  email: string
  password: string
  companyName?: string
  phone?: string
}

export interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  resetPassword: (token: string, password: string) => Promise<User>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export const homePathFor = (role: Role) => (role === 'customer' ? '/portal' : '/app')
