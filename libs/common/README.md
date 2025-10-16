# common

This library was generated with [Nx](https://nx.dev).

## Running unit tests

Run `nx test common` to execute the unit tests via [Jest](https://jestjs.io).

## Generate TypeScript from .proto

We use `protoc` with the `ts-proto` plugin to generate TypeScript interfaces.

Run the Nx target:

```bash
npx nx run common:gen-proto
```

Notes:
- Ensure `protoc` is installed and available on PATH.
- `ts-proto` is included as a devDependency; the generator uses the `protoc-gen-ts_proto` binary from `node_modules/.bin`.
- Generated files go to `libs/common/src/proto`.
