import { fetchAuthSession } from "aws-amplify/auth";
import outputs from "../amplify_outputs.json";

const CHAT_URL = outputs.custom?.chatStreamUrl;
if (!CHAT_URL) {
  console.warn("chatStreamUrl missing from amplify_outputs.json — chat drawer will not work");
}

export async function* streamChat({ message, sessionId }) {
  const { tokens } = await fetchAuthSession();
  const idToken = tokens?.idToken?.toString();
  if (!idToken) throw new Error("No auth token — please sign in");

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ message, sessionId })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evMatch = chunk.match(/^event: (.+)$/m);
      const dataMatch = chunk.match(/^data: (.+)$/ms);
      if (evMatch && dataMatch) {
        try {
          yield { type: evMatch[1], data: JSON.parse(dataMatch[1]) };
        } catch (e) {
          console.warn("Bad SSE chunk:", chunk);
        }
      }
    }
  }
}
