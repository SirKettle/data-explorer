# Security

Please report a vulnerability privately, through
[GitHub's private vulnerability reporting](https://github.com/SirKettle/data-explorer/security/advisories/new),
not in a public issue. You should hear back within a week.

Only the latest published minor version receives fixes while the package is 0.x.

The package renders data its consumer supplies. Labels and other text are drawn as text, never as
HTML; images (`texture`, background images) load only from URLs the consumer gives it, and only
when the host allows cross-origin reads.
