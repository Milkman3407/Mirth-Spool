# M00 toolchain decision

M00 pins Node.js 24 and pnpm 11.9.0, the pnpm release available in the bootstrap environment. The repository uses ESLint 10 with `typescript-eslint` 8.65.0 and TypeScript 6.0.3.

TypeScript 7.0.2 was current when M00 was bootstrapped, but `typescript-eslint` 8.65.0 declares support only through TypeScript versions below 6.1. TypeScript 6.0.3 is therefore the newest stable compatible compiler for this toolchain. Revisit the pin after the lint toolchain declares TypeScript 7 support.
