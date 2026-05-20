import type { ApiSurface } from "@shared/ipc-types.js";
import type { ApprovalRequest, StreamEvent } from "@shared/domain.js";

declare global {
  interface ChaseJoyBridge {
    readonly version: string;
    readonly api: ApiSurface;
    readonly on: {
      onStream(handler: (evt: StreamEvent) => void): () => void;
      onApprovalRequest(handler: (req: ApprovalRequest) => void): () => void;
    };
  }

  interface Window {
    chasejoy: ChaseJoyBridge;
  }
}

export {};
