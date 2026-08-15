import { auth } from "@/app/(auth)/auth";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  if (!process.env.POSTGRES_URL) {
    return Response.json({
      isReadonly: false,
      messages: [],
      userId: null,
      visibility: "private",
    });
  }

  const [session, chat, messages] = await Promise.all([
    auth().catch(() => null),
    getChatById({ id: chatId }).catch(() => null),
    getMessagesByChatId({ id: chatId }).catch(() => []),
  ]);

  if (!chat) {
    return Response.json({
      isReadonly: false,
      messages: [],
      userId: null,
      visibility: "private",
    });
  }

  if (
    chat.visibility === "private" &&
    (!session?.user || session.user.id !== chat.userId)
  ) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const isReadonly = !session?.user || session.user.id !== chat.userId;

  return Response.json({
    isReadonly,
    messages: convertToUIMessages(messages),
    userId: chat.userId,
    visibility: chat.visibility,
  });
}
