import { useState, useCallback } from 'react'
import { downloadWorkbook } from '@/lib/exportWorkbook'

interface ExportColumn {
  key: string
  label: string
}

export function useExportCsv<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  columns: ExportColumn[]
) {
  const [isExporting, setIsExporting] = useState(false)

  const exportCsv = useCallback(async () => {
    if (!data.length) return
    setIsExporting(true)
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.default.Workbook()
      const ws = wb.addWorksheet('Data')
      ws.columns = columns.map((c) => ({ header: c.label, key: c.label, width: 20 }))
      data.forEach((row) => {
        const mapped: Record<string, unknown> = {}
        for (const col of columns) {
          mapped[col.label] = row[col.key] ?? ''
        }
        ws.addRow(mapped)
      })
      await downloadWorkbook(wb, filename)
    } finally {
      setIsExporting(false)
    }
  }, [data, filename, columns])

  return { exportCsv, isExporting }
}
