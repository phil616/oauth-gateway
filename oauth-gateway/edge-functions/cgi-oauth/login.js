import { oauthStart } from "../lib/oauth.js";

export async function onRequest(context) {
  try {
    return await oauthStart(context);
  } catch (error) {
    return new Response("OAuth Login Error: " + error.message, { status: 500 });
  }
}

