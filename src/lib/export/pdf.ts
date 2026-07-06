import { jsPDF } from 'jspdf';

export interface PDFSection {
  title: string;
  headers: string[];
  rows: string[][];
}

export const generatePDF = async (title: string, sections: PDFSection[]): Promise<Blob> => {
  const doc = new jsPDF();
  let y = 20;

  // Title
  doc.setFontSize(16);
  doc.text(title, 14, y);
  y += 10;

  // Date
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, y);
  y += 5;

  for (const section of sections) {
    // Section title
    y += 5;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(section.title, 14, y);
    y += 5;

    // Check if we need a new page
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    // Table header
    doc.setFillColor(240, 240, 240);
    const colWidths = section.headers.map(() => Math.min(170 / section.headers.length, 50));
    let x = 14;
    section.headers.forEach((header, i) => {
      doc.rect(x, y, colWidths[i], 7, 'F');
      doc.setFontSize(7);
      doc.text(header, x + 1, y + 5);
      x += colWidths[i];
    });
    y += 7;

    // Table rows
    for (const row of section.rows) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      x = 14;
      const maxLines = Math.max(...row.map(cell => {
        const lines = doc.splitTextToSize(cell || '-', colWidths[row.indexOf(cell)] - 2);
        return lines.length;
      }));
      const rowHeight = Math.max(6, maxLines * 4);

      let currentX = 14;
      row.forEach((cell, i) => {
        const lines = doc.splitTextToSize(cell || '-', colWidths[i] - 2);
        doc.setFontSize(6);
        doc.text(lines, currentX + 1, y + 4);
        currentX += colWidths[i];
      });
      y += rowHeight + 1;
    }
  }

  return doc.output('blob');
};

export const downloadPDF = async (title: string, sections: PDFSection[], filename?: string) => {
  const blob = await generatePDF(title, sections);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
};
