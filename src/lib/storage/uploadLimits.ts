// サーバー側（署名付きURL発行時の検証）とクライアント側（アップロード前の表示・検証）の
// 両方から参照する定数。サーバー専用のモジュール（signedUpload.ts）と分けているのは、
// クライアントコンポーネントがそちらをimportするとcreateServiceRoleClient等の
// サーバー専用コードがブラウザ向けバンドルに引き込まれてしまうため。
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// 1イベントあたりのファイル合計容量の上限（無料インフラ枠の消費ペース管理のため）。
export const MAX_EVENT_STORAGE_BYTES = 200 * 1024 * 1024;

export function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
