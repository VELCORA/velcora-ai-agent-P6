import { groq } from "@ai-sdk/groq";
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";

export const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        chatModel,
        titleModel: mockTitleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mockTitleModel,
        },
      });
    })()
  : null;

// All production traffic routes through our Groq-backed Velcora model.
// The real underlying model is never exposed to the client.
export function getLanguageModel(_modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("chat-model");
  }
  return groq(GROQ_MODEL);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return groq(GROQ_MODEL);
}
