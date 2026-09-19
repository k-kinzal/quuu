/** Even on the same WebContents, an operation coming from an iframe is not accepted. */
export function authorizedFrame(input: { owned: boolean; mainFrame: boolean; actualUrl: string; expectedUrl: string }): boolean {
  return input.owned && input.mainFrame && input.actualUrl.length > 0 && input.actualUrl === input.expectedUrl
}
