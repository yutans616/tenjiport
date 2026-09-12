// 配列の各要素に非同期処理を適用するが、同時実行数をlimitで制限する。
// Promise.allをそのまま使うと大規模イベント（最大300社等）でDB/Storageへの
// 同時接続数が要素数分に達してしまうため、ZIP生成のようなN件のI/Oバウンドな
// 処理をまとめて行う場面で使う。結果は入力と同じ順序の配列で返る
// （呼び出し側でその後の重複排除等を決定的な順序で処理できるようにするため）。
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
