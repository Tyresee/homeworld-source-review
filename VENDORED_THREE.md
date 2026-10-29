# Vendored Three.js runtime

The offline review pages use the real Three.js **0.186.1** runtime in `vendor/three/`. These are unmodified files copied from the installed MIT-licensed npm package, not replacement classes or a CDN shim.

- `vendor/three/build/three.module.js` is the browser entry, including its real `three.core.js` dependency.
- `vendor/three/examples/jsm/` contains the addons actually imported by the included source and review pages, together with their recursive module dependencies.
- `vendor/three/LICENSE` preserves the upstream MIT copyright and permission notice.
- `vendor/three/MANIFEST.json` records the version, entrypoints, byte sizes and SHA-256 of every vendored file.

Browser import maps resolve `three` to `/vendor/three/build/three.module.js` and `three/addons/` to `/vendor/three/examples/jsm/`. The local read-only server serves these URLs from the checked-in `vendor/three` directory. Running the offline viewer does not need `node_modules`, npm access or any CDN.

To check the included runtime using Node.js alone:

```sh
node scripts/vendor-three.mjs --check
```

To refresh the vendor closure as a maintainer, first install the locked npm dependencies, then run:

```sh
node scripts/vendor-three.mjs
```

An already installed package can instead be supplied with `--source path/to/three`. The tool checks the exact version and license, copies the static ESM dependency closure without altering upstream code, and verifies all output hashes. It does not store the supplied filesystem path in the manifest.

The browser runtime is intentionally a bounded subset of Three.js. It does not include unused examples, optional Draco/KTX decoders, WebGPU libraries or the full upstream source tree. If a future review page imports another addon, regenerate and commit the expanded closure before sharing it. Existing Node unit tests still use the normal locked npm dependency; vendoring does not change their module resolution or make the production service a standalone application.
