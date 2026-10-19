export async function uploadImageQueue<T>(
  items: T[],
  upload: (item: T) => Promise<{ error?: string }>,
  onResult: (item: T, error?: string) => void,
  shouldContinue: () => boolean = () => true
) {
  for (const item of items) {
    if (!shouldContinue()) break;
    let error: string | undefined;
    try { error = (await upload(item)).error; }
    catch { error = "Upload interrupted. Try this image again."; }
    onResult(item, error);
  }
}
