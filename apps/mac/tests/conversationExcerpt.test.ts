import { expect, it } from 'vitest'
import { conversationExcerpt } from '../src/renderer/src/model/conversationExcerpt.js'

it('keeps readable prose in the channel when the stored preview ends inside a code fence', () => {
  expect(conversationExcerpt('## Result\n\nThe **notification** opens [the conversation](https://example.test).\n\n```ts\nconst work = {')).toBe('The notification opens the conversation.')
  expect(conversationExcerpt('```sh\nnpm run check\n```')).toBe('npm run check')
  expect(conversationExcerpt('修正できます。\n\n次に確認します。')).toBe('修正できます。\n\n次に確認します。')
})
