# Live voice verification

- `npm run test:os` covers transcript filtering, readout scheduling, and reply normalization.
- `node scripts/test-voice-browser.cjs` mounts the real VoiceSheet in headless Edge with simulated Realtime transport events. It requires `playwright` available through Node module resolution (or `NODE_PATH`); esbuild comes from the existing development dependencies. Set `VOICE_TEST_BROWSER=chrome` to use Chrome instead.
- `npx tsx scripts/test-voice-inbox.ts` uses the configured database, writes an isolated test reply, verifies it from another process, and removes its own test data.
- `npm run build` verifies the production bundle and types.

The browser regression covers late user transcription, speaking during playback, non-Latin input, explicit mute, queued readouts, stale playback completion, and microphone loss. It simulates the remote service; it does not validate physical speaker echo cancellation, phone audio routing, or spoken model language selection.

Deploy the `20260911120000_voice_inbox` migration before the updated inbox routes. Replies expire after one hour and are stored by a hash of the owner key.

Realtime interruption behavior follows the [official OpenAI conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations). WebRTC handles interruption and truncation with VAD enabled. Keep the input track enabled except when the owner explicitly mutes it.
