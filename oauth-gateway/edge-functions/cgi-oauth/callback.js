import { oauthCallback } from "../lib/oauth.js";
import { errorResponse } from "../lib/http.js";

export async function onRequest(context) {
  try {
    return await oauthCallback(context);
  } catch (error) {
    console.error("OAuth callback internal error", error);
    return errorResponse(context.request, 500, "OAUTH_INTERNAL_ERROR");
  }
}
