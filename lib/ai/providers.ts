import { google } from "@ai-sdk/google";
import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";

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

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  if (modelId.startsWith("google/") || modelId.startsWith("models/")) {
    const strippedId = modelId.replace("google/", "");
    return google(strippedId);
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (
    titleModel.id.startsWith("google/") ||
    titleModel.id.startsWith("models/")
  ) {
    const strippedId = titleModel.id.replace("google/", "");
    return google(strippedId);
  }
  return gateway.languageModel(titleModel.id);
}
