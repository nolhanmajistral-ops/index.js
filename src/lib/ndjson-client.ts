/** Lecture côté navigateur d'une réponse NDJSON (une ligne JSON = un événement). */
export async function readNdjson<T extends { type: string }>(res: Response, onEvent: (event: T) => void): Promise<void> {
  if (!res.ok || !res.body) {
    let message = "Le serveur n'a pas répondu.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* corps non JSON */
    }
    onEvent({ type: "error", message } as unknown as T);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as T);
    }
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
}
