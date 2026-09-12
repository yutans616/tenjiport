import path from "node:path";
import PDFDocument from "pdfkit";

const FONT_REGULAR = path.join(process.cwd(), "src/lib/pdf/fonts/NotoSansJP-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "src/lib/pdf/fonts/NotoSansJP-Bold.ttf");
const TAX_RATE = 0.1;

export type ServiceInvoicePdfBankDetails = {
  bankName: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
  accountHolderName: string;
};

export type ServiceInvoicePdfData = {
  invoiceNumber: string;
  issueDate: Date;
  organizerName: string;
  sellerCompanyName: string;
  sellerPostalCode: string | null;
  sellerAddress: string | null;
  sellerPhoneNumber: string | null;
  registrationNumber: string | null;
  lineItemLabel: string;
  amountYen: number;
  // 請求書払い（銀行振込）の場合のみ設定する。null＝クレカ即時決済済み（従来の挙動）。
  dueDate: Date | null;
  bankDetails: ServiceInvoicePdfBankDetails | null;
};

function formatYen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// TenjiPort自身が発行する利用料請求書（適格請求書）のPDF。dueDateが無い（＝クレカ即時決済）
// 場合はexhibitor_invoices向けgenerateInvoicePdfと違い振込先の案内を省略するが、
// dueDateがある（＝請求書払い/銀行振込）場合は同フォーマットの振込先・支払期限を表示する。
export async function generateServiceInvoicePdf(data: ServiceInvoicePdfData): Promise<Buffer> {
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

      doc.font("jp-bold").fontSize(22).text(data.dueDate ? "請求書" : "請求書（お支払い完了）", left, doc.y, { width: contentWidth, align: "center" });
      doc.moveDown(1.5);

      const headerTop = doc.y;
      const leftColWidth = contentWidth * 0.55;
      const rightColX = left + contentWidth * 0.5;
      const rightColWidth = contentWidth * 0.5;

      doc.font("jp-bold").fontSize(15);
      doc.text(`${data.organizerName} 御中`, left, headerTop, { width: leftColWidth });
      const leftBottom = doc.y;

      doc.font("jp").fontSize(10);
      doc.text(`請求書番号: ${data.invoiceNumber}`, rightColX, headerTop, { width: rightColWidth, align: "right" });
      doc.text(`発行日: ${formatDate(data.issueDate)}`, rightColX, doc.y, { width: rightColWidth, align: "right" });
      doc.moveDown(0.6);
      doc.font("jp-bold").fontSize(10);
      doc.text("発行元", rightColX, doc.y, { width: rightColWidth, align: "right" });
      doc.font("jp").fontSize(10);
      doc.text(data.sellerCompanyName, rightColX, doc.y, { width: rightColWidth, align: "right" });
      if (data.sellerPostalCode) doc.text(`〒${data.sellerPostalCode}`, rightColX, doc.y, { width: rightColWidth, align: "right" });
      if (data.sellerAddress) doc.text(data.sellerAddress, rightColX, doc.y, { width: rightColWidth, align: "right" });
      if (data.sellerPhoneNumber) doc.text(`TEL: ${data.sellerPhoneNumber}`, rightColX, doc.y, { width: rightColWidth, align: "right" });
      if (data.registrationNumber) {
        doc.text(`登録番号: ${data.registrationNumber}`, rightColX, doc.y, { width: rightColWidth, align: "right" });
      }
      const rightBottom = doc.y;

      doc.y = Math.max(leftBottom, rightBottom) + 10;
      rule();

      const colItem = contentWidth * 0.55;
      const colQty = contentWidth * 0.15;
      const colAmount = contentWidth * 0.3;

      const rowHeight = 18;
      doc.font("jp-bold").fontSize(10);
      const headerY = doc.y;
      doc.text("品目", left, headerY, { width: colItem, lineBreak: false });
      doc.text("数量", left + colItem, headerY, { width: colQty, align: "right", lineBreak: false });
      doc.text("金額（税込）", left + colItem + colQty, headerY, { width: colAmount, align: "right", lineBreak: false });
      doc.y = headerY + rowHeight;
      rule();

      doc.font("jp").fontSize(10);
      const rowY = doc.y;
      doc.text(data.lineItemLabel, left, rowY, { width: colItem, lineBreak: false });
      doc.text("1", left + colItem, rowY, { width: colQty, align: "right", lineBreak: false });
      doc.text(formatYen(data.amountYen), left + colItem + colQty, rowY, { width: colAmount, align: "right", lineBreak: false });
      doc.y = rowY + rowHeight;
      doc.moveDown(0.5);
      rule();

      const subtotal = Math.round(data.amountYen / (1 + TAX_RATE));
      const tax = data.amountYen - subtotal;
      doc.font("jp").fontSize(10);
      doc.text(`小計（税抜10%相当）: ${formatYen(subtotal)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.text(`消費税（10%）: ${formatYen(tax)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.moveDown(0.25);
      doc.font("jp-bold").fontSize(13);
      doc.text(`ご請求金額（税込）: ${formatYen(data.amountYen)}`, left, doc.y, { width: contentWidth, align: "right" });
      doc.moveDown(1.5);

      if (data.dueDate) {
        doc.font("jp").fontSize(10);
        doc.text(`お支払期限: ${formatDate(data.dueDate)}`, left, doc.y, { width: contentWidth });
        doc.moveDown(1.5);

        if (data.bankDetails) {
          doc.font("jp-bold").fontSize(11).text("お振込先", left, doc.y, { width: contentWidth });
          doc.moveDown(0.4);
          doc.font("jp").fontSize(10);
          doc.text(`銀行名: ${data.bankDetails.bankName}`, left, doc.y, { width: contentWidth });
          doc.text(`支店名: ${data.bankDetails.branchName}`, left, doc.y, { width: contentWidth });
          doc.text(`口座: ${data.bankDetails.accountType} ${data.bankDetails.accountNumber}`, left, doc.y, { width: contentWidth });
          doc.text(`口座名義: ${data.bankDetails.accountHolderName}`, left, doc.y, { width: contentWidth });
          doc.moveDown(1.5);
        }

        rule();

        doc.font("jp").fontSize(10);
        doc.text(
          "上記の通りご請求申し上げます。お振込み手数料は貴社にてご負担いただきますようお願い申し上げます。",
          left,
          doc.y,
          { width: contentWidth },
        );
      } else {
        rule();

        doc.font("jp").fontSize(10);
        doc.text(
          "上記の金額は、ご登録いただいたクレジットカードにより自動的にお支払いが完了しています。振込等の追加のお手続きは不要です。",
          left,
          doc.y,
          { width: contentWidth },
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
