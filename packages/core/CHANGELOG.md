# Changelog

## [0.6.0](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.5.0...data-explorer-v0.6.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* fixed layouts and regions, for data with places of its own
* `ExplorerShape`, `NodeShape` and `NodeAppearance.ring` gain `"region"`; code that switches exhaustively over any of them must handle it.

### Features

* fixed layouts and regions, for data with places of its own ([cd6f55d](https://github.com/SirKettle/data-explorer/commit/cd6f55dccb0811917e40897f8b982313d2f7f9ef))
* pan and zoom limits that keep the scene in view, on by default (the `limits` prop; `false` turns each off) ([cd6f55d](https://github.com/SirKettle/data-explorer/commit/cd6f55dccb0811917e40897f8b982313d2f7f9ef))

## [0.5.0](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.4.0...data-explorer-v0.5.0) (2026-10-24)


### ⚠ BREAKING CHANGES

* RampColours is { stops, interpolation? }; fromHue, toHue, saturation and lightness are gone. DEFAULT_RAMP keeps the same red-magenta-blue-cyan-green sweep as five hsl stops, without the old lift on pure blues.

### Features

* colour-stop ramps, applied live, and a Ladle playground ([#16](https://github.com/SirKettle/data-explorer/issues/16)) ([d7fd9a8](https://github.com/SirKettle/data-explorer/commit/d7fd9a8f452d1a34da5b79b91bf9114550874e24))

## [0.4.0](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.3.0...data-explorer-v0.4.0) (2026-10-23)


### Features

* presence, to scale and fade items in place without a new layout ([#14](https://github.com/SirKettle/data-explorer/issues/14)) ([b656dfe](https://github.com/SirKettle/data-explorer/commit/b656dfeaad7230c853ec0d5c564eae2b3660169d))

## [0.3.0](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.2.1...data-explorer-v0.3.0) (2026-10-13)


### Features

* custom grid tiles, step and continuous zoom ([#12](https://github.com/SirKettle/data-explorer/issues/12)) ([99dafb7](https://github.com/SirKettle/data-explorer/commit/99dafb7c379c0f9e2aff56bf9fdfc67b238a4d1a))

## [0.2.1](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.2.0...data-explorer-v0.2.1) (2026-10-13)


### Bug Fixes

* re-read the host rect on wheel, pointerenter and scroll ([#10](https://github.com/SirKettle/data-explorer/issues/10)) ([b29683e](https://github.com/SirKettle/data-explorer/commit/b29683ea8718f6b8dbe1d3df494b9880aa787a9d))

## [0.2.0](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.1.1...data-explorer-v0.2.0) (2026-10-13)


### Features

* hand renderers a kit of PixiJS classes in create(kit) ([#8](https://github.com/SirKettle/data-explorer/issues/8)) ([34cded3](https://github.com/SirKettle/data-explorer/commit/34cded3f8df2d01871866676ceb1b974b43f6876))

## [0.1.1](https://github.com/SirKettle/data-explorer/compare/data-explorer-v0.1.0...data-explorer-v0.1.1) (2026-10-13)


### Bug Fixes

* stack custom views and textures with their own scene layer ([#6](https://github.com/SirKettle/data-explorer/issues/6)) ([a65269f](https://github.com/SirKettle/data-explorer/commit/a65269fc74010f3c0ab12f3b6667c23a97bf7ce4)), closes [#5](https://github.com/SirKettle/data-explorer/issues/5)

## 0.1.0 (2026-10-12)


### Features

* import @thirkettle/data-explorer from PicaBase ([3c563e0](https://github.com/SirKettle/data-explorer/commit/3c563e05dd3af1b4913a57954c6eb9bb1dec6bb3))

## Changelog

All notable changes to this package are recorded here by
[release-please](https://github.com/googleapis/release-please). Before 1.0, a minor version may
break the API; its entry says how.
