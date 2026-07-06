import * as XLSX from 'xlsx';

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number)[][];
}

export const generateExcel = (sheets: ExcelSheet[]): Blob => {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const data = [sheet.headers, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Auto-width columns
    const colWidths = sheet.headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...sheet.rows.map(r => String(r[i] || '').length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }

  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

export const downloadExcel = (sheets: ExcelSheet[], filename?: string) => {
  const blob = generateExcel(sheets);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `export-${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
