// html2canvas@1.4.1 ships a broken "typings" pointer (dist/types/index.d.ts
// doesn't actually exist in the published package). This minimal ambient
// declaration keeps TypeScript happy without pulling in a types package.
declare module 'html2canvas' {
  export interface Html2CanvasOptions {
    scale?: number;
    backgroundColor?: string | null;
    useCORS?: boolean;
    [key: string]: unknown;
  }
  export default function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions
  ): Promise<HTMLCanvasElement>;
}
