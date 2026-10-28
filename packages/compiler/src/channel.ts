import type { ServerHotChannel } from "vite";

export interface WirePayload {
  type: string;
  data?: unknown;
  event?: string;
  path?: string;
  updates?: unknown[];
  [key: string]: unknown;
}

export interface HotClient {
  send: (payload: unknown) => void;
}

export function createChannelBridge(channel: ServerHotChannel) {
  const api = channel.api;
  if (!api) throw new Error("hot channel without api");
  let onWire: ((payload: WirePayload) => void) | null = null;

  api.outsideEmitter.on("send", (payload: unknown) => {
    onWire?.(payload as WirePayload);
  });

  return {
    setWire(handler: (payload: WirePayload) => void) {
      onWire = handler;
    },
    clientConnect(client: HotClient) {
      api.innerEmitter.emit("vite:client:connect", undefined, {
        send: (payload: unknown) => {
          if ((payload as WirePayload)?.type === "custom") client.send(payload);
        },
      });
    },
    clientMessage(payload: WirePayload, client: HotClient) {
      if (payload.type === "custom" && typeof payload.event === "string") {
        api.innerEmitter.emit(payload.event, payload.data, {
          send: (p: unknown) => {
            if ((p as WirePayload)?.type === "custom") client.send(p);
          },
        });
      }
    },
  };
}
