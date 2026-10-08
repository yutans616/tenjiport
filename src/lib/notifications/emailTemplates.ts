// 出展者向け通知メールの文面。組織ごとに件名・本文・署名を変更でき（organization_email_templates、
// migrations/0073）、未設定の項目は下の標準文面を使う。{{…}}は送信時に差し込む。
// 確認用リンク・資料の本文（主催者が資料ごとに入力したもの）は文面設定とは別に必ず付ける。

export const EMAIL_TEMPLATE_TYPES = [
  "announcement_publish",
  "announcement_resend",
  "invoice_publish",
  "invoice_reminder",
  "revision_request",
  "revision_request_resend",
  "participation_invite",
] as const;
export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

export const EMAIL_TEMPLATE_LABEL: Record<EmailTemplateType, string> = {
  announcement_publish: "資料の公開",
  announcement_resend: "資料の再通知（未確認者へ）",
  invoice_publish: "請求書の発行",
  invoice_reminder: "請求書の再送・督促",
  revision_request: "修正依頼",
  revision_request_resend: "修正依頼の再送",
  participation_invite: "出展のご案内（過去の出展者への招待）",
};

export const EMAIL_VARIABLES: Record<EmailTemplateType, string[]> = {
  announcement_publish: ["イベント名", "ブランド名", "主催者名", "資料タイトル"],
  announcement_resend: ["イベント名", "ブランド名", "主催者名", "資料タイトル"],
  invoice_publish: ["イベント名", "ブランド名", "主催者名", "請求金額", "支払期限"],
  invoice_reminder: ["イベント名", "ブランド名", "主催者名", "請求金額", "支払期限"],
  revision_request: ["イベント名", "ブランド名", "主催者名", "修正依頼内容"],
  revision_request_resend: ["イベント名", "ブランド名", "主催者名", "修正依頼内容"],
  participation_invite: ["イベント名", "ブランド名", "主催者名", "開催期間", "会場"],
};

export const DEFAULT_EMAIL_TEMPLATES: Record<EmailTemplateType, { subject: string; body: string }> = {
  announcement_publish: {
    subject: "【{{イベント名}}】資料が公開されました：{{資料タイトル}}",
    body: "{{ブランド名}} ご担当者様\n\n{{イベント名}}の資料「{{資料タイトル}}」を公開しました。\n下記リンクから内容をご確認ください。",
  },
  announcement_resend: {
    subject: "【再送・{{イベント名}}】資料のご確認をお願いします：{{資料タイトル}}",
    body: "{{ブランド名}} ご担当者様\n\n{{イベント名}}の資料「{{資料タイトル}}」について、まだご確認いただけていないようです。\nお手数ですが、下記リンクから内容をご確認ください。",
  },
  invoice_publish: {
    subject: "【{{イベント名}}】請求書が届いています",
    body: "{{ブランド名}} ご担当者様\n\n{{イベント名}}の請求書を発行しました。\nご請求金額：{{請求金額}}\nお支払期限：{{支払期限}}\n\n下記リンクから請求書と振込先をご確認ください。",
  },
  invoice_reminder: {
    subject: "【再送・{{イベント名}}】請求書のご確認をお願いします",
    body: "{{ブランド名}} ご担当者様\n\n{{イベント名}}の請求書について、改めてご案内いたします。\nご請求金額：{{請求金額}}\nお支払期限：{{支払期限}}\n\n下記リンクから請求書と振込先をご確認ください。すでにお支払い済みの場合は、行き違いですのでご容赦ください。",
  },
  revision_request: {
    subject: "【{{イベント名}}】入力内容の修正をお願いします",
    body: "{{ブランド名}} ご担当者様\n\n{{イベント名}}にご提出いただいた内容について、以下の修正をお願いいたします。\n\n{{修正依頼内容}}\n\n下記リンクから修正のうえ、再度ご提出ください。",
  },
  revision_request_resend: {
    subject: "【再送・{{イベント名}}】入力内容の修正をお願いします",
    body: "{{ブランド名}} ご担当者様\n\n{{イベント名}}にご提出いただいた内容について、以下の修正をお願いしております。\n\n{{修正依頼内容}}\n\n下記リンクから修正のうえ、再度ご提出ください。",
  },
  participation_invite: {
    subject: "【{{イベント名}}】出展のご案内",
    body: "{{ブランド名}} ご担当者様\n\nいつもお世話になっております。\n{{イベント名}}（{{開催期間}}・{{会場}}）の出展者募集をご案内いたします。\n\n前回ご登録いただいた内容を入力済みにしておりますので、下記リンクから内容をご確認のうえ、ブース・オプション品等をお選びいただきご提出ください。",
  },
};

export const DEFAULT_SIGNATURE = "{{主催者名}}";

export type EmailTemplateOverrides = Partial<Record<EmailTemplateType | "signature", { subject: string | null; body: string | null }>>;

export function fillVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, name: string) => (name in vars ? vars[name] : match));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

export function renderNotificationEmail(params: {
  templateType: EmailTemplateType;
  overrides: EmailTemplateOverrides;
  vars: Record<string, string>;
  link: string;
  /** 資料の本文（主催者が資料ごとに入力したもの）。資料のメールのみ。 */
  announcementBody?: string | null;
}): { subject: string; text: string; html: string } {
  const { templateType, overrides, vars, link, announcementBody } = params;
  const custom = overrides[templateType];
  const subject = fillVariables(custom?.subject?.trim() || DEFAULT_EMAIL_TEMPLATES[templateType].subject, vars);
  const body = fillVariables(custom?.body?.trim() || DEFAULT_EMAIL_TEMPLATES[templateType].body, vars);
  const signature = fillVariables(overrides.signature?.body?.trim() || DEFAULT_SIGNATURE, vars);

  const linkBlock = `▼ご確認はこちら\n${link}\n（このリンクは一定時間で無効になります。期限切れの場合は、最初にお知らせしたURLからメールアドレスを入力してください）`;
  const sections = [body, announcementBody?.trim() ? `――――――――――\n${announcementBody.trim()}\n――――――――――` : null, linkBlock, `--\n${signature}`].filter(
    (s): s is string => !!s,
  );
  const text = sections.join("\n\n");

  const html = [
    `<p>${textToHtml(body)}</p>`,
    announcementBody?.trim()
      ? `<div style="border-left:3px solid #ccc;padding-left:12px;margin:16px 0">${textToHtml(announcementBody.trim())}</div>`
      : "",
    `<p>▼ご確認はこちら<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a><br><span style="color:#666;font-size:12px">（このリンクは一定時間で無効になります。期限切れの場合は、最初にお知らせしたURLからメールアドレスを入力してください）</span></p>`,
    `<p style="color:#444">--<br>${textToHtml(signature)}</p>`,
  ].join("");

  return { subject, text, html };
}

export const SAMPLE_VARIABLES: Record<string, string> = {
  イベント名: "サンプル展示会2026",
  ブランド名: "サンプル物産株式会社",
  主催者名: "（組織名）",
  資料タイトル: "搬入のご案内",
  請求金額: "¥33,000",
  支払期限: "2026-11-30",
  修正依頼内容: "電話番号が間違っています。修正をお願いいたします。",
  開催期間: "2026-11-07〜2026-11-09",
  会場: "東京ビッグサイト",
};
