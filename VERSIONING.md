# Versioning and release policy

MirthSpool uses Semantic Versioning beginning with `0.1.0`. During the `0.x`
series, minor versions may contain breaking configuration, API, or migration
changes; every such change must be called out in the changelog and release
notes. Patch versions are intended for compatible corrections.

The release tag must be `v` plus the exact root `package.json` version. CI builds
artifacts only from that tag and publishes both the version tag and a
commit-derived `sha-<40-hex>` tag. Production deployments should pin the digest
recorded in the GitHub release rather than relying on a mutable tag. `latest` is
not published.

The supported v0.1 runtime architecture is `linux/amd64`. Other architectures
are neither blocked in source nor claimed as tested; a release must not add a
platform to its manifest until CI and acceptance coverage exist for it.
