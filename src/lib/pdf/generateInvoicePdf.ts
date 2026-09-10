import path from "node:path";
import PDFDocument from "pdfkit";
import type { InvoiceLineItem } from "./resolveInvoiceLineItems";

const FONT_REGULAR = path.join(process.cwd(), "src/lib/pdf/fonts/NotoSansJP-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "src/lib/pdf/fonts/NotoSansJP-Bold.ttf");
const TAX_RATE = 0.1;

export type InvoicePdfBankDetails = {
  bankName: string | null;
  branchName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
};

export type InvoicePdfData = {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: string | null;
  organizerName: string;
  organizerPostalCode: string | null;
  organizerAddress: string | null;
  registrationNumber: string | null;
  bankDetails: InvoicePdfBankDetails | null;
  exhibitorCompanyName: string;
  lineItems: InvoiceLineItem[];
  amountYen: number;
};

function formatYen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function hasBankDetails(b: InvoicePdfBankDetails | null): b is InvoicePdfBankDetails {
  return !!b && !!(b.bankName || b.accountNumber);
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("jp", FONT_REGULAR);
      doc.registerFont("jp-bold", FONT_BOLD);

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const contentWidth = right - left;

      function rule() {
        const y = doc.y;
        doc.moveTo(left, y).lineTo(right, y).strokeColor("#cccccc").stroke();
        doc.moveDown(0.75);
      }

      // タイトル
      doc.font("jp-bold").fontSize(22).text("請求書", left, doc.y, { width: contentWidth, align: "center" });
      doc.moveDown(1.5);

      // 請求書番号・発行日（右寄せ）
      doc.font("jp").fontSize(10);
      doc.text(`請求書番号: ${data.invoiceNumber}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.text(`発行日: ${formatDate(data.issueDate)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.moveDown(1);

      // 発行元
      doc.font("jp-bold").fontSize(11).text("発行元", left, doc.y, { width: contentWidth });
      doc.moveDown(0.3);
      doc.font("jp").fontSize(10);
      doc.text(data.organizerName, left, doc.y, { width: contentWidth });
      if (data.organizerPostalCode) doc.text(`〒${data.organizerPostalCode}`, left, doc.y, { width: contentWidth });
      if (data.organizerAddress) doc.text(data.organizerAddress, left, doc.y, { width: contentWidth });
      if (data.registrationNumber) {
        doc.text(`適格請求書発行事業者登録番号: ${data.registrationNumber}`, left, doc.y, { width: contentWidth });
      }
      doc.moveDown(1.5);

      rule();

      // 宛先
      doc.font("jp-bold").fontSize(15).text(`${data.exhibitorCompanyName} 御中`, left, doc.y, { width: contentWidth });
      doc.moveDown(1.5);

      // 明細（品目・数量・金額）
      const colItem = contentWidth * 0.55;
      const colQty = contentWidth * 0.15;
      const colAmount = contentWidth * 0.3;

      // 各セルはlineBreak:falseで単一行に固定し、行の高さを自前で管理する
      // （複数のtext()呼び出しが互いのdoc.yを不定に更新し合うのを避けるため）。
      const rowHeight = 18;
      doc.font("jp-bold").fontSize(10);
      const headerY = doc.y;
      doc.text("品目", left, headerY, { width: colItem, lineBreak: false });
      doc.text("数量", left + colItem, headerY, { width: colQty, align: "right", lineBreak: false });
      doc.text("金額（税込）", left + colItem + colQty, headerY, { width: colAmount, align: "right", lineBreak: false });
      doc.y = headerY + rowHeight;
      rule();

      doc.font("jp").fontSize(10);
      for (const item of data.lineItems) {
        const rowY = doc.y;
        doc.text(item.label, left, rowY, { width: colItem, lineBreak: false });
        doc.text(String(item.quantity), left + colItem, rowY, { width: colQty, align: "right", lineBreak: false });
        doc.text(formatYen(item.priceYen * item.quantity), left + colItem + colQty, rowY, { width: colAmount, align: "right", lineBreak: false });
        doc.y = rowY + rowHeight;
      }
      doc.moveDown(0.5);
      rule();

      // 税抜金額・消費税の内訳（税込合計金額から逆算）
      const subtotal = Math.round(data.amountYen / (1 + TAX_RATE));
      const tax = data.amountYen - subtotal;
      doc.font("jp").fontSize(10);
      doc.text(`小計（税抜10%相当）: ${formatYen(subtotal)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.text(`消費税（10%）: ${formatYen(tax)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.moveDown(0.25);
      doc.font("jp-bold").fontSize(13);
      doc.text(`ご請求金額（税込）: ${formatYen(data.amountYen)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.moveDown(1.5);

      doc.font("jp").fontSize(10);
      doc.text(`お支払期限: ${data.dueDate ?? "-"}`, left, doc.y, { width: contentWidth });
      doc.moveDown(1.5);

      if (hasBankDetails(data.bankDetails)) {
        doc.font("jp-bold").fontSize(11).text("お振込先", left, doc.y, { width: contentWidth });
        doc.moveDown(0.4);
        doc.font("jp").fontSize(10);
        if (data.bankDetails.bankName) doc.text(`銀行名: ${data.bankDetails.bankName}`, left, doc.y, { width: contentWidth });
        if (data.bankDetails.branchName) doc.text(`支店名: ${data.bankDetails.branchName}`, left, doc.y, { width: contentWidth });
        if (data.bankDetails.accountType && data.bankDetails.accountNumber) {
          doc.text(`口座: ${data.bankDetails.accountType} ${data.bankDetails.accountNumber}`, left, doc.y, { width: contentWidth });
        }
        if (data.bankDetails.accountHolderName) doc.text(`口座名義: ${data.bankDetails.accountHolderName}`, left, doc.y, { width: contentWidth });
        doc.moveDown(1.5);
      }

      rule();

      doc.font("jp").fontSize(10);
      doc.text(
        "上記の通りご請求申し上げます。お振込み手数料は御社でご負担頂きますようお願い申し上げます。",
        left,
        doc.y,
        { width: contentWidth },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
