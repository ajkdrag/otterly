declare module "refractor" {
  export interface Refractor {
    listLanguages(): string[];
    languages: Record<string, object>;
  }
  export const refractor: Refractor;
}
