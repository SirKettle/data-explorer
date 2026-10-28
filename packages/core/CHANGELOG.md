# Changelog

## [0.7.2](https://github.com/SirKettle/data-xplorer/compare/core-v0.7.1...core-v0.7.2) (2026-10-28)


### Bug Fixes

* draw a hovered item's label once ([b67662e](https://github.com/SirKettle/data-xplorer/commit/b67662ecc169a6e81f548b7bbf58ff8624048a0f))
* draw a hovered item's label once ([0752a94](https://github.com/SirKettle/data-xplorer/commit/0752a94438faa937821b4a8da5404e4ec773da33))

## [0.7.1](https://github.com/SirKettle/data-xplorer/compare/core-v0.7.0...core-v0.7.1) (2026-10-27)


### Bug Fixes

* zooming past limit fixed ([9666e6d](https://github.com/SirKettle/data-xplorer/commit/9666e6d1a29654a84ceb47bd99f17ea561826006))

## [0.7.0](https://github.com/SirKettle/data-xplorer/compare/core-v0.6.0...core-v0.7.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* the package is now @data-xplorer/core. Uninstall @thirkettle/data-explorer, install @data-xplorer/core, and change imports from "@thirkettle/data-explorer", "/headless" and "/pixi" to "@data-xplorer/core", "@data-xplorer/core/headless" and "@data-xplorer/core/pixi". Nothing else changes.

### Features

* move to the [@data-xplorer](https://github.com/data-xplorer) org as a monorepo ([1a52fcd](https://github.com/SirKettle/data-xplorer/commit/1a52fcdfa4ba7422cd1d375ea8f1da8ecad971e5))

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
