export {};

declare global {
  interface Window {
    jamFrog: {
      platform: string;
      osc: {
        send(address: string, ...args: number[]): void;
        onMessage(cb: (msg: unknown[]) => void): void;
        onError(cb: (text: string) => void): void;
      };
      /** the jam report's Gemini call (main process; the API key stays there) */
      gemini: {
        available(): Promise<boolean>;
        generate(body: unknown): Promise<{ response?: unknown; error?: string }>;
      };
    };
  }
}
