import { Injectable } from '@angular/core';
import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import { MPISheetRequest } from '../models/mpi.models';

export interface PreparedPdfPoint {
  index: number;
  text: string;
  wrapped: string[];
  height: number;
}

@Injectable({
  providedIn: 'root'
})
export class MpiPdfGeneratorService {

  /**
   * Generates the MPI Sheet PDF as a Uint8Array byte array matching QuestPDF layout
   */
  async generatePdfBytes(request: MPISheetRequest): Promise<Uint8Array> {
    const doc = await PDFDocument.create();

    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const fontItalic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const rawPoints = (request.points || '')
      .split(/\r?\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const pointMaxW = 595.28 - 20 * 2 - 28; // contentWidth - 28 = 527.28 pt
    const preparedPoints: PreparedPdfPoint[] = [];

    let ptIdx = 0;
    for (const raw of rawPoints) {
      // Strip any duplicate user-typed bullet or number prefix: "1. ", "1) ", "- ", "• ", "* ", "1: "
      const clean = raw.replace(/^(\d+[\.\)\-:]|\*|\-|•|▪|–)\s*/, '').trim();
      if (!clean) continue;
      const wrapped = this.splitIntoLines(clean, fontRegular, 8.5, pointMaxW);
      // Height = wrapped lines * line height (11.5) + point bottom gap (3.5)
      const height = wrapped.length * 11.5 + 3.5;
      preparedPoints.push({
        index: ptIdx++,
        text: clean,
        wrapped,
        height
      });
    }

    const formattedDate = this.getFormattedMonthYear(request.date);

    // Usable vertical heights inside boxes:
    // Page 1 points box: height 548pt, usable = 548 - 14 - 12 = 522pt
    // Page 2 points box: usable = (curY - 14) - (boxY + 12) = 782.89 - 44 = 738.89pt
    const page1AvailableHeight = 522;
    const overflowPageAvailableHeight = 735;
    const MAX_PAGES = 2; // Strict limit: Maximum 2 pages allowed

    const pagesPoints: PreparedPdfPoint[][] = [];
    let currentPagePoints: PreparedPdfPoint[] = [];
    let currentUsedHeight = 0;
    let currentLimit = page1AvailableHeight;

    for (const pt of preparedPoints) {
      const neededHeight = pt.wrapped.length * 11.5;
      if (currentPagePoints.length === 0 || currentUsedHeight + neededHeight <= currentLimit) {
        currentPagePoints.push(pt);
        currentUsedHeight += pt.height;
      } else {
        // Enforce strict limit to only 2 pages (do not create Page 3)
        if (pagesPoints.length + 1 >= MAX_PAGES) {
          break;
        }
        // Page 1 is filled completely before going to Page 2
        pagesPoints.push(currentPagePoints);
        currentPagePoints = [pt];
        currentLimit = overflowPageAvailableHeight;
        currentUsedHeight = pt.height;
      }
    }

    if (currentPagePoints.length > 0 || pagesPoints.length === 0) {
      pagesPoints.push(currentPagePoints);
    }

    // Document will have either 1 page or at most 2 pages
    const totalPages = Math.min(pagesPoints.length, MAX_PAGES);

    // --- PAGE 1 ---
    const page1 = doc.addPage([595.28, 841.89]);
    this.renderPage(
      doc,
      page1,
      1,
      totalPages,
      request,
      pagesPoints[0] || [],
      formattedDate,
      fontRegular,
      fontBold,
      fontItalic
    );

    // --- PAGE 2 (Overflow page if points exceed Page 1, strictly capped to Page 2) ---
    if (totalPages === 2 && pagesPoints.length > 1) {
      const page2 = doc.addPage([595.28, 841.89]);
      this.renderOverflowPage(
        doc,
        page2,
        2,
        totalPages,
        request,
        pagesPoints[1],
        formattedDate,
        fontRegular,
        fontBold,
        fontItalic
      );
    }

    return await doc.save();
  }

