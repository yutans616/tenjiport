export type MyAnnouncementRow = {
  announcement_version_id: string;
  title: string;
  body: string;
  published_at: string | null;
  ack_required: boolean;
  acknowledged_at: string | null;
  attachments: { file_asset_id: string; filename: string | null; content_type: string }[] | null;
};
