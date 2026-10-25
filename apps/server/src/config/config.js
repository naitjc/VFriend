require("dotenv").config();
const path = require("path");

const config = {
  port: Number(process.env.PORT) || 8888,
  apiKey: process.env.API_KEY,
  model: process.env.MODEL || "GLM-5",
  apiURL: process.env.API_BASE_URL || "https://api.edgefn.net/v1",
  databasePath:
    process.env.SQLITE_PATH || path.join(__dirname, "../../data/chat.db"),

  setModel(newModel) {
    if (newModel && typeof newModel === "string") {
      this.model = newModel;
    }
  },

  validate() {
    let protocol;
    try {
      protocol = new URL(this.apiURL).protocol;
    } catch {
      throw new Error("API_BASE_URL 不是有效 URL。");
    }
    if (protocol !== "http:" && protocol !== "https:") {
      throw new Error("API_BASE_URL 仅支持 http:// 或 https://。");
    }
  },
};

module.exports = config;
