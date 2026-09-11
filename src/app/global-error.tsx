"use client";

// ルートレイアウト自体で例外が起きた場合の最終フォールバック。global-errorは
// ルートレイアウトを丸ごと置き換えるため、通常のCSS/フォント/テーマは届かない前提で、
// インラインスタイルのみで最小限の見た目を組む。
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#171717",
        }}
      >
        <div
          style={{
            maxWidth: 384,
            width: "100%",
            padding: 24,
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            textAlign: "center",
            background: "#fff",
          }}
        >
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "#dc2626", margin: 0 }}>問題が発生しました</h1>
          <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>
            予期しないエラーが発生しました。時間をおいて再度お試しください。
          </p>
          {error.digest && <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>エラーコード: {error.digest}</p>}
          <button
            onClick={() => retry()}
            style={{
              marginTop: 16,
              height: 36,
              padding: "0 16px",
              borderRadius: 8,
              background: "#171717",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  );
}
