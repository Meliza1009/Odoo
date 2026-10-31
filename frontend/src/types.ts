export type Role = 'admin' | 'staff' | 'customer'

export interface Customer {
  id: number
  userId: number | null
  companyName: string
  contactName: string | null
  email: string | null
  phone: string | null
  billingAddress: string | null
  taxNumber: string | null
  isActive: boolean
  createdAt: string
}

export interface User {
  id: number
  email: string
  fullName: string
  role: Role
  isActive: boolean
  createdAt: string
  customer?: Customer | null
}

export interface Paged<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
