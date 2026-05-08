import { oauthCallback } from "../lib/oauth.js";

export async function onRequest(context) {
  try {
    return await oauthCallback(context);
  } catch (error) {
    return new Response("OAuth Callback Error: " + error.message, { status: 500 });
  }
}

