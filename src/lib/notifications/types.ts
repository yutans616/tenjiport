export type MyAnnouncementRow = {
  announcement_version_id: string;
  title: string;
  body: string;
  published_at: string | null;
  ack_required: boolean;
  acknowledged_at: string | null;
  attachments: { file_asset_id: string; filename: string | null; content_type: string }[] | null;
  requires_submission: boolean;
  submission_due_date: string | null;
  submissions: { id: string; file_asset_id: string; filename: string | null; submitted_at: string }[] | null;
};