  /**
   * Generates the MPI Sheet PDF as a Blob (application/pdf)
   */
  async generatePdfBlob(request: MPISheetRequest): Promise<Blob> {
    const bytes = await this.generatePdfBytes(request);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: 'application/pdf' });
  }

  private renderPage(
    doc: PDFDocument,
    page: any,
    pageNumber: number,
    totalPages: number,
    request: MPISheetRequest,
    points: PreparedPdfPoint[],
    formattedDate: string,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    fontItalic: PDFFont
  ): void {
    const { width, height } = page.getSize();
    const marginX = 20;
    const marginY = 12;
    const contentWidth = width - marginX * 2;

    // Brand Colors
    const blueDark = rgb(25 / 255, 118 / 255, 210 / 255);       // #1976D2
    const blueDarker = rgb(21 / 255, 101 / 255, 192 / 255);     // #1565C0
    const greyBorder = rgb(203 / 255, 213 / 255, 225 / 255);   // #CBD5E1
    const textDark = rgb(33 / 255, 33 / 255, 33 / 255);         // #212121
    const textMedium = rgb(120 / 255, 130 / 255, 140 / 255);   // #78828C

    let curY = height - marginY;

    // 1. Header Row: Employee Name (Left) | Month & Year (Right)
    const empName = request.employeeName?.trim() || 'MPI SHEET';
    page.drawText(empName, {
      x: marginX,
      y: curY - 18,
      size: 18,
      font: fontBold,
      color: blueDark
    });

    const dateWidth = fontBold.widthOfTextAtSize(formattedDate, 10.5);
    page.drawText(formattedDate, {
      x: width - marginX - dateWidth,
      y: curY - 14,
      size: 10.5,
      font: fontBold,
      color: blueDarker
    });
    curY -= 25;

    // Header Divider Line
    page.drawLine({
      start: { x: marginX, y: curY },
      end: { x: width - marginX, y: curY },
      thickness: 1.5,
      color: blueDark
    });
    curY -= 8;

    // 2. Points Box (Enlarged to 548pt height, sliding lower sections down)
    const pointsBoxHeight = 548;
    const pointsBoxY = curY - pointsBoxHeight;

    page.drawRectangle({
      x: marginX,
      y: pointsBoxY,
      width: contentWidth,
      height: pointsBoxHeight,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    if (points.length === 0) {
      page.drawText('No points provided.', {
        x: marginX + 10,
        y: curY - 20,
        size: 8.5,
        font: fontItalic,
        color: textMedium
      });
    } else {
      let pY = curY - 14;
      const bulletX = marginX + 9;
      const textX = marginX + 20;

      for (const pt of points) {
        if (pY < pointsBoxY + 12) break;

        // Draw crisp circular bullet point in blueDark
        page.drawCircle({
          x: bulletX,
          y: pY + 3.0,
          size: 2.2,
          color: blueDark
        });

        // Draw wrapped lines indented at textX for clean hanging indent
        for (let l = 0; l < pt.wrapped.length; l++) {
          if (pY < pointsBoxY + 10) break;
          page.drawText(pt.wrapped[l], {
            x: textX,
            y: pY,
            size: 8.5,
            font: fontRegular,
            color: textDark
          });
          pY -= 11.5;
        }
        pY -= 3.5;
      }
    }

    curY = pointsBoxY - 8;

    // 3. Extraordinary Section
    const cardHeight = 45;
    page.drawText('Extraordinary', {
      x: marginX,
      y: curY - 8,
      size: 9,
      font: fontBold,
      color: textDark
    });
    curY -= 14;

    page.drawRectangle({
      x: marginX,
      y: curY - cardHeight,
      width: contentWidth,
      height: cardHeight,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    const extraText = request.extraCurricularActivity?.trim();
    if (extraText) {
      const wrapped = this.splitIntoLines(extraText, fontRegular, 8.5, contentWidth - 14);
      let textY = curY - 13;
      for (const line of wrapped.slice(0, 3)) {
        page.drawText(line, {
          x: marginX + 7,
          y: textY,
          size: 8.5,
          font: fontRegular,
          color: textDark
        });
        textY -= 11.5;
      }
    } else {
      page.drawText('Extraordinary Contributions / Notes', {
        x: marginX + 7,
        y: curY - 15,
        size: 8.2,
        font: fontItalic,
        color: textMedium
      });
    }
    curY -= (cardHeight + 8);

    // 4. Team Lead Review Section (Title + Rating Box [   ] / 10 + Review box)
    page.drawText('Team Lead Review', {
      x: marginX,
      y: curY - 8,
      size: 9,
      font: fontBold,
      color: textDark
    });

    const r10Text = ' / 10';
    const r10W = fontBold.widthOfTextAtSize(r10Text, 9.5);
    const r10X = width - marginX - r10W;
    page.drawText(r10Text, {
      x: r10X,
      y: curY - 8,
      size: 9.5,
      font: fontBold,
      color: textDark
    });

    const boxW = 32, boxH = 15;
    const boxX = r10X - boxW - 3;
    // Align rating box cleanly with text baseline and leave 7pt space above review box
    const boxY = curY - 11;
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    if (request.hrRating !== undefined && request.hrRating !== null && request.hrRating !== '') {
      const ratingStr = String(request.hrRating);
      const rw = fontBold.widthOfTextAtSize(ratingStr, 10);
      page.drawText(ratingStr, {
        x: boxX + (boxW - rw) / 2,
        y: boxY + 3.5,
        size: 10,
        font: fontBold,
        color: textDark
      });
    }

    if (request.seniorRating !== undefined && request.seniorRating !== null && request.seniorRating !== '') {
      const ratingStr = String(request.seniorRating);
      const rw = fontBold.widthOfTextAtSize(ratingStr, 10);
      page.drawText(ratingStr, {
        x: boxX + (boxW - rw) / 2,
        y: boxY + 3.5,
        size: 10,
        font: fontBold,
        color: textDark
      });
    }

    const ratingLabel = 'Rating: ';
    const ratingLabelW = fontBold.widthOfTextAtSize(ratingLabel, 9.5);
    page.drawText(ratingLabel, {
      x: boxX - ratingLabelW - 3,
      y: curY - 8,
      size: 9.5,
      font: fontBold,
      color: textDark
    });

    // Space of 7pt between bottom of rating box (boxY = curY - 11) and top of review box (curY - 18)
    curY -= 18;
    page.drawRectangle({
      x: marginX,
      y: curY - cardHeight,
      width: contentWidth,
      height: cardHeight,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    const leadReviewText = request.seniorReview?.trim();
    if (leadReviewText) {
      const wrapped = this.splitIntoLines(leadReviewText, fontRegular, 8.5, contentWidth - 14);
      let textY = curY - 13;
      for (const line of wrapped.slice(0, 3)) {
        page.drawText(line, {
          x: marginX + 7,
          y: textY,
          size: 8.5,
          font: fontRegular,
          color: textDark
        });
        textY -= 11.5;
      }
    } else {
      page.drawText('Review Comments / Notes', {
        x: marginX + 7,
        y: curY - 15,
        size: 8.2,
        font: fontItalic,
        color: textMedium
      });
    }
    curY -= (cardHeight + 8);

    // 5. HR Review & Approval Section (Title + Rating Box [   ] / 10 + HR Remarks box)
    page.drawText('HR Review & Approval', {
      x: marginX,
      y: curY - 8,
      size: 9,
      font: fontBold,
      color: textDark
    });

    page.drawText(r10Text, {
      x: r10X,
      y: curY - 8,
      size: 9.5,
      font: fontBold,
      color: textDark
    });

    const hrBoxY = curY - 11;
    page.drawRectangle({
      x: boxX,
      y: hrBoxY,
      width: boxW,
      height: boxH,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    if (request.hrRating !== undefined && request.hrRating !== null && request.hrRating !== '') {
      const ratingStr = String(request.hrRating);
      const rw = fontBold.widthOfTextAtSize(ratingStr, 10);
      page.drawText(ratingStr, {
        x: boxX + (boxW - rw) / 2,
        y: hrBoxY + 3.5,
        size: 10,
        font: fontBold,
        color: textDark
      });
    }

    page.drawText(ratingLabel, {
      x: boxX - ratingLabelW - 3,
      y: curY - 8,
      size: 9.5,
      font: fontBold,
      color: textDark
    });

    // Space of 7pt between bottom of rating box and top of HR review box
    curY -= 18;
    page.drawRectangle({
      x: marginX,
      y: curY - cardHeight,
      width: contentWidth,
      height: cardHeight,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    const hrReviewText = request.hrReview?.trim();
    if (hrReviewText) {
      const wrapped = this.splitIntoLines(hrReviewText, fontRegular, 8.5, contentWidth - 14);
      let textY = curY - 13;
      for (const line of wrapped.slice(0, 3)) {
        page.drawText(line, {
          x: marginX + 7,
          y: textY,
          size: 8.5,
          font: fontRegular,
          color: textDark
        });
        textY -= 11.5;
      }
    } else {
      page.drawText('HR Remarks', {
        x: marginX + 7,
        y: curY - 15,
        size: 8.2,
        font: fontItalic,
        color: textMedium
      });
    }

    // 6. Footer Row
    const footerY = marginY;
    page.drawText('MPI Sheet System — Confidential & Proprietary', {
      x: marginX,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: textMedium
    });

    const pageStr = `Page ${pageNumber} of ${totalPages}`;
    const pageStrW = fontRegular.widthOfTextAtSize(pageStr, 7.5);
    page.drawText(pageStr, {
      x: width - marginX - pageStrW,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: textMedium
    });
  }

  private renderOverflowPage(
    doc: PDFDocument,
    page: any,
    pageNumber: number,
    totalPages: number,
    request: MPISheetRequest,
    points: PreparedPdfPoint[],
    formattedDate: string,
    fontRegular: PDFFont,
    fontBold: PDFFont,
    fontItalic: PDFFont
  ): void {
    const { width, height } = page.getSize();
    const marginX = 20;
    const marginY = 12;
    const contentWidth = width - marginX * 2;

    const blueDark = rgb(25 / 255, 118 / 255, 210 / 255);
    const blueDarker = rgb(21 / 255, 101 / 255, 192 / 255);
    const greyBorder = rgb(203 / 255, 213 / 255, 225 / 255);
    const textDark = rgb(33 / 255, 33 / 255, 33 / 255);
    const textMedium = rgb(120 / 255, 130 / 255, 140 / 255);

    let curY = height - marginY;

    // Header
    const empName = request.employeeName?.trim() || 'MPI SHEET';
    page.drawText(empName, {
      x: marginX,
      y: curY - 18,
      size: 18,
      font: fontBold,
      color: blueDark
    });

    const dateWidth = fontBold.widthOfTextAtSize(formattedDate, 10.5);
    page.drawText(formattedDate, {
      x: width - marginX - dateWidth,
      y: curY - 14,
      size: 10.5,
      font: fontBold,
      color: blueDarker
    });
    curY -= 25;

    page.drawLine({
      start: { x: marginX, y: curY },
      end: { x: width - marginX, y: curY },
      thickness: 1.5,
      color: blueDark
    });
    curY -= 8;

    // Overflow Points Box (takes full remaining page height down to footer)
    const boxY = marginY + 20;
    const boxHeight = curY - boxY;

    page.drawRectangle({
      x: marginX,
      y: boxY,
      width: contentWidth,
      height: boxHeight,
      borderWidth: 1,
      borderColor: greyBorder,
      color: rgb(1, 1, 1)
    });

    let pY = curY - 14;
    const bulletX = marginX + 9;
    const textX = marginX + 20;

    for (const pt of points) {
      if (pY < boxY + 12) break;

      // Draw crisp circular bullet point in blueDark
      page.drawCircle({
        x: bulletX,
        y: pY + 3.0,
        size: 2.2,
        color: blueDark
      });

      // Draw wrapped lines indented at textX for clean hanging indent
      for (let l = 0; l < pt.wrapped.length; l++) {
        if (pY < boxY + 10) break;
        page.drawText(pt.wrapped[l], {
          x: textX,
          y: pY,
          size: 8.5,
          font: fontRegular,
          color: textDark
        });
        pY -= 11.5;
      }
      pY -= 3.5;
    }

    // Footer
    const footerY = marginY;
    page.drawText('MPI Sheet System — Confidential & Proprietary', {
      x: marginX,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: textMedium
    });

    const pageStr = `Page ${pageNumber} of ${totalPages}`;
    const pageStrW = fontRegular.widthOfTextAtSize(pageStr, 7.5);
    page.drawText(pageStr, {
      x: width - marginX - pageStrW,
      y: footerY,
      size: 7.5,
      font: fontRegular,
      color: textMedium
    });
  }

  private splitIntoLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines.length > 0 ? lines : [''];
  }

  private getFormattedMonthYear(dateStr?: string): string {
    if (!dateStr || !dateStr.trim()) {
      const now = new Date();
      const monthNames = [
        'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
      ];
      return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    const trimmed = dateStr.trim();
    // If user entered formatted text e.g. "OCTOBER 2026", "October 2026", "Nov 2026"
    if (/^[A-Za-z]+\s+\d{2,4}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }

    // If user passed YYYY-MM or YYYY-MM-DD
    const parts = trimmed.split('-');
    if (parts.length >= 2) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        const monthNames = [
          'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
          'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
        ];
        return `${monthNames[month - 1]} ${year}`;
      }
    }

    return trimmed.toUpperCase();
  }
}

