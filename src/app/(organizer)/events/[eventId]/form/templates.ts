// ブリーフ5章「収集する代表項目」に基づく、展示会でよく使うセクションのテンプレート。
// brand（ブランド共通情報）内の予約キーは exhibitor_profiles への自動同期対象（actions.tsのPRESET_FIELDSと共通）。
export const SECTION_TEMPLATES: Record<
  string,
  { title: string; fields: { key: string; label: string; type: string; required?: boolean; options?: string[] }[] }
> = {
  brand: {
    title: "ブランド共通情報",
    fields: [
      { key: "brand_name", label: "ブランド名", type: "short_text", required: true },
      { key: "company_name", label: "会社名", type: "short_text", required: true },
      { key: "address", label: "所在地", type: "short_text" },
      { key: "website", label: "Webサイト", type: "short_text" },
      { key: "sns_instagram", label: "Instagram", type: "short_text" },
      { key: "sns_facebook", label: "Facebook（Meta）", type: "short_text" },
      { key: "sns_x", label: "X（旧Twitter）", type: "short_text" },
      { key: "sns_youtube", label: "YouTube", type: "short_text" },
      { key: "default_contact_name", label: "担当者氏名", type: "short_text", required: true },
      { key: "default_contact_email", label: "担当者メールアドレス", type: "short_text", required: true },
      { key: "default_contact_phone", label: "担当者電話番号", type: "short_text" },
    ],
  },
  pr: {
    title: "広報素材",
    fields: [
      { key: "description", label: "紹介文", type: "long_text" },
      { key: "logo_file", label: "ロゴ", type: "file" },
      { key: "product_photos", label: "商品写真", type: "file" },
    ],
  },
  event_specific: {
    title: "開催別情報",
    fields: [
      { key: "exhibit_content", label: "展示・販売内容", type: "long_text" },
      { key: "onsite_contact_name", label: "当日担当者", type: "short_text" },
      { key: "emergency_contact", label: "緊急連絡先", type: "short_text" },
    ],
  },
  power: {
    title: "電源・備品",
    fields: [
      { key: "power_needed", label: "電源使用の有無", type: "single_select", options: ["あり", "なし"] },
      { key: "power_equipment", label: "使用機器名", type: "short_text" },
      { key: "power_wattage", label: "消費電力（W）", type: "number" },
      { key: "equipment_request", label: "希望備品", type: "short_text" },
      { key: "equipment_quantity", label: "数量", type: "number" },
    ],
  },
  vehicle: {
    title: "車両・搬入出",
    fields: [
      { key: "vehicle_type", label: "車種", type: "short_text" },
      { key: "vehicle_number", label: "ナンバー", type: "short_text" },
      { key: "vehicle_count", label: "台数", type: "number" },
      { key: "vehicle_contact", label: "担当者", type: "short_text" },
      { key: "preferred_time", label: "搬入出希望時間", type: "short_text" },
    ],
  },
  staff: {
    title: "スタッフ",
    fields: [
      { key: "staff_name", label: "氏名", type: "short_text" },
      { key: "staff_dates", label: "参加日", type: "short_text" },
      { key: "staff_pass_count", label: "パス希望枚数", type: "number" },
    ],
  },
};
