export interface TicketAnalysis {
  category: string;
  categoryConfidence: number;
  sentiment: "negative" | "neutral" | "positive";
  sentimentScore: number;
  urgency: "low" | "medium" | "high";
  urgencySignals: string[];
  suggestedReply: string;
  replySource: "template" | "llm";
  modelVersion: string;
}

interface AiResponse {
  category: string;
  confidence: number;
  sentiment: { label: TicketAnalysis["sentiment"]; score: number };
  urgency: { level: TicketAnalysis["urgency"]; signals: string[] };
  suggested_reply: string;
  reply_source: "template" | "llm";
  model_version: string;
}

/**
 * Asks the optional Python AI service to analyse a ticket.
 * Returns null when the service is not configured, slow or down, so that
 * ticket creation never depends on it.
 */
export async function analyseTicket(
  subject: string,
  message: string
): Promise<TicketAnalysis | null> {
  const baseUrl = process.env.AI_SERVICE_URL;
  if (!baseUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as AiResponse;

    return {
      category: data.category,
      categoryConfidence: data.confidence,
      sentiment: data.sentiment.label,
      sentimentScore: data.sentiment.score,
      urgency: data.urgency.level,
      urgencySignals: data.urgency.signals,
      suggestedReply: data.suggested_reply,
      replySource: data.reply_source,
      modelVersion: data.model_version,
    };
  } catch (error) {
    console.warn("AI service unavailable:", (error as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
