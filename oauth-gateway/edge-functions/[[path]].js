import { handleGatewayRequest } from "./lib/gateway.js";

export async function onRequest(context) {
  return handleGatewayRequest(context);
}
