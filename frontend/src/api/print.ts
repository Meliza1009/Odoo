import { api } from './client'

/**
 * The print endpoint needs the bearer token, so a plain link would not work. Fetch the HTML with auth,
 * then open it from a blob URL (or download it).
 */
export async function openInvoicePrint(invoiceId: number, invoiceNumber: string, download = false) {
  // Open the window synchronously so popup blockers treat it as a user action.
  const win = download ? null : window.open('', '_blank')
  try {
    const { data } = await api.get<string>(`/invoices/${invoiceId}/print`, { responseType: 'text' })
    const url = URL.createObjectURL(new Blob([data], { type: 'text/html' }))
    if (download) {
      const a = document.createElement('a')
      a.href = url
      a.download = `${invoiceNumber}.html`
      a.click()
    } else if (win) {
      win.location.href = url
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    win?.close()
    throw error
  }
}
