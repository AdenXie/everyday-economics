// Vercel Function: POST /api/chat → AMD Radeon Cloud (Qwen3.8-27B).
// Set RADEON_API_KEY in the Vercel project's Environment Variables.
import { handleChat } from "../server/ai-proxy.js";

export default {
  fetch(request) {
    return handleChat(request, process.env);
  },
};
