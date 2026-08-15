import { auth } from "@/app/(auth)/auth";
import { getSuggestionsByDocumentId } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");

  if (!documentId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter documentId is required."
    ).toResponse();
  }

  if (!process.env.POSTGRES_URL) {
    return Response.json([], { status: 200 });
  }

  const session = await auth().catch(() => null);

  if (!session?.user) {
    return Response.json([], { status: 200 });
  }

  const suggestions = await getSuggestionsByDocumentId({
    documentId,
  }).catch(() => []);

  const [suggestion] = suggestions;

  if (!suggestion) {
    return Response.json([], { status: 200 });
  }

  if (suggestion.userId !== session.user.id) {
    return new ChatbotError("forbidden:api").toResponse();
  }

  return Response.json(suggestions, { status: 200 });
}
