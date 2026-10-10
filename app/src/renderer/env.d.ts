export {};

declare global {
  interface Window {
    jamFrog: {
      platform: string;
      saveMidi(bytes: Uint8Array, fileName: string): Promise<string | null>;
      osc: {
        send(address: string, ...args: number[]): void;
        onMessage(cb: (msg: unknown[]) => void): void;
        onError(cb: (text: string) => void): void;
      };
    };
  }
}
