# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [0.3.0](https://github.com/Ahacad/hn-summarizer/compare/v0.2.5...v0.3.0) (2025-03-20)


### Features

* add new state retries for retrying API calls ([d6b2981](https://github.com/Ahacad/hn-summarizer/commit/d6b2981f2384be25c506c3f49f68b7dbe7caaf11))
* implement stories & summaries apis ([a6fa214](https://github.com/Ahacad/hn-summarizer/commit/a6fa21450085f401d8d5e0f25561a5635ab3b8f7))


### Bug Fixes

* **env:** fix numeric problem from environmental variables ([e0f7572](https://github.com/Ahacad/hn-summarizer/commit/e0f7572f12a165224ad05a86f32ec1be4f5e25bd))
* new SENT status for all sent stories ([c6e3cb0](https://github.com/Ahacad/hn-summarizer/commit/c6e3cb0f0545e4f004c0bb830138448be4bb2755))
* **wrangler.example:** fix example wrangler cron jobs ([ea2deb1](https://github.com/Ahacad/hn-summarizer/commit/ea2deb1158a99571a0c891690cd1d85811367a64))


### Documentation

* **readme:** fix license ([8715846](https://github.com/Ahacad/hn-summarizer/commit/8715846bdff332030c744a8a3558b2a398ff6020))


### Chores

* **constants.ts:** change cron intervals for all workers ([0ead7f6](https://github.com/Ahacad/hn-summarizer/commit/0ead7f6a4030c8b4883bc7d5d2d768ef849d58cf))
* **constants.ts:** update cron job for generating summaries ([7d953ff](https://github.com/Ahacad/hn-summarizer/commit/7d953ff11862bf453d0624a23038ddf22f39329c))


### Code Refactoring

* individual concurrency constants for different workers ([5ffe1c3](https://github.com/Ahacad/hn-summarizer/commit/5ffe1c390b23f6fd5213542c0ddb2db98f5761a6))
* update database schema for notifications ([e6c309b](https://github.com/Ahacad/hn-summarizer/commit/e6c309bf92bc514a66d885d61ec713b54d1a07fc))
* use environmental variables rather than hardcoded numbers for item numbers now ([4a2c291](https://github.com/Ahacad/hn-summarizer/commit/4a2c291ca427fcc53cf9fa74267ef7094207520f))

### [0.2.5](https://github.com/Ahacad/hn-summarizer/compare/v0.2.4...v0.2.5) (2025-03-20)


### Performance Improvements

* **content-processor:** using concurrent content processor now ([99cbcd3](https://github.com/Ahacad/hn-summarizer/commit/99cbcd33230f6083344681f09c7e20ff34d437bf))


### Chores

* **google-ai.ts:** remove redundant maxTokens variable in summarize function ([c317fd3](https://github.com/Ahacad/hn-summarizer/commit/c317fd32925da7911e4cc29cf754cf1102e31cb1))


### Code Refactoring

* **index.ts:** change the way cronjobs are handled ([6d6a2e6](https://github.com/Ahacad/hn-summarizer/commit/6d6a2e6c35fa3855ff7e8b6600146e6ef660f199))


### Styling

* format code ([bf4ea26](https://github.com/Ahacad/hn-summarizer/commit/bf4ea2631f7e3b1cc585d267b0d98a85cb1c0342))


### CI

* add husky, running npm format before committing ([d5a981c](https://github.com/Ahacad/hn-summarizer/commit/d5a981cdd0bd3e353656295f7a4eb4fd19bb1419))
* fix husky format and commit logic ([8c65a4e](https://github.com/Ahacad/hn-summarizer/commit/8c65a4e6c890b28f134b035c09ae9f354d89af5a))


### Documentation

* add license ([46b15b8](https://github.com/Ahacad/hn-summarizer/commit/46b15b82b9bacc3a2a74e3200676d95fbbe50856))

### [0.2.4](https://github.com/Ahacad/hn-summarizer/compare/v0.2.3...v0.2.4) (2025-03-19)


### CI

* publish to github immediately after bumping version ([b3d9b00](https://github.com/Ahacad/hn-summarizer/commit/b3d9b0067f60cf31b669a1c815bd6fb6831992f1))

### [0.2.3](https://github.com/Ahacad/hn-summarizer/compare/v0.2.2...v0.2.3) (2025-03-19)


### CI

* seperating code to a file under scripts/ ([8304854](https://github.com/Ahacad/hn-summarizer/commit/83048548b102666a73c240f9f1d53f2921c915e4))

### [0.2.2](https://github.com/Ahacad/hn-summarizer/compare/v0.2.1...v0.2.2) (2025-03-19)


### CI

* trying to have a better release note on github ([3ed96bf](https://github.com/Ahacad/hn-summarizer/commit/3ed96bf4a03df8a1fd43846e0f47749c0314e965))

### [0.2.1](https://github.com/Ahacad/hn-summarizer/compare/v0.2.0...v0.2.1) (2025-03-19)


### CI

* add conventional-changelog to devDeps, fix publish:github script ([3b1ce23](https://github.com/Ahacad/hn-summarizer/commit/3b1ce23f69d115567b91c02acac76425d0c4850a))

## 0.2.0 (2025-03-19)


### Features

* add selfbuilt firecrawl endpoint as the page crawler ([765eb10](https://github.com/Ahacad/hn-summarizer/commit/765eb10e0a3fa87d24bf8c09702388c614f9c86b))
* add unit tests ([a43e72d](https://github.com/Ahacad/hn-summarizer/commit/a43e72d4eb610a159a1112fb0b7fa744c29ca11f))
* first virsion init ([38079a1](https://github.com/Ahacad/hn-summarizer/commit/38079a1ed4728e51a9d509c0ee1256c6c0103cf3))
* init repo ([9d74300](https://github.com/Ahacad/hn-summarizer/commit/9d74300d8b598e538aa09b67162e59a624fb5d02))


### Bug Fixes

* **ai-summarize:** fix content.length property problem ([9017649](https://github.com/Ahacad/hn-summarizer/commit/90176492318812f3425f885b1b536a19b362d297))
* **discord.ts:** fix cloudflare supports ([ed744b4](https://github.com/Ahacad/hn-summarizer/commit/ed744b4464680087b39b211345b2b56016153c57))
* **firecrawl-client:** fix wordcount in firecrawl ([445e4ff](https://github.com/Ahacad/hn-summarizer/commit/445e4ffb626e95023c72ed6e37471d1381a34052))
* **google-ai:** fix duplicate constant names ([dea8a57](https://github.com/Ahacad/hn-summarizer/commit/dea8a57abc00152637caab94e6470539af7eff5e))


### Code Refactoring

* formatted code ([9805a6e](https://github.com/Ahacad/hn-summarizer/commit/9805a6e46625343ae0ae77c5fb9c70f8a6d9f51b))
* move constants to a single file ([d938d83](https://github.com/Ahacad/hn-summarizer/commit/d938d83141497ee394d0a74954732d418bbc7004))


### Chores

* add tsconfig.json ([3d9827f](https://github.com/Ahacad/hn-summarizer/commit/3d9827f5216bd575ccba991530a28edffc68d071))
* **constants.ts:** change model to pro experimental 0205 ([a6649ff](https://github.com/Ahacad/hn-summarizer/commit/a6649fffe28877afa410178d1853777ed7bfaecb))
* **constants.ts:** increase token and max_content counts for our powerful gemini now ([4f2e0e4](https://github.com/Ahacad/hn-summarizer/commit/4f2e0e4ad708a0cdff2ed7a800343867cb9b2a7f))
* ignore repomix-output.txt ([b9fea80](https://github.com/Ahacad/hn-summarizer/commit/b9fea80138759b34fb5a03f5d47b718fde020ab1))
* ignoring .dev.vars for dev secrets ([1c4345b](https://github.com/Ahacad/hn-summarizer/commit/1c4345b9dba706aa5b789dbfbedc4e2a4b4f5c94))
* ignoring .wrangler & todos.txt ([31a97ea](https://github.com/Ahacad/hn-summarizer/commit/31a97eaad136cbb10b74284447c077dca3096d60))
* ignoring wrangler.toml now, add wrangler.example.toml for publishing ([439962d](https://github.com/Ahacad/hn-summarizer/commit/439962da3fe767e5d7febe9759acada6989a9f2e))
* remove .env.example ([b6097ed](https://github.com/Ahacad/hn-summarizer/commit/b6097ede7e07434f93bd08b0cc3ff549ea4fe038))
* running npm format ([0f65e5c](https://github.com/Ahacad/hn-summarizer/commit/0f65e5cc6579d15b31e1f4f3092fd5f8551edf59))
* update package-lock.json ([e1c5e75](https://github.com/Ahacad/hn-summarizer/commit/e1c5e75f5a4b17344866c420c277a747f658844b))
* **wrangler:** no longer use customizde domain ([2dc322d](https://github.com/Ahacad/hn-summarizer/commit/2dc322d370c9971d9bf5e09be99eac4a43d6e49c))


### Documentation

* update readme ([c61d994](https://github.com/Ahacad/hn-summarizer/commit/c61d994a63623ad5c986eb0a16d64513ab9fb73c))


### CI

* add tools for automatic release ([544283a](https://github.com/Ahacad/hn-summarizer/commit/544283ab33367645517e3a991bfff36527f59822))
