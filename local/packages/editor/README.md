# General document editor

Local extraction of the production Adam implementation. Build with `npm run build` at the `local` package root, then install the generated tarball. No registry is required.

Use the exports in `package.json`; imports into `src` are unsupported. See the root README for host adapters, architecture, bootstrap, demo and verification. This package uses ESM; UI packages target Svelte 4 via a peer dependency.
