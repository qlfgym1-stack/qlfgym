import type { Workbook } from 'exceljs'

/**
 * Download an ExcelJS workbook in the browser.
 *
 * exceljs's `wb.xlsx.writeFile()` targets Node.js (fs); in the browser it
 * throws. The browser-safe path is `writeBuffer()` + Blob + anchor click.
 */
export async function downloadWorkbook(wb: Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 1000)
}