import { oauthCallback } from "../lib/oauth.js";

export async function onRequest(context) {
  try {
    return await oauthCallback(context);
  } catch (error) {
    console.error("OAuth Callback Error", error);
    return new Response("OAuth Callback Error", { status: 500 });
  }
}
