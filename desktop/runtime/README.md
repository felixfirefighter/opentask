# Omplish desktop runtime artifacts

The production desktop package deliberately vendors its own Node and PostgreSQL runtimes. End users
must not need Node, Docker, PostgreSQL, pnpm, or an internet connection after installation.

Stage these files before running `pnpm electron:dist`:

```text
desktop/runtime/
  node/
    windows-x64/node.exe
    macos-x64/node
    macos-arm64/node
  postgres/
    windows-x64/
      bin/{postgres,initdb,createdb,pg_ctl,psql}.exe
      lib/**                  # matching runtime DLLs/modules
      share/**                # timezone, locale, extension/control data
    macos-x64/
      bin/{postgres,initdb,createdb,pg_ctl,psql}
      lib/**
      share/**
    macos-arm64/
      bin/{postgres,initdb,createdb,pg_ctl,psql}
      lib/**
      share/**
```

Use the repository staging helper after downloading and extracting the pinned archives. It never
downloads or executes the runtime; it copies the extracted trees and records the archive hashes:

```bash
pnpm electron:stage-runtime -- \
  --target macos-arm64 \
  --node /path/to/extracted/node/bin \
  --node-archive /path/to/node-archive.tar.gz \
  --node-version v24.x.y \
  --node-source-url https://nodejs.org/dist/v24.x.y/node-v24.x.y-darwin-arm64.tar.gz \
  --postgres /path/to/extracted/postgresql \
  --postgres-archive /path/to/postgresql-archive.tar.gz \
  --postgres-version 17.x \
  --postgres-source-url https://example.invalid/pinned-postgresql-archive
```

Run it once for every shipped target. The PostgreSQL input must be the extracted directory whose
children are `bin/`, `lib/`, and `share/`; the Node input must contain `node` or `node.exe`. The
command replaces only that target's generated runtime directory and updates `manifest.json`.
Commit the manifest and keep the original archives outside Git for release reproducibility.

The packaging pipeline then copies only the selected target into `dist-desktop-runtime/` before
Electron Builder runs. An installer therefore contains one platform runtime, not the complete
Windows/macOS staging tree.

Do not cherry-pick only the executables: PostgreSQL must come from one pinned, relocatable,
redistributable PostgreSQL 17 distribution per target, including its matching `lib/` and `share/`
trees. Validate macOS dynamic-library references after extraction and keep the source archive,
version, checksums, and license notice in the release build record. Do not download anything during
application startup.

Recommended source baseline: the PostgreSQL community [macOS package guidance](https://www.postgresql.org/download/macosx/)
explicitly provides an advanced binary ZIP intended for inclusion in another application installer;
the EDB [binary archive page](https://www.enterprisedb.com/download-postgresql-binaries?lang=en) provides
the corresponding Windows x86-64 and macOS PostgreSQL 17 archives. Pin the exact archive release used
by the build and record its SHA-256; do not treat a moving “PostgreSQL 17” download link as a lock.

The runtime supervisor stores the user database under the operating system's application-data
directory and binds PostgreSQL to loopback on a dynamically reserved port.

The currently staged baseline is Node.js `v24.14.1` and PostgreSQL `17.10-2`; the exact archive URLs
and SHA-256 values are recorded in `manifest.json`. The EDB macOS archive is a universal binary and
is used for both macOS targets. Its layout does not include `share/locale`; this is valid because
Omplish initializes clusters with `--no-locale`. PostgreSQL's required extension/timezone data is
still present under `share/postgresql` on macOS and the platform-equivalent `share/extension` layout
on Windows.

The current desktop slice reads `OPENAI_API_KEY` from the process environment only. It never sends the
key to the renderer, but it does not yet provide an in-app keychain settings flow. A production release
must either supply that environment securely or complete an Electron `safeStorage`/OS-keychain flow
before advertising user-configurable AI.

## Release risks and alternatives

Bundling PostgreSQL makes the installer substantially larger and makes PostgreSQL security updates a
release responsibility. It is the recommended path for this product because it preserves the existing
PostgreSQL/Drizzle application boundary and avoids asking users to install or operate a database.
SQLite would reduce installer size, but would require a second schema/transaction implementation and
would weaken parity with the web and self-hosted PostgreSQL deployment. A remote database would make
offline use impossible and introduce hosting, account, and network availability dependencies.

Electron and the bundled Node/PostgreSQL versions are pinned release inputs. Upgrading any of them
requires rebuilding every target, rerunning migration/cold-start/upgrade checks, and rechecking
dynamic-library and share-data layout. The runtime tree is ignored by Git because its current staged
size is roughly 830 MB; keep it in controlled release artifact storage or Git LFS, while committing
the manifest, notices, and staging instructions.
