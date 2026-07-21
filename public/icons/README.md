# OpenTask app icons

The two SVG files are the editable sources. The PNG files are generated install assets; do not edit
them directly. Generation uses only the macOS system renderers already present on the supported
development host:

```sh
icon_output=$(mktemp -d)
qlmanage -t -s 512 -o "$icon_output" public/icons/opentask-source.svg >/dev/null
mv "$icon_output/opentask-source.svg.png" public/icons/opentask-512.png
sips -s format png public/icons/opentask-maskable-source.svg \
  --out public/icons/opentask-maskable-512.png >/dev/null
sips -z 192 192 public/icons/opentask-512.png --out public/icons/opentask-192.png >/dev/null
rmdir "$icon_output"
```

Run `pnpm test -- app/manifest.test.ts` afterward. The contract test checks every declared PNG
dimension and the manifest path; visual review must also confirm that the maskable mark remains
inside the source SVG's safe area.
